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
      await Promise.all([...[...this.clients.values()].map(client => client.parseWebSocket.ws.close()), this.parseWebSocketServer.close(), ...Array.from(this.subscriber.subscriptions.keys()).map(key => this.subscriber.unsubscribe(key)), this.subscriber.close?.()]);
    }
    this.subscriber.isOpen = false;
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
        installationId: request.installationId
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdHYiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX1N1YnNjcmlwdGlvbiIsIl9DbGllbnQiLCJfUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJfbG9nZ2VyIiwiX1JlcXVlc3RTY2hlbWEiLCJfUXVlcnlUb29scyIsIl9QYXJzZVB1YlN1YiIsIl9TY2hlbWFDb250cm9sbGVyIiwiX2xvZGFzaCIsIl91dWlkIiwiX3RyaWdnZXJzIiwiX0F1dGgiLCJfQ29udHJvbGxlcnMiLCJfbHJ1Q2FjaGUiLCJfVXNlcnNSb3V0ZXIiLCJfRGF0YWJhc2VDb250cm9sbGVyIiwiX3V0aWwiLCJfZGVlcGNvcHkiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwidHRsIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJjb25uZWN0IiwiaXNPcGVuIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfY3JlYXRlU3Vic2NyaWJlcnMiLCJzaHV0ZG93biIsImFsbCIsInZhbHVlcyIsIm1hcCIsImNsaWVudCIsInBhcnNlV2ViU29ja2V0Iiwid3MiLCJjbG9zZSIsIkFycmF5IiwiZnJvbSIsInVuc3Vic2NyaWJlIiwibWVzc2FnZVJlY2lldmVkIiwiY2hhbm5lbCIsIm1lc3NhZ2VTdHIiLCJtZXNzYWdlIiwiSlNPTiIsInBhcnNlIiwiZXJyb3IiLCJfY2xlYXJDYWNoZWRSb2xlcyIsInVzZXJJZCIsIl9pbmZsYXRlUGFyc2VPYmplY3QiLCJfb25BZnRlclNhdmUiLCJfb25BZnRlckRlbGV0ZSIsIm9uIiwiZmllbGQiLCJzdWJzY3JpYmUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJmb3JFYWNoIiwicmVxdWVzdElkIiwiYWNsIiwiZ2V0QUNMIiwib3AiLCJfZ2V0Q0xQT3BlcmF0aW9uIiwicXVlcnkiLCJyZXMiLCJfbWF0Y2hlc0NMUCIsImlzTWF0Y2hlZCIsIl9tYXRjaGVzQUNMIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInRyaWdnZXIiLCJnZXRUcmlnZ2VyIiwiYXV0aCIsImdldEF1dGhGcm9tQ2xpZW50IiwidXNlciIsImZyb21KU09OIiwicnVuVHJpZ2dlciIsInRvSlNPTndpdGhPYmplY3RzIiwiX2ZpbHRlclNlbnNpdGl2ZURhdGEiLCJwdXNoRGVsZXRlIiwicmVzb2x2ZUVycm9yIiwiQ2xpZW50IiwicHVzaEVycm9yIiwiY29kZSIsInN0cmluZ2lmeSIsImlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkIiwiaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCIsIm9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlIiwib3JpZ2luYWxBQ0wiLCJjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlIiwiY3VycmVudEFDTCIsImlzT3JpZ2luYWxNYXRjaGVkIiwiaXNDdXJyZW50TWF0Y2hlZCIsImhhc2giLCJ0eXBlIiwid2F0Y2hGaWVsZHNDaGFuZ2VkIiwiX2NoZWNrV2F0Y2hGaWVsZHMiLCJvcmlnaW5hbCIsImZ1bmN0aW9uTmFtZSIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJyZXF1ZXN0IiwidHY0IiwidmFsaWRhdGUiLCJSZXF1ZXN0U2NoZW1hIiwiX2hhbmRsZUNvbm5lY3QiLCJfaGFuZGxlU3Vic2NyaWJlIiwiX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbiIsIl9oYW5kbGVVbnN1YnNjcmliZSIsImluZm8iLCJoYXMiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZGVsZXRlIiwic3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm9zIiwiZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uIiwiaGFzU3Vic2NyaWJpbmdDbGllbnQiLCJtYXRjaGVzUXVlcnkiLCJkZWVwY29weSIsInZhbGlkVG9rZW5zIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsIlVzZXIiLCJjcmVhdGVXaXRob3V0RGF0YSIsImZpbmQiLCJ0b2tlbiIsImF1dGhQcm9taXNlIiwiYXV0aDEiLCJhdXRoMiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJjbGVhclJvbGVDYWNoZSIsImZyb21DYWNoZSIsInRoZW4iLCJjYXRjaCIsInJlc3VsdCIsIkVycm9yIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImFjbEdyb3VwIiwicHVzaCIsIlNjaGVtYUNvbnRyb2xsZXIiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJjbGllbnRBdXRoIiwiZmlsdGVyIiwib2JqIiwicHJvdGVjdGVkRmllbGRzIiwiaXNBcnJheSIsImdldERhdGFiYXNlQ29udHJvbGxlciIsImFkZFByb3RlY3RlZEZpZWxkcyIsIkRhdGFiYXNlQ29udHJvbGxlciIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJsZW5ndGgiLCJvYmplY3RJZCIsIl92ZXJpZnlBQ0wiLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50Iiwid2F0Y2giLCJpc0RlZXBTdHJpY3RFcXVhbCIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwidXVpZHY0IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsImF1dGhDYWxsZWQiLCJwYXJzZVF1ZXJ5Iiwid2l0aEpTT04iLCJ3aGVyZSIsInRvUG9pbnRlciIsIm1hc3RlciIsInN1YnNjcmlwdGlvbkhhc2giLCJxdWVyeUhhc2giLCJTdWJzY3JpcHRpb24iLCJzcGxpdCIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJhZGRDbGllbnRTdWJzY3JpcHRpb24iLCJwdXNoU3Vic2NyaWJlIiwibm90aWZ5Q2xpZW50IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsInB1c2hVbnN1YnNjcmliZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgZ2V0VHJpZ2dlcixcbiAgcnVuVHJpZ2dlcixcbiAgcmVzb2x2ZUVycm9yLFxuICB0b0pTT053aXRoT2JqZWN0cyxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyLCBnZXREYXRhYmFzZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBMUlVDYWNoZSBhcyBMUlUgfSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFVzZXJSb3V0ZXIgZnJvbSAnLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgdHRsOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICB0aGlzLnN1YnNjcmliZXIgPSBQYXJzZVB1YlN1Yi5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG4gICAgaWYgKCF0aGlzLnN1YnNjcmliZXIuY29ubmVjdCkge1xuICAgICAgdGhpcy5jb25uZWN0KCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY29ubmVjdCgpIHtcbiAgICBpZiAodGhpcy5zdWJzY3JpYmVyLmlzT3Blbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuc3Vic2NyaWJlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zdWJzY3JpYmVyLmNvbm5lY3QoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5pc09wZW4gPSB0cnVlO1xuICAgIH1cbiAgICB0aGlzLl9jcmVhdGVTdWJzY3JpYmVycygpO1xuICB9XG5cbiAgYXN5bmMgc2h1dGRvd24oKSB7XG4gICAgaWYgKHRoaXMuc3Vic2NyaWJlci5pc09wZW4pIHtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgLi4uWy4uLnRoaXMuY2xpZW50cy52YWx1ZXMoKV0ubWFwKGNsaWVudCA9PiBjbGllbnQucGFyc2VXZWJTb2NrZXQud3MuY2xvc2UoKSksXG4gICAgICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIuY2xvc2UoKSxcbiAgICAgICAgLi4uQXJyYXkuZnJvbSh0aGlzLnN1YnNjcmliZXIuc3Vic2NyaXB0aW9ucy5rZXlzKCkpLm1hcChrZXkgPT5cbiAgICAgICAgICB0aGlzLnN1YnNjcmliZXIudW5zdWJzY3JpYmUoa2V5KVxuICAgICAgICApLFxuICAgICAgICB0aGlzLnN1YnNjcmliZXIuY2xvc2U/LigpLFxuICAgICAgXSk7XG4gICAgfVxuICAgIHRoaXMuc3Vic2NyaWJlci5pc09wZW4gPSBmYWxzZTtcbiAgfVxuXG4gIF9jcmVhdGVTdWJzY3JpYmVycygpIHtcbiAgICBjb25zdCBtZXNzYWdlUmVjaWV2ZWQgPSAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2NsZWFyQ2FjaGUnKSB7XG4gICAgICAgIHRoaXMuX2NsZWFyQ2FjaGVkUm9sZXMobWVzc2FnZS51c2VySWQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aGlzLl9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZSk7XG4gICAgICBpZiAoY2hhbm5lbCA9PT0gUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJTYXZlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJykge1xuICAgICAgICB0aGlzLl9vbkFmdGVyRGVsZXRlKG1lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdHZXQgbWVzc2FnZSAlcyBmcm9tIHVua25vd24gY2hhbm5lbCAlaicsIG1lc3NhZ2UsIGNoYW5uZWwpO1xuICAgICAgfVxuICAgIH07XG4gICAgdGhpcy5zdWJzY3JpYmVyLm9uKCdtZXNzYWdlJywgKGNoYW5uZWwsIG1lc3NhZ2VTdHIpID0+IG1lc3NhZ2VSZWNpZXZlZChjaGFubmVsLCBtZXNzYWdlU3RyKSk7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBbJ2FmdGVyU2F2ZScsICdhZnRlckRlbGV0ZScsICdjbGVhckNhY2hlJ10pIHtcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfSR7ZmllbGR9YDtcbiAgICAgIHRoaXMuc3Vic2NyaWJlci5zdWJzY3JpYmUoY2hhbm5lbCwgbWVzc2FnZVN0ciA9PiBtZXNzYWdlUmVjaWV2ZWQoY2hhbm5lbCwgbWVzc2FnZVN0cikpO1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgSlNPTiBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0IEpTT04uXG4gIF9pbmZsYXRlUGFyc2VPYmplY3QobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgLy8gSW5mbGF0ZSBtZXJnZWQgb2JqZWN0XG4gICAgY29uc3QgY3VycmVudFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKGN1cnJlbnRQYXJzZU9iamVjdCk7XG4gICAgbGV0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbGV0IHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgLy8gSW5mbGF0ZSBvcmlnaW5hbCBvYmplY3RcbiAgICBjb25zdCBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0O1xuICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICBVc2VyUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXMob3JpZ2luYWxQYXJzZU9iamVjdCk7XG4gICAgICBjbGFzc05hbWUgPSBvcmlnaW5hbFBhcnNlT2JqZWN0LmNsYXNzTmFtZTtcbiAgICAgIHBhcnNlT2JqZWN0ID0gbmV3IFBhcnNlLk9iamVjdChjbGFzc05hbWUpO1xuICAgICAgcGFyc2VPYmplY3QuX2ZpbmlzaEZldGNoKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0ID0gcGFyc2VPYmplY3Q7XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlckRlbGV0ZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IGRlbGV0ZWRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJWogfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGRlbGV0ZWRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGNsYXNzU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgaXNTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihkZWxldGVkUGFyc2VPYmplY3QsIHN1YnNjcmlwdGlvbik7XG4gICAgICBpZiAoIWlzU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICBjb25zdCBhY2wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAvLyBDaGVjayBDTFBcbiAgICAgICAgICBjb25zdCBvcCA9IHRoaXMuX2dldENMUE9wZXJhdGlvbihzdWJzY3JpcHRpb24ucXVlcnkpO1xuICAgICAgICAgIGxldCByZXMgPSB7fTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fbWF0Y2hlc0NMUChcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgaXNNYXRjaGVkID0gYXdhaXQgdGhpcy5fbWF0Y2hlc0FDTChhY2wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGlmICghaXNNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzID0ge1xuICAgICAgICAgICAgICBldmVudDogJ2RlbGV0ZScsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBkZWxldGVkUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICBzZW5kRXZlbnQ6IHRydWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYWZ0ZXJFdmVudCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLnF1ZXJ5XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlclNhdmUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG51bGw7XG4gICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgbGV0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGN1cnJlbnRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgY29uc3QgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKG9yaWdpbmFsQUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IFtpc09yaWdpbmFsTWF0Y2hlZCwgaXNDdXJyZW50TWF0Y2hlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgICAgICAgJ09yaWdpbmFsICVqIHwgQ3VycmVudCAlaiB8IE1hdGNoOiAlcywgJXMsICVzLCAlcyB8IFF1ZXJ5OiAlcycsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdlbnRlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjcmVhdGUnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHdhdGNoRmllbGRzQ2hhbmdlZCA9IHRoaXMuX2NoZWNrV2F0Y2hGaWVsZHMoY2xpZW50LCByZXF1ZXN0SWQsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgaWYgKCF3YXRjaEZpZWxkc0NoYW5nZWQgJiYgKHR5cGUgPT09ICd1cGRhdGUnIHx8IHR5cGUgPT09ICdjcmVhdGUnKSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCkge1xuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub3JpZ2luYWwpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KGRlZXBjb3B5KHBhcnNlT2JqZWN0KSwgc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgfVxuXG4gIGFzeW5jIF9jbGVhckNhY2hlZFJvbGVzKHVzZXJJZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHZhbGlkVG9rZW5zID0gYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAgIC5lcXVhbFRvKCd1c2VyJywgUGFyc2UuVXNlci5jcmVhdGVXaXRob3V0RGF0YSh1c2VySWQpKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICB2YWxpZFRva2Vucy5tYXAoYXN5bmMgdG9rZW4gPT4ge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHRva2VuLmdldCgnc2Vzc2lvblRva2VuJyk7XG4gICAgICAgICAgY29uc3QgYXV0aFByb21pc2UgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICBpZiAoIWF1dGhQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IFthdXRoMSwgYXV0aDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgYXV0aFByb21pc2UsXG4gICAgICAgICAgICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuKHsgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlciwgc2Vzc2lvblRva2VuIH0pLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGF1dGgxLmF1dGg/LmNsZWFyUm9sZUNhY2hlKHNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgYXV0aDIuYXV0aD8uY2xlYXJSb2xlQ2FjaGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgICB0aGlzLmF1dGhDYWNoZS5kZWxldGUoc2Vzc2lvblRva2VuKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoYENvdWxkIG5vdCBjbGVhciByb2xlIGNhY2hlLiAke2V9YCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbGV0ZShzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIGFzeW5jIF9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogP2FueSxcbiAgICByZXM6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlcixcbiAgICBvcDogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnlcbiAgKSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCwgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IG9iaiA9PiB7XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHMgfHwgW107XG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkgJiYgIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBnZXREYXRhYmFzZUNvbnRyb2xsZXIodGhpcy5jb25maWcpLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgY2xpZW50QXV0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIERhdGFiYXNlQ29udHJvbGxlci5maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgIGNsaWVudEF1dGgsXG4gICAgICAgIG9wLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIHJlcy5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgIG9iaixcbiAgICAgICAgcXVlcnlcbiAgICAgICk7XG4gICAgfTtcbiAgICByZXMub2JqZWN0ID0gZmlsdGVyKHJlcy5vYmplY3QpO1xuICAgIHJlcy5vcmlnaW5hbCA9IGZpbHRlcihyZXMub3JpZ2luYWwpO1xuICB9XG5cbiAgX2dldENMUE9wZXJhdGlvbihxdWVyeTogYW55KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBxdWVyeSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT0gMSAmJlxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICAgPyAnZ2V0J1xuICAgICAgOiAnZmluZCc7XG4gIH1cblxuICBhc3luYyBfdmVyaWZ5QUNMKGFjbDogYW55LCB0b2tlbjogc3RyaW5nKSB7XG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHsgYXV0aCwgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4odG9rZW4pO1xuXG4gICAgLy8gR2V0dGluZyB0aGUgc2Vzc2lvbiB0b2tlbiBmYWlsZWRcbiAgICAvLyBUaGlzIG1lYW5zIHRoYXQgbm8gYWRkaXRpb25hbCBhdXRoIGlzIGF2YWlsYWJsZVxuICAgIC8vIEF0IHRoaXMgcG9pbnQsIGp1c3QgYmFpbCBvdXQgYXMgbm8gYWRkaXRpb25hbCB2aXNpYmlsaXR5IGNhbiBiZSBpbmZlcnJlZC5cbiAgICBpZiAoIWF1dGggfHwgIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQgPSBhY2wuZ2V0UmVhZEFjY2Vzcyh1c2VySWQpO1xuICAgIGlmIChpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSB1c2VyIGhhcyBhbnkgcm9sZXMgdGhhdCBtYXRjaCB0aGUgQUNMXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIC8vIFJlc29sdmUgZmFsc2UgcmlnaHQgYXdheSBpZiB0aGUgYWNsIGRvZXNuJ3QgaGF2ZSBhbnkgcm9sZXNcbiAgICAgICAgY29uc3QgYWNsX2hhc19yb2xlcyA9IE9iamVjdC5rZXlzKGFjbC5wZXJtaXNzaW9uc0J5SWQpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKCdyb2xlOicpKTtcbiAgICAgICAgaWYgKCFhY2xfaGFzX3JvbGVzKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW46IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIF9jaGVja1dhdGNoRmllbGRzKGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IGFueSwgbWVzc2FnZTogYW55KSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3Qgd2F0Y2ggPSBzdWJzY3JpcHRpb25JbmZvPy53YXRjaDtcbiAgICBpZiAoIXdhdGNoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qgb2JqZWN0ID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3Q7XG4gICAgY29uc3Qgb3JpZ2luYWwgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gICAgcmV0dXJuIHdhdGNoLnNvbWUoZmllbGQgPT4gIWlzRGVlcFN0cmljdEVxdWFsKG9iamVjdC5nZXQoZmllbGQpLCBvcmlnaW5hbD8uZ2V0KGZpZWxkKSkpO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNBQ0woYWNsOiBhbnksIGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIFJldHVybiB0cnVlIGRpcmVjdGx5IGlmIEFDTCBpc24ndCBwcmVzZW50LCBBQ0wgaXMgcHVibGljIHJlYWQsIG9yIGNsaWVudCBoYXMgbWFzdGVyIGtleVxuICAgIGlmICghYWNsIHx8IGFjbC5nZXRQdWJsaWNSZWFkQWNjZXNzKCkgfHwgY2xpZW50Lmhhc01hc3RlcktleSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHN1YnNjcmlwdGlvbiBzZXNzaW9uVG9rZW4gbWF0Y2hlcyBBQ0wgZmlyc3RcbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uVG9rZW4gPSBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbjtcbiAgICBjb25zdCBjbGllbnRTZXNzaW9uVG9rZW4gPSBjbGllbnQuc2Vzc2lvblRva2VuO1xuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIHN1YnNjcmlwdGlvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGF3YWl0IHRoaXMuX3ZlcmlmeUFDTChhY2wsIGNsaWVudFNlc3Npb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgaWYgKCF0aGlzLl92YWxpZGF0ZUtleXMocmVxdWVzdCwgdGhpcy5rZXlQYWlycykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIDQsICdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIGxvZ2dlci5lcnJvcignS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhhc01hc3RlcktleSA9IHRoaXMuX2hhc01hc3RlcktleShyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IHV1aWR2NCgpO1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoXG4gICAgICBjbGllbnRJZCxcbiAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgaGFzTWFzdGVyS2V5LFxuICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICByZXF1ZXN0Lmluc3RhbGxhdGlvbklkXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICBjbGllbnQsXG4gICAgICAgIGV2ZW50OiAnY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxdWVzdC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH07XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcignQENvbm5lY3QnLCAnYmVmb3JlQ29ubmVjdCcsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxLnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcS51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZUNvbm5lY3QuQENvbm5lY3RgLCByZXEsIGF1dGgpO1xuICAgICAgfVxuICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgPSBjbGllbnRJZDtcbiAgICAgIHRoaXMuY2xpZW50cy5zZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIGNsaWVudCk7XG4gICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlIG5ldyBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9YCk7XG4gICAgICBjbGllbnQucHVzaENvbm5lY3QoKTtcbiAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMocmVxKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZUNvbm5lY3QgZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFzTWFzdGVyS2V5KHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwIHx8ICF2YWxpZEtleVBhaXJzLmhhcygnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0IHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVxdWVzdCwgJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0Lm1hc3RlcktleSA9PT0gdmFsaWRLZXlQYWlycy5nZXQoJ21hc3RlcktleScpO1xuICB9XG5cbiAgX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGxldCBpc1ZhbGlkID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBba2V5LCBzZWNyZXRdIG9mIHZhbGlkS2V5UGFpcnMpIHtcbiAgICAgIGlmICghcmVxdWVzdFtrZXldIHx8IHJlcXVlc3Rba2V5XSAhPT0gc2VjcmV0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGlzVmFsaWQ7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlU3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHJlcXVlc3QucXVlcnkuY2xhc3NOYW1lO1xuICAgIGxldCBhdXRoQ2FsbGVkID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2JlZm9yZVN1YnNjcmliZScsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgaWYgKHRyaWdnZXIpIHtcbiAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0LnJlcXVlc3RJZCwgcmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBhdXRoQ2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICAgICAgICBwYXJzZVF1ZXJ5LndpdGhKU09OKHJlcXVlc3QucXVlcnkpO1xuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlU3Vic2NyaWJlLiR7Y2xhc3NOYW1lfWAsIHJlcXVlc3QsIGF1dGgpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgICAgfVxuXG4gICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSB7XG4gICAgICAgIGlmICghYXV0aENhbGxlZCkge1xuICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KFxuICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlblxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0LnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnF1ZXJ5LndoZXJlLnVzZXIgPSByZXF1ZXN0LnVzZXIudG9Qb2ludGVyKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEdldCBzdWJzY3JpcHRpb24gZnJvbSBzdWJzY3JpcHRpb25zLCBjcmVhdGUgb25lIGlmIG5lY2Vzc2FyeVxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSGFzaCA9IHF1ZXJ5SGFzaChyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgIC8vIEFkZCBjbGFzc05hbWUgdG8gc3Vic2NyaXB0aW9ucyBpZiBuZWNlc3NhcnlcblxuICAgICAgaWYgKCF0aGlzLnN1YnNjcmlwdGlvbnMuaGFzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChjbGFzc05hbWUsIG5ldyBNYXAoKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICBsZXQgc3Vic2NyaXB0aW9uO1xuICAgICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5oYXMoc3Vic2NyaXB0aW9uSGFzaCkpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gY2xhc3NTdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IG5ldyBTdWJzY3JpcHRpb24oY2xhc3NOYW1lLCByZXF1ZXN0LnF1ZXJ5LndoZXJlLCBzdWJzY3JpcHRpb25IYXNoKTtcbiAgICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb25IYXNoLCBzdWJzY3JpcHRpb24pO1xuICAgICAgfVxuXG4gICAgICAvLyBBZGQgc3Vic2NyaXB0aW9uSW5mbyB0byBjbGllbnRcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbjogc3Vic2NyaXB0aW9uLFxuICAgICAgfTtcbiAgICAgIC8vIEFkZCBzZWxlY3RlZCBmaWVsZHMsIHNlc3Npb25Ub2tlbiBhbmQgaW5zdGFsbGF0aW9uSWQgZm9yIHRoaXMgc3Vic2NyaXB0aW9uIGlmIG5lY2Vzc2FyeVxuICAgICAgaWYgKHJlcXVlc3QucXVlcnkua2V5cykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmtleXMgPSBBcnJheS5pc0FycmF5KHJlcXVlc3QucXVlcnkua2V5cylcbiAgICAgICAgICA/IHJlcXVlc3QucXVlcnkua2V5c1xuICAgICAgICAgIDogcmVxdWVzdC5xdWVyeS5rZXlzLnNwbGl0KCcsJyk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS53YXRjaCkge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLndhdGNoID0gcmVxdWVzdC5xdWVyeS53YXRjaDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEdBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGFBQUEsR0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLHFCQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxjQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxXQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxZQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxpQkFBQSxHQUFBVixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVUsT0FBQSxHQUFBWCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVcsS0FBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksU0FBQSxHQUFBWixPQUFBO0FB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