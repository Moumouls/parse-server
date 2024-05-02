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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
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
    const diff = validateKeyNames(options, optionsBlueprint);
    if (diff.length > 0) {
      const logger = logging.logger;
      logger.error(`Invalid Option Keys Found: ${diff.join(', ')}`);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJjb250cm9sbGVycyIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJfU2VjdXJpdHlSb3V0ZXIiLCJfQ2hlY2tSdW5uZXIiLCJfRGVwcmVjYXRvciIsIl9EZWZpbmVkU2NoZW1hcyIsIl9EZWZpbml0aW9ucyIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm9iaiIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJiYXRjaCIsImJvZHlQYXJzZXIiLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJpbnRlcmZhY2VzIiwiSlNPTiIsInN0cmluZ2lmeSIsIk9wdGlvbnNEZWZpbml0aW9ucyIsImdldFZhbGlkT2JqZWN0Iiwicm9vdCIsInJlc3VsdCIsInByb3RvdHlwZSIsInR5cGUiLCJlbmRzV2l0aCIsInNsaWNlIiwib3B0aW9uc0JsdWVwcmludCIsInZhbGlkYXRlS2V5TmFtZXMiLCJvcmlnaW5hbCIsInJlZiIsIm5hbWUiLCJwcmVmaXgiLCJyZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpdGVtIiwiaWR4IiwiY29uY2F0IiwiZGlmZiIsImxvZ2dlciIsImVycm9yIiwiam9pbiIsImluamVjdERlZmF1bHRzIiwiYXBwSWQiLCJyZXF1aXJlZFBhcmFtZXRlciIsIm1hc3RlcktleSIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiQ29uZmlnIiwidmFsaWRhdGVPcHRpb25zIiwiYWxsQ29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsInN0YXRlIiwiY29uZmlnIiwicHV0IiwiYXNzaWduIiwibWFzdGVyS2V5SXBzU3RvcmUiLCJNYXAiLCJtYWludGVuYW5jZUtleUlwc1N0b3JlIiwic2V0TG9nZ2VyIiwibG9nZ2VyQ29udHJvbGxlciIsInN0YXJ0IiwiX2NhY2hlQ29udHJvbGxlciRhZGFwIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiaG9va3NDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiY2xvdWQiLCJzZWN1cml0eSIsInNjaGVtYSIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJjb2RlIiwiRXJyb3IiLCJEVVBMSUNBVEVfVkFMVUUiLCJsb2FkIiwic3RhcnR1cFByb21pc2VzIiwiRGVmaW5lZFNjaGVtYXMiLCJleGVjdXRlIiwiYWRhcHRlciIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsIl9qc29uIiwianNvbiIsInByb2Nlc3MiLCJlbnYiLCJucG1fcGFja2FnZV9qc29uIiwibnBtX3BhY2thZ2VfdHlwZSIsImN3ZCIsInNldFRpbWVvdXQiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJjb25zb2xlIiwiYXBwIiwiX2FwcCIsImhhbmRsZVNodXRkb3duIiwiX3RoaXMkbGl2ZVF1ZXJ5U2VydmVyIiwicHJvbWlzZXMiLCJkYXRhYmFzZUFkYXB0ZXIiLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsImxpdmVRdWVyeVNlcnZlciIsInNlcnZlciIsImNsb3NlIiwic2h1dGRvd24iLCJ0aGVuIiwic2VydmVyQ2xvc2VDb21wbGV0ZSIsImFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIiwiYXBpIiwicmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIiwidXNlIiwibWF4VXBsb2FkU2l6ZSIsImRpcmVjdEFjY2VzcyIsInBhZ2VzIiwicmF0ZUxpbWl0IiwiYWxsb3dDcm9zc0RvbWFpbiIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsInJlcSIsInN0YXR1cyIsInVybGVuY29kZWQiLCJleHRlbmRlZCIsImVuYWJsZVJvdXRlciIsIlBhZ2VzUm91dGVyIiwiUHVibGljQVBJUm91dGVyIiwibGltaXQiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicm91dGVzIiwicm91dGUiLCJhZGRSYXRlTGltaXQiLCJoYW5kbGVQYXJzZVNlc3Npb24iLCJhcHBSb3V0ZXIiLCJwcm9taXNlUm91dGVyIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJURVNUSU5HIiwib24iLCJlcnIiLCJzdGRlcnIiLCJ3cml0ZSIsInBvcnQiLCJleGl0IiwibWVzc2FnZSIsInN0YWNrIiwiUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyIsIkNvcmVNYW5hZ2VyIiwic2V0UkVTVENvbnRyb2xsZXIiLCJQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIiwicm91dGVycyIsIkNsYXNzZXNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsIlNlc3Npb25zUm91dGVyIiwiUm9sZXNSb3V0ZXIiLCJBbmFseXRpY3NSb3V0ZXIiLCJJbnN0YWxsYXRpb25zUm91dGVyIiwiRnVuY3Rpb25zUm91dGVyIiwiU2NoZW1hc1JvdXRlciIsIlB1c2hSb3V0ZXIiLCJMb2dzUm91dGVyIiwiSUFQVmFsaWRhdGlvblJvdXRlciIsIkZlYXR1cmVzUm91dGVyIiwiR2xvYmFsQ29uZmlnUm91dGVyIiwiR3JhcGhRTFJvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJTZWN1cml0eVJvdXRlciIsInJlZHVjZSIsIm1lbW8iLCJyb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwibW91bnRPbnRvIiwic3RhcnRBcHAiLCJtaWRkbGV3YXJlIiwibW91bnRQYXRoIiwibW91bnRHcmFwaFFMIiwibW91bnRQbGF5Z3JvdW5kIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwidW5kZWZpbmVkIiwiZ3JhcGhRTFNjaGVtYSIsInJlYWRGaWxlU3luYyIsInBhcnNlR3JhcGhRTFNlcnZlciIsIlBhcnNlR3JhcGhRTFNlcnZlciIsImdyYXBoUUxQYXRoIiwicGxheWdyb3VuZFBhdGgiLCJhcHBseUdyYXBoUUwiLCJhcHBseVBsYXlncm91bmQiLCJsaXN0ZW4iLCJob3N0Iiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwidHJ1c3RQcm94eSIsImNvbmZpZ3VyZUxpc3RlbmVycyIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsInZlcmlmeVNlcnZlclVybCIsIl9yZXNwb25zZSRoZWFkZXJzIiwiaXNWYWxpZEh0dHBVcmwiLCJzdHJpbmciLCJ1cmwiLCJVUkwiLCJfIiwicHJvdG9jb2wiLCJyZXBsYWNlIiwid2FybiIsInJlcXVlc3QiLCJyZXNwb25zZSIsImNhdGNoIiwiZGF0YSIsInJldHJ5IiwiaGVhZGVycyIsIlBhcnNlQ2xvdWQiLCJjb25mIiwiYXBwbGljYXRpb25JZCIsIm5ld1ZhbCIsIkNsb3VkIiwiZ2xvYmFsIiwiZGVmYXVsdHMiLCJyZWdleCIsIm1hdGNoIiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsImZyb20iLCJTZXQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJfVXNlciIsImMiLCJjdXIiLCJ1bnEiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsInN0ZG91dCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGJvZHlQYXJzZXIgPSByZXF1aXJlKCdib2R5LXBhcnNlcicpLFxuICBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpLFxuICBtaWRkbGV3YXJlcyA9IHJlcXVpcmUoJy4vbWlkZGxld2FyZXMnKSxcbiAgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2UsXG4gIHsgcGFyc2UgfSA9IHJlcXVpcmUoJ2dyYXBocWwnKSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMsIExpdmVRdWVyeVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQW5hbHl0aWNzUm91dGVyJztcbmltcG9ydCB7IENsYXNzZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgeyBGZWF0dXJlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GZWF0dXJlc1JvdXRlcic7XG5pbXBvcnQgeyBGaWxlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GaWxlc1JvdXRlcic7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCB7IEdsb2JhbENvbmZpZ1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXInO1xuaW1wb3J0IHsgR3JhcGhRTFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9HcmFwaFFMUm91dGVyJztcbmltcG9ydCB7IEhvb2tzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0hvb2tzUm91dGVyJztcbmltcG9ydCB7IElBUFZhbGlkYXRpb25Sb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSUFQVmFsaWRhdGlvblJvdXRlcic7XG5pbXBvcnQgeyBJbnN0YWxsYXRpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0luc3RhbGxhdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgTG9nc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Mb2dzUm91dGVyJztcbmltcG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH0gZnJvbSAnLi9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXInO1xuaW1wb3J0IHsgUGFnZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUGFnZXNSb3V0ZXInO1xuaW1wb3J0IHsgUHVibGljQVBJUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlcic7XG5pbXBvcnQgeyBQdXNoUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1c2hSb3V0ZXInO1xuaW1wb3J0IHsgQ2xvdWRDb2RlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Nsb3VkQ29kZVJvdXRlcic7XG5pbXBvcnQgeyBSb2xlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Sb2xlc1JvdXRlcic7XG5pbXBvcnQgeyBTY2hlbWFzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgVXNlcnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgUHVyZ2VSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVyZ2VSb3V0ZXInO1xuaW1wb3J0IHsgQXVkaWVuY2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlcic7XG5pbXBvcnQgeyBBZ2dyZWdhdGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWdncmVnYXRlUm91dGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIgfSBmcm9tICcuL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXInO1xuaW1wb3J0ICogYXMgY29udHJvbGxlcnMgZnJvbSAnLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcbmltcG9ydCB7IFNlY3VyaXR5Um91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NlY3VyaXR5Um91dGVyJztcbmltcG9ydCBDaGVja1J1bm5lciBmcm9tICcuL1NlY3VyaXR5L0NoZWNrUnVubmVyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCB7IERlZmluZWRTY2hlbWFzIH0gZnJvbSAnLi9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzJztcbmltcG9ydCBPcHRpb25zRGVmaW5pdGlvbnMgZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcblxuLy8gTXV0YXRlIHRoZSBQYXJzZSBvYmplY3QgdG8gYWRkIHRoZSBDbG91ZCBDb2RlIGhhbmRsZXJzXG5hZGRQYXJzZUNsb3VkKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgLyoqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0aGUgcGFyc2Ugc2VydmVyIGluaXRpYWxpemF0aW9uIG9wdGlvbnNcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIC8vIFNjYW4gZm9yIGRlcHJlY2F0ZWQgUGFyc2UgU2VydmVyIG9wdGlvbnNcbiAgICBEZXByZWNhdG9yLnNjYW5QYXJzZVNlcnZlck9wdGlvbnMob3B0aW9ucyk7XG5cbiAgICBjb25zdCBpbnRlcmZhY2VzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShPcHRpb25zRGVmaW5pdGlvbnMpKTtcblxuICAgIGZ1bmN0aW9uIGdldFZhbGlkT2JqZWN0KHJvb3QpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gcm9vdCkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJvb3Rba2V5XSwgJ3R5cGUnKSkge1xuICAgICAgICAgIGlmIChyb290W2tleV0udHlwZS5lbmRzV2l0aCgnW10nKSkge1xuICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBbZ2V0VmFsaWRPYmplY3QoaW50ZXJmYWNlc1tyb290W2tleV0udHlwZS5zbGljZSgwLCAtMildKV07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gZ2V0VmFsaWRPYmplY3QoaW50ZXJmYWNlc1tyb290W2tleV0udHlwZV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9ICcnO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGNvbnN0IG9wdGlvbnNCbHVlcHJpbnQgPSBnZXRWYWxpZE9iamVjdChpbnRlcmZhY2VzWydQYXJzZVNlcnZlck9wdGlvbnMnXSk7XG5cbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUtleU5hbWVzKG9yaWdpbmFsLCByZWYsIG5hbWUgPSAnJykge1xuICAgICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgICAgY29uc3QgcHJlZml4ID0gbmFtZSArIChuYW1lICE9PSAnJyA/ICcuJyA6ICcnKTtcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIG9yaWdpbmFsKSB7XG4gICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlZiwga2V5KSkge1xuICAgICAgICAgIHJlc3VsdC5wdXNoKHByZWZpeCArIGtleSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHJlZltrZXldID09PSAnJykgY29udGludWU7XG4gICAgICAgICAgbGV0IHJlcyA9IFtdO1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9yaWdpbmFsW2tleV0pICYmIEFycmF5LmlzQXJyYXkocmVmW2tleV0pKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gcmVmW2tleV1bMF07XG4gICAgICAgICAgICBvcmlnaW5hbFtrZXldLmZvckVhY2goKGl0ZW0sIGlkeCkgPT4ge1xuICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIGl0ZW0gIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMuY29uY2F0KHZhbGlkYXRlS2V5TmFtZXMoaXRlbSwgdHlwZSwgcHJlZml4ICsga2V5ICsgYFske2lkeH1dYCkpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcmlnaW5hbFtrZXldID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgcmVmW2tleV0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICByZXMgPSB2YWxpZGF0ZUtleU5hbWVzKG9yaWdpbmFsW2tleV0sIHJlZltrZXldLCBwcmVmaXggKyBrZXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHJlcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgY29uc3QgZGlmZiA9IHZhbGlkYXRlS2V5TmFtZXMob3B0aW9ucywgb3B0aW9uc0JsdWVwcmludCk7XG4gICAgaWYgKGRpZmYubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbG9nZ2VyID0gbG9nZ2luZy5sb2dnZXI7XG4gICAgICBsb2dnZXIuZXJyb3IoYEludmFsaWQgT3B0aW9uIEtleXMgRm91bmQ6ICR7ZGlmZi5qb2luKCcsICcpfWApO1xuICAgIH1cblxuICAgIC8vIFNldCBvcHRpb24gZGVmYXVsdHNcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbm9kZSBjbGllbnQgU0RLIGF1dG9tYXRpY2FsbHlcbiAgICBQYXJzZS5pbml0aWFsaXplKGFwcElkLCBqYXZhc2NyaXB0S2V5IHx8ICd1bnVzZWQnLCBtYXN0ZXJLZXkpO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG5cbiAgICBvcHRpb25zLnN0YXRlID0gJ2luaXRpYWxpemVkJztcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5wdXQoT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywgYWxsQ29udHJvbGxlcnMpKTtcbiAgICB0aGlzLmNvbmZpZy5tYXN0ZXJLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlID0gbmV3IE1hcCgpO1xuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGFsbENvbnRyb2xsZXJzLmxvZ2dlckNvbnRyb2xsZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0cyBQYXJzZSBTZXJ2ZXIgYXMgYW4gZXhwcmVzcyBhcHA7IHRoaXMgcHJvbWlzZSByZXNvbHZlcyB3aGVuIFBhcnNlIFNlcnZlciBpcyByZWFkeSB0byBhY2NlcHQgcmVxdWVzdHMuXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0KCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc3RhdGUgPT09ICdvaycpIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdzdGFydGluZyc7XG4gICAgICBDb25maWcucHV0KHRoaXMuY29uZmlnKTtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgICBob29rc0NvbnRyb2xsZXIsXG4gICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgY2xvdWQsXG4gICAgICAgIHNlY3VyaXR5LFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGxpdmVRdWVyeUNvbnRyb2xsZXIsXG4gICAgICB9ID0gdGhpcy5jb25maWc7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBkYXRhYmFzZUNvbnRyb2xsZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG4gICAgICBjb25zdCBzdGFydHVwUHJvbWlzZXMgPSBbXTtcbiAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobmV3IERlZmluZWRTY2hlbWFzKHNjaGVtYSwgdGhpcy5jb25maWcpLmV4ZWN1dGUoKSk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIGNhY2hlQ29udHJvbGxlci5hZGFwdGVyPy5jb25uZWN0ICYmXG4gICAgICAgIHR5cGVvZiBjYWNoZUNvbnRyb2xsZXIuYWRhcHRlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2goY2FjaGVDb250cm9sbGVyLmFkYXB0ZXIuY29ubmVjdCgpKTtcbiAgICAgIH1cbiAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGxpdmVRdWVyeUNvbnRyb2xsZXIuY29ubmVjdCgpKTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHN0YXJ0dXBQcm9taXNlcyk7XG4gICAgICBpZiAoY2xvdWQpIHtcbiAgICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGNsb3VkKFBhcnNlKSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGxldCBqc29uO1xuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKSB7XG4gICAgICAgICAgICBqc29uID0gcmVxdWlyZShwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX3R5cGUgPT09ICdtb2R1bGUnIHx8IGpzb24/LnR5cGUgPT09ICdtb2R1bGUnKSB7XG4gICAgICAgICAgICBhd2FpdCBpbXBvcnQocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG4gICAgICB9XG4gICAgICBpZiAoc2VjdXJpdHkgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgbmV3IENoZWNrUnVubmVyKHNlY3VyaXR5KS5ydW4oKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ29rJztcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXI/LnNlcnZlcj8uY2xvc2UpIHtcbiAgICAgIHByb21pc2VzLnB1c2gobmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLmxpdmVRdWVyeVNlcnZlci5zZXJ2ZXIuY2xvc2UocmVzb2x2ZSkpKTtcbiAgICB9XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNodXRkb3duKCkpO1xuICAgIH1cbiAgICByZXR1cm4gKHByb21pc2VzLmxlbmd0aCA+IDAgPyBQcm9taXNlLmFsbChwcm9taXNlcykgOiBQcm9taXNlLnJlc29sdmUoKSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBBbGxvdyBkZXZlbG9wZXJzIHRvIGN1c3RvbWl6ZSBlYWNoIHJlcXVlc3Qgd2l0aCBpbnZlcnNpb24gb2YgY29udHJvbC9kZXBlbmRlbmN5IGluamVjdGlvblxuICAgKi9cbiAgc3RhdGljIGFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSkge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlcXVlc3RDb250ZXh0TWlkZGxld2FyZSBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIH1cbiAgICAgIGFwaS51c2Uob3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzLCByYXRlTGltaXQgPSBbXSB9ID0gb3B0aW9ucztcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4oYXBwSWQpKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uIChyZXEsIHJlcykge1xuICAgICAgcmVzLnN0YXR1cyhvcHRpb25zLnN0YXRlID09PSAnb2snID8gMjAwIDogNTAzKTtcbiAgICAgIGlmIChvcHRpb25zLnN0YXRlID09PSAnc3RhcnRpbmcnKSB7XG4gICAgICAgIHJlcy5zZXQoJ1JldHJ5LUFmdGVyJywgMSk7XG4gICAgICB9XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogb3B0aW9ucy5zdGF0ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiByb3V0ZXMpIHtcbiAgICAgIG1pZGRsZXdhcmVzLmFkZFJhdGVMaW1pdChyb3V0ZSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uKTtcbiAgICB0aGlzLmFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucyk7XG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAvLyB1c2VyLWZyaWVuZGx5IG1lc3NhZ2UgZm9yIHRoaXMgY29tbW9uIGVycm9yXG4gICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChlcnIubWVzc2FnZSkge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ0FuIHVuY2F1Z2h0IGV4Y2VwdGlvbiBvY2N1cnJlZDogJyArIGVyci5tZXNzYWdlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVyci5zdGFjaykge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoJ1N0YWNrIFRyYWNlOlxcbicgKyBlcnIuc3RhY2spO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIC8vIGFwaS5vbignbW91bnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG4gICAgICAvLyAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgLy8gfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IFNlY3VyaXR5Um91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG5cbiAgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBvbiBQYXJzZVNlcnZlci5zdGFydEFwcDogJywgZSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXNvbHZlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG5cbiAgICBpZiAob3B0aW9ucy5zdGFydExpdmVRdWVyeVNlcnZlciB8fCBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyID0gYXdhaXQgUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICAgICAgb3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMudHJ1c3RQcm94eSkge1xuICAgICAgYXBwLnNldCgndHJ1c3QgcHJveHknLCBvcHRpb25zLnRydXN0UHJveHkpO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0QXBwKG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciBtZXRob2QgdG8gY3JlYXRlIGEgbGl2ZVF1ZXJ5IHNlcnZlclxuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7U2VydmVyfSBodHRwU2VydmVyIGFuIG9wdGlvbmFsIGh0dHAgc2VydmVyIHRvIHBhc3NcbiAgICogQHBhcmFtIHtMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zfSBjb25maWcgb3B0aW9ucyBmb3IgdGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyBvcHRpb25zIGZvciB0aGUgUGFyc2VTZXJ2ZXJcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VMaXZlUXVlcnlTZXJ2ZXI+fSB0aGUgbGl2ZSBxdWVyeSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgaHR0cFNlcnZlcixcbiAgICBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zXG4gICkge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICAgIGF3YWl0IHNlcnZlci5jb25uZWN0KCk7XG4gICAgcmV0dXJuIHNlcnZlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyB2ZXJpZnlTZXJ2ZXJVcmwoKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgaXNWYWxpZEh0dHBVcmwgPSBzdHJpbmcgPT4ge1xuICAgICAgICBsZXQgdXJsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHVybCA9IG5ldyBVUkwoc3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG4gICAgICB9O1xuICAgICAgY29uc3QgdXJsID0gYCR7UGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2hlYWx0aGA7XG4gICAgICBpZiAoIWlzVmFsaWRIdHRwVXJsKHVybCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9JyBhcyB0aGUgVVJMIGlzIGludmFsaWQuYCArXG4gICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoeyB1cmwgfSkuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpO1xuICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgIGNvbnN0IHJldHJ5ID0gcmVzcG9uc2UuaGVhZGVycz8uWydyZXRyeS1hZnRlciddO1xuICAgICAgaWYgKHJldHJ5KSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCByZXRyeSAqIDEwMDApKTtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwganNvbj8uc3RhdHVzICE9PSAnb2snKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBjb25zdCBQYXJzZVNlcnZlciA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5TZXJ2ZXInKTtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFBhcnNlLCAnU2VydmVyJywge1xuICAgIGdldCgpIHtcbiAgICAgIGNvbnN0IGNvbmYgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgcmV0dXJuIHsgLi4uY29uZiwgLi4uUGFyc2VTZXJ2ZXIgfTtcbiAgICB9LFxuICAgIHNldChuZXdWYWwpIHtcbiAgICAgIG5ld1ZhbC5hcHBJZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgICBDb25maWcucHV0KG5ld1ZhbCk7XG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gIH0pO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsIGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCAnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIFJlc2VydmVkIENoYXJhY3RlcnNcbiAgaWYgKG9wdGlvbnMuYXBwSWQpIHtcbiAgICBjb25zdCByZWdleCA9IC9bISMkJScoKSorJi86Oz0/QFtcXF17fV4sfDw+XS9nO1xuICAgIGlmIChvcHRpb25zLmFwcElkLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBzZXJ2ZXIgPSBwYXJzZVNlcnZlci5zZXJ2ZXI7XG4gIGNvbnN0IHNvY2tldHMgPSB7fTtcbiAgLyogQ3VycmVudGx5LCBleHByZXNzIGRvZXNuJ3Qgc2h1dCBkb3duIGltbWVkaWF0ZWx5IGFmdGVyIHJlY2VpdmluZyBTSUdJTlQvU0lHVEVSTSBpZiBpdCBoYXMgY2xpZW50IGNvbm5lY3Rpb25zIHRoYXQgaGF2ZW4ndCB0aW1lZCBvdXQuIChUaGlzIGlzIGEga25vd24gaXNzdWUgd2l0aCBub2RlIC0gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8yNjQyKVxuICAgIFRoaXMgZnVuY3Rpb24sIGFsb25nIHdpdGggYGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKClgLCBpbnRlbmQgdG8gZml4IHRoaXMgYmVoYXZpb3Igc3VjaCB0aGF0IHBhcnNlIHNlcnZlciB3aWxsIGNsb3NlIGFsbCBvcGVuIGNvbm5lY3Rpb25zIGFuZCBpbml0aWF0ZSB0aGUgc2h1dGRvd24gcHJvY2VzcyBhcyBzb29uIGFzIGl0IHJlY2VpdmVzIGEgU0lHSU5UL1NJR1RFUk0gc2lnbmFsLiAqL1xuICBzZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBzb2NrZXQgPT4ge1xuICAgIGNvbnN0IHNvY2tldElkID0gc29ja2V0LnJlbW90ZUFkZHJlc3MgKyAnOicgKyBzb2NrZXQucmVtb3RlUG9ydDtcbiAgICBzb2NrZXRzW3NvY2tldElkXSA9IHNvY2tldDtcbiAgICBzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgZGVsZXRlIHNvY2tldHNbc29ja2V0SWRdO1xuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBkZXN0cm95QWxpdmVDb25uZWN0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKGNvbnN0IHNvY2tldElkIGluIHNvY2tldHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNvY2tldHNbc29ja2V0SWRdLmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1Rlcm1pbmF0aW9uIHNpZ25hbCByZWNlaXZlZC4gU2h1dHRpbmcgZG93bi4nKTtcbiAgICBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpO1xuICAgIHNlcnZlci5jbG9zZSgpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQVdBLElBQUFBLFFBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUMsdUJBQUEsQ0FBQUosT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFNLGNBQUEsR0FBQUosc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFPLGtCQUFBLEdBQUFMLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBUSxnQkFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsY0FBQSxHQUFBVCxPQUFBO0FBQ0EsSUFBQVUsZUFBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsWUFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksZ0JBQUEsR0FBQVosT0FBQTtBQUNBLElBQUFhLG1CQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxjQUFBLEdBQUFkLE9BQUE7QUFDQSxJQUFBZSxZQUFBLEdBQUFmLE9BQUE7QUFDQSxJQUFBZ0Isb0JBQUEsR0FBQWhCLE9BQUE7QUFDQSxJQUFBaUIsb0JBQUEsR0FBQWpCLE9BQUE7QUFDQSxJQUFBa0IsV0FBQSxHQUFBbEIsT0FBQTtBQUNBLElBQUFtQixxQkFBQSxHQUFBbkIsT0FBQTtBQUNBLElBQUFvQixZQUFBLEdBQUFwQixPQUFBO0FBQ0EsSUFBQXFCLGdCQUFBLEdBQUFyQixPQUFBO0FBQ0EsSUFBQXNCLFdBQUEsR0FBQXRCLE9BQUE7QUFDQSxJQUFBdUIsZ0JBQUEsR0FBQXZCLE9BQUE7QUFD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