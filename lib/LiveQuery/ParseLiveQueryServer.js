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

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseLiveQueryServer {
  // className -> (queryHash -> subscription)
  // The subscriber we use to get object update from publisher
  constructor(server, config = {}, parseServerConfig = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.config = config;
    config.appId = config.appId || _node.default.applicationId;
    config.masterKey = config.masterKey || _node.default.masterKey; // Store keys, convert obj to map

    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();

    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }

    _logger.default.verbose('Support key pairs', this.keyPairs); // Initialize Parse


    _node.default.Object.disableSingleInstance();

    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;

    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey); // The cache controller is a proper cache controller
    // with access to User and Roles


    this.cacheController = (0, _Controllers.getCacheController)(parseServerConfig);
    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s
    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.

    this.authCache = new _lruCache.default({
      max: 500,
      // 500 concurrent
      maxAge: config.cacheTimeout
    }); // Initialize websocket server

    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config); // Initialize subscriber

    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete'); // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.

    this.subscriber.on('message', (channel, messageStr) => {
      _logger.default.verbose('Subscribe message %j', messageStr);

      let message;

      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger.default.error('unable to parse message', messageStr, e);

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
    });
  } // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.


  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;

    _UsersRouter.default.removeHiddenProperties(currentParseObject);

    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);

    parseObject._finishFetch(currentParseObject);

    message.currentParseObject = parseObject; // Inflate original object

    const originalParseObject = message.originalParseObject;

    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);

      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);

      parseObject._finishFetch(originalParseObject);

      message.originalParseObject = parseObject;
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
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
          const acl = message.currentParseObject.getACL(); // Check CLP

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

            if ((deletedParseObject.className === '_User' || deletedParseObject.className === '_Session') && !client.hasMasterKey) {
              delete deletedParseObject.sessionToken;
              delete deletedParseObject.authData;
            }

            client.pushDelete(requestId, deletedParseObject);
          } catch (error) {
            _Client.Client.pushError(client.parseWebSocket, error.code || 141, error.message || error, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
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
          } // Set current ParseObject ACL checking promise, if the object does not match
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

            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash); // Decide event type


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

            if ((currentParseObject.className === '_User' || currentParseObject.className === '_Session') && !client.hasMasterKey) {
              var _originalParseObject, _originalParseObject2;

              delete currentParseObject.sessionToken;
              (_originalParseObject = originalParseObject) === null || _originalParseObject === void 0 ? true : delete _originalParseObject.sessionToken;
              delete currentParseObject.authData;
              (_originalParseObject2 = originalParseObject) === null || _originalParseObject2 === void 0 ? true : delete _originalParseObject2.authData;
            }

            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);

            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
            }
          } catch (error) {
            _Client.Client.pushError(client.parseWebSocket, error.code || 141, error.message || error, false, requestId);

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

      _logger.default.verbose('Request: %j', request); // Check whether this request is a valid request, return error directly if not


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
      } // Delete client


      const client = this.clients.get(clientId);
      this.clients.delete(clientId); // Delete client from subscriptions

      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

        const classSubscriptions = this.subscriptions.get(subscription.className);

        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        } // If there is no subscriptions under this class, remove it from subscriptions


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

    return (0, _QueryTools.matchesQuery)(parseObject, subscription.query);
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
        this.authCache.del(sessionToken);
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
    } // TODO: handle roles permissions
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
    } = await this.getAuthForSessionToken(token); // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.

    if (!auth || !userId) {
      return false;
    }

    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);

    if (isSubscriptionSessionTokenMatched) {
      return true;
    } // Check if the user has any roles that match the ACL


    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));

      if (!acl_has_roles) {
        return false;
      }

      const roleNames = await auth.getUserRoles(); // Finally, see if any of the user's roles allow them read access

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

  async _matchesACL(acl, client, requestId) {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    } // Check subscription sessionToken matches ACL first


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
    } catch (error) {
      _Client.Client.pushError(parseWebsocket, error.code || 141, error.message || error, false);

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

        if (query.keys) {
          query.fields = query.keys.split(',');
        }

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
      } // Get subscription from subscriptions, create one if necessary


      const subscriptionHash = (0, _QueryTools.queryHash)(request.query); // Add className to subscriptions if necessary

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
      } // Add subscriptionInfo to client


      const subscriptionInfo = {
        subscription: subscription
      }; // Add selected fields, sessionToken and installationId for this subscription if necessary

      if (request.query.fields) {
        subscriptionInfo.fields = request.query.fields;
      }

      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }

      client.addSubscriptionInfo(request.requestId, subscriptionInfo); // Add clientId to subscription

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
      _Client.Client.pushError(parseWebsocket, e.code || 141, e.message || e, false, request.requestId);

      _logger.default.error(`Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(e));
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
    } // Remove subscription from client


    client.deleteSubscriptionInfo(requestId); // Remove client from subscription

    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

    const classSubscriptions = this.subscriptions.get(className);

    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    } // If there is no subscriptions under this class, remove it from subscriptions


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsImNvbmZpZyIsInBhcnNlU2VydmVyQ29uZmlnIiwiY2xpZW50cyIsIk1hcCIsInN1YnNjcmlwdGlvbnMiLCJhcHBJZCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsIm1hc3RlcktleSIsImtleVBhaXJzIiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInNldCIsImxvZ2dlciIsInZlcmJvc2UiLCJkaXNhYmxlU2luZ2xlSW5zdGFuY2UiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiamF2YVNjcmlwdEtleSIsImNhY2hlQ29udHJvbGxlciIsImNhY2hlVGltZW91dCIsImF1dGhDYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsInBhcnNlV2ViU29ja2V0U2VydmVyIiwiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJwYXJzZVdlYnNvY2tldCIsIl9vbkNvbm5lY3QiLCJzdWJzY3JpYmVyIiwiUGFyc2VQdWJTdWIiLCJjcmVhdGVTdWJzY3JpYmVyIiwic3Vic2NyaWJlIiwib24iLCJjaGFubmVsIiwibWVzc2FnZVN0ciIsIm1lc3NhZ2UiLCJKU09OIiwicGFyc2UiLCJlIiwiZXJyb3IiLCJfaW5mbGF0ZVBhcnNlT2JqZWN0IiwiX29uQWZ0ZXJTYXZlIiwiX29uQWZ0ZXJEZWxldGUiLCJjdXJyZW50UGFyc2VPYmplY3QiLCJVc2VyUm91dGVyIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsImNsYXNzTmFtZSIsInBhcnNlT2JqZWN0IiwiX2ZpbmlzaEZldGNoIiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImRlbGV0ZWRQYXJzZU9iamVjdCIsInRvSlNPTiIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlkIiwic2l6ZSIsImNsYXNzU3Vic2NyaXB0aW9ucyIsImdldCIsImRlYnVnIiwic3Vic2NyaXB0aW9uIiwidmFsdWVzIiwiaXNTdWJzY3JpcHRpb25NYXRjaGVkIiwiX21hdGNoZXNTdWJzY3JpcHRpb24iLCJjbGllbnRJZCIsInJlcXVlc3RJZHMiLCJfIiwiZW50cmllcyIsImNsaWVudFJlcXVlc3RJZHMiLCJjbGllbnQiLCJmb3JFYWNoIiwicmVxdWVzdElkIiwiYWNsIiwiZ2V0QUNMIiwib3AiLCJfZ2V0Q0xQT3BlcmF0aW9uIiwicXVlcnkiLCJyZXMiLCJfbWF0Y2hlc0NMUCIsImlzTWF0Y2hlZCIsIl9tYXRjaGVzQUNMIiwiZXZlbnQiLCJzZXNzaW9uVG9rZW4iLCJvYmplY3QiLCJ1c2VNYXN0ZXJLZXkiLCJoYXNNYXN0ZXJLZXkiLCJpbnN0YWxsYXRpb25JZCIsInNlbmRFdmVudCIsInRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJhdXRoRGF0YSIsInB1c2hEZWxldGUiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJwYXJzZVdlYlNvY2tldCIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwib3JpZ2luYWxBQ0wiLCJjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlIiwiY3VycmVudEFDTCIsImlzT3JpZ2luYWxNYXRjaGVkIiwiaXNDdXJyZW50TWF0Y2hlZCIsImFsbCIsImhhc2giLCJ0eXBlIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwiZGVsZXRlIiwic3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm9zIiwiZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uIiwiaGFzU3Vic2NyaWJpbmdDbGllbnQiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiZnJvbUNhY2hlIiwiYXV0aFByb21pc2UiLCJ0aGVuIiwidXNlcklkIiwiY2F0Y2giLCJyZXN1bHQiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsImRlbCIsImdldFN1YnNjcmlwdGlvbkluZm8iLCJhY2xHcm91cCIsInB1c2giLCJTY2hlbWFDb250cm9sbGVyIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwidG9rZW4iLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50IiwiZ2V0UHVibGljUmVhZEFjY2VzcyIsInN1YnNjcmlwdGlvblRva2VuIiwiY2xpZW50U2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlS2V5cyIsIl9oYXNNYXN0ZXJLZXkiLCJyZXEiLCJwdXNoQ29ubmVjdCIsInZhbGlkS2V5UGFpcnMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpc1ZhbGlkIiwic2VjcmV0IiwiYXV0aENhbGxlZCIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwiZmllbGRzIiwic3BsaXQiLCJ3aGVyZSIsInRvUG9pbnRlciIsIm1hc3RlciIsInN1YnNjcmlwdGlvbkhhc2giLCJTdWJzY3JpcHRpb24iLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1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QSxRQUFJLENBQUNZLFlBQVksQ0FBQ3dFLG9CQUFiLEVBQUwsRUFBMEM7QUFDeEMzRSxNQUFBQSxrQkFBa0IsQ0FBQ3VFLE1BQW5CLENBQTBCcEUsWUFBWSxDQUFDbUQsSUFBdkM7QUFDRCxLQXpEc0YsQ0EwRHZGOzs7QUFDQSxRQUFJdEQsa0JBQWtCLENBQUNELElBQW5CLEtBQTRCLENBQWhDLEVBQW1DO0FBQ2pDLFdBQUtwRCxhQUFMLENBQW1CNEgsTUFBbkIsQ0FBMEJoRixTQUExQjtBQUNEOztBQUNELDZDQUEwQjtBQUN4QnFCLE1BQUFBLE1BRHdCO0FBRXhCWSxNQUFBQSxLQUFLLEVBQUUsYUFGaUI7QUFHeEIvRSxNQUFBQSxPQUFPLEVBQUUsS0FBS0EsT0FBTCxDQUFhc0QsSUFIRTtBQUl4QnBELE1BQUFBLGFBQWEsRUFBRSxLQUFLQSxhQUFMLENBQW1Cb0QsSUFKVjtBQUt4QjBCLE1BQUFBLFlBQVksRUFBRStDLGdCQUFnQixDQUFDL0MsWUFMUDtBQU14QkUsTUFBQUEsWUFBWSxFQUFFZixNQUFNLENBQUNnQixZQU5HO0FBT3hCQyxNQUFBQSxjQUFjLEVBQUVqQixNQUFNLENBQUNpQjtBQVBDLEtBQTFCOztBQVVBLFFBQUksQ0FBQ3VHLFlBQUwsRUFBbUI7QUFDakI7QUFDRDs7QUFFRHhILElBQUFBLE1BQU0sQ0FBQzBILGVBQVAsQ0FBdUJ6RSxPQUFPLENBQUMvQyxTQUEvQjs7QUFFQXpELG9CQUFPQyxPQUFQLENBQ0csa0JBQWlCYSxjQUFjLENBQUNvQyxRQUFTLG9CQUFtQnNELE9BQU8sQ0FBQy9DLFNBQVUsRUFEakY7QUFHRDs7QUFwNEJ3QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHsgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycywgZ2V0VHJpZ2dlciwgcnVuVHJpZ2dlciwgdG9KU09Od2l0aE9iamVjdHMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgbWF4QWdlOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcblxuICAgIC8vIEluaXRpYWxpemUgc3Vic2NyaWJlclxuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJyk7XG4gICAgLy8gUmVnaXN0ZXIgbWVzc2FnZSBoYW5kbGVyIGZvciBzdWJzY3JpYmVyLiBXaGVuIHB1Ymxpc2hlciBnZXQgbWVzc2FnZXMsIGl0IHdpbGwgcHVibGlzaCBtZXNzYWdlXG4gICAgLy8gdG8gdGhlIHN1YnNjcmliZXJzIGFuZCB0aGUgaGFuZGxlciB3aWxsIGJlIGNhbGxlZC5cbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2hlZCA9IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0woYWNsLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6ICdkZWxldGUnLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgKGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgfHxcbiAgICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSAmJlxuICAgICAgICAgICAgICAhY2xpZW50Lmhhc01hc3RlcktleVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBkZWxldGVkUGFyc2VPYmplY3Quc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgZGVsZXRlZFBhcnNlT2JqZWN0LmF1dGhEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgICBjbGllbnQucGFyc2VXZWJTb2NrZXQsXG4gICAgICAgICAgICAgIGVycm9yLmNvZGUgfHwgMTQxLFxuICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlIHx8IGVycm9yLFxuICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgcmVxdWVzdElkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlclNhdmUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG51bGw7XG4gICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgbGV0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGN1cnJlbnRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgY29uc3QgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKG9yaWdpbmFsQUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IFtpc09yaWdpbmFsTWF0Y2hlZCwgaXNDdXJyZW50TWF0Y2hlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgICAgICAgJ09yaWdpbmFsICVqIHwgQ3VycmVudCAlaiB8IE1hdGNoOiAlcywgJXMsICVzLCAlcyB8IFF1ZXJ5OiAlcycsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdlbnRlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjcmVhdGUnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6IHR5cGUsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsICYmIHR5cGVvZiByZXMub3JpZ2luYWwudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwsXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgKGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgfHxcbiAgICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSAmJlxuICAgICAgICAgICAgICAhY2xpZW50Lmhhc01hc3RlcktleVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBjdXJyZW50UGFyc2VPYmplY3Quc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgb3JpZ2luYWxQYXJzZU9iamVjdD8uc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgY3VycmVudFBhcnNlT2JqZWN0LmF1dGhEYXRhO1xuICAgICAgICAgICAgICBkZWxldGUgb3JpZ2luYWxQYXJzZU9iamVjdD8uYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgICBjbGllbnQucGFyc2VXZWJTb2NrZXQsXG4gICAgICAgICAgICAgIGVycm9yLmNvZGUgfHwgMTQxLFxuICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlIHx8IGVycm9yLFxuICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgcmVxdWVzdElkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbChzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIF9nZXRDTFBPcGVyYXRpb24ocXVlcnk6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09IDEgJiZcbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gJ2dldCdcbiAgICAgIDogJ2ZpbmQnO1xuICB9XG5cbiAgYXN5bmMgX3ZlcmlmeUFDTChhY2w6IGFueSwgdG9rZW46IHN0cmluZykge1xuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGF1dGgsIHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHRva2VuKTtcblxuICAgIC8vIEdldHRpbmcgdGhlIHNlc3Npb24gdG9rZW4gZmFpbGVkXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG5vIGFkZGl0aW9uYWwgYXV0aCBpcyBhdmFpbGFibGVcbiAgICAvLyBBdCB0aGlzIHBvaW50LCBqdXN0IGJhaWwgb3V0IGFzIG5vIGFkZGl0aW9uYWwgdmlzaWJpbGl0eSBjYW4gYmUgaW5mZXJyZWQuXG4gICAgaWYgKCFhdXRoIHx8ICF1c2VySWQpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkID0gYWNsLmdldFJlYWRBY2Nlc3ModXNlcklkKTtcbiAgICBpZiAoaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgdXNlciBoYXMgYW55IHJvbGVzIHRoYXQgbWF0Y2ggdGhlIEFDTFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBSZXNvbHZlIGZhbHNlIHJpZ2h0IGF3YXkgaWYgdGhlIGFjbCBkb2Vzbid0IGhhdmUgYW55IHJvbGVzXG4gICAgICAgIGNvbnN0IGFjbF9oYXNfcm9sZXMgPSBPYmplY3Qua2V5cyhhY2wucGVybWlzc2lvbnNCeUlkKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSk7XG4gICAgICAgIGlmICghYWNsX2hhc19yb2xlcykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW46IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9O1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoJ0BDb25uZWN0JywgJ2JlZm9yZUNvbm5lY3QnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcS5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXEudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVDb25uZWN0LkBDb25uZWN0YCwgcmVxLCBhdXRoKTtcbiAgICAgIH1cbiAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkID0gY2xpZW50SWQ7XG4gICAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgICAgbG9nZ2VyLmluZm8oYENyZWF0ZSBuZXcgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY2xpZW50LnB1c2hDb25uZWN0KCk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHJlcSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IocGFyc2VXZWJzb2NrZXQsIGVycm9yLmNvZGUgfHwgMTQxLCBlcnJvci5tZXNzYWdlIHx8IGVycm9yLCBmYWxzZSk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVDb25uZWN0IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhc01hc3RlcktleShyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCB8fCAhdmFsaWRLZXlQYWlycy5oYXMoJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdCB8fCAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlcXVlc3QsICdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gcmVxdWVzdC5tYXN0ZXJLZXkgPT09IHZhbGlkS2V5UGFpcnMuZ2V0KCdtYXN0ZXJLZXknKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUtleXMocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBsZXQgaXNWYWxpZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2tleSwgc2VjcmV0XSBvZiB2YWxpZEtleVBhaXJzKSB7XG4gICAgICBpZiAoIXJlcXVlc3Rba2V5XSB8fCByZXF1ZXN0W2tleV0gIT09IHNlY3JldCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBpc1ZhbGlkO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnF1ZXJ5LmNsYXNzTmFtZTtcbiAgICBsZXQgYXV0aENhbGxlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdiZWZvcmVTdWJzY3JpYmUnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgICAgICAgYXV0aENhbGxlZCA9IHRydWU7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgICAgICAgcGFyc2VRdWVyeS53aXRoSlNPTihyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZVN1YnNjcmliZS4ke2NsYXNzTmFtZX1gLCByZXF1ZXN0LCBhdXRoKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlcXVlc3QucXVlcnkudG9KU09OKCk7XG4gICAgICAgIGlmIChxdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcXVlcnkuZmllbGRzID0gcXVlcnkua2V5cy5zcGxpdCgnLCcpO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICBpZiAoIWF1dGhDYWxsZWQpIHtcbiAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChcbiAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkLFxuICAgICAgICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW5cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC5xdWVyeS53aGVyZS51c2VyID0gcmVxdWVzdC51c2VyLnRvUG9pbnRlcigpO1xuICAgICAgICB9IGVsc2UgaWYgKCFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkhhc2ggPSBxdWVyeUhhc2gocmVxdWVzdC5xdWVyeSk7XG4gICAgICAvLyBBZGQgY2xhc3NOYW1lIHRvIHN1YnNjcmlwdGlvbnMgaWYgbmVjZXNzYXJ5XG5cbiAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25zLmhhcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NOYW1lLCBuZXcgTWFwKCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgICAgbGV0IHN1YnNjcmlwdGlvbjtcbiAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IGNsYXNzU3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKGNsYXNzTmFtZSwgcmVxdWVzdC5xdWVyeS53aGVyZSwgc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSGFzaCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0ge1xuICAgICAgICBzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgICAvLyBBZGQgc2VsZWN0ZWQgZmllbGRzLCBzZXNzaW9uVG9rZW4gYW5kIGluc3RhbGxhdGlvbklkIGZvciB0aGlzIHN1YnNjcmlwdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmZpZWxkcykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmZpZWxkcyA9IHJlcXVlc3QucXVlcnkuZmllbGRzO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZS5jb2RlIHx8IDE0MSwgZS5tZXNzYWdlIHx8IGUsIGZhbHNlLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVTdWJzY3JpYmUgb24gJHtjbGFzc05hbWV9IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXX0=