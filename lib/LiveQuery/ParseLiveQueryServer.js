"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseLiveQueryServer = void 0;
var _tv = _interopRequireDefault(require("tv4"));
var _node = _interopRequireDefault(require("parse/node"));
var _Subscription = require("./Subscription");
var _Client = require("./Client");
var _ParseWebSocketServer = require("./ParseWebSocketServer");
var _logger = _interopRequireDefault(require("../logger"));
var _RequestSchema = _interopRequireDefault(require("./RequestSchema"));
var _QueryTools = require("./QueryTools");
var _ParsePubSub = require("./ParsePubSub");
var _SchemaController = _interopRequireDefault(require("../Controllers/SchemaController"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _triggers = require("../triggers");
var _Auth = require("../Auth");
var _Controllers = require("../Controllers");
var _lruCache = require("lru-cache");
var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _util = require("util");
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// @ts-ignore

class ParseLiveQueryServer {
  // className -> (queryHash -> subscription)

  // The subscriber we use to get object update from publisher

  constructor(server, config = {}, parseServerConfig = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.config = config;
    config.appId = config.appId || _node.default.applicationId;
    config.masterKey = config.masterKey || _node.default.masterKey;

    // Store keys, convert obj to map
    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();
    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }
    _logger.default.verbose('Support key pairs', this.keyPairs);

    // Initialize Parse
    _node.default.Object.disableSingleInstance();
    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;
    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey);

    // The cache controller is a proper cache controller
    // with access to User and Roles
    this.cacheController = (0, _Controllers.getCacheController)(parseServerConfig);
    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s

    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.
    this.authCache = new _lruCache.LRUCache({
      max: 500,
      // 500 concurrent
      ttl: config.cacheTimeout
    });
    // Initialize websocket server
    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config);
    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    if (!this.subscriber.connect) {
      this.connect();
    }
  }
  async connect() {
    if (this.subscriber.isOpen) {
      return;
    }
    if (typeof this.subscriber.connect === 'function') {
      await Promise.resolve(this.subscriber.connect());
    } else {
      this.subscriber.isOpen = true;
    }
    this._createSubscribers();
  }
  async shutdown() {
    if (this.subscriber.isOpen) {
      await Promise.all([...[...this.clients.values()].map(client => client.parseWebSocket.ws.close()), this.parseWebSocketServer.close?.(), ...Array.from(this.subscriber.subscriptions?.keys() || []).map(key => this.subscriber.unsubscribe(key)), this.subscriber.close?.()]);
    }
    if (typeof this.subscriber.quit === 'function') {
      try {
        await this.subscriber.quit();
      } catch (err) {
        _logger.default.error('PubSubAdapter error on shutdown', {
          error: err
        });
      }
    } else {
      this.subscriber.isOpen = false;
    }
  }
  _createSubscribers() {
    const messageRecieved = (channel, messageStr) => {
      _logger.default.verbose('Subscribe message %j', messageStr);
      let message;
      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger.default.error('unable to parse message', messageStr, e);
        return;
      }
      if (channel === _node.default.applicationId + 'clearCache') {
        this._clearCachedRoles(message.userId);
        return;
      }
      this._inflateParseObject(message);
      if (channel === _node.default.applicationId + 'afterSave') {
        this._onAfterSave(message);
      } else if (channel === _node.default.applicationId + 'afterDelete') {
        this._onAfterDelete(message);
      } else {
        _logger.default.error('Get message %s from unknown channel %j', message, channel);
      }
    };
    this.subscriber.on('message', (channel, messageStr) => messageRecieved(channel, messageStr));
    for (const field of ['afterSave', 'afterDelete', 'clearCache']) {
      const channel = `${_node.default.applicationId}${field}`;
      this.subscriber.subscribe(channel, messageStr => messageRecieved(channel, messageStr));
    }
  }

  // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.
  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;
    _UsersRouter.default.removeHiddenProperties(currentParseObject);
    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);
    parseObject._finishFetch(currentParseObject);
    message.currentParseObject = parseObject;
    // Inflate original object
    const originalParseObject = message.originalParseObject;
    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);
      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);
      parseObject._finishFetch(originalParseObject);
      message.originalParseObject = parseObject;
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  async _onAfterDelete(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterDelete is triggered');
    let deletedParseObject = message.currentParseObject.toJSON();
    const classLevelPermissions = message.classLevelPermissions;
    const className = deletedParseObject.className;
    _logger.default.verbose('ClassName: %j | ObjectId: %s', className, deletedParseObject.id);
    _logger.default.verbose('Current client number : %d', this.clients.size);
    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);
      return;
    }
    for (const subscription of classSubscriptions.values()) {
      const isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);
      if (!isSubscriptionMatched) {
        continue;
      }
      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
          const acl = message.currentParseObject.getACL();
          // Check CLP
          const op = this._getCLPOperation(subscription.query);
          let res = {};
          try {
            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const isMatched = await this._matchesACL(acl, client, requestId);
            if (!isMatched) {
              return null;
            }
            res = {
              event: 'delete',
              sessionToken: client.sessionToken,
              object: deletedParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);
            if (trigger) {
              const auth = await this.getAuthFromClient(client, requestId);
              if (auth && auth.user) {
                res.user = auth.user;
              }
              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }
              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }
            if (!res.sendEvent) {
              return;
            }
            if (res.object && typeof res.object.toJSON === 'function') {
              deletedParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            client.pushDelete(requestId, deletedParseObject);
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);
            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);
            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  async _onAfterSave(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterSave is triggered');
    let originalParseObject = null;
    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }
    const classLevelPermissions = message.classLevelPermissions;
    let currentParseObject = message.currentParseObject.toJSON();
    const className = currentParseObject.className;
    _logger.default.verbose('ClassName: %s | ObjectId: %s', className, currentParseObject.id);
    _logger.default.verbose('Current client number : %d', this.clients.size);
    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);
      return;
    }
    for (const subscription of classSubscriptions.values()) {
      const isOriginalSubscriptionMatched = this._matchesSubscription(originalParseObject, subscription);
      const isCurrentSubscriptionMatched = this._matchesSubscription(currentParseObject, subscription);
      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
          // Set orignal ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let originalACLCheckingPromise;
          if (!isOriginalSubscriptionMatched) {
            originalACLCheckingPromise = Promise.resolve(false);
          } else {
            let originalACL;
            if (message.originalParseObject) {
              originalACL = message.originalParseObject.getACL();
            }
            originalACLCheckingPromise = this._matchesACL(originalACL, client, requestId);
          }
          // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let currentACLCheckingPromise;
          let res = {};
          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(currentACL, client, requestId);
          }
          try {
            const op = this._getCLPOperation(subscription.query);
            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const [isOriginalMatched, isCurrentMatched] = await Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);
            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash);
            // Decide event type
            let type;
            if (isOriginalMatched && isCurrentMatched) {
              type = 'update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
                type = 'enter';
              } else {
                type = 'create';
              }
            } else {
              return null;
            }
            const watchFieldsChanged = this._checkWatchFields(client, requestId, message);
            if (!watchFieldsChanged && (type === 'update' || type === 'create')) {
              return;
            }
            res = {
              event: type,
              sessionToken: client.sessionToken,
              object: currentParseObject,
              original: originalParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);
            if (trigger) {
              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }
              if (res.original) {
                res.original = _node.default.Object.fromJSON(res.original);
              }
              const auth = await this.getAuthFromClient(client, requestId);
              if (auth && auth.user) {
                res.user = auth.user;
              }
              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }
            if (!res.sendEvent) {
              return;
            }
            if (res.object && typeof res.object.toJSON === 'function') {
              currentParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }
            if (res.original && typeof res.original.toJSON === 'function') {
              originalParseObject = (0, _triggers.toJSONwithObjects)(res.original, res.original.className || className);
            }
            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);
            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
            }
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);
            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);
            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  }
  _onConnect(parseWebsocket) {
    parseWebsocket.on('message', request => {
      if (typeof request === 'string') {
        try {
          request = JSON.parse(request);
        } catch (e) {
          _logger.default.error('unable to parse request', request, e);
          return;
        }
      }
      _logger.default.verbose('Request: %j', request);

      // Check whether this request is a valid request, return error directly if not
      if (!_tv.default.validate(request, _RequestSchema.default['general']) || !_tv.default.validate(request, _RequestSchema.default[request.op])) {
        _Client.Client.pushError(parseWebsocket, 1, _tv.default.error.message);
        _logger.default.error('Connect message error %s', _tv.default.error.message);
        return;
      }
      switch (request.op) {
        case 'connect':
          this._handleConnect(parseWebsocket, request);
          break;
        case 'subscribe':
          this._handleSubscribe(parseWebsocket, request);
          break;
        case 'update':
          this._handleUpdateSubscription(parseWebsocket, request);
          break;
        case 'unsubscribe':
          this._handleUnsubscribe(parseWebsocket, request);
          break;
        default:
          _Client.Client.pushError(parseWebsocket, 3, 'Get unknown operation');
          _logger.default.error('Get unknown operation', request.op);
      }
    });
    parseWebsocket.on('disconnect', () => {
      _logger.default.info(`Client disconnect: ${parseWebsocket.clientId}`);
      const clientId = parseWebsocket.clientId;
      if (!this.clients.has(clientId)) {
        (0, _triggers.runLiveQueryEventHandlers)({
          event: 'ws_disconnect_error',
          clients: this.clients.size,
          subscriptions: this.subscriptions.size,
          error: `Unable to find client ${clientId}`
        });
        _logger.default.error(`Can not find client ${clientId} on disconnect`);
        return;
      }

      // Delete client
      const client = this.clients.get(clientId);
      this.clients.delete(clientId);

      // Delete client from subscriptions
      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId);

        // If there is no client which is subscribing this subscription, remove it from subscriptions
        const classSubscriptions = this.subscriptions.get(subscription.className);
        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        }
        // If there is no subscriptions under this class, remove it from subscriptions
        if (classSubscriptions.size === 0) {
          this.subscriptions.delete(subscription.className);
        }
      }
      _logger.default.verbose('Current clients %d', this.clients.size);
      _logger.default.verbose('Current subscriptions %d', this.subscriptions.size);
      (0, _triggers.runLiveQueryEventHandlers)({
        event: 'ws_disconnect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId,
        sessionToken: client.sessionToken
      });
    });
    (0, _triggers.runLiveQueryEventHandlers)({
      event: 'ws_connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size
    });
  }
  _matchesSubscription(parseObject, subscription) {
    // Object is undefined or null, not match
    if (!parseObject) {
      return false;
    }
    return (0, _QueryTools.matchesQuery)((0, _deepcopy.default)(parseObject), subscription.query);
  }
  async _clearCachedRoles(userId) {
    try {
      const validTokens = await new _node.default.Query(_node.default.Session).equalTo('user', _node.default.User.createWithoutData(userId)).find({
        useMasterKey: true
      });
      await Promise.all(validTokens.map(async token => {
        const sessionToken = token.get('sessionToken');
        const authPromise = this.authCache.get(sessionToken);
        if (!authPromise) {
          return;
        }
        const [auth1, auth2] = await Promise.all([authPromise, (0, _Auth.getAuthForSessionToken)({
          cacheController: this.cacheController,
          sessionToken
        })]);
        auth1.auth?.clearRoleCache(sessionToken);
        auth2.auth?.clearRoleCache(sessionToken);
        this.authCache.delete(sessionToken);
      }));
    } catch (e) {
      _logger.default.verbose(`Could not clear role cache. ${e}`);
    }
  }
  getAuthForSessionToken(sessionToken) {
    if (!sessionToken) {
      return Promise.resolve({});
    }
    const fromCache = this.authCache.get(sessionToken);
    if (fromCache) {
      return fromCache;
    }
    const authPromise = (0, _Auth.getAuthForSessionToken)({
      cacheController: this.cacheController,
      sessionToken: sessionToken
    }).then(auth => {
      return {
        auth,
        userId: auth && auth.user && auth.user.id
      };
    }).catch(error => {
      // There was an error with the session token
      const result = {};
      if (error && error.code === _node.default.Error.INVALID_SESSION_TOKEN) {
        result.error = error;
        this.authCache.set(sessionToken, Promise.resolve(result), this.config.cacheTimeout);
      } else {
        this.authCache.delete(sessionToken);
      }
      return result;
    });
    this.authCache.set(sessionToken, authPromise);
    return authPromise;
  }
  async _matchesCLP(classLevelPermissions, object, client, requestId, op) {
    // try to match on user first, less expensive than with roles
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let userId;
    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
      if (userId) {
        aclGroup.push(userId);
      }
    }
    try {
      await _SchemaController.default.validatePermission(classLevelPermissions, object.className, aclGroup, op);
      return true;
    } catch (e) {
      _logger.default.verbose(`Failed matching CLP for ${object.id} ${userId} ${e}`);
      return false;
    }
    // TODO: handle roles permissions
    // Object.keys(classLevelPermissions).forEach((key) => {
    //   const perm = classLevelPermissions[key];
    //   Object.keys(perm).forEach((key) => {
    //     if (key.indexOf('role'))
    //   });
    // })
    // // it's rejected here, check the roles
    // var rolesQuery = new Parse.Query(Parse.Role);
    // rolesQuery.equalTo("users", user);
    // return rolesQuery.find({useMasterKey:true});
  }
  async _filterSensitiveData(classLevelPermissions, res, client, requestId, op, query) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let clientAuth;
    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId,
        auth
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
      if (userId) {
        aclGroup.push(userId);
      }
      clientAuth = auth;
    }
    const filter = obj => {
      if (!obj) {
        return;
      }
      let protectedFields = classLevelPermissions?.protectedFields || [];
      if (!client.hasMasterKey && !Array.isArray(protectedFields)) {
        protectedFields = (0, _Controllers.getDatabaseController)(this.config).addProtectedFields(classLevelPermissions, res.object.className, query, aclGroup, clientAuth);
      }
      return _DatabaseController.default.filterSensitiveData(client.hasMasterKey, false, aclGroup, clientAuth, op, classLevelPermissions, res.object.className, protectedFields, obj, query);
    };
    res.object = filter(res.object);
    res.original = filter(res.original);
  }
  _getCLPOperation(query) {
    return typeof query === 'object' && Object.keys(query).length == 1 && typeof query.objectId === 'string' ? 'get' : 'find';
  }
  async _verifyACL(acl, token) {
    if (!token) {
      return false;
    }
    const {
      auth,
      userId
    } = await this.getAuthForSessionToken(token);

    // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.
    if (!auth || !userId) {
      return false;
    }
    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);
    if (isSubscriptionSessionTokenMatched) {
      return true;
    }

    // Check if the user has any roles that match the ACL
    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));
      if (!acl_has_roles) {
        return false;
      }
      const roleNames = await auth.getUserRoles();
      // Finally, see if any of the user's roles allow them read access
      for (const role of roleNames) {
        // We use getReadAccess as `role` is in the form `role:roleName`
        if (acl.getReadAccess(role)) {
          return true;
        }
      }
      return false;
    }).catch(() => {
      return false;
    });
  }
  async getAuthFromClient(client, requestId, sessionToken) {
    const getSessionFromClient = () => {
      const subscriptionInfo = client.getSubscriptionInfo(requestId);
      if (typeof subscriptionInfo === 'undefined') {
        return client.sessionToken;
      }
      return subscriptionInfo.sessionToken || client.sessionToken;
    };
    if (!sessionToken) {
      sessionToken = getSessionFromClient();
    }
    if (!sessionToken) {
      return;
    }
    const {
      auth
    } = await this.getAuthForSessionToken(sessionToken);
    return auth;
  }
  _checkWatchFields(client, requestId, message) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const watch = subscriptionInfo?.watch;
    if (!watch) {
      return true;
    }
    const object = message.currentParseObject;
    const original = message.originalParseObject;
    return watch.some(field => !(0, _util.isDeepStrictEqual)(object.get(field), original?.get(field)));
  }
  async _matchesACL(acl, client, requestId) {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    }
    // Check subscription sessionToken matches ACL first
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      return false;
    }
    const subscriptionToken = subscriptionInfo.sessionToken;
    const clientSessionToken = client.sessionToken;
    if (await this._verifyACL(acl, subscriptionToken)) {
      return true;
    }
    if (await this._verifyACL(acl, clientSessionToken)) {
      return true;
    }
    return false;
  }
  async _handleConnect(parseWebsocket, request) {
    if (!this._validateKeys(request, this.keyPairs)) {
      _Client.Client.pushError(parseWebsocket, 4, 'Key in request is not valid');
      _logger.default.error('Key in request is not valid');
      return;
    }
    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);
    const clientId = (0, _uuid.v4)();
    const client = new _Client.Client(clientId, parseWebsocket, hasMasterKey, request.sessionToken, request.installationId);
    try {
      const req = {
        client,
        event: 'connect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: request.installationId,
        user: undefined
      };
      const trigger = (0, _triggers.getTrigger)('@Connect', 'beforeConnect', _node.default.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, req.sessionToken);
        if (auth && auth.user) {
          req.user = auth.user;
        }
        await (0, _triggers.runTrigger)(trigger, `beforeConnect.@Connect`, req, auth);
      }
      parseWebsocket.clientId = clientId;
      this.clients.set(parseWebsocket.clientId, client);
      _logger.default.info(`Create new client: ${parseWebsocket.clientId}`);
      client.pushConnect();
      (0, _triggers.runLiveQueryEventHandlers)(req);
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);
      _Client.Client.pushError(parseWebsocket, error.code, error.message, false);
      _logger.default.error(`Failed running beforeConnect for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }
  _hasMasterKey(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0 || !validKeyPairs.has('masterKey')) {
      return false;
    }
    if (!request || !Object.prototype.hasOwnProperty.call(request, 'masterKey')) {
      return false;
    }
    return request.masterKey === validKeyPairs.get('masterKey');
  }
  _validateKeys(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0) {
      return true;
    }
    let isValid = false;
    for (const [key, secret] of validKeyPairs) {
      if (!request[key] || request[key] !== secret) {
        continue;
      }
      isValid = true;
      break;
    }
    return isValid;
  }
  async _handleSubscribe(parseWebsocket, request) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before subscribing');
      _logger.default.error('Can not find this client, make sure you connect to server before subscribing');
      return;
    }
    const client = this.clients.get(parseWebsocket.clientId);
    const className = request.query.className;
    let authCalled = false;
    try {
      const trigger = (0, _triggers.getTrigger)(className, 'beforeSubscribe', _node.default.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        authCalled = true;
        if (auth && auth.user) {
          request.user = auth.user;
        }
        const parseQuery = new _node.default.Query(className);
        parseQuery.withJSON(request.query);
        request.query = parseQuery;
        await (0, _triggers.runTrigger)(trigger, `beforeSubscribe.${className}`, request, auth);
        const query = request.query.toJSON();
        request.query = query;
      }
      if (className === '_Session') {
        if (!authCalled) {
          const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
          if (auth && auth.user) {
            request.user = auth.user;
          }
        }
        if (request.user) {
          request.query.where.user = request.user.toPointer();
        } else if (!request.master) {
          _Client.Client.pushError(parseWebsocket, _node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', false, request.requestId);
          return;
        }
      }
      // Get subscription from subscriptions, create one if necessary
      const subscriptionHash = (0, _QueryTools.queryHash)(request.query);
      // Add className to subscriptions if necessary

      if (!this.subscriptions.has(className)) {
        this.subscriptions.set(className, new Map());
      }
      const classSubscriptions = this.subscriptions.get(className);
      let subscription;
      if (classSubscriptions.has(subscriptionHash)) {
        subscription = classSubscriptions.get(subscriptionHash);
      } else {
        subscription = new _Subscription.Subscription(className, request.query.where, subscriptionHash);
        classSubscriptions.set(subscriptionHash, subscription);
      }

      // Add subscriptionInfo to client
      const subscriptionInfo = {
        subscription: subscription
      };
      // Add selected fields, sessionToken and installationId for this subscription if necessary
      if (request.query.keys) {
        subscriptionInfo.keys = Array.isArray(request.query.keys) ? request.query.keys : request.query.keys.split(',');
      }
      if (request.query.watch) {
        subscriptionInfo.watch = request.query.watch;
      }
      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }
      client.addSubscriptionInfo(request.requestId, subscriptionInfo);

      // Add clientId to subscription
      subscription.addClientSubscription(parseWebsocket.clientId, request.requestId);
      client.pushSubscribe(request.requestId);
      _logger.default.verbose(`Create client ${parseWebsocket.clientId} new subscription: ${request.requestId}`);
      _logger.default.verbose('Current client number: %d', this.clients.size);
      (0, _triggers.runLiveQueryEventHandlers)({
        client,
        event: 'subscribe',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId
      });
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);
      _Client.Client.pushError(parseWebsocket, error.code, error.message, false, request.requestId);
      _logger.default.error(`Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }
  _handleUpdateSubscription(parseWebsocket, request) {
    this._handleUnsubscribe(parseWebsocket, request, false);
    this._handleSubscribe(parseWebsocket, request);
  }
  _handleUnsubscribe(parseWebsocket, request, notifyClient = true) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before unsubscribing');
      _logger.default.error('Can not find this client, make sure you connect to server before unsubscribing');
      return;
    }
    const requestId = request.requestId;
    const client = this.clients.get(parseWebsocket.clientId);
    if (typeof client === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find client with clientId ' + parseWebsocket.clientId + '. Make sure you connect to live query server before unsubscribing.');
      _logger.default.error('Can not find this client ' + parseWebsocket.clientId);
      return;
    }
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId + '. Make sure you subscribe to live query server before unsubscribing.');
      _logger.default.error('Can not find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId);
      return;
    }

    // Remove subscription from client
    client.deleteSubscriptionInfo(requestId);
    // Remove client from subscription
    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId);
    // If there is no client which is subscribing this subscription, remove it from subscriptions
    const classSubscriptions = this.subscriptions.get(className);
    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    }
    // If there is no subscriptions under this class, remove it from subscriptions
    if (classSubscriptions.size === 0) {
      this.subscriptions.delete(className);
    }
    (0, _triggers.runLiveQueryEventHandlers)({
      client,
      event: 'unsubscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
      sessionToken: subscriptionInfo.sessionToken,
      useMasterKey: client.hasMasterKey,
      installationId: client.installationId
    });
    if (!notifyClient) {
      return;
    }
    client.pushUnsubscribe(request.requestId);
    _logger.default.verbose(`Delete client: ${parseWebsocket.clientId} | subscription: ${request.requestId}`);
  }
}
exports.ParseLiveQueryServer = ParseLiveQueryServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfbHJ1Q2FjaGUiLCJfVXNlcnNSb3V0ZXIiLCJfRGF0YWJhc2VDb250cm9sbGVyIiwiX3V0aWwiLCJfZGVlcGNvcHkiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJjb25uZWN0IiwiaXNPcGVuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfY3JlYXRlU3Vic2NyaWJlcnMiLCJzaHV0ZG93biIsImFsbCIsInZhbHVlcyIsIm1hcCIsImNsaWVudCIsInBhcnNlV2ViU29ja2V0Iiwid3MiLCJjbG9zZSIsIkFycmF5IiwiZnJvbSIsInVuc3Vic2NyaWJlIiwicXVpdCIsImVyciIsImVycm9yIiwibWVzc2FnZVJlY2lldmVkIiwiY2hhbm5lbCIsIm1lc3NhZ2VTdHIiLCJtZXNzYWdlIiwiSlNPTiIsInBhcnNlIiwiX2NsZWFyQ2FjaGVkUm9sZXMiLCJ1c2VySWQiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJvbiIsImZpZWxkIiwic3Vic2NyaWJlIiwiY3VycmVudFBhcnNlT2JqZWN0IiwiVXNlclJvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJjbGFzc05hbWUiLCJwYXJzZU9iamVjdCIsIl9maW5pc2hGZXRjaCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJkZWxldGVkUGFyc2VPYmplY3QiLCJ0b0pTT04iLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpZCIsInNpemUiLCJjbGFzc1N1YnNjcmlwdGlvbnMiLCJnZXQiLCJkZWJ1ZyIsInN1YnNjcmlwdGlvbiIsImlzU3Vic2NyaXB0aW9uTWF0Y2hlZCIsIl9tYXRjaGVzU3Vic2NyaXB0aW9uIiwiY2xpZW50SWQiLCJyZXF1ZXN0SWRzIiwiXyIsImVudHJpZXMiLCJjbGllbnRSZXF1ZXN0SWRzIiwiZm9yRWFjaCIsInJlcXVlc3RJZCIsImFjbCIsImdldEFDTCIsIm9wIiwiX2dldENMUE9wZXJhdGlvbiIsInF1ZXJ5IiwicmVzIiwiX21hdGNoZXNDTFAiLCJpc01hdGNoZWQiLCJfbWF0Y2hlc0FDTCIsImV2ZW50Iiwic2Vzc2lvblRva2VuIiwib2JqZWN0IiwidXNlTWFzdGVyS2V5IiwiaGFzTWFzdGVyS2V5IiwiaW5zdGFsbGF0aW9uSWQiLCJzZW5kRXZlbnQiLCJ0cmlnZ2VyIiwiZ2V0VHJpZ2dlciIsImF1dGgiLCJnZXRBdXRoRnJvbUNsaWVudCIsInVzZXIiLCJmcm9tSlNPTiIsInJ1blRyaWdnZXIiLCJ0b0pTT053aXRoT2JqZWN0cyIsIl9maWx0ZXJTZW5zaXRpdmVEYXRhIiwicHVzaERlbGV0ZSIsInJlc29sdmVFcnJvciIsIkNsaWVudCIsInB1c2hFcnJvciIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIm9yaWdpbmFsQUNMIiwiY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSIsImN1cnJlbnRBQ0wiLCJpc09yaWdpbmFsTWF0Y2hlZCIsImlzQ3VycmVudE1hdGNoZWQiLCJoYXNoIiwidHlwZSIsIndhdGNoRmllbGRzQ2hhbmdlZCIsIl9jaGVja1dhdGNoRmllbGRzIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwibWF0Y2hlc1F1ZXJ5IiwiZGVlcGNvcHkiLCJ2YWxpZFRva2VucyIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJVc2VyIiwiY3JlYXRlV2l0aG91dERhdGEiLCJmaW5kIiwidG9rZW4iLCJhdXRoUHJvbWlzZSIsImF1dGgxIiwiYXV0aDIiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiY2xlYXJSb2xlQ2FjaGUiLCJmcm9tQ2FjaGUiLCJ0aGVuIiwiY2F0Y2giLCJyZXN1bHQiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImdldFN1YnNjcmlwdGlvbkluZm8iLCJhY2xHcm91cCIsInB1c2giLCJTY2hlbWFDb250cm9sbGVyIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY2xpZW50QXV0aCIsImZpbHRlciIsIm9iaiIsInByb3RlY3RlZEZpZWxkcyIsImlzQXJyYXkiLCJnZXREYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsIndhdGNoIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJnZXRQdWJsaWNSZWFkQWNjZXNzIiwic3Vic2NyaXB0aW9uVG9rZW4iLCJjbGllbnRTZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVLZXlzIiwiX2hhc01hc3RlcktleSIsInV1aWR2NCIsInJlcSIsInVuZGVmaW5lZCIsInB1c2hDb25uZWN0IiwidmFsaWRLZXlQYWlycyIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzVmFsaWQiLCJzZWNyZXQiLCJhdXRoQ2FsbGVkIiwicGFyc2VRdWVyeSIsIndpdGhKU09OIiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwicXVlcnlIYXNoIiwiU3Vic2NyaXB0aW9uIiwic3BsaXQiLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJwdXNoVW5zdWJzY3JpYmUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuLy8gQHRzLWlnbm9yZVxuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB7XG4gIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMsXG4gIGdldFRyaWdnZXIsXG4gIHJ1blRyaWdnZXIsXG4gIHJlc29sdmVFcnJvcixcbiAgdG9KU09Od2l0aE9iamVjdHMsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4sIEF1dGggfSBmcm9tICcuLi9BdXRoJztcbmltcG9ydCB7IGdldENhY2hlQ29udHJvbGxlciwgZ2V0RGF0YWJhc2VDb250cm9sbGVyIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgYXMgTFJVIH0gZnJvbSAnbHJ1LWNhY2hlJztcbmltcG9ydCBVc2VyUm91dGVyIGZyb20gJy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5cbmNsYXNzIFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIHtcbiAgc2VydmVyOiBhbnk7XG4gIGNvbmZpZzogYW55O1xuICBjbGllbnRzOiBNYXA8c3RyaW5nLCBhbnk+O1xuICAvLyBjbGFzc05hbWUgLT4gKHF1ZXJ5SGFzaCAtPiBzdWJzY3JpcHRpb24pXG4gIHN1YnNjcmlwdGlvbnM6IE1hcDxzdHJpbmcsIGFueT47XG4gIHBhcnNlV2ViU29ja2V0U2VydmVyOiBhbnk7XG4gIGtleVBhaXJzOiBhbnk7XG4gIC8vIFRoZSBzdWJzY3JpYmVyIHdlIHVzZSB0byBnZXQgb2JqZWN0IHVwZGF0ZSBmcm9tIHB1Ymxpc2hlclxuICBzdWJzY3JpYmVyOiBhbnk7XG4gIGF1dGhDYWNoZTogYW55O1xuICBjYWNoZUNvbnRyb2xsZXI6IGFueTtcblxuICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGFueSwgY29uZmlnOiBhbnkgPSB7fSwgcGFyc2VTZXJ2ZXJDb25maWc6IGFueSA9IHt9KSB7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgdGhpcy5jbGllbnRzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgIGNvbmZpZy5hcHBJZCA9IGNvbmZpZy5hcHBJZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgIGNvbmZpZy5tYXN0ZXJLZXkgPSBjb25maWcubWFzdGVyS2V5IHx8IFBhcnNlLm1hc3RlcktleTtcblxuICAgIC8vIFN0b3JlIGtleXMsIGNvbnZlcnQgb2JqIHRvIG1hcFxuICAgIGNvbnN0IGtleVBhaXJzID0gY29uZmlnLmtleVBhaXJzIHx8IHt9O1xuICAgIHRoaXMua2V5UGFpcnMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5UGFpcnMpKSB7XG4gICAgICB0aGlzLmtleVBhaXJzLnNldChrZXksIGtleVBhaXJzW2tleV0pO1xuICAgIH1cbiAgICBsb2dnZXIudmVyYm9zZSgnU3VwcG9ydCBrZXkgcGFpcnMnLCB0aGlzLmtleVBhaXJzKTtcblxuICAgIC8vIEluaXRpYWxpemUgUGFyc2VcbiAgICBQYXJzZS5PYmplY3QuZGlzYWJsZVNpbmdsZUluc3RhbmNlKCk7XG4gICAgY29uc3Qgc2VydmVyVVJMID0gY29uZmlnLnNlcnZlclVSTCB8fCBQYXJzZS5zZXJ2ZXJVUkw7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIFBhcnNlLmluaXRpYWxpemUoY29uZmlnLmFwcElkLCBQYXJzZS5qYXZhU2NyaXB0S2V5LCBjb25maWcubWFzdGVyS2V5KTtcblxuICAgIC8vIFRoZSBjYWNoZSBjb250cm9sbGVyIGlzIGEgcHJvcGVyIGNhY2hlIGNvbnRyb2xsZXJcbiAgICAvLyB3aXRoIGFjY2VzcyB0byBVc2VyIGFuZCBSb2xlc1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gZ2V0Q2FjaGVDb250cm9sbGVyKHBhcnNlU2VydmVyQ29uZmlnKTtcblxuICAgIGNvbmZpZy5jYWNoZVRpbWVvdXQgPSBjb25maWcuY2FjaGVUaW1lb3V0IHx8IDUgKiAxMDAwOyAvLyA1c1xuXG4gICAgLy8gVGhpcyBhdXRoIGNhY2hlIHN0b3JlcyB0aGUgcHJvbWlzZXMgZm9yIGVhY2ggYXV0aCByZXNvbHV0aW9uLlxuICAgIC8vIFRoZSBtYWluIGJlbmVmaXQgaXMgdG8gYmUgYWJsZSB0byByZXVzZSB0aGUgc2FtZSB1c2VyIC8gc2Vzc2lvbiB0b2tlbiByZXNvbHV0aW9uLlxuICAgIHRoaXMuYXV0aENhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IDUwMCwgLy8gNTAwIGNvbmN1cnJlbnRcbiAgICAgIHR0bDogY29uZmlnLmNhY2hlVGltZW91dCxcbiAgICB9KTtcbiAgICAvLyBJbml0aWFsaXplIHdlYnNvY2tldCBzZXJ2ZXJcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyID0gbmV3IFBhcnNlV2ViU29ja2V0U2VydmVyKFxuICAgICAgc2VydmVyLFxuICAgICAgcGFyc2VXZWJzb2NrZXQgPT4gdGhpcy5fb25Db25uZWN0KHBhcnNlV2Vic29ja2V0KSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgdGhpcy5zdWJzY3JpYmVyID0gUGFyc2VQdWJTdWIuY3JlYXRlU3Vic2NyaWJlcihjb25maWcpO1xuICAgIGlmICghdGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QpIHtcbiAgICAgIHRoaXMuY29ubmVjdCgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuc3Vic2NyaWJlci5pc09wZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLnN1YnNjcmliZXIuY29ubmVjdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc3Vic2NyaWJlci5jb25uZWN0KCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnN1YnNjcmliZXIuaXNPcGVuID0gdHJ1ZTtcbiAgICB9XG4gICAgdGhpcy5fY3JlYXRlU3Vic2NyaWJlcnMoKTtcbiAgfVxuXG4gIGFzeW5jIHNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLnN1YnNjcmliZXIuaXNPcGVuKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgIC4uLlsuLi50aGlzLmNsaWVudHMudmFsdWVzKCldLm1hcChjbGllbnQgPT4gY2xpZW50LnBhcnNlV2ViU29ja2V0LndzLmNsb3NlKCkpLFxuICAgICAgICB0aGlzLnBhcnNlV2ViU29ja2V0U2VydmVyLmNsb3NlPy4oKSxcbiAgICAgICAgLi4uQXJyYXkuZnJvbSh0aGlzLnN1YnNjcmliZXIuc3Vic2NyaXB0aW9ucz8ua2V5cygpIHx8IFtdKS5tYXAoa2V5ID0+XG4gICAgICAgICAgdGhpcy5zdWJzY3JpYmVyLnVuc3Vic2NyaWJlKGtleSlcbiAgICAgICAgKSxcbiAgICAgICAgdGhpcy5zdWJzY3JpYmVyLmNsb3NlPy4oKSxcbiAgICAgIF0pO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuc3Vic2NyaWJlci5xdWl0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnN1YnNjcmliZXIucXVpdCgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignUHViU3ViQWRhcHRlciBlcnJvciBvbiBzaHV0ZG93bicsIHsgZXJyb3I6IGVyciB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zdWJzY3JpYmVyLmlzT3BlbiA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIF9jcmVhdGVTdWJzY3JpYmVycygpIHtcbiAgICBjb25zdCBtZXNzYWdlUmVjaWV2ZWQgPSAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyQ2FjaGVkUm9sZXMobWVzc2FnZS51c2VySWQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH07XG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IG1lc3NhZ2VSZWNpZXZlZChjaGFubmVsLCBtZXNzYWdlU3RyKSk7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBbJ2FmdGVyU2F2ZScsICdhZnRlckRlbGV0ZScsICdjbGVhckNhY2hlJ10pIHtcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfSR7ZmllbGR9YDtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoY2hhbm5lbCwgbWVzc2FnZVN0ciA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgSlNPTiBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0IEpTT04uXG4gIF9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgLy8gSW5mbGF0ZSBtZXJnZWQgb2JqZWN0XG4gICAgY29uc3QgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbGV0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbGV0IHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgLy8gSW5mbGF0ZSBvcmlnaW5hbCBvYmplY3RcbiAgICBjb25zdCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBjbGFzc05hbWUgPSBvcmlnaW5hbFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICAgIHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlckRlbGV0ZShtZXNzYWdlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IGRlbGV0ZWRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJWogfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGRlbGV0ZWRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihkZWxldGVkUGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbik7XG4gICAgICBpZiAoIWlzU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXM6IGFueSA9IHt9O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBpc01hdGNoZWQgPSBhd2FpdCB0aGlzLl9tYXRjaGVzQUNMKGFjbCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgaWYgKCFpc01hdGNoZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiAnZGVsZXRlJyxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGRlbGV0ZWRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjbGllbnQucHVzaERlbGV0ZShyZXF1ZXN0SWQsIGRlbGV0ZWRQYXJzZU9iamVjdCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKGNsaWVudC5wYXJzZVdlYlNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhZnRlckxpdmVRdWVyeUV2ZW50IG9uIGNsYXNzICR7Y2xhc3NOYW1lfSBmb3IgZXZlbnQgJHtyZXMuZXZlbnR9IHdpdGggc2Vzc2lvbiAke3Jlcy5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlciBhZnRlciBpbmZsYXRlZC4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IGFmdGVyIGNoYW5nZXMuXG4gIC8vIE1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCBpcyB0aGUgb3JpZ2luYWwgUGFyc2VPYmplY3QuXG4gIGFzeW5jIF9vbkFmdGVyU2F2ZShtZXNzYWdlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbnVsbDtcbiAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIH1cbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBsZXQgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gY3VycmVudFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ2xhc3NOYW1lOiAlcyB8IE9iamVjdElkOiAlcycsIGNsYXNzTmFtZSwgY3VycmVudFBhcnNlT2JqZWN0LmlkKTtcbiAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnQgbnVtYmVyIDogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG5cbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKHR5cGVvZiBjbGFzc1N1YnNjcmlwdGlvbnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MgJyArIGNsYXNzTmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBjb25zdCBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICBzdWJzY3JpcHRpb25cbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgLy8gU2V0IG9yaWduYWwgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBpZiAoIWlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbEFDTDtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxBQ0wgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0wob3JpZ2luYWxBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gU2V0IGN1cnJlbnQgUGFyc2VPYmplY3QgQUNMIGNoZWNraW5nIHByb21pc2UsIGlmIHRoZSBvYmplY3QgZG9lcyBub3QgbWF0Y2hcbiAgICAgICAgICAvLyBzdWJzY3JpcHRpb24sIHdlIGRvIG5vdCBuZWVkIHRvIGNoZWNrIEFDTFxuICAgICAgICAgIGxldCBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGxldCByZXM6IGFueSA9IHt9O1xuICAgICAgICAgIGlmICghaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBQ0wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKGN1cnJlbnRBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc09yaWdpbmFsTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50TWF0Y2hlZCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmhhc2hcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgICAgICBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ3VwZGF0ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmICFpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAnbGVhdmUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnZW50ZXInO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB3YXRjaEZpZWxkc0NoYW5nZWQgPSB0aGlzLl9jaGVja1dhdGNoRmllbGRzKGNsaWVudCwgcmVxdWVzdElkLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIGlmICghd2F0Y2hGaWVsZHNDaGFuZ2VkICYmICh0eXBlID09PSAndXBkYXRlJyB8fCB0eXBlID09PSAnY3JlYXRlJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogdHlwZSxcbiAgICAgICAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgICAgICAgICBvYmplY3Q6IGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9yaWdpbmFsKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgICAgIHJlcy51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgY3VycmVudFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub3JpZ2luYWwgJiYgdHlwZW9mIHJlcy5vcmlnaW5hbC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCxcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLnF1ZXJ5XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25OYW1lID0gJ3B1c2gnICsgcmVzLmV2ZW50LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcmVzLmV2ZW50LnNsaWNlKDEpO1xuICAgICAgICAgICAgaWYgKGNsaWVudFtmdW5jdGlvbk5hbWVdKSB7XG4gICAgICAgICAgICAgIGNsaWVudFtmdW5jdGlvbk5hbWVdKHJlcXVlc3RJZCwgY3VycmVudFBhcnNlT2JqZWN0LCBvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIF9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSk6IHZvaWQge1xuICAgIHBhcnNlV2Vic29ja2V0Lm9uKCdtZXNzYWdlJywgcmVxdWVzdCA9PiB7XG4gICAgICBpZiAodHlwZW9mIHJlcXVlc3QgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UocmVxdWVzdCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSByZXF1ZXN0JywgcmVxdWVzdCwgZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsb2dnZXIudmVyYm9zZSgnUmVxdWVzdDogJWonLCByZXF1ZXN0KTtcblxuICAgICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIHJlcXVlc3QgaXMgYSB2YWxpZCByZXF1ZXN0LCByZXR1cm4gZXJyb3IgZGlyZWN0bHkgaWYgbm90XG4gICAgICBpZiAoXG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVsnZ2VuZXJhbCddKSB8fFxuICAgICAgICAhdHY0LnZhbGlkYXRlKHJlcXVlc3QsIFJlcXVlc3RTY2hlbWFbcmVxdWVzdC5vcF0pXG4gICAgICApIHtcbiAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMSwgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Nvbm5lY3QgbWVzc2FnZSBlcnJvciAlcycsIHR2NC5lcnJvci5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKHJlcXVlc3Qub3ApIHtcbiAgICAgICAgY2FzZSAnY29ubmVjdCc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXBkYXRlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1bnN1YnNjcmliZSc6XG4gICAgICAgICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDMsICdHZXQgdW5rbm93biBvcGVyYXRpb24nKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCB1bmtub3duIG9wZXJhdGlvbicsIHJlcXVlc3Qub3ApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbyhgQ2xpZW50IGRpc2Nvbm5lY3Q6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjb25zdCBjbGllbnRJZCA9IHBhcnNlV2Vic29ja2V0LmNsaWVudElkO1xuICAgICAgaWYgKCF0aGlzLmNsaWVudHMuaGFzKGNsaWVudElkKSkge1xuICAgICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3RfZXJyb3InLFxuICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgIGVycm9yOiBgVW5hYmxlIHRvIGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgQ2FuIG5vdCBmaW5kIGNsaWVudCAke2NsaWVudElkfSBvbiBkaXNjb25uZWN0YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gRGVsZXRlIGNsaWVudFxuICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICB0aGlzLmNsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblxuICAgICAgLy8gRGVsZXRlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mb10gb2YgXy5lbnRyaWVzKGNsaWVudC5zdWJzY3JpcHRpb25JbmZvcykpIHtcbiAgICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgICAgIHN1YnNjcmlwdGlvbi5kZWxldGVDbGllbnRTdWJzY3JpcHRpb24oY2xpZW50SWQsIHJlcXVlc3RJZCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY2xpZW50IHdoaWNoIGlzIHN1YnNjcmliaW5nIHRoaXMgc3Vic2NyaXB0aW9uLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uLmNsYXNzTmFtZSk7XG4gICAgICAgIGlmICghc3Vic2NyaXB0aW9uLmhhc1N1YnNjcmliaW5nQ2xpZW50KCkpIHtcbiAgICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBzdWJzY3JpcHRpb25zIHVuZGVyIHRoaXMgY2xhc3MsIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBjbGllbnRzICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgc3Vic2NyaXB0aW9ucyAlZCcsIHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICBldmVudDogJ3dzX2Rpc2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBjbGllbnQuc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGV2ZW50OiAnd3NfY29ubmVjdCcsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgIH0pO1xuICB9XG5cbiAgX21hdGNoZXNTdWJzY3JpcHRpb24ocGFyc2VPYmplY3Q6IGFueSwgc3Vic2NyaXB0aW9uOiBhbnkpOiBib29sZWFuIHtcbiAgICAvLyBPYmplY3QgaXMgdW5kZWZpbmVkIG9yIG51bGwsIG5vdCBtYXRjaFxuICAgIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoZXNRdWVyeShkZWVwY29weShwYXJzZU9iamVjdCksIHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gIH1cblxuICBhc3luYyBfY2xlYXJDYWNoZWRSb2xlcyh1c2VySWQ6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWxpZFRva2VucyA9IGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAuZXF1YWxUbygndXNlcicsIFBhcnNlLlVzZXIuY3JlYXRlV2l0aG91dERhdGEodXNlcklkKSlcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgdmFsaWRUb2tlbnMubWFwKGFzeW5jIHRva2VuID0+IHtcbiAgICAgICAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSB0b2tlbi5nZXQoJ3Nlc3Npb25Ub2tlbicpO1xuICAgICAgICAgIGNvbnN0IGF1dGhQcm9taXNlID0gdGhpcy5hdXRoQ2FjaGUuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgaWYgKCFhdXRoUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBbYXV0aDEsIGF1dGgyXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGF1dGhQcm9taXNlLFxuICAgICAgICAgICAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7IGNhY2hlQ29udHJvbGxlcjogdGhpcy5jYWNoZUNvbnRyb2xsZXIsIHNlc3Npb25Ub2tlbiB9KSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBhdXRoMS5hdXRoPy5jbGVhclJvbGVDYWNoZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICAgIGF1dGgyLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgdGhpcy5hdXRoQ2FjaGUuZGVsZXRlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci52ZXJib3NlKGBDb3VsZCBub3QgY2xlYXIgcm9sZSBjYWNoZS4gJHtlfWApO1xuICAgIH1cbiAgfVxuXG4gIGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuPzogc3RyaW5nKTogUHJvbWlzZTx7IGF1dGg/OiBBdXRoLCB1c2VySWQ/OiBzdHJpbmcgfT4ge1xuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICB9XG4gICAgY29uc3QgZnJvbUNhY2hlID0gdGhpcy5hdXRoQ2FjaGUuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKGZyb21DYWNoZSkge1xuICAgICAgcmV0dXJuIGZyb21DYWNoZTtcbiAgICB9XG4gICAgY29uc3QgYXV0aFByb21pc2UgPSBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgIGNhY2hlQ29udHJvbGxlcjogdGhpcy5jYWNoZUNvbnRyb2xsZXIsXG4gICAgICBzZXNzaW9uVG9rZW46IHNlc3Npb25Ub2tlbixcbiAgICB9KVxuICAgICAgLnRoZW4oYXV0aCA9PiB7XG4gICAgICAgIHJldHVybiB7IGF1dGgsIHVzZXJJZDogYXV0aCAmJiBhdXRoLnVzZXIgJiYgYXV0aC51c2VyLmlkIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gVGhlcmUgd2FzIGFuIGVycm9yIHdpdGggdGhlIHNlc3Npb24gdG9rZW5cbiAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zPzogYW55LFxuICAgIG9iamVjdD86IGFueSxcbiAgICBjbGllbnQ/OiBhbnksXG4gICAgcmVxdWVzdElkPzogbnVtYmVyLFxuICAgIG9wPzogc3RyaW5nXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gdHJ5IHRvIG1hdGNoIG9uIHVzZXIgZmlyc3QsIGxlc3MgZXhwZW5zaXZlIHRoYW4gd2l0aCByb2xlc1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gWycqJ107XG4gICAgbGV0IHVzZXJJZDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgIH1cbiAgICB0cnkge1xuICAgICAgYXdhaXQgU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIG9wXG4gICAgICApO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYEZhaWxlZCBtYXRjaGluZyBDTFAgZm9yICR7b2JqZWN0LmlkfSAke3VzZXJJZH0gJHtlfWApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBUT0RPOiBoYW5kbGUgcm9sZXMgcGVybWlzc2lvbnNcbiAgICAvLyBPYmplY3Qua2V5cyhjbGFzc0xldmVsUGVybWlzc2lvbnMpLmZvckVhY2goKGtleSkgPT4ge1xuICAgIC8vICAgY29uc3QgcGVybSA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9uc1trZXldO1xuICAgIC8vICAgT2JqZWN0LmtleXMocGVybSkuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICAgIGlmIChrZXkuaW5kZXhPZigncm9sZScpKVxuICAgIC8vICAgfSk7XG4gICAgLy8gfSlcbiAgICAvLyAvLyBpdCdzIHJlamVjdGVkIGhlcmUsIGNoZWNrIHRoZSByb2xlc1xuICAgIC8vIHZhciByb2xlc1F1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpO1xuICAgIC8vIHJvbGVzUXVlcnkuZXF1YWxUbyhcInVzZXJzXCIsIHVzZXIpO1xuICAgIC8vIHJldHVybiByb2xlc1F1ZXJ5LmZpbmQoe3VzZU1hc3RlcktleTp0cnVlfSk7XG4gIH1cblxuICBhc3luYyBfZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM/OiBhbnksXG4gICAgcmVzPzogYW55LFxuICAgIGNsaWVudD86IGFueSxcbiAgICByZXF1ZXN0SWQ/OiBudW1iZXIsXG4gICAgb3A/OiBzdHJpbmcsXG4gICAgcXVlcnk/OiBhbnlcbiAgKSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCwgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IG9iaiA9PiB7XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHMgfHwgW107XG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkgJiYgIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBnZXREYXRhYmFzZUNvbnRyb2xsZXIodGhpcy5jb25maWcpLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgY2xpZW50QXV0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIERhdGFiYXNlQ29udHJvbGxlci5maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIGNsaWVudEF1dGgsXG4gICAgICAgIG9wLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIHJlcy5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgIG9iaixcbiAgICAgICAgcXVlcnlcbiAgICAgICk7XG4gICAgfTtcbiAgICByZXMub2JqZWN0ID0gZmlsdGVyKHJlcy5vYmplY3QpO1xuICAgIHJlcy5vcmlnaW5hbCA9IGZpbHRlcihyZXMub3JpZ2luYWwpO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW4/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBnZXRTZXNzaW9uRnJvbUNsaWVudCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgIH07XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHNlc3Npb25Ub2tlbiA9IGdldFNlc3Npb25Gcm9tQ2xpZW50KCk7XG4gICAgfVxuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbik7XG4gICAgcmV0dXJuIGF1dGg7XG4gIH1cblxuICBfY2hlY2tXYXRjaEZpZWxkcyhjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBhbnksIG1lc3NhZ2U6IGFueSkge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGNvbnN0IHdhdGNoID0gc3Vic2NyaXB0aW9uSW5mbz8ud2F0Y2g7XG4gICAgaWYgKCF3YXRjaCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IG9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIGNvbnN0IG9yaWdpbmFsID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIHJldHVybiB3YXRjaC5zb21lKGZpZWxkID0+ICFpc0RlZXBTdHJpY3RFcXVhbChvYmplY3QuZ2V0KGZpZWxkKSwgb3JpZ2luYWw/LmdldChmaWVsZCkpKTtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHVzZXI6IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcignQENvbm5lY3QnLCAnYmVmb3JlQ29ubmVjdCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxLnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcS51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZUNvbm5lY3QuQENvbm5lY3RgLCByZXEsIGF1dGgpO1xuICAgICAgfVxuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIGxldCBhdXRoQ2FsbGVkID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2JlZm9yZVN1YnNjcmliZScsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICAgICAgICBwYXJzZVF1ZXJ5LndpdGhKU09OKHJlcXVlc3QucXVlcnkpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlU3Vic2NyaWJlLiR7Y2xhc3NOYW1lfWAsIHJlcXVlc3QsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgICAgfVxuXG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSB7XG4gICAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLnVzZXIgPSByZXF1ZXN0LnVzZXIudG9Qb2ludGVyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm86IGFueSA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5rZXlzKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ua2V5cyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5xdWVyeS5rZXlzKVxuICAgICAgICAgID8gcmVxdWVzdC5xdWVyeS5rZXlzXG4gICAgICAgICAgOiByZXF1ZXN0LnF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LndhdGNoKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8ud2F0Y2ggPSByZXF1ZXN0LnF1ZXJ5LndhdGNoO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlU3Vic2NyaWJlIG9uICR7Y2xhc3NOYW1lfSBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhw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