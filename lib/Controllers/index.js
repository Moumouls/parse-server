"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getAnalyticsController = getAnalyticsController;
exports.getAuthDataManager = getAuthDataManager;
exports.getCacheController = getCacheController;
exports.getControllers = getControllers;
exports.getDatabaseAdapter = getDatabaseAdapter;
exports.getDatabaseController = getDatabaseController;
exports.getFilesController = getFilesController;
exports.getHooksController = getHooksController;
exports.getLiveQueryController = getLiveQueryController;
exports.getLoggerController = getLoggerController;
exports.getParseGraphQLController = getParseGraphQLController;
exports.getPushController = getPushController;
exports.getUserController = getUserController;
var _Auth = _interopRequireDefault(require("../Adapters/Auth"));
var _Options = require("../Options");
var _AdapterLoader = require("../Adapters/AdapterLoader");
var _defaults = _interopRequireDefault(require("../defaults"));
var _LoggerController = require("./LoggerController");
var _FilesController = require("./FilesController");
var _HooksController = require("./HooksController");
var _UserController = require("./UserController");
var _CacheController = require("./CacheController");
var _LiveQueryController = require("./LiveQueryController");
var _AnalyticsController = require("./AnalyticsController");
var _PushController = require("./PushController");
var _PushQueue = require("../Push/PushQueue");
var _PushWorker = require("../Push/PushWorker");
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _GridFSBucketAdapter = require("../Adapters/Files/GridFSBucketAdapter");
var _WinstonLoggerAdapter = require("../Adapters/Logger/WinstonLoggerAdapter");
var _InMemoryCacheAdapter = require("../Adapters/Cache/InMemoryCacheAdapter");
var _AnalyticsAdapter = require("../Adapters/Analytics/AnalyticsAdapter");
var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _pushAdapter = _interopRequireDefault(require("@parse/push-adapter"));
var _ParseGraphQLController = _interopRequireDefault(require("./ParseGraphQLController"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // Controllers
// Adapters
function getControllers(options) {
  const loggerController = getLoggerController(options);
  const filesController = getFilesController(options);
  const userController = getUserController(options);
  const {
    pushController,
    hasPushScheduledSupport,
    hasPushSupport,
    pushControllerQueue,
    pushWorker
  } = getPushController(options);
  const cacheController = getCacheController(options);
  const analyticsController = getAnalyticsController(options);
  const liveQueryController = getLiveQueryController(options);
  const databaseController = getDatabaseController(options);
  const hooksController = getHooksController(options, databaseController);
  const authDataManager = getAuthDataManager(options);
  const parseGraphQLController = getParseGraphQLController(options, {
    databaseController,
    cacheController
  });
  return {
    loggerController,
    filesController,
    userController,
    pushController,
    hasPushScheduledSupport,
    hasPushSupport,
    pushWorker,
    pushControllerQueue,
    analyticsController,
    cacheController,
    parseGraphQLController,
    liveQueryController,
    databaseController,
    hooksController,
    authDataManager,
    schemaCache: _SchemaCache.default
  };
}
function getLoggerController(options) {
  const {
    appId,
    jsonLogs,
    logsFolder,
    verbose,
    logLevel,
    maxLogFiles,
    silent,
    loggerAdapter
  } = options;
  const loggerOptions = {
    jsonLogs,
    logsFolder,
    verbose,
    logLevel,
    silent,
    maxLogFiles
  };
  const loggerControllerAdapter = (0, _AdapterLoader.loadAdapter)(loggerAdapter, _WinstonLoggerAdapter.WinstonLoggerAdapter, loggerOptions);
  return new _LoggerController.LoggerController(loggerControllerAdapter, appId, loggerOptions);
}
function getFilesController(options) {
  const {
    appId,
    databaseURI,
    databaseOptions = {},
    filesAdapter,
    databaseAdapter,
    preserveFileName,
    fileKey
  } = options;
  if (!filesAdapter && databaseAdapter) {
    throw 'When using an explicit database adapter, you must also use an explicit filesAdapter.';
  }
  const filesControllerAdapter = (0, _AdapterLoader.loadAdapter)(filesAdapter, () => {
    return new _GridFSBucketAdapter.GridFSBucketAdapter(databaseURI, databaseOptions, fileKey);
  });
  return new _FilesController.FilesController(filesControllerAdapter, appId, {
    preserveFileName
  });
}
function getUserController(options) {
  const {
    appId,
    emailAdapter,
    verifyUserEmails
  } = options;
  const emailControllerAdapter = (0, _AdapterLoader.loadAdapter)(emailAdapter);
  return new _UserController.UserController(emailControllerAdapter, appId, {
    verifyUserEmails
  });
}
function getCacheController(options) {
  const {
    appId,
    cacheAdapter,
    cacheTTL,
    cacheMaxSize
  } = options;
  const cacheControllerAdapter = (0, _AdapterLoader.loadAdapter)(cacheAdapter, _InMemoryCacheAdapter.InMemoryCacheAdapter, {
    appId: appId,
    ttl: cacheTTL,
    maxSize: cacheMaxSize
  });
  return new _CacheController.CacheController(cacheControllerAdapter, appId);
}
function getParseGraphQLController(options, controllerDeps) {
  return new _ParseGraphQLController.default(_objectSpread({
    mountGraphQL: options.mountGraphQL
  }, controllerDeps));
}
function getAnalyticsController(options) {
  const {
    analyticsAdapter
  } = options;
  const analyticsControllerAdapter = (0, _AdapterLoader.loadAdapter)(analyticsAdapter, _AnalyticsAdapter.AnalyticsAdapter);
  return new _AnalyticsController.AnalyticsController(analyticsControllerAdapter);
}
function getLiveQueryController(options) {
  return new _LiveQueryController.LiveQueryController(options.liveQuery);
}
function getDatabaseController(options) {
  const {
    databaseURI,
    collectionPrefix,
    databaseOptions
  } = options;
  let {
    databaseAdapter
  } = options;
  if ((databaseOptions || databaseURI && databaseURI !== _defaults.default.databaseURI || collectionPrefix !== _defaults.default.collectionPrefix) && databaseAdapter) {
    throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
  } else if (!databaseAdapter) {
    databaseAdapter = getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions);
  } else {
    databaseAdapter = (0, _AdapterLoader.loadAdapter)(databaseAdapter);
  }
  return new _DatabaseController.default(databaseAdapter, options);
}
function getHooksController(options, databaseController) {
  const {
    appId,
    webhookKey
  } = options;
  return new _HooksController.HooksController(appId, databaseController, webhookKey);
}
function getPushController(options) {
  const {
    scheduledPush,
    push
  } = options;
  const pushOptions = Object.assign({}, push);
  const pushQueueOptions = pushOptions.queueOptions || {};
  if (pushOptions.queueOptions) {
    delete pushOptions.queueOptions;
  }

  // Pass the push options too as it works with the default
  const pushAdapter = (0, _AdapterLoader.loadAdapter)(pushOptions && pushOptions.adapter, _pushAdapter.default, pushOptions);
  // We pass the options and the base class for the adatper,
  // Note that passing an instance would work too
  const pushController = new _PushController.PushController();
  const hasPushSupport = !!(pushAdapter && push);
  const hasPushScheduledSupport = hasPushSupport && scheduledPush === true;
  const {
    disablePushWorker
  } = pushQueueOptions;
  const pushControllerQueue = new _PushQueue.PushQueue(pushQueueOptions);
  let pushWorker;
  if (!disablePushWorker) {
    pushWorker = new _PushWorker.PushWorker(pushAdapter, pushQueueOptions);
  }
  return {
    pushController,
    hasPushSupport,
    hasPushScheduledSupport,
    pushControllerQueue,
    pushWorker
  };
}
function getAuthDataManager(options) {
  const {
    auth,
    enableAnonymousUsers
  } = options;
  return (0, _Auth.default)(auth, enableAnonymousUsers);
}
function getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions) {
  let protocol;
  try {
    const parsedURI = new URL(databaseURI);
    protocol = parsedURI.protocol ? parsedURI.protocol.toLowerCase() : null;
  } catch (e) {
    /* */
  }
  switch (protocol) {
    case 'postgres:':
    case 'postgresql:':
      return new _PostgresStorageAdapter.default({
        uri: databaseURI,
        collectionPrefix,
        databaseOptions
      });
    default:
      return new _MongoStorageAdapter.default({
        uri: databaseURI,
        collectionPrefix,
        mongoOptions: databaseOptions
      });
  }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQXV0aCIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX09wdGlvbnMiLCJfQWRhcHRlckxvYWRlciIsIl9kZWZhdWx0cyIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX0ZpbGVzQ29udHJvbGxlciIsIl9Ib29rc0NvbnRyb2xsZXIiLCJfVXNlckNvbnRyb2xsZXIiLCJfQ2FjaGVDb250cm9sbGVyIiwiX0xpdmVRdWVyeUNvbnRyb2xsZXIiLCJfQW5hbHl0aWNzQ29udHJvbGxlciIsIl9QdXNoQ29udHJvbGxlciIsIl9QdXNoUXVldWUiLCJfUHVzaFdvcmtlciIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfR3JpZEZTQnVja2V0QWRhcHRlciIsIl9XaW5zdG9uTG9nZ2VyQWRhcHRlciIsIl9Jbk1lbW9yeUNhY2hlQWRhcHRlciIsIl9BbmFseXRpY3NBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9wdXNoQWRhcHRlciIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX1NjaGVtYUNhY2hlIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsImdldENvbnRyb2xsZXJzIiwib3B0aW9ucyIsImxvZ2dlckNvbnRyb2xsZXIiLCJnZXRMb2dnZXJDb250cm9sbGVyIiwiZmlsZXNDb250cm9sbGVyIiwiZ2V0RmlsZXNDb250cm9sbGVyIiwidXNlckNvbnRyb2xsZXIiLCJnZXRVc2VyQ29udHJvbGxlciIsInB1c2hDb250cm9sbGVyIiwiaGFzUHVzaFNjaGVkdWxlZFN1cHBvcnQiLCJoYXNQdXNoU3VwcG9ydCIsInB1c2hDb250cm9sbGVyUXVldWUiLCJwdXNoV29ya2VyIiwiZ2V0UHVzaENvbnRyb2xsZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJnZXRDYWNoZUNvbnRyb2xsZXIiLCJhbmFseXRpY3NDb250cm9sbGVyIiwiZ2V0QW5hbHl0aWNzQ29udHJvbGxlciIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJnZXRMaXZlUXVlcnlDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiZ2V0RGF0YWJhc2VDb250cm9sbGVyIiwiaG9va3NDb250cm9sbGVyIiwiZ2V0SG9va3NDb250cm9sbGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0QXV0aERhdGFNYW5hZ2VyIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImdldFBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJzY2hlbWFDYWNoZSIsIlNjaGVtYUNhY2hlIiwiYXBwSWQiLCJqc29uTG9ncyIsImxvZ3NGb2xkZXIiLCJ2ZXJib3NlIiwibG9nTGV2ZWwiLCJtYXhMb2dGaWxlcyIsInNpbGVudCIsImxvZ2dlckFkYXB0ZXIiLCJsb2dnZXJPcHRpb25zIiwibG9nZ2VyQ29udHJvbGxlckFkYXB0ZXIiLCJsb2FkQWRhcHRlciIsIldpbnN0b25Mb2dnZXJBZGFwdGVyIiwiTG9nZ2VyQ29udHJvbGxlciIsImRhdGFiYXNlVVJJIiwiZGF0YWJhc2VPcHRpb25zIiwiZmlsZXNBZGFwdGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwicHJlc2VydmVGaWxlTmFtZSIsImZpbGVLZXkiLCJmaWxlc0NvbnRyb2xsZXJBZGFwdGVyIiwiR3JpZEZTQnVja2V0QWRhcHRlciIsIkZpbGVzQ29udHJvbGxlciIsImVtYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJlbWFpbENvbnRyb2xsZXJBZGFwdGVyIiwiVXNlckNvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJjYWNoZVRUTCIsImNhY2hlTWF4U2l6ZSIsImNhY2hlQ29udHJvbGxlckFkYXB0ZXIiLCJJbk1lbW9yeUNhY2hlQWRhcHRlciIsInR0bCIsIm1heFNpemUiLCJDYWNoZUNvbnRyb2xsZXIiLCJjb250cm9sbGVyRGVwcyIsIlBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJtb3VudEdyYXBoUUwiLCJhbmFseXRpY3NBZGFwdGVyIiwiYW5hbHl0aWNzQ29udHJvbGxlckFkYXB0ZXIiLCJBbmFseXRpY3NBZGFwdGVyIiwiQW5hbHl0aWNzQ29udHJvbGxlciIsIkxpdmVRdWVyeUNvbnRyb2xsZXIiLCJsaXZlUXVlcnkiLCJjb2xsZWN0aW9uUHJlZml4IiwiZGVmYXVsdHMiLCJnZXREYXRhYmFzZUFkYXB0ZXIiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJ3ZWJob29rS2V5IiwiSG9va3NDb250cm9sbGVyIiwic2NoZWR1bGVkUHVzaCIsInB1c2hPcHRpb25zIiwiYXNzaWduIiwicHVzaFF1ZXVlT3B0aW9ucyIsInF1ZXVlT3B0aW9ucyIsInB1c2hBZGFwdGVyIiwiYWRhcHRlciIsIlBhcnNlUHVzaEFkYXB0ZXIiLCJQdXNoQ29udHJvbGxlciIsImRpc2FibGVQdXNoV29ya2VyIiwiUHVzaFF1ZXVlIiwiUHVzaFdvcmtlciIsImF1dGgiLCJlbmFibGVBbm9ueW1vdXNVc2VycyIsInByb3RvY29sIiwicGFyc2VkVVJJIiwiVVJMIiwidG9Mb3dlckNhc2UiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidXJpIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsIm1vbmdvT3B0aW9ucyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgYXV0aERhdGFNYW5hZ2VyIGZyb20gJy4uL0FkYXB0ZXJzL0F1dGgnO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgeyBsb2FkQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0FkYXB0ZXJMb2FkZXInO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uL2RlZmF1bHRzJztcbi8vIENvbnRyb2xsZXJzXG5pbXBvcnQgeyBMb2dnZXJDb250cm9sbGVyIH0gZnJvbSAnLi9Mb2dnZXJDb250cm9sbGVyJztcbmltcG9ydCB7IEZpbGVzQ29udHJvbGxlciB9IGZyb20gJy4vRmlsZXNDb250cm9sbGVyJztcbmltcG9ydCB7IEhvb2tzQ29udHJvbGxlciB9IGZyb20gJy4vSG9va3NDb250cm9sbGVyJztcbmltcG9ydCB7IFVzZXJDb250cm9sbGVyIH0gZnJvbSAnLi9Vc2VyQ29udHJvbGxlcic7XG5pbXBvcnQgeyBDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuL0NhY2hlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBMaXZlUXVlcnlDb250cm9sbGVyIH0gZnJvbSAnLi9MaXZlUXVlcnlDb250cm9sbGVyJztcbmltcG9ydCB7IEFuYWx5dGljc0NvbnRyb2xsZXIgfSBmcm9tICcuL0FuYWx5dGljc0NvbnRyb2xsZXInO1xuaW1wb3J0IHsgUHVzaENvbnRyb2xsZXIgfSBmcm9tICcuL1B1c2hDb250cm9sbGVyJztcbmltcG9ydCB7IFB1c2hRdWV1ZSB9IGZyb20gJy4uL1B1c2gvUHVzaFF1ZXVlJztcbmltcG9ydCB7IFB1c2hXb3JrZXIgfSBmcm9tICcuLi9QdXNoL1B1c2hXb3JrZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5cbi8vIEFkYXB0ZXJzXG5pbXBvcnQgeyBHcmlkRlNCdWNrZXRBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvRmlsZXMvR3JpZEZTQnVja2V0QWRhcHRlcic7XG5pbXBvcnQgeyBXaW5zdG9uTG9nZ2VyQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0xvZ2dlci9XaW5zdG9uTG9nZ2VyQWRhcHRlcic7XG5pbXBvcnQgeyBJbk1lbW9yeUNhY2hlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL0luTWVtb3J5Q2FjaGVBZGFwdGVyJztcbmltcG9ydCB7IEFuYWx5dGljc0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9BbmFseXRpY3MvQW5hbHl0aWNzQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQYXJzZVB1c2hBZGFwdGVyIGZyb20gJ0BwYXJzZS9wdXNoLWFkYXB0ZXInO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIgZnJvbSAnLi9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250cm9sbGVycyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgY29uc3QgbG9nZ2VyQ29udHJvbGxlciA9IGdldExvZ2dlckNvbnRyb2xsZXIob3B0aW9ucyk7XG4gIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGdldEZpbGVzQ29udHJvbGxlcihvcHRpb25zKTtcbiAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBnZXRVc2VyQ29udHJvbGxlcihvcHRpb25zKTtcbiAgY29uc3Qge1xuICAgIHB1c2hDb250cm9sbGVyLFxuICAgIGhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0LFxuICAgIGhhc1B1c2hTdXBwb3J0LFxuICAgIHB1c2hDb250cm9sbGVyUXVldWUsXG4gICAgcHVzaFdvcmtlcixcbiAgfSA9IGdldFB1c2hDb250cm9sbGVyKG9wdGlvbnMpO1xuICBjb25zdCBjYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIob3B0aW9ucyk7XG4gIGNvbnN0IGFuYWx5dGljc0NvbnRyb2xsZXIgPSBnZXRBbmFseXRpY3NDb250cm9sbGVyKG9wdGlvbnMpO1xuICBjb25zdCBsaXZlUXVlcnlDb250cm9sbGVyID0gZ2V0TGl2ZVF1ZXJ5Q29udHJvbGxlcihvcHRpb25zKTtcbiAgY29uc3QgZGF0YWJhc2VDb250cm9sbGVyID0gZ2V0RGF0YWJhc2VDb250cm9sbGVyKG9wdGlvbnMpO1xuICBjb25zdCBob29rc0NvbnRyb2xsZXIgPSBnZXRIb29rc0NvbnRyb2xsZXIob3B0aW9ucywgZGF0YWJhc2VDb250cm9sbGVyKTtcbiAgY29uc3QgYXV0aERhdGFNYW5hZ2VyID0gZ2V0QXV0aERhdGFNYW5hZ2VyKG9wdGlvbnMpO1xuICBjb25zdCBwYXJzZUdyYXBoUUxDb250cm9sbGVyID0gZ2V0UGFyc2VHcmFwaFFMQ29udHJvbGxlcihvcHRpb25zLCB7XG4gICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgfSk7XG4gIHJldHVybiB7XG4gICAgbG9nZ2VyQ29udHJvbGxlcixcbiAgICBmaWxlc0NvbnRyb2xsZXIsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgcHVzaENvbnRyb2xsZXIsXG4gICAgaGFzUHVzaFNjaGVkdWxlZFN1cHBvcnQsXG4gICAgaGFzUHVzaFN1cHBvcnQsXG4gICAgcHVzaFdvcmtlcixcbiAgICBwdXNoQ29udHJvbGxlclF1ZXVlLFxuICAgIGFuYWx5dGljc0NvbnRyb2xsZXIsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgbGl2ZVF1ZXJ5Q29udHJvbGxlcixcbiAgICBkYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgaG9va3NDb250cm9sbGVyLFxuICAgIGF1dGhEYXRhTWFuYWdlcixcbiAgICBzY2hlbWFDYWNoZTogU2NoZW1hQ2FjaGUsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2dnZXJDb250cm9sbGVyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyk6IExvZ2dlckNvbnRyb2xsZXIge1xuICBjb25zdCB7XG4gICAgYXBwSWQsXG4gICAganNvbkxvZ3MsXG4gICAgbG9nc0ZvbGRlcixcbiAgICB2ZXJib3NlLFxuICAgIGxvZ0xldmVsLFxuICAgIG1heExvZ0ZpbGVzLFxuICAgIHNpbGVudCxcbiAgICBsb2dnZXJBZGFwdGVyLFxuICB9ID0gb3B0aW9ucztcbiAgY29uc3QgbG9nZ2VyT3B0aW9ucyA9IHtcbiAgICBqc29uTG9ncyxcbiAgICBsb2dzRm9sZGVyLFxuICAgIHZlcmJvc2UsXG4gICAgbG9nTGV2ZWwsXG4gICAgc2lsZW50LFxuICAgIG1heExvZ0ZpbGVzLFxuICB9O1xuICBjb25zdCBsb2dnZXJDb250cm9sbGVyQWRhcHRlciA9IGxvYWRBZGFwdGVyKGxvZ2dlckFkYXB0ZXIsIFdpbnN0b25Mb2dnZXJBZGFwdGVyLCBsb2dnZXJPcHRpb25zKTtcbiAgcmV0dXJuIG5ldyBMb2dnZXJDb250cm9sbGVyKGxvZ2dlckNvbnRyb2xsZXJBZGFwdGVyLCBhcHBJZCwgbG9nZ2VyT3B0aW9ucyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWxlc0NvbnRyb2xsZXIob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKTogRmlsZXNDb250cm9sbGVyIHtcbiAgY29uc3Qge1xuICAgIGFwcElkLFxuICAgIGRhdGFiYXNlVVJJLFxuICAgIGRhdGFiYXNlT3B0aW9ucyA9IHt9LFxuICAgIGZpbGVzQWRhcHRlcixcbiAgICBkYXRhYmFzZUFkYXB0ZXIsXG4gICAgcHJlc2VydmVGaWxlTmFtZSxcbiAgICBmaWxlS2V5LFxuICB9ID0gb3B0aW9ucztcbiAgaWYgKCFmaWxlc0FkYXB0ZXIgJiYgZGF0YWJhc2VBZGFwdGVyKSB7XG4gICAgdGhyb3cgJ1doZW4gdXNpbmcgYW4gZXhwbGljaXQgZGF0YWJhc2UgYWRhcHRlciwgeW91IG11c3QgYWxzbyB1c2UgYW4gZXhwbGljaXQgZmlsZXNBZGFwdGVyLic7XG4gIH1cbiAgY29uc3QgZmlsZXNDb250cm9sbGVyQWRhcHRlciA9IGxvYWRBZGFwdGVyKGZpbGVzQWRhcHRlciwgKCkgPT4ge1xuICAgIHJldHVybiBuZXcgR3JpZEZTQnVja2V0QWRhcHRlcihkYXRhYmFzZVVSSSwgZGF0YWJhc2VPcHRpb25zLCBmaWxlS2V5KTtcbiAgfSk7XG4gIHJldHVybiBuZXcgRmlsZXNDb250cm9sbGVyKGZpbGVzQ29udHJvbGxlckFkYXB0ZXIsIGFwcElkLCB7XG4gICAgcHJlc2VydmVGaWxlTmFtZSxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRVc2VyQ29udHJvbGxlcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpOiBVc2VyQ29udHJvbGxlciB7XG4gIGNvbnN0IHsgYXBwSWQsIGVtYWlsQWRhcHRlciwgdmVyaWZ5VXNlckVtYWlscyB9ID0gb3B0aW9ucztcbiAgY29uc3QgZW1haWxDb250cm9sbGVyQWRhcHRlciA9IGxvYWRBZGFwdGVyKGVtYWlsQWRhcHRlcik7XG4gIHJldHVybiBuZXcgVXNlckNvbnRyb2xsZXIoZW1haWxDb250cm9sbGVyQWRhcHRlciwgYXBwSWQsIHtcbiAgICB2ZXJpZnlVc2VyRW1haWxzLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENhY2hlQ29udHJvbGxlcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpOiBDYWNoZUNvbnRyb2xsZXIge1xuICBjb25zdCB7IGFwcElkLCBjYWNoZUFkYXB0ZXIsIGNhY2hlVFRMLCBjYWNoZU1heFNpemUgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IGNhY2hlQ29udHJvbGxlckFkYXB0ZXIgPSBsb2FkQWRhcHRlcihjYWNoZUFkYXB0ZXIsIEluTWVtb3J5Q2FjaGVBZGFwdGVyLCB7XG4gICAgYXBwSWQ6IGFwcElkLFxuICAgIHR0bDogY2FjaGVUVEwsXG4gICAgbWF4U2l6ZTogY2FjaGVNYXhTaXplLFxuICB9KTtcbiAgcmV0dXJuIG5ldyBDYWNoZUNvbnRyb2xsZXIoY2FjaGVDb250cm9sbGVyQWRhcHRlciwgYXBwSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGFyc2VHcmFwaFFMQ29udHJvbGxlcihcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBjb250cm9sbGVyRGVwc1xuKTogUGFyc2VHcmFwaFFMQ29udHJvbGxlciB7XG4gIHJldHVybiBuZXcgUGFyc2VHcmFwaFFMQ29udHJvbGxlcih7XG4gICAgbW91bnRHcmFwaFFMOiBvcHRpb25zLm1vdW50R3JhcGhRTCxcbiAgICAuLi5jb250cm9sbGVyRGVwcyxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBbmFseXRpY3NDb250cm9sbGVyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyk6IEFuYWx5dGljc0NvbnRyb2xsZXIge1xuICBjb25zdCB7IGFuYWx5dGljc0FkYXB0ZXIgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IGFuYWx5dGljc0NvbnRyb2xsZXJBZGFwdGVyID0gbG9hZEFkYXB0ZXIoYW5hbHl0aWNzQWRhcHRlciwgQW5hbHl0aWNzQWRhcHRlcik7XG4gIHJldHVybiBuZXcgQW5hbHl0aWNzQ29udHJvbGxlcihhbmFseXRpY3NDb250cm9sbGVyQWRhcHRlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXZlUXVlcnlDb250cm9sbGVyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyk6IExpdmVRdWVyeUNvbnRyb2xsZXIge1xuICByZXR1cm4gbmV3IExpdmVRdWVyeUNvbnRyb2xsZXIob3B0aW9ucy5saXZlUXVlcnkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGF0YWJhc2VDb250cm9sbGVyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyk6IERhdGFiYXNlQ29udHJvbGxlciB7XG4gIGNvbnN0IHsgZGF0YWJhc2VVUkksIGNvbGxlY3Rpb25QcmVmaXgsIGRhdGFiYXNlT3B0aW9ucyB9ID0gb3B0aW9ucztcbiAgbGV0IHsgZGF0YWJhc2VBZGFwdGVyIH0gPSBvcHRpb25zO1xuICBpZiAoXG4gICAgKGRhdGFiYXNlT3B0aW9ucyB8fFxuICAgICAgKGRhdGFiYXNlVVJJICYmIGRhdGFiYXNlVVJJICE9PSBkZWZhdWx0cy5kYXRhYmFzZVVSSSkgfHxcbiAgICAgIGNvbGxlY3Rpb25QcmVmaXggIT09IGRlZmF1bHRzLmNvbGxlY3Rpb25QcmVmaXgpICYmXG4gICAgZGF0YWJhc2VBZGFwdGVyXG4gICkge1xuICAgIHRocm93ICdZb3UgY2Fubm90IHNwZWNpZnkgYm90aCBhIGRhdGFiYXNlQWRhcHRlciBhbmQgYSBkYXRhYmFzZVVSSS9kYXRhYmFzZU9wdGlvbnMvY29sbGVjdGlvblByZWZpeC4nO1xuICB9IGVsc2UgaWYgKCFkYXRhYmFzZUFkYXB0ZXIpIHtcbiAgICBkYXRhYmFzZUFkYXB0ZXIgPSBnZXREYXRhYmFzZUFkYXB0ZXIoZGF0YWJhc2VVUkksIGNvbGxlY3Rpb25QcmVmaXgsIGRhdGFiYXNlT3B0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgZGF0YWJhc2VBZGFwdGVyID0gbG9hZEFkYXB0ZXIoZGF0YWJhc2VBZGFwdGVyKTtcbiAgfVxuICByZXR1cm4gbmV3IERhdGFiYXNlQ29udHJvbGxlcihkYXRhYmFzZUFkYXB0ZXIsIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SG9va3NDb250cm9sbGVyKFxuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsXG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyXG4pOiBIb29rc0NvbnRyb2xsZXIge1xuICBjb25zdCB7IGFwcElkLCB3ZWJob29rS2V5IH0gPSBvcHRpb25zO1xuICByZXR1cm4gbmV3IEhvb2tzQ29udHJvbGxlcihhcHBJZCwgZGF0YWJhc2VDb250cm9sbGVyLCB3ZWJob29rS2V5KTtcbn1cblxuaW50ZXJmYWNlIFB1c2hDb250cm9sbGluZyB7XG4gIHB1c2hDb250cm9sbGVyOiBQdXNoQ29udHJvbGxlcjtcbiAgaGFzUHVzaFNjaGVkdWxlZFN1cHBvcnQ6IGJvb2xlYW47XG4gIHB1c2hDb250cm9sbGVyUXVldWU6IFB1c2hRdWV1ZTtcbiAgcHVzaFdvcmtlcjogUHVzaFdvcmtlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFB1c2hDb250cm9sbGVyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyk6IFB1c2hDb250cm9sbGluZyB7XG4gIGNvbnN0IHsgc2NoZWR1bGVkUHVzaCwgcHVzaCB9ID0gb3B0aW9ucztcblxuICBjb25zdCBwdXNoT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHB1c2gpO1xuICBjb25zdCBwdXNoUXVldWVPcHRpb25zID0gcHVzaE9wdGlvbnMucXVldWVPcHRpb25zIHx8IHt9O1xuICBpZiAocHVzaE9wdGlvbnMucXVldWVPcHRpb25zKSB7XG4gICAgZGVsZXRlIHB1c2hPcHRpb25zLnF1ZXVlT3B0aW9ucztcbiAgfVxuXG4gIC8vIFBhc3MgdGhlIHB1c2ggb3B0aW9ucyB0b28gYXMgaXQgd29ya3Mgd2l0aCB0aGUgZGVmYXVsdFxuICBjb25zdCBwdXNoQWRhcHRlciA9IGxvYWRBZGFwdGVyKFxuICAgIHB1c2hPcHRpb25zICYmIHB1c2hPcHRpb25zLmFkYXB0ZXIsXG4gICAgUGFyc2VQdXNoQWRhcHRlcixcbiAgICBwdXNoT3B0aW9uc1xuICApO1xuICAvLyBXZSBwYXNzIHRoZSBvcHRpb25zIGFuZCB0aGUgYmFzZSBjbGFzcyBmb3IgdGhlIGFkYXRwZXIsXG4gIC8vIE5vdGUgdGhhdCBwYXNzaW5nIGFuIGluc3RhbmNlIHdvdWxkIHdvcmsgdG9vXG4gIGNvbnN0IHB1c2hDb250cm9sbGVyID0gbmV3IFB1c2hDb250cm9sbGVyKCk7XG4gIGNvbnN0IGhhc1B1c2hTdXBwb3J0ID0gISEocHVzaEFkYXB0ZXIgJiYgcHVzaCk7XG4gIGNvbnN0IGhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0ID0gaGFzUHVzaFN1cHBvcnQgJiYgc2NoZWR1bGVkUHVzaCA9PT0gdHJ1ZTtcblxuICBjb25zdCB7IGRpc2FibGVQdXNoV29ya2VyIH0gPSBwdXNoUXVldWVPcHRpb25zO1xuXG4gIGNvbnN0IHB1c2hDb250cm9sbGVyUXVldWUgPSBuZXcgUHVzaFF1ZXVlKHB1c2hRdWV1ZU9wdGlvbnMpO1xuICBsZXQgcHVzaFdvcmtlcjtcbiAgaWYgKCFkaXNhYmxlUHVzaFdvcmtlcikge1xuICAgIHB1c2hXb3JrZXIgPSBuZXcgUHVzaFdvcmtlcihwdXNoQWRhcHRlciwgcHVzaFF1ZXVlT3B0aW9ucyk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBwdXNoQ29udHJvbGxlcixcbiAgICBoYXNQdXNoU3VwcG9ydCxcbiAgICBoYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCxcbiAgICBwdXNoQ29udHJvbGxlclF1ZXVlLFxuICAgIHB1c2hXb3JrZXIsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBdXRoRGF0YU1hbmFnZXIob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIGNvbnN0IHsgYXV0aCwgZW5hYmxlQW5vbnltb3VzVXNlcnMgfSA9IG9wdGlvbnM7XG4gIHJldHVybiBhdXRoRGF0YU1hbmFnZXIoYXV0aCwgZW5hYmxlQW5vbnltb3VzVXNlcnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGF0YWJhc2VBZGFwdGVyKGRhdGFiYXNlVVJJLCBjb2xsZWN0aW9uUHJlZml4LCBkYXRhYmFzZU9wdGlvbnMpIHtcbiAgbGV0IHByb3RvY29sO1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZFVSSSA9IG5ldyBVUkwoZGF0YWJhc2VVUkkpO1xuICAgIHByb3RvY29sID0gcGFyc2VkVVJJLnByb3RvY29sID8gcGFyc2VkVVJJLnByb3RvY29sLnRvTG93ZXJDYXNlKCkgOiBudWxsO1xuICB9IGNhdGNoIChlKSB7XG4gICAgLyogKi9cbiAgfVxuICBzd2l0Y2ggKHByb3RvY29sKSB7XG4gICAgY2FzZSAncG9zdGdyZXM6JzpcbiAgICBjYXNlICdwb3N0Z3Jlc3FsOic6XG4gICAgICByZXR1cm4gbmV3IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIoe1xuICAgICAgICB1cmk6IGRhdGFiYXNlVVJJLFxuICAgICAgICBjb2xsZWN0aW9uUHJlZml4LFxuICAgICAgICBkYXRhYmFzZU9wdGlvbnMsXG4gICAgICB9KTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG5ldyBNb25nb1N0b3JhZ2VBZGFwdGVyKHtcbiAgICAgICAgdXJpOiBkYXRhYmFzZVVSSSxcbiAgICAgICAgY29sbGVjdGlvblByZWZpeCxcbiAgICAgICAgbW9uZ29PcHRpb25zOiBkYXRhYmFzZU9wdGlvbnMsXG4gICAgICB9KTtcbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxRQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxjQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxTQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFFQSxJQUFBSSxpQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssZ0JBQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLGdCQUFBLEdBQUFOLE9BQUE7QUFDQSxJQUFBTyxlQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxnQkFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsb0JBQUEsR0FBQVQsT0FBQTtBQUNBLElBQUFVLG9CQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxlQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxVQUFBLEdBQUFaLE9BQUE7QUFDQSxJQUFBYSxXQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxtQkFBQSxHQUFBZixzQkFB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