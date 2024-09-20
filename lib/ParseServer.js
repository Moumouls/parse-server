"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Options = require("./Options");
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
var _Definitions = _interopRequireDefault(require("./Options/Definitions"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    const interfaces = JSON.parse(JSON.stringify(_Definitions.default));
    function getValidObject(root) {
      const result = {};
      for (const key in root) {
        if (Object.prototype.hasOwnProperty.call(root[key], 'type')) {
          if (root[key].type.endsWith('[]')) {
            result[key] = [getValidObject(interfaces[root[key].type.slice(0, -2)])];
          } else {
            result[key] = getValidObject(interfaces[root[key].type]);
          }
        } else {
          result[key] = '';
        }
      }
      return result;
    }
    const optionsBlueprint = getValidObject(interfaces['ParseServerOptions']);
    function validateKeyNames(original, ref, name = '') {
      let result = [];
      const prefix = name + (name !== '' ? '.' : '');
      for (const key in original) {
        if (!Object.prototype.hasOwnProperty.call(ref, key)) {
          result.push(prefix + key);
        } else {
          if (ref[key] === '') continue;
          let res = [];
          if (Array.isArray(original[key]) && Array.isArray(ref[key])) {
            const type = ref[key][0];
            original[key].forEach((item, idx) => {
              if (typeof item === 'object' && item !== null) {
                res = res.concat(validateKeyNames(item, type, prefix + key + `[${idx}]`));
              }
            });
          } else if (typeof original[key] === 'object' && typeof ref[key] === 'object') {
            res = validateKeyNames(original[key], ref[key], prefix + key);
          }
          result = result.concat(res);
        }
      }
      return result;
    }
    const diff = validateKeyNames(options, optionsBlueprint).filter(item => item.indexOf('databaseOptions.') === -1);
    if (diff.length > 0) {
      const logger = logging.logger;
      logger.error(`Invalid key(s) found in Parse Server configuration: ${diff.join(', ')}`);
    }

    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    _Config.default.validateOptions(options);
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this.config.maintenanceKeyIpsStore = new Map();
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      var _cacheController$adap;
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cacheController,
        cloud,
        security,
        schema,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      const pushController = await controllers.getPushController(this.config);
      await hooksController.load();
      const startupPromises = [];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if ((_cacheController$adap = cacheController.adapter) !== null && _cacheController$adap !== void 0 && _cacheController$adap.connect && typeof cacheController.adapter.connect === 'function') {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          var _json;
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || ((_json = json) === null || _json === void 0 ? void 0 : _json.type) === 'module') {
            await import(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      this.config = _objectSpread(_objectSpread({}, this.config), pushController);
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }
  handleShutdown() {
    var _this$liveQueryServer;
    const promises = [];
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    if ((_this$liveQueryServer = this.liveQueryServer) !== null && _this$liveQueryServer !== void 0 && (_this$liveQueryServer = _this$liveQueryServer.server) !== null && _this$liveQueryServer !== void 0 && _this$liveQueryServer.close) {
      promises.push(new Promise(resolve => this.liveQueryServer.server.close(resolve)));
    }
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
  }

  /**
   * @static
   * Allow developers to customize each request with inversion of control/dependency injection
   */
  static applyRequestContextMiddleware(api, options) {
    if (options.requestContextMiddleware) {
      if (typeof options.requestContextMiddleware !== 'function') {
        throw new Error('requestContextMiddleware must be a function');
      }
      api.use(options.requestContextMiddleware);
    }
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages,
      rateLimit = []
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    this.applyRequestContextMiddleware(api, options);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          if (err.message) {
            process.stderr.write('An uncaught exception occurred: ' + err.message);
          }
          if (err.stack) {
            process.stderr.write('Stack Trace:\n' + err.stack);
          } else {
            process.stderr.write(err);
          }
          process.exit(1);
        }
      });
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      // api.on('mount', async function () {
      //   await new Promise(resolve => setTimeout(resolve, 1000));
      //   ParseServer.verifyServerUrl();
      // });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }
      app.use(middleware);
    }
    app.use(options.mountPath, this.app);
    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      var _response$headers;
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = (_response$headers = response.headers) === null || _response$headers === void 0 ? void 0 : _response$headers['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || (json === null || json === void 0 ? void 0 : json.status) !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  const ParseServer = require('./cloud-code/Parse.Server');
  Object.defineProperty(Parse, 'Server', {
    get() {
      const conf = _Config.default.get(Parse.applicationId);
      return _objectSpread(_objectSpread({}, conf), ParseServer);
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });
  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = exports.default = ParseServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJjb250cm9sbGVycyIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJfU2VjdXJpdHlSb3V0ZXIiLCJfQ2hlY2tSdW5uZXIiLCJfRGVwcmVjYXRvciIsIl9EZWZpbmVkU2NoZW1hcyIsIl9EZWZpbml0aW9ucyIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJiYXRjaCIsImJvZHlQYXJzZXIiLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJpbnRlcmZhY2VzIiwiSlNPTiIsInN0cmluZ2lmeSIsIk9wdGlvbnNEZWZpbml0aW9ucyIsImdldFZhbGlkT2JqZWN0Iiwicm9vdCIsInJlc3VsdCIsImtleSIsInByb3RvdHlwZSIsInR5cGUiLCJlbmRzV2l0aCIsInNsaWNlIiwib3B0aW9uc0JsdWVwcmludCIsInZhbGlkYXRlS2V5TmFtZXMiLCJvcmlnaW5hbCIsInJlZiIsIm5hbWUiLCJwcmVmaXgiLCJyZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpdGVtIiwiaWR4IiwiY29uY2F0IiwiZGlmZiIsImluZGV4T2YiLCJsb2dnZXIiLCJlcnJvciIsImpvaW4iLCJpbmplY3REZWZhdWx0cyIsImFwcElkIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJtYXN0ZXJLZXkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsIkNvbmZpZyIsInZhbGlkYXRlT3B0aW9ucyIsImFsbENvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsImFzc2lnbiIsIm1hc3RlcktleUlwc1N0b3JlIiwiTWFwIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsInNldExvZ2dlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzdGFydCIsIl9jYWNoZUNvbnRyb2xsZXIkYWRhcCIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNhY2hlQ29udHJvbGxlciIsImNsb3VkIiwic2VjdXJpdHkiLCJzY2hlbWEiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiY29kZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwicHVzaENvbnRyb2xsZXIiLCJnZXRQdXNoQ29udHJvbGxlciIsImxvYWQiLCJzdGFydHVwUHJvbWlzZXMiLCJEZWZpbmVkU2NoZW1hcyIsImV4ZWN1dGUiLCJhZGFwdGVyIiwiY29ubmVjdCIsIlByb21pc2UiLCJhbGwiLCJyZXNvbHZlIiwiX2pzb24iLCJqc29uIiwicHJvY2VzcyIsImVudiIsIm5wbV9wYWNrYWdlX2pzb24iLCJucG1fcGFja2FnZV90eXBlIiwiY3dkIiwic2V0VGltZW91dCIsImVuYWJsZUNoZWNrIiwiZW5hYmxlQ2hlY2tMb2ciLCJDaGVja1J1bm5lciIsInJ1biIsImNvbnNvbGUiLCJhcHAiLCJfYXBwIiwiaGFuZGxlU2h1dGRvd24iLCJfdGhpcyRsaXZlUXVlcnlTZXJ2ZXIiLCJwcm9taXNlcyIsImRhdGFiYXNlQWRhcHRlciIsImZpbGVBZGFwdGVyIiwiZmlsZXNDb250cm9sbGVyIiwiY2FjaGVBZGFwdGVyIiwibGl2ZVF1ZXJ5U2VydmVyIiwic2VydmVyIiwiY2xvc2UiLCJzaHV0ZG93biIsInRoZW4iLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwiYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJhcGkiLCJyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJ1c2UiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyb3V0ZXMiLCJyb3V0ZSIsImFkZFJhdGVMaW1pdCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsIlRFU1RJTkciLCJvbiIsImVyciIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsImV4aXQiLCJtZXNzYWdlIiwic3RhY2siLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsIlBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydEFwcCIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJ0cnVzdFByb3h5IiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwidmVyaWZ5U2VydmVyVXJsIiwiX3Jlc3BvbnNlJGhlYWRlcnMiLCJpc1ZhbGlkSHR0cFVybCIsInN0cmluZyIsInVybCIsIlVSTCIsIl8iLCJwcm90b2NvbCIsInJlcGxhY2UiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiY2F0Y2giLCJkYXRhIiwicmV0cnkiLCJoZWFkZXJzIiwiUGFyc2VDbG91ZCIsImNvbmYiLCJhcHBsaWNhdGlvbklkIiwibmV3VmFsIiwiQ2xvdWQiLCJnbG9iYWwiLCJkZWZhdWx0cyIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInVucSIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95Iiwic3Rkb3V0IiwiX2RlZmF1bHQiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuaW1wb3J0IE9wdGlvbnNEZWZpbml0aW9ucyBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcblxuICAgIGNvbnN0IGludGVyZmFjZXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KE9wdGlvbnNEZWZpbml0aW9ucykpO1xuXG4gICAgZnVuY3Rpb24gZ2V0VmFsaWRPYmplY3Qocm9vdCkge1xuICAgICAgY29uc3QgcmVzdWx0ID0ge307XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiByb290KSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocm9vdFtrZXldLCAndHlwZScpKSB7XG4gICAgICAgICAgaWYgKHJvb3Rba2V5XS50eXBlLmVuZHNXaXRoKCdbXScpKSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IFtnZXRWYWxpZE9iamVjdChpbnRlcmZhY2VzW3Jvb3Rba2V5XS50eXBlLnNsaWNlKDAsIC0yKV0pXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBnZXRWYWxpZE9iamVjdChpbnRlcmZhY2VzW3Jvb3Rba2V5XS50eXBlXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgY29uc3Qgb3B0aW9uc0JsdWVwcmludCA9IGdldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbJ1BhcnNlU2VydmVyT3B0aW9ucyddKTtcblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlS2V5TmFtZXMob3JpZ2luYWwsIHJlZiwgbmFtZSA9ICcnKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gW107XG4gICAgICBjb25zdCBwcmVmaXggPSBuYW1lICsgKG5hbWUgIT09ICcnID8gJy4nIDogJycpO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gb3JpZ2luYWwpIHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVmLCBrZXkpKSB7XG4gICAgICAgICAgcmVzdWx0LnB1c2gocHJlZml4ICsga2V5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAocmVmW2tleV0gPT09ICcnKSBjb250aW51ZTtcbiAgICAgICAgICBsZXQgcmVzID0gW107XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3JpZ2luYWxba2V5XSkgJiYgQXJyYXkuaXNBcnJheShyZWZba2V5XSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSByZWZba2V5XVswXTtcbiAgICAgICAgICAgIG9yaWdpbmFsW2tleV0uZm9yRWFjaCgoaXRlbSwgaWR4KSA9PiB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcy5jb25jYXQodmFsaWRhdGVLZXlOYW1lcyhpdGVtLCB0eXBlLCBwcmVmaXggKyBrZXkgKyBgWyR7aWR4fV1gKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9yaWdpbmFsW2tleV0gPT09ICdvYmplY3QnICYmIHR5cGVvZiByZWZba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHJlcyA9IHZhbGlkYXRlS2V5TmFtZXMob3JpZ2luYWxba2V5XSwgcmVmW2tleV0sIHByZWZpeCArIGtleSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQocmVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBkaWZmID0gdmFsaWRhdGVLZXlOYW1lcyhvcHRpb25zLCBvcHRpb25zQmx1ZXByaW50KS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaW5kZXhPZignZGF0YWJhc2VPcHRpb25zLicpID09PSAtMSk7XG4gICAgaWYgKGRpZmYubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbG9nZ2VyID0gbG9nZ2luZy5sb2dnZXI7XG4gICAgICBsb2dnZXIuZXJyb3IoYEludmFsaWQga2V5KHMpIGZvdW5kIGluIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uOiAke2RpZmYuam9pbignLCAnKX1gKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgQ29uZmlnLnZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgb3B0aW9ucy5zdGF0ZSA9ICdpbml0aWFsaXplZCc7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG4gICAgdGhpcy5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICBsb2dnaW5nLnNldExvZ2dlcihhbGxDb250cm9sbGVycy5sb2dnZXJDb250cm9sbGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgUGFyc2UgU2VydmVyIGFzIGFuIGV4cHJlc3MgYXBwOyB0aGlzIHByb21pc2UgcmVzb2x2ZXMgd2hlbiBQYXJzZSBTZXJ2ZXIgaXMgcmVhZHkgdG8gYWNjZXB0IHJlcXVlc3RzLlxuICAgKi9cblxuICBhc3luYyBzdGFydCgpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YXRlID09PSAnb2snKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnc3RhcnRpbmcnO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgIGNsb3VkLFxuICAgICAgICBzZWN1cml0eSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBsaXZlUXVlcnlDb250cm9sbGVyLFxuICAgICAgfSA9IHRoaXMuY29uZmlnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBwdXNoQ29udHJvbGxlciA9IGF3YWl0IGNvbnRyb2xsZXJzLmdldFB1c2hDb250cm9sbGVyKHRoaXMuY29uZmlnKTtcbiAgICAgIGF3YWl0IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG4gICAgICBjb25zdCBzdGFydHVwUHJvbWlzZXMgPSBbXTtcbiAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobmV3IERlZmluZWRTY2hlbWFzKHNjaGVtYSwgdGhpcy5jb25maWcpLmV4ZWN1dGUoKSk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIGNhY2hlQ29udHJvbGxlci5hZGFwdGVyPy5jb25uZWN0ICYmXG4gICAgICAgIHR5cGVvZiBjYWNoZUNvbnRyb2xsZXIuYWRhcHRlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2goY2FjaGVDb250cm9sbGVyLmFkYXB0ZXIuY29ubmVjdCgpKTtcbiAgICAgIH1cbiAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGxpdmVRdWVyeUNvbnRyb2xsZXIuY29ubmVjdCgpKTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHN0YXJ0dXBQcm9taXNlcyk7XG4gICAgICBpZiAoY2xvdWQpIHtcbiAgICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGNsb3VkKFBhcnNlKSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGxldCBqc29uO1xuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKSB7XG4gICAgICAgICAgICBqc29uID0gcmVxdWlyZShwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX3R5cGUgPT09ICdtb2R1bGUnIHx8IGpzb24/LnR5cGUgPT09ICdtb2R1bGUnKSB7XG4gICAgICAgICAgICBhd2FpdCBpbXBvcnQocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG4gICAgICB9XG4gICAgICBpZiAoc2VjdXJpdHkgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgbmV3IENoZWNrUnVubmVyKHNlY3VyaXR5KS5ydW4oKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ29rJztcbiAgICAgIHRoaXMuY29uZmlnID0geyAuLi50aGlzLmNvbmZpZywgLi4ucHVzaENvbnRyb2xsZXIgfTtcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXI/LnNlcnZlcj8uY2xvc2UpIHtcbiAgICAgIHByb21pc2VzLnB1c2gobmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLmxpdmVRdWVyeVNlcnZlci5zZXJ2ZXIuY2xvc2UocmVzb2x2ZSkpKTtcbiAgICB9XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNodXRkb3duKCkpO1xuICAgIH1cbiAgICByZXR1cm4gKHByb21pc2VzLmxlbmd0aCA+IDAgPyBQcm9taXNlLmFsbChwcm9taXNlcykgOiBQcm9taXNlLnJlc29sdmUoKSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBBbGxvdyBkZXZlbG9wZXJzIHRvIGN1c3RvbWl6ZSBlYWNoIHJlcXVlc3Qgd2l0aCBpbnZlcnNpb24gb2YgY29udHJvbC9kZXBlbmRlbmN5IGluamVjdGlvblxuICAgKi9cbiAgc3RhdGljIGFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSkge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlcXVlc3RDb250ZXh0TWlkZGxld2FyZSBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIH1cbiAgICAgIGFwaS51c2Uob3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzLCByYXRlTGltaXQgPSBbXSB9ID0gb3B0aW9ucztcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4oYXBwSWQpKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uIChyZXEsIHJlcykge1xuICAgICAgcmVzLnN0YXR1cyhvcHRpb25zLnN0YXRlID09PSAnb2snID8gMjAwIDogNTAzKTtcbiAgICAgIGlmIChvcHRpb25zLnN0YXRlID09PSAnc3RhcnRpbmcnKSB7XG4gICAgICAgIHJlcy5zZXQoJ1JldHJ5LUFmdGVyJywgMSk7XG4gICAgICB9XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogb3B0aW9ucy5zdGF0ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiByb3V0ZXMpIHtcbiAgICAgIG1pZGRsZXdhcmVzLmFkZFJhdGVMaW1pdChyb3V0ZSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uKTtcbiAgICB0aGlzLmFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucyk7XG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAvLyB1c2VyLWZyaWVuZGx5IG1lc3NhZ2UgZm9yIHRoaXMgY29tbW9uIGVycm9yXG4gICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChlcnIubWVzc2FnZSkge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ0FuIHVuY2F1Z2h0IGV4Y2VwdGlvbiBvY2N1cnJlZDogJyArIGVyci5tZXNzYWdlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVyci5zdGFjaykge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ1N0YWNrIFRyYWNlOlxcbicgKyBlcnIuc3RhY2spO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIC8vIGFwaS5vbignbW91bnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG4gICAgICAvLyAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgLy8gfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IFNlY3VyaXR5Um91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG5cbiAgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBvbiBQYXJzZVNlcnZlci5zdGFydEFwcDogJywgZSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXNvbHZlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG5cbiAgICBpZiAob3B0aW9ucy5zdGFydExpdmVRdWVyeVNlcnZlciB8fCBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyID0gYXdhaXQgUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICAgICAgb3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMudHJ1c3RQcm94eSkge1xuICAgICAgYXBwLnNldCgndHJ1c3QgcHJveHknLCBvcHRpb25zLnRydXN0UHJveHkpO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0QXBwKG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciBtZXRob2QgdG8gY3JlYXRlIGEgbGl2ZVF1ZXJ5IHNlcnZlclxuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7U2VydmVyfSBodHRwU2VydmVyIGFuIG9wdGlvbmFsIGh0dHAgc2VydmVyIHRvIHBhc3NcbiAgICogQHBhcmFtIHtMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zfSBjb25maWcgb3B0aW9ucyBmb3IgdGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyBvcHRpb25zIGZvciB0aGUgUGFyc2VTZXJ2ZXJcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VMaXZlUXVlcnlTZXJ2ZXI+fSB0aGUgbGl2ZSBxdWVyeSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgaHR0cFNlcnZlcixcbiAgICBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zXG4gICkge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICAgIGF3YWl0IHNlcnZlci5jb25uZWN0KCk7XG4gICAgcmV0dXJuIHNlcnZlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyB2ZXJpZnlTZXJ2ZXJVcmwoKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgaXNWYWxpZEh0dHBVcmwgPSBzdHJpbmcgPT4ge1xuICAgICAgICBsZXQgdXJsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHVybCA9IG5ldyBVUkwoc3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG4gICAgICB9O1xuICAgICAgY29uc3QgdXJsID0gYCR7UGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2hlYWx0aGA7XG4gICAgICBpZiAoIWlzVmFsaWRIdHRwVXJsKHVybCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9JyBhcyB0aGUgVVJMIGlzIGludmFsaWQuYCArXG4gICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KHsgdXJsIH0pLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKTtcbiAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICBjb25zdCByZXRyeSA9IHJlc3BvbnNlLmhlYWRlcnM/LlsncmV0cnktYWZ0ZXInXTtcbiAgICAgIGlmIChyZXRyeSkge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgcmV0cnkgKiAxMDAwKSk7XG4gICAgICAgIHJldHVybiB0aGlzLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8IGpzb24/LnN0YXR1cyAhPT0gJ29rJykge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIGNvbnN0IFBhcnNlU2VydmVyID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcicpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgY29uc3QgY29uZiA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICByZXR1cm4geyAuLi5jb25mLCAuLi5QYXJzZVNlcnZlciB9O1xuICAgIH0sXG4gICAgc2V0KG5ld1ZhbCkge1xuICAgICAgbmV3VmFsLmFwcElkID0gUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICAgIENvbmZpZy5wdXQobmV3VmFsKTtcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgfSk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4oZGVmYXVsdHMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksIC4uLihvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pXSlcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzIGlzIHVuc2V0LFxuICAgIC8vIGl0J2xsIGJlIGFzc2lnbmVkIHRoZSBkZWZhdWx0IGFib3ZlLlxuICAgIC8vIEhlcmUsIHByb3RlY3QgYWdhaW5zdCB0aGUgY2FzZSB3aGVyZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAvLyBpcyBzZXQsIGJ1dCBkb2Vzbid0IGhhdmUgX1VzZXIuXG4gICAgaWYgKCEoJ19Vc2VyJyBpbiBvcHRpb25zLnByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzID0gT2JqZWN0LmFzc2lnbih7IF9Vc2VyOiBbXSB9LCBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgfVxuXG4gICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSB8fCBbXSksIC4uLnVzZXJTZW5zaXRpdmVGaWVsZHNdKVxuICAgICk7XG4gIH1cblxuICAvLyBNZXJnZSBwcm90ZWN0ZWRGaWVsZHMgb3B0aW9ucyB3aXRoIGRlZmF1bHRzLlxuICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHMpLmZvckVhY2goYyA9PiB7XG4gICAgY29uc3QgY3VyID0gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgaWYgKCFjdXIpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdID0gZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIH0gZWxzZSB7XG4gICAgICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY10pLmZvckVhY2gociA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyBUaG9zZSBjYW4ndCBiZSB0ZXN0ZWQgYXMgaXQgcmVxdWlyZXMgYSBzdWJwcm9jZXNzXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZnVuY3Rpb24gY29uZmlndXJlTGlzdGVuZXJzKHBhcnNlU2VydmVyKSB7XG4gIGNvbnN0IHNlcnZlciA9IHBhcnNlU2VydmVyLnNlcnZlcjtcbiAgY29uc3Qgc29ja2V0cyA9IHt9O1xuICAvKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC4gKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAgVGhpcyBmdW5jdGlvbiwgYWxvbmcgd2l0aCBgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKWAsIGludGVuZCB0byBmaXggdGhpcyBiZWhhdmlvciBzdWNoIHRoYXQgcGFyc2Ugc2VydmVyIHdpbGwgY2xvc2UgYWxsIG9wZW4gY29ubmVjdGlvbnMgYW5kIGluaXRpYXRlIHRoZSBzaHV0ZG93biBwcm9jZXNzIGFzIHNvb24gYXMgaXQgcmVjZWl2ZXMgYSBTSUdJTlQvU0lHVEVSTSBzaWduYWwuICovXG4gIHNlcnZlci5vbignY29ubmVjdGlvbicsIHNvY2tldCA9PiB7XG4gICAgY29uc3Qgc29ja2V0SWQgPSBzb2NrZXQucmVtb3RlQWRkcmVzcyArICc6JyArIHNvY2tldC5yZW1vdGVQb3J0O1xuICAgIHNvY2tldHNbc29ja2V0SWRdID0gc29ja2V0O1xuICAgIHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBkZWxldGUgc29ja2V0c1tzb2NrZXRJZF07XG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAoY29uc3Qgc29ja2V0SWQgaW4gc29ja2V0cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc29ja2V0c1tzb2NrZXRJZF0uZGVzdHJveSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiAqL1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uICgpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKCk7XG4gICAgc2VydmVyLmNsb3NlKCk7XG4gICAgcGFyc2VTZXJ2ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgfTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIGhhbmRsZVNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgaGFuZGxlU2h1dGRvd24pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBV0EsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBQyx1QkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sY0FBQSxHQUFBSixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU8sa0JBQUEsR0FBQUwsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFRLGdCQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxjQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxlQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxZQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxnQkFBQSxHQUFBWixPQUFBO0FBQ0EsSUFBQWEsbUJBQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLGNBQUEsR0FBQWQsT0FBQTtBQUNBLElB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Q0FDbEMsQ0FBQztRQUNGcUQsT0FBTyxDQUFDa08sZUFBZSxDQUFDRSxDQUFDLENBQUMsQ0FBQ3pSLENBQUMsQ0FBQyxHQUFHMkUsS0FBSyxDQUFDME0sSUFBSSxDQUFDTSxHQUFHLENBQUM7TUFDakQsQ0FBQyxDQUFDO0lBQ0o7RUFDRixDQUFDLENBQUM7QUFDSjs7QUFFQTtBQUNBO0FBQ0EsU0FBU3RDLGtCQUFrQkEsQ0FBQ0UsV0FBVyxFQUFFO0VBQ3ZDLE1BQU0vRixNQUFNLEdBQUcrRixXQUFXLENBQUMvRixNQUFNO0VBQ2pDLE1BQU1vSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0VBQ2xCO0FBQ0Y7RUFDRXBJLE1BQU0sQ0FBQ2tDLEVBQUUsQ0FBQyxZQUFZLEVBQUVtRyxNQUFNLElBQUk7SUFDaEMsTUFBTUMsUUFBUSxHQUFHRCxNQUFNLENBQUNFLGFBQWEsR0FBRyxHQUFHLEdBQUdGLE1BQU0sQ0FBQ0csVUFBVTtJQUMvREosT0FBTyxDQUFDRSxRQUFRLENBQUMsR0FBR0QsTUFBTTtJQUMxQkEsTUFBTSxDQUFDbkcsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNO01BQ3ZCLE9BQU9rRyxPQUFPLENBQUNFLFFBQVEsQ0FBQztJQUMxQixDQUFDLENBQUM7RUFDSixDQUFDLENBQUM7RUFFRixNQUFNRyx1QkFBdUIsR0FBRyxTQUFBQSxDQUFBLEVBQVk7SUFDMUMsS0FBSyxNQUFNSCxRQUFRLElBQUlGLE9BQU8sRUFBRTtNQUM5QixJQUFJO1FBQ0ZBLE9BQU8sQ0FBQ0UsUUFBUSxDQUFDLENBQUNJLE9BQU8sQ0FBQyxDQUFDO01BQzdCLENBQUMsQ0FBQyxPQUFPcFMsQ0FBQyxFQUFFO1FBQ1Y7TUFBQTtJQUVKO0VBQ0YsQ0FBQztFQUVELE1BQU1rSixjQUFjLEdBQUcsU0FBQUEsQ0FBQSxFQUFZO0lBQ2pDYixPQUFPLENBQUNnSyxNQUFNLENBQUN0RyxLQUFLLENBQUMsNkNBQTZDLENBQUM7SUFDbkVvRyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3pCekksTUFBTSxDQUFDQyxLQUFLLENBQUMsQ0FBQztJQUNkOEYsV0FBVyxDQUFDdkcsY0FBYyxDQUFDLENBQUM7RUFDOUIsQ0FBQztFQUNEYixPQUFPLENBQUN1RCxFQUFFLENBQUMsU0FBUyxFQUFFMUMsY0FBYyxDQUFDO0VBQ3JDYixPQUFPLENBQUN1RCxFQUFFLENBQUMsUUFBUSxFQUFFMUMsY0FBYyxDQUFDO0FBQ3RDO0FBQUMsSUFBQW9KLFFBQUEsR0FBQUMsT0FBQSxDQUFBbFMsT0FBQSxHQUVjZ0QsV0FBVyIsImlnbm9yZUxpc3QiOltdfQ==