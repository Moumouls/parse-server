"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
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
var _TestUtils = require("./TestUtils");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
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

// Track connections to destroy them on shutdown
const connections = new _TestUtils.Connections();

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
          if (ref[key] === '') {
            continue;
          }
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
      const startupPromises = [this.config.loadMasterKey?.()];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if (cacheController.adapter?.connect && typeof cacheController.adapter.connect === 'function') {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || json?.type === 'module') {
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
      this.config = {
        ...this.config,
        ...pushController
      };
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      // eslint-disable-next-line no-console
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

  /**
   * Stops the parse server, cancels any ongoing requests and closes all connections.
   *
   * Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM
   * if it has client connections that haven't timed out.
   * (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
   *
   * @returns {Promise<void>} a promise that resolves when the server is stopped
   */
  async handleShutdown() {
    const serverClosePromise = (0, _TestUtils.resolvingPromise)();
    const liveQueryServerClosePromise = (0, _TestUtils.resolvingPromise)();
    const promises = [];
    this.server.close(error => {
      /* istanbul ignore next */
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error while closing parse server', error);
      }
      serverClosePromise.resolve();
    });
    if (this.liveQueryServer?.server?.close && this.liveQueryServer.server !== this.server) {
      this.liveQueryServer.server.close(error => {
        /* istanbul ignore next */
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Error while closing live query server', error);
        }
        liveQueryServerClosePromise.resolve();
      });
    } else {
      liveQueryServerClosePromise.resolve();
    }
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
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    await Promise.all(promises);
    connections.destroyAll();
    await Promise.all([serverClosePromise, liveQueryServerClosePromise]);
    if (this.config.serverCloseComplete) {
      this.config.serverCloseComplete();
    }
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
    api.use(middlewares.allowDoubleForwardSlash);
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
    api.use('/', express.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(express.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    api.set('query parser', 'extended');
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
      // eslint-disable-next-line no-console
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
    connections.track(server);
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
      if (this.liveQueryServer.server !== this.server) {
        connections.track(this.liveQueryServer.server);
      }
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
        // eslint-disable-next-line no-console
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = response.headers?.['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || json?.status !== 'ok') {
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
      return {
        ...conf,
        ...ParseServer
      };
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
      // eslint-disable-next-line no-console
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
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = exports.default = ParseServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsImxvZ2dpbmciLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9Db25maWciLCJfUHJvbWlzZVJvdXRlciIsIl9yZXF1aXJlZFBhcmFtZXRlciIsIl9BbmFseXRpY3NSb3V0ZXIiLCJfQ2xhc3Nlc1JvdXRlciIsIl9GZWF0dXJlc1JvdXRlciIsIl9GaWxlc1JvdXRlciIsIl9GdW5jdGlvbnNSb3V0ZXIiLCJfR2xvYmFsQ29uZmlnUm91dGVyIiwiX0dyYXBoUUxSb3V0ZXIiLCJfSG9va3NSb3V0ZXIiLCJfSUFQVmFsaWRhdGlvblJvdXRlciIsIl9JbnN0YWxsYXRpb25zUm91dGVyIiwiX0xvZ3NSb3V0ZXIiLCJfUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJfUGFnZXNSb3V0ZXIiLCJfUHVibGljQVBJUm91dGVyIiwiX1B1c2hSb3V0ZXIiLCJfQ2xvdWRDb2RlUm91dGVyIiwiX1JvbGVzUm91dGVyIiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2Vzc2lvbnNSb3V0ZXIiLCJfVXNlcnNSb3V0ZXIiLCJfUHVyZ2VSb3V0ZXIiLCJfQXVkaWVuY2VzUm91dGVyIiwiX0FnZ3JlZ2F0ZVJvdXRlciIsIl9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIiwiY29udHJvbGxlcnMiLCJfUGFyc2VHcmFwaFFMU2VydmVyIiwiX1NlY3VyaXR5Um91dGVyIiwiX0NoZWNrUnVubmVyIiwiX0RlcHJlY2F0b3IiLCJfRGVmaW5lZFNjaGVtYXMiLCJfRGVmaW5pdGlvbnMiLCJfVGVzdFV0aWxzIiwiZSIsInQiLCJXZWFrTWFwIiwiciIsIm4iLCJfX2VzTW9kdWxlIiwibyIsImkiLCJmIiwiX19wcm90b19fIiwiZGVmYXVsdCIsImhhcyIsImdldCIsInNldCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiYmF0Y2giLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsImNvbm5lY3Rpb25zIiwiQ29ubmVjdGlvbnMiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW50ZXJmYWNlcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJPcHRpb25zRGVmaW5pdGlvbnMiLCJnZXRWYWxpZE9iamVjdCIsInJvb3QiLCJyZXN1bHQiLCJrZXkiLCJwcm90b3R5cGUiLCJ0eXBlIiwiZW5kc1dpdGgiLCJzbGljZSIsIm9wdGlvbnNCbHVlcHJpbnQiLCJ2YWxpZGF0ZUtleU5hbWVzIiwib3JpZ2luYWwiLCJyZWYiLCJuYW1lIiwicHJlZml4IiwicHVzaCIsInJlcyIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJpdGVtIiwiaWR4IiwiY29uY2F0IiwiZGlmZiIsImZpbHRlciIsImluZGV4T2YiLCJsZW5ndGgiLCJsb2dnZXIiLCJlcnJvciIsImpvaW4iLCJpbmplY3REZWZhdWx0cyIsImFwcElkIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJtYXN0ZXJLZXkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsIkNvbmZpZyIsInZhbGlkYXRlT3B0aW9ucyIsImFsbENvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsImFzc2lnbiIsIm1hc3RlcktleUlwc1N0b3JlIiwiTWFwIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsInNldExvZ2dlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzdGFydCIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNhY2hlQ29udHJvbGxlciIsImNsb3VkIiwic2VjdXJpdHkiLCJzY2hlbWEiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiY29kZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwicHVzaENvbnRyb2xsZXIiLCJnZXRQdXNoQ29udHJvbGxlciIsImxvYWQiLCJzdGFydHVwUHJvbWlzZXMiLCJsb2FkTWFzdGVyS2V5IiwiRGVmaW5lZFNjaGVtYXMiLCJleGVjdXRlIiwiYWRhcHRlciIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsImpzb24iLCJwcm9jZXNzIiwiZW52IiwibnBtX3BhY2thZ2VfanNvbiIsIm5wbV9wYWNrYWdlX3R5cGUiLCJjd2QiLCJzZXRUaW1lb3V0IiwiZW5hYmxlQ2hlY2siLCJlbmFibGVDaGVja0xvZyIsIkNoZWNrUnVubmVyIiwicnVuIiwiY29uc29sZSIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInNlcnZlckNsb3NlUHJvbWlzZSIsInJlc29sdmluZ1Byb21pc2UiLCJsaXZlUXVlcnlTZXJ2ZXJDbG9zZVByb21pc2UiLCJwcm9taXNlcyIsInNlcnZlciIsImNsb3NlIiwibGl2ZVF1ZXJ5U2VydmVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJzaHV0ZG93biIsImRlc3Ryb3lBbGwiLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwiYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJhcGkiLCJyZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUiLCJ1c2UiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhbGxvd0Nyb3NzRG9tYWluIiwiYWxsb3dEb3VibGVGb3J3YXJkU2xhc2giLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJvdXRlcyIsInJvdXRlIiwiYWRkUmF0ZUxpbWl0IiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiVEVTVElORyIsIm9uIiwiZXJyIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwiZXhpdCIsIm1lc3NhZ2UiLCJzdGFjayIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiU2VjdXJpdHlSb3V0ZXIiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0QXBwIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwibGlzdGVuIiwiaG9zdCIsInRyYWNrIiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwidHJ1c3RQcm94eSIsImNvbmZpZ3VyZUxpc3RlbmVycyIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsInZlcmlmeVNlcnZlclVybCIsImlzVmFsaWRIdHRwVXJsIiwic3RyaW5nIiwidXJsIiwiVVJMIiwiXyIsInByb3RvY29sIiwicmVwbGFjZSIsIndhcm4iLCJyZXF1ZXN0IiwicmVzcG9uc2UiLCJjYXRjaCIsImRhdGEiLCJyZXRyeSIsImhlYWRlcnMiLCJQYXJzZUNsb3VkIiwiY29uZiIsImFwcGxpY2F0aW9uSWQiLCJuZXdWYWwiLCJjb25maWd1cmFibGUiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInVucSIsInN0ZG91dCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuaW1wb3J0IE9wdGlvbnNEZWZpbml0aW9ucyBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgcmVzb2x2aW5nUHJvbWlzZSwgQ29ubmVjdGlvbnMgfSBmcm9tICcuL1Rlc3RVdGlscyc7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBUcmFjayBjb25uZWN0aW9ucyB0byBkZXN0cm95IHRoZW0gb24gc2h1dGRvd25cbmNvbnN0IGNvbm5lY3Rpb25zID0gbmV3IENvbm5lY3Rpb25zKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgX2FwcDogYW55O1xuICBjb25maWc6IGFueTtcbiAgc2VydmVyOiBhbnk7XG4gIGV4cHJlc3NBcHA6IGFueTtcbiAgbGl2ZVF1ZXJ5U2VydmVyOiBhbnk7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gICAgRGVwcmVjYXRvci5zY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpO1xuXG4gICAgY29uc3QgaW50ZXJmYWNlcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoT3B0aW9uc0RlZmluaXRpb25zKSk7XG5cbiAgICBmdW5jdGlvbiBnZXRWYWxpZE9iamVjdChyb290KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIHJvb3QpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyb290W2tleV0sICd0eXBlJykpIHtcbiAgICAgICAgICBpZiAocm9vdFtrZXldLnR5cGUuZW5kc1dpdGgoJ1tdJykpIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gW2dldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGUuc2xpY2UoMCwgLTIpXSldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IGdldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGVdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBvcHRpb25zQmx1ZXByaW50ID0gZ2V0VmFsaWRPYmplY3QoaW50ZXJmYWNlc1snUGFyc2VTZXJ2ZXJPcHRpb25zJ10pO1xuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVLZXlOYW1lcyhvcmlnaW5hbCwgcmVmLCBuYW1lID0gJycpIHtcbiAgICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICAgIGNvbnN0IHByZWZpeCA9IG5hbWUgKyAobmFtZSAhPT0gJycgPyAnLicgOiAnJyk7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBvcmlnaW5hbCkge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZWYsIGtleSkpIHtcbiAgICAgICAgICByZXN1bHQucHVzaChwcmVmaXggKyBrZXkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChyZWZba2V5XSA9PT0gJycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBsZXQgcmVzID0gW107XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3JpZ2luYWxba2V5XSkgJiYgQXJyYXkuaXNBcnJheShyZWZba2V5XSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSByZWZba2V5XVswXTtcbiAgICAgICAgICAgIG9yaWdpbmFsW2tleV0uZm9yRWFjaCgoaXRlbSwgaWR4KSA9PiB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcy5jb25jYXQodmFsaWRhdGVLZXlOYW1lcyhpdGVtLCB0eXBlLCBwcmVmaXggKyBrZXkgKyBgWyR7aWR4fV1gKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9yaWdpbmFsW2tleV0gPT09ICdvYmplY3QnICYmIHR5cGVvZiByZWZba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHJlcyA9IHZhbGlkYXRlS2V5TmFtZXMob3JpZ2luYWxba2V5XSwgcmVmW2tleV0sIHByZWZpeCArIGtleSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQocmVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBkaWZmID0gdmFsaWRhdGVLZXlOYW1lcyhvcHRpb25zLCBvcHRpb25zQmx1ZXByaW50KS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaW5kZXhPZignZGF0YWJhc2VPcHRpb25zLicpID09PSAtMSk7XG4gICAgaWYgKGRpZmYubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbG9nZ2VyID0gKGxvZ2dpbmcgYXMgYW55KS5sb2dnZXI7XG4gICAgICBsb2dnZXIuZXJyb3IoYEludmFsaWQga2V5KHMpIGZvdW5kIGluIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uOiAke2RpZmYuam9pbignLCAnKX1gKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgQ29uZmlnLnZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgKG9wdGlvbnMgYXMgYW55KS5zdGF0ZSA9ICdpbml0aWFsaXplZCc7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG4gICAgdGhpcy5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICBsb2dnaW5nLnNldExvZ2dlcihhbGxDb250cm9sbGVycy5sb2dnZXJDb250cm9sbGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgUGFyc2UgU2VydmVyIGFzIGFuIGV4cHJlc3MgYXBwOyB0aGlzIHByb21pc2UgcmVzb2x2ZXMgd2hlbiBQYXJzZSBTZXJ2ZXIgaXMgcmVhZHkgdG8gYWNjZXB0IHJlcXVlc3RzLlxuICAgKi9cblxuICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHRoaXM+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YXRlID09PSAnb2snKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnc3RhcnRpbmcnO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgIGNsb3VkLFxuICAgICAgICBzZWN1cml0eSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBsaXZlUXVlcnlDb250cm9sbGVyLFxuICAgICAgfSA9IHRoaXMuY29uZmlnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBwdXNoQ29udHJvbGxlciA9IGF3YWl0IGNvbnRyb2xsZXJzLmdldFB1c2hDb250cm9sbGVyKHRoaXMuY29uZmlnKTtcbiAgICAgIGF3YWl0IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG4gICAgICBjb25zdCBzdGFydHVwUHJvbWlzZXMgPSBbdGhpcy5jb25maWcubG9hZE1hc3RlcktleT8uKCldO1xuICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChuZXcgRGVmaW5lZFNjaGVtYXMoc2NoZW1hLCB0aGlzLmNvbmZpZykuZXhlY3V0ZSgpKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgY2FjaGVDb250cm9sbGVyLmFkYXB0ZXI/LmNvbm5lY3QgJiZcbiAgICAgICAgdHlwZW9mIGNhY2hlQ29udHJvbGxlci5hZGFwdGVyLmNvbm5lY3QgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChjYWNoZUNvbnRyb2xsZXIuYWRhcHRlci5jb25uZWN0KCkpO1xuICAgICAgfVxuICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobGl2ZVF1ZXJ5Q29udHJvbGxlci5jb25uZWN0KCkpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3RhcnR1cFByb21pc2VzKTtcbiAgICAgIGlmIChjbG91ZCkge1xuICAgICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoY2xvdWQoUGFyc2UpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgbGV0IGpzb247XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pIHtcbiAgICAgICAgICAgIGpzb24gPSByZXF1aXJlKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfdHlwZSA9PT0gJ21vZHVsZScgfHwganNvbj8udHlwZSA9PT0gJ21vZHVsZScpIHtcbiAgICAgICAgICAgIGF3YWl0IGltcG9ydChwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICBuZXcgQ2hlY2tSdW5uZXIoc2VjdXJpdHkpLnJ1bigpO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnb2snO1xuICAgICAgdGhpcy5jb25maWcgPSB7IC4uLnRoaXMuY29uZmlnLCAuLi5wdXNoQ29udHJvbGxlciB9O1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyB0aGUgcGFyc2Ugc2VydmVyLCBjYW5jZWxzIGFueSBvbmdvaW5nIHJlcXVlc3RzIGFuZCBjbG9zZXMgYWxsIGNvbm5lY3Rpb25zLlxuICAgKlxuICAgKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNXG4gICAqIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC5cbiAgICogKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBzZXJ2ZXIgaXMgc3RvcHBlZFxuICAgKi9cbiAgYXN5bmMgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3Qgc2VydmVyQ2xvc2VQcm9taXNlID0gcmVzb2x2aW5nUHJvbWlzZSgpO1xuICAgIGNvbnN0IGxpdmVRdWVyeVNlcnZlckNsb3NlUHJvbWlzZSA9IHJlc29sdmluZ1Byb21pc2UoKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIHRoaXMuc2VydmVyLmNsb3NlKChlcnJvcikgPT4ge1xuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBjbG9zaW5nIHBhcnNlIHNlcnZlcicsIGVycm9yKTtcbiAgICAgIH1cbiAgICAgIHNlcnZlckNsb3NlUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfSk7XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyPy5zZXJ2ZXI/LmNsb3NlICYmIHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlciAhPT0gdGhpcy5zZXJ2ZXIpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyLnNlcnZlci5jbG9zZSgoZXJyb3IpID0+IHtcbiAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBjbG9zaW5nIGxpdmUgcXVlcnkgc2VydmVyJywgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIGxpdmVRdWVyeVNlcnZlckNsb3NlUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGl2ZVF1ZXJ5U2VydmVyQ2xvc2VQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXIpIHtcbiAgICAgIHByb21pc2VzLnB1c2godGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25uZWN0aW9ucy5kZXN0cm95QWxsKCk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoW3NlcnZlckNsb3NlUHJvbWlzZSwgbGl2ZVF1ZXJ5U2VydmVyQ2xvc2VQcm9taXNlXSk7XG4gICAgaWYgKHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUpIHtcbiAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBBbGxvdyBkZXZlbG9wZXJzIHRvIGN1c3RvbWl6ZSBlYWNoIHJlcXVlc3Qgd2l0aCBpbnZlcnNpb24gb2YgY29udHJvbC9kZXBlbmRlbmN5IGluamVjdGlvblxuICAgKi9cbiAgc3RhdGljIGFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSkge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlcXVlc3RDb250ZXh0TWlkZGxld2FyZSBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIH1cbiAgICAgIGFwaS51c2Uob3B0aW9ucy5yZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzLCByYXRlTGltaXQgPSBbXSB9ID0gb3B0aW9ucztcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4oYXBwSWQpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93RG91YmxlRm9yd2FyZFNsYXNoKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uIChyZXEsIHJlcykge1xuICAgICAgcmVzLnN0YXR1cyhvcHRpb25zLnN0YXRlID09PSAnb2snID8gMjAwIDogNTAzKTtcbiAgICAgIGlmIChvcHRpb25zLnN0YXRlID09PSAnc3RhcnRpbmcnKSB7XG4gICAgICAgIHJlcy5zZXQoJ1JldHJ5LUFmdGVyJywgMSk7XG4gICAgICB9XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogb3B0aW9ucy5zdGF0ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGV4cHJlc3MudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGV4cHJlc3MuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgYXBpLnNldCgncXVlcnkgcGFyc2VyJywgJ2V4dGVuZGVkJyk7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiByb3V0ZXMpIHtcbiAgICAgIG1pZGRsZXdhcmVzLmFkZFJhdGVMaW1pdChyb3V0ZSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uKTtcbiAgICB0aGlzLmFwcGx5UmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKGFwaSwgb3B0aW9ucyk7XG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycjogYW55KSA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoZXJyLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKCdBbiB1bmNhdWdodCBleGNlcHRpb24gb2NjdXJyZWQ6ICcgKyBlcnIubWVzc2FnZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnIuc3RhY2spIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKCdTdGFjayBUcmFjZTpcXG4nICsgZXJyLnN0YWNrKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vIHZlcmlmeSB0aGUgc2VydmVyIHVybCBhZnRlciBhICdtb3VudCcgZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICAvLyBhcGkub24oJ21vdW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgLy8gICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMCkpO1xuICAgICAgLy8gICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIC8vIH0pO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8IGRpcmVjdEFjY2Vzcykge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBJZCwgYXBwUm91dGVyKSk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgR3JhcGhRTFJvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZWN1cml0eVJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG9uIFBhcnNlU2VydmVyLnN0YXJ0QXBwOiAnLCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlc29sdmUodGhpcyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICBjb25uZWN0aW9ucy50cmFjayhzZXJ2ZXIpO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IGF3YWl0IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyICE9PSB0aGlzLnNlcnZlcikge1xuICAgICAgICBjb25uZWN0aW9ucy50cmFjayh0aGlzLmxpdmVRdWVyeVNlcnZlci5zZXJ2ZXIpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAob3B0aW9ucy50cnVzdFByb3h5KSB7XG4gICAgICBhcHAuc2V0KCd0cnVzdCBwcm94eScsIG9wdGlvbnMudHJ1c3RQcm94eSk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnRBcHAob3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj59IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKTogUHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj4ge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICAgIGF3YWl0IHNlcnZlci5jb25uZWN0KCk7XG4gICAgcmV0dXJuIHNlcnZlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyB2ZXJpZnlTZXJ2ZXJVcmwoKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgaXNWYWxpZEh0dHBVcmwgPSBzdHJpbmcgPT4ge1xuICAgICAgICBsZXQgdXJsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHVybCA9IG5ldyBVUkwoc3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG4gICAgICB9O1xuICAgICAgY29uc3QgdXJsID0gYCR7UGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2hlYWx0aGA7XG4gICAgICBpZiAoIWlzVmFsaWRIdHRwVXJsKHVybCkpIHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9JyBhcyB0aGUgVVJMIGlzIGludmFsaWQuYCArXG4gICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KHsgdXJsIH0pLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKTtcbiAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICBjb25zdCByZXRyeSA9IHJlc3BvbnNlLmhlYWRlcnM/LlsncmV0cnktYWZ0ZXInXTtcbiAgICAgIGlmIChyZXRyeSkge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgcmV0cnkgKiAxMDAwKSk7XG4gICAgICAgIHJldHVybiB0aGlzLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8IGpzb24/LnN0YXR1cyAhPT0gJ29rJykge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIGNvbnN0IFBhcnNlU2VydmVyID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcicpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgY29uc3QgY29uZiA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICByZXR1cm4geyAuLi5jb25mLCAuLi5QYXJzZVNlcnZlciB9O1xuICAgIH0sXG4gICAgc2V0KG5ld1ZhbCkge1xuICAgICAgbmV3VmFsLmFwcElkID0gUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICAgIENvbmZpZy5wdXQobmV3VmFsKTtcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgfSk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uICgpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQVdBLElBQUFBLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUMsdUJBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLGNBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLGtCQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxnQkFBQSxHQUFBTixPQUFBO0FBQ0EsSUFBQU8sY0FBQSxHQUFBUCxPQUFBO0FBQ0EsSUFBQVEsZUFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsWUFBQSxHQUFBVCxPQUFBO0FBQ0EsSUFBQVUsZ0JBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLG1CQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxjQUFBLEdBQUFaLE9BQUE7QUFDQSxJQUFBYSxZQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxvQkFBQSxHQUFBZCxPQUFBO0FBQ0EsSUFBQWUsb0JBQUEsR0FBQWYsT0FBQTtBQUNBLElBQUFnQixXQUFBLEdBQUFoQixPQUFBO0FBQ0EsSUFBQWlCLHFCQUFBLEdBQUFqQixPQUFBO0FBQ0EsSUFBQWtCLFlBQUEsR0FBQWxCLE9BQUE7QUFDQSxJQUFBbUIsZ0JBQUEsR0FBQW5CLE9BQUE7QUFDQSxJQUFBb0IsV0FBQSxHQUFBcEIsT0FBQTtBQUNBLElBQUFxQixnQkFBQSxHQUFBckIsT0FBQTtBQUNBLElBQUFzQixZQUFBLEdBQUF0QixPQUFBO0FBQ0EsSUFBQXVCLGNBQUEsR0FBQXZCLE9BQUE7QUFDQSxJQUFBd0Is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