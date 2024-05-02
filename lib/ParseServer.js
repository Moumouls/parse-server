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
    const diff = validateKeyNames(options, optionsBlueprint).filter(item => item.indexOf('databaseOptions.') === -1);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJjb250cm9sbGVycyIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJfU2VjdXJpdHlSb3V0ZXIiLCJfQ2hlY2tSdW5uZXIiLCJfRGVwcmVjYXRvciIsIl9EZWZpbmVkU2NoZW1hcyIsIl9EZWZpbml0aW9ucyIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm9iaiIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJiYXRjaCIsImJvZHlQYXJzZXIiLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJpbnRlcmZhY2VzIiwiSlNPTiIsInN0cmluZ2lmeSIsIk9wdGlvbnNEZWZpbml0aW9ucyIsImdldFZhbGlkT2JqZWN0Iiwicm9vdCIsInJlc3VsdCIsInByb3RvdHlwZSIsInR5cGUiLCJlbmRzV2l0aCIsInNsaWNlIiwib3B0aW9uc0JsdWVwcmludCIsInZhbGlkYXRlS2V5TmFtZXMiLCJvcmlnaW5hbCIsInJlZiIsIm5hbWUiLCJwcmVmaXgiLCJyZXMiLCJBcnJheSIsImlzQXJyYXkiLCJpdGVtIiwiaWR4IiwiY29uY2F0IiwiZGlmZiIsImluZGV4T2YiLCJsb2dnZXIiLCJlcnJvciIsImpvaW4iLCJpbmplY3REZWZhdWx0cyIsImFwcElkIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJtYXN0ZXJLZXkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsIkNvbmZpZyIsInZhbGlkYXRlT3B0aW9ucyIsImFsbENvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsImFzc2lnbiIsIm1hc3RlcktleUlwc1N0b3JlIiwiTWFwIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsInNldExvZ2dlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzdGFydCIsIl9jYWNoZUNvbnRyb2xsZXIkYWRhcCIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNhY2hlQ29udHJvbGxlciIsImNsb3VkIiwic2VjdXJpdHkiLCJzY2hlbWEiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiY29kZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwibG9hZCIsInN0YXJ0dXBQcm9taXNlcyIsIkRlZmluZWRTY2hlbWFzIiwiZXhlY3V0ZSIsImFkYXB0ZXIiLCJjb25uZWN0IiwiUHJvbWlzZSIsImFsbCIsInJlc29sdmUiLCJfanNvbiIsImpzb24iLCJwcm9jZXNzIiwiZW52IiwibnBtX3BhY2thZ2VfanNvbiIsIm5wbV9wYWNrYWdlX3R5cGUiLCJjd2QiLCJzZXRUaW1lb3V0IiwiZW5hYmxlQ2hlY2siLCJlbmFibGVDaGVja0xvZyIsIkNoZWNrUnVubmVyIiwicnVuIiwiY29uc29sZSIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsIl90aGlzJGxpdmVRdWVyeVNlcnZlciIsInByb21pc2VzIiwiZGF0YWJhc2VBZGFwdGVyIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJzZXJ2ZXIiLCJjbG9zZSIsInNodXRkb3duIiwidGhlbiIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJhcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSIsImFwaSIsInJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSIsInVzZSIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJwYWdlcyIsInJhdGVMaW1pdCIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJvdXRlcyIsInJvdXRlIiwiYWRkUmF0ZUxpbWl0IiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiVEVTVElORyIsIm9uIiwiZXJyIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwiZXhpdCIsIm1lc3NhZ2UiLCJzdGFjayIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiU2VjdXJpdHlSb3V0ZXIiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0QXBwIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwibGlzdGVuIiwiaG9zdCIsInN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIiwibGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsInRydXN0UHJveHkiLCJjb25maWd1cmVMaXN0ZW5lcnMiLCJleHByZXNzQXBwIiwicGFyc2VTZXJ2ZXIiLCJodHRwU2VydmVyIiwiY3JlYXRlU2VydmVyIiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJfcmVzcG9uc2UkaGVhZGVycyIsImlzVmFsaWRIdHRwVXJsIiwic3RyaW5nIiwidXJsIiwiVVJMIiwiXyIsInByb3RvY29sIiwicmVwbGFjZSIsIndhcm4iLCJyZXF1ZXN0IiwicmVzcG9uc2UiLCJjYXRjaCIsImRhdGEiLCJyZXRyeSIsImhlYWRlcnMiLCJQYXJzZUNsb3VkIiwiY29uZiIsImFwcGxpY2F0aW9uSWQiLCJuZXdWYWwiLCJDbG91ZCIsImdsb2JhbCIsImRlZmF1bHRzIiwicmVnZXgiLCJtYXRjaCIsInVzZXJTZW5zaXRpdmVGaWVsZHMiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwidW5xIiwic29ja2V0cyIsInNvY2tldCIsInNvY2tldElkIiwicmVtb3RlQWRkcmVzcyIsInJlbW90ZVBvcnQiLCJkZXN0cm95QWxpdmVDb25uZWN0aW9ucyIsImRlc3Ryb3kiLCJzdGRvdXQiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvUGFyc2VTZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICB7IHBhcnNlIH0gPSByZXF1aXJlKCdncmFwaHFsJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIGZzID0gcmVxdWlyZSgnZnMnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFBhZ2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1BhZ2VzUm91dGVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5pbXBvcnQgeyBTZWN1cml0eVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZWN1cml0eVJvdXRlcic7XG5pbXBvcnQgQ2hlY2tSdW5uZXIgZnJvbSAnLi9TZWN1cml0eS9DaGVja1J1bm5lcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBEZWZpbmVkU2NoZW1hcyB9IGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9EZWZpbmVkU2NoZW1hcyc7XG5pbXBvcnQgT3B0aW9uc0RlZmluaXRpb25zIGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBodHRwczovL3BhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9hcGkvbWFzdGVyL1BhcnNlU2VydmVyT3B0aW9ucy5odG1sXG5jbGFzcyBQYXJzZVNlcnZlciB7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gICAgRGVwcmVjYXRvci5zY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpO1xuXG4gICAgY29uc3QgaW50ZXJmYWNlcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoT3B0aW9uc0RlZmluaXRpb25zKSk7XG5cbiAgICBmdW5jdGlvbiBnZXRWYWxpZE9iamVjdChyb290KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIHJvb3QpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyb290W2tleV0sICd0eXBlJykpIHtcbiAgICAgICAgICBpZiAocm9vdFtrZXldLnR5cGUuZW5kc1dpdGgoJ1tdJykpIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gW2dldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGUuc2xpY2UoMCwgLTIpXSldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IGdldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGVdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBvcHRpb25zQmx1ZXByaW50ID0gZ2V0VmFsaWRPYmplY3QoaW50ZXJmYWNlc1snUGFyc2VTZXJ2ZXJPcHRpb25zJ10pO1xuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVLZXlOYW1lcyhvcmlnaW5hbCwgcmVmLCBuYW1lID0gJycpIHtcbiAgICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICAgIGNvbnN0IHByZWZpeCA9IG5hbWUgKyAobmFtZSAhPT0gJycgPyAnLicgOiAnJyk7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBvcmlnaW5hbCkge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZWYsIGtleSkpIHtcbiAgICAgICAgICByZXN1bHQucHVzaChwcmVmaXggKyBrZXkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChyZWZba2V5XSA9PT0gJycpIGNvbnRpbnVlO1xuICAgICAgICAgIGxldCByZXMgPSBbXTtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvcmlnaW5hbFtrZXldKSAmJiBBcnJheS5pc0FycmF5KHJlZltrZXldKSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IHJlZltrZXldWzBdO1xuICAgICAgICAgICAgb3JpZ2luYWxba2V5XS5mb3JFYWNoKChpdGVtLCBpZHgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiBpdGVtICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzLmNvbmNhdCh2YWxpZGF0ZUtleU5hbWVzKGl0ZW0sIHR5cGUsIHByZWZpeCArIGtleSArIGBbJHtpZHh9XWApKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3JpZ2luYWxba2V5XSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIHJlZltrZXldID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgcmVzID0gdmFsaWRhdGVLZXlOYW1lcyhvcmlnaW5hbFtrZXldLCByZWZba2V5XSwgcHJlZml4ICsga2V5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChyZXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGNvbnN0IGRpZmYgPSB2YWxpZGF0ZUtleU5hbWVzKG9wdGlvbnMsIG9wdGlvbnNCbHVlcHJpbnQpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pbmRleE9mKCdkYXRhYmFzZU9wdGlvbnMuJykgPT09IC0xKTtcbiAgICBpZiAoZGlmZi5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBsb2dnZXIgPSBsb2dnaW5nLmxvZ2dlcjtcbiAgICAgIGxvZ2dlci5lcnJvcihgSW52YWxpZCBPcHRpb24gS2V5cyBGb3VuZDogJHtkaWZmLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuXG4gICAgLy8gU2V0IG9wdGlvbiBkZWZhdWx0c1xuICAgIGluamVjdERlZmF1bHRzKG9wdGlvbnMpO1xuICAgIGNvbnN0IHtcbiAgICAgIGFwcElkID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gYXBwSWQhJyksXG4gICAgICBtYXN0ZXJLZXkgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIG1hc3RlcktleSEnKSxcbiAgICAgIGphdmFzY3JpcHRLZXksXG4gICAgICBzZXJ2ZXJVUkwgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHNlcnZlclVSTCEnKSxcbiAgICB9ID0gb3B0aW9ucztcbiAgICAvLyBJbml0aWFsaXplIHRoZSBub2RlIGNsaWVudCBTREsgYXV0b21hdGljYWxseVxuICAgIFBhcnNlLmluaXRpYWxpemUoYXBwSWQsIGphdmFzY3JpcHRLZXkgfHwgJ3VudXNlZCcsIG1hc3RlcktleSk7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuICAgIENvbmZpZy52YWxpZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG4gICAgY29uc3QgYWxsQ29udHJvbGxlcnMgPSBjb250cm9sbGVycy5nZXRDb250cm9sbGVycyhvcHRpb25zKTtcblxuICAgIG9wdGlvbnMuc3RhdGUgPSAnaW5pdGlhbGl6ZWQnO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLnB1dChPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCBhbGxDb250cm9sbGVycykpO1xuICAgIHRoaXMuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgbG9nZ2luZy5zZXRMb2dnZXIoYWxsQ29udHJvbGxlcnMubG9nZ2VyQ29udHJvbGxlcik7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIFBhcnNlIFNlcnZlciBhcyBhbiBleHByZXNzIGFwcDsgdGhpcyBwcm9taXNlIHJlc29sdmVzIHdoZW4gUGFyc2UgU2VydmVyIGlzIHJlYWR5IHRvIGFjY2VwdCByZXF1ZXN0cy5cbiAgICovXG5cbiAgYXN5bmMgc3RhcnQoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zdGF0ZSA9PT0gJ29rJykge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ3N0YXJ0aW5nJztcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgY29uc3Qge1xuICAgICAgICBkYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICAgIGhvb2tzQ29udHJvbGxlcixcbiAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICBjbG91ZCxcbiAgICAgICAgc2VjdXJpdHksXG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgbGl2ZVF1ZXJ5Q29udHJvbGxlcixcbiAgICAgIH0gPSB0aGlzLmNvbmZpZztcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGRhdGFiYXNlQ29udHJvbGxlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGUuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgaG9va3NDb250cm9sbGVyLmxvYWQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0dXBQcm9taXNlcyA9IFtdO1xuICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChuZXcgRGVmaW5lZFNjaGVtYXMoc2NoZW1hLCB0aGlzLmNvbmZpZykuZXhlY3V0ZSgpKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgY2FjaGVDb250cm9sbGVyLmFkYXB0ZXI/LmNvbm5lY3QgJiZcbiAgICAgICAgdHlwZW9mIGNhY2hlQ29udHJvbGxlci5hZGFwdGVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChjYWNoZUNvbnRyb2xsZXIuYWRhcHRlci5jb25uZWN0KCkpO1xuICAgICAgfVxuICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobGl2ZVF1ZXJ5Q29udHJvbGxlci5jb25uZWN0KCkpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3RhcnR1cFByb21pc2VzKTtcbiAgICAgIGlmIChjbG91ZCkge1xuICAgICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoY2xvdWQoUGFyc2UpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgbGV0IGpzb247XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pIHtcbiAgICAgICAgICAgIGpzb24gPSByZXF1aXJlKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfdHlwZSA9PT0gJ21vZHVsZScgfHwganNvbj8udHlwZSA9PT0gJ21vZHVsZScpIHtcbiAgICAgICAgICAgIGF3YWl0IGltcG9ydChwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICBuZXcgQ2hlY2tSdW5uZXIoc2VjdXJpdHkpLnJ1bigpO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnb2snO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdlcnJvcic7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCB7IGFkYXB0ZXI6IGRhdGFiYXNlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyO1xuICAgIGlmIChkYXRhYmFzZUFkYXB0ZXIgJiYgdHlwZW9mIGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogZmlsZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBpZiAoZmlsZUFkYXB0ZXIgJiYgdHlwZW9mIGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGNhY2hlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgIGlmIChjYWNoZUFkYXB0ZXIgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGlmICh0aGlzLmxpdmVRdWVyeVNlcnZlcj8uc2VydmVyPy5jbG9zZSkge1xuICAgICAgcHJvbWlzZXMucHVzaChuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlci5jbG9zZShyZXNvbHZlKSkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXIpIHtcbiAgICAgIHByb21pc2VzLnB1c2godGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2h1dGRvd24oKSk7XG4gICAgfVxuICAgIHJldHVybiAocHJvbWlzZXMubGVuZ3RoID4gMCA/IFByb21pc2UuYWxsKHByb21pc2VzKSA6IFByb21pc2UucmVzb2x2ZSgpKS50aGVuKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIEFsbG93IGRldmVsb3BlcnMgdG8gY3VzdG9taXplIGVhY2ggcmVxdWVzdCB3aXRoIGludmVyc2lvbiBvZiBjb250cm9sL2RlcGVuZGVuY3kgaW5qZWN0aW9uXG4gICAqL1xuICBzdGF0aWMgYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgfVxuICAgICAgYXBpLnVzZShvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAob3B0aW9ucykge1xuICAgIGNvbnN0IHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcywgcGFnZXMsIHJhdGVMaW1pdCA9IFtdIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuc3RhdHVzKG9wdGlvbnMuc3RhdGUgPT09ICdvaycgPyAyMDAgOiA1MDMpO1xuICAgICAgaWYgKG9wdGlvbnMuc3RhdGUgPT09ICdzdGFydGluZycpIHtcbiAgICAgICAgcmVzLnNldCgnUmV0cnktQWZ0ZXInLCAxKTtcbiAgICAgIH1cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiBvcHRpb25zLnN0YXRlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHJvdXRlcykge1xuICAgICAgbWlkZGxld2FyZXMuYWRkUmF0ZUxpbWl0KHJvdXRlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24pO1xuICAgIHRoaXMuYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKTtcbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGVyci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnQW4gdW5jYXVnaHQgZXhjZXB0aW9uIG9jY3VycmVkOiAnICsgZXJyLm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyLnN0YWNrKSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnU3RhY2sgVHJhY2U6XFxuJyArIGVyci5zdGFjayk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgLy8gYXBpLm9uKCdtb3VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgIC8vICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMDApKTtcbiAgICAgIC8vICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICAvLyB9KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fCBkaXJlY3RBY2Nlc3MpIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcikpO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgICBuZXcgU2VjdXJpdHlSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cblxuICBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG9uIFBhcnNlU2VydmVyLnN0YXJ0QXBwOiAnLCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlc29sdmUodGhpcyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBhd2FpdCBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy50cnVzdFByb3h5KSB7XG4gICAgICBhcHAuc2V0KCd0cnVzdCBwcm94eScsIG9wdGlvbnMudHJ1c3RQcm94eSk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnRBcHAob3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj59IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKSB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gICAgYXdhaXQgc2VydmVyLmNvbm5lY3QoKTtcbiAgICByZXR1cm4gc2VydmVyO1xuICB9XG5cbiAgc3RhdGljIGFzeW5jIHZlcmlmeVNlcnZlclVybCgpIHtcbiAgICAvLyBwZXJmb3JtIGEgaGVhbHRoIGNoZWNrIG9uIHRoZSBzZXJ2ZXJVUkwgdmFsdWVcbiAgICBpZiAoUGFyc2Uuc2VydmVyVVJMKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkSHR0cFVybCA9IHN0cmluZyA9PiB7XG4gICAgICAgIGxldCB1cmw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdXJsID0gbmV3IFVSTChzdHJpbmcpO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09ICdodHRwOicgfHwgdXJsLnByb3RvY29sID09PSAnaHR0cHM6JztcbiAgICAgIH07XG4gICAgICBjb25zdCB1cmwgPSBgJHtQYXJzZS5zZXJ2ZXJVUkwucmVwbGFjZSgvXFwvJC8sICcnKX0vaGVhbHRoYDtcbiAgICAgIGlmICghaXNWYWxpZEh0dHBVcmwodXJsKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nIGFzIHRoZSBVUkwgaXMgaW52YWxpZC5gICtcbiAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoeyB1cmwgfSkuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpO1xuICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgIGNvbnN0IHJldHJ5ID0gcmVzcG9uc2UuaGVhZGVycz8uWydyZXRyeS1hZnRlciddO1xuICAgICAgaWYgKHJldHJ5KSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCByZXRyeSAqIDEwMDApKTtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwganNvbj8uc3RhdHVzICE9PSAnb2snKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZFBhcnNlQ2xvdWQoKSB7XG4gIGNvbnN0IFBhcnNlQ2xvdWQgPSByZXF1aXJlKCcuL2Nsb3VkLWNvZGUvUGFyc2UuQ2xvdWQnKTtcbiAgY29uc3QgUGFyc2VTZXJ2ZXIgPSByZXF1aXJlKCcuL2Nsb3VkLWNvZGUvUGFyc2UuU2VydmVyJyk7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQYXJzZSwgJ1NlcnZlcicsIHtcbiAgICBnZXQoKSB7XG4gICAgICBjb25zdCBjb25mID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIHJldHVybiB7IC4uLmNvbmYsIC4uLlBhcnNlU2VydmVyIH07XG4gICAgfSxcbiAgICBzZXQobmV3VmFsKSB7XG4gICAgICBuZXdWYWwuYXBwSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgICAgQ29uZmlnLnB1dChuZXdWYWwpO1xuICAgIH0sXG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICB9KTtcbiAgT2JqZWN0LmFzc2lnbihQYXJzZS5DbG91ZCwgUGFyc2VDbG91ZCk7XG4gIGdsb2JhbC5QYXJzZSA9IFBhcnNlO1xufVxuXG5mdW5jdGlvbiBpbmplY3REZWZhdWx0cyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCBrZXkpKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSBkZWZhdWx0c1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ3NlcnZlclVSTCcpKSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJVUkwgPSBgaHR0cDovL2xvY2FsaG9zdDoke29wdGlvbnMucG9ydH0ke29wdGlvbnMubW91bnRQYXRofWA7XG4gIH1cblxuICAvLyBSZXNlcnZlZCBDaGFyYWN0ZXJzXG4gIGlmIChvcHRpb25zLmFwcElkKSB7XG4gICAgY29uc3QgcmVnZXggPSAvWyEjJCUnKCkqKyYvOjs9P0BbXFxde31eLHw8Pl0vZztcbiAgICBpZiAob3B0aW9ucy5hcHBJZC5tYXRjaChyZWdleCkpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbldBUk5JTkcsIGFwcElkIHRoYXQgY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzIGNhbiBjYXVzZSBpc3N1ZXMgd2hpbGUgdXNpbmcgd2l0aCB1cmxzLlxcbmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSwgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSldKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKHsgX1VzZXI6IFtdIH0sIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSwgLi4udXNlclNlbnNpdGl2ZUZpZWxkc10pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFXQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFDLHVCQUFBLENBQUFKLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFILHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTSxjQUFBLEdBQUFKLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTyxrQkFBQSxHQUFBTCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQVEsZ0JBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLGNBQUEsR0FBQVQsT0FBQTtBQUNBLElBQUFVLGVBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLFlBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLGdCQUFBLEdBQUFaLE9BQUE7QUFDQSxJQUFBYSxtQkFBQSxHQUFBYixPQUFBO0FBQ0EsSUFBQWMsY0FBQSxHQUFBZCxPQUFBO0FBQ0EsSUFBQWUsWUFBQSxHQUFBZixPQUFBO0FBQ0EsSUFBQWdCLG9CQUFBLEdBQUFoQixPQUFBO0FBQ0EsSUFBQWlCLG9CQUFBLEdBQUFqQixPQUFBO0FBQ0EsSUFBQWtCLFdBQUEsR0FBQWxCLE9BQUE7QUFDQSxJQUFBbUIscUJBQUEsR0FBQW5CLE9BQUE7QUFDQSxJQUFBb0IsWUFBQSxHQUFBcEIsT0FBQTtBQUNBLElBQUFxQixnQkFBQSxHQUFBckIsT0FB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