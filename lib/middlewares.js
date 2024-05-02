"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowMethodOverride = allowMethodOverride;
exports.checkIp = void 0;
exports.enforceMasterKeyAccess = enforceMasterKeyAccess;
exports.handleParseErrors = handleParseErrors;
exports.handleParseHeaders = handleParseHeaders;
exports.handleParseSession = void 0;
exports.promiseEnforceMasterKeyAccess = promiseEnforceMasterKeyAccess;
exports.promiseEnsureIdempotency = promiseEnsureIdempotency;
var _cache = _interopRequireDefault(require("./cache"));
var _node = _interopRequireDefault(require("parse/node"));
var _Auth = _interopRequireDefault(require("./Auth"));
var _Config = _interopRequireDefault(require("./Config"));
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = require("path-to-regexp");
var _rateLimitRedis = _interopRequireDefault(require("rate-limit-redis"));
var _redis = require("redis");
var _net = require("net");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const DEFAULT_ALLOWED_HEADERS = exports.DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};
const getBlockList = (ipRangeList, store) => {
  if (store.get('blockList')) return store.get('blockList');
  const blockList = new _net.BlockList();
  ipRangeList.forEach(fullIp => {
    if (fullIp === '::/0' || fullIp === '::') {
      store.set('allowAllIpv6', true);
      return;
    }
    if (fullIp === '0.0.0.0/0' || fullIp === '0.0.0.0') {
      store.set('allowAllIpv4', true);
      return;
    }
    const [ip, mask] = fullIp.split('/');
    if (!mask) {
      blockList.addAddress(ip, (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    } else {
      blockList.addSubnet(ip, Number(mask), (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    }
  });
  store.set('blockList', blockList);
  return blockList;
};
const checkIp = (ip, ipRangeList, store) => {
  const incomingIpIsV4 = (0, _net.isIPv4)(ip);
  const blockList = getBlockList(ipRangeList, store);
  if (store.get(ip)) return true;
  if (store.get('allowAllIpv4') && incomingIpIsV4) return true;
  if (store.get('allowAllIpv6') && !incomingIpIsV4) return true;
  const result = blockList.check(ip, incomingIpIsV4 ? 'ipv4' : 'ipv6');

  // If the ip is in the list, we store the result in the store
  // so we have a optimized path for the next request
  if (ipRangeList.includes(ip) && result) {
    store.set(ip, result);
  }
  return result;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
exports.checkIp = checkIp;
function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch (e) {
      return malformedContext(req, res);
    }
  }
  var info = {
    appId: req.get('X-Parse-Application-Id'),
    sessionToken: req.get('X-Parse-Session-Token'),
    masterKey: req.get('X-Parse-Master-Key'),
    maintenanceKey: req.get('X-Parse-Maintenance-Key'),
    installationId: req.get('X-Parse-Installation-Id'),
    clientKey: req.get('X-Parse-Client-Key'),
    javascriptKey: req.get('X-Parse-Javascript-Key'),
    dotNetKey: req.get('X-Parse-Windows-Key'),
    restAPIKey: req.get('X-Parse-REST-API-Key'),
    clientVersion: req.get('X-Parse-Client-Version'),
    context: context
  };
  var basicAuth = httpAuth(req);
  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (_cache.default.get(basicAuthAppId)) {
      info.appId = basicAuthAppId;
      info.masterKey = basicAuth.masterKey || info.masterKey;
      info.javascriptKey = basicAuth.javascriptKey || info.javascriptKey;
    }
  }
  if (req.body) {
    // Unity SDK sends a _noBody key which needs to be removed.
    // Unclear at this point if action needs to be taken.
    delete req.body._noBody;
  }
  var fileViaJSON = false;
  if (!info.appId || !_cache.default.get(info.appId)) {
    // See if we can find the app id on the body.
    if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }
    if (req.body) {
      delete req.body._RevocableSession;
    }
    if (req.body && req.body._ApplicationId && _cache.default.get(req.body._ApplicationId) && (!info.masterKey || _cache.default.get(req.body._ApplicationId).masterKey === info.masterKey)) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      if (req.body._ClientVersion) {
        info.clientVersion = req.body._ClientVersion;
        delete req.body._ClientVersion;
      }
      if (req.body._InstallationId) {
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (req.body._context instanceof Object) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch (e) {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      }
      if (req.body._ContentType) {
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.clientVersion) {
    info.clientSDK = _ClientSDK.default.fromString(info.clientVersion);
  }
  if (fileViaJSON) {
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }
  const clientIp = getClientIp(req);
  const config = _Config.default.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`
    });
    return;
  }
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    var _req$config;
    if (checkIp(clientIp, req.config.maintenanceKeyIps || [], req.config.maintenanceKeyIpsStore)) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = ((_req$config = req.config) === null || _req$config === void 0 ? void 0 : _req$config.loggerController) || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  let isMaster = info.masterKey === req.config.masterKey;
  if (isMaster && !checkIp(clientIp, req.config.masterKeyIps || [], req.config.masterKeyIpsStore)) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
    const error = new Error();
    error.status = 403;
    error.message = `unauthorized`;
    throw error;
  }
  if (isMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true
    });
    return handleRateLimit(req, res, next);
  }
  var isReadOnlyMaster = info.masterKey === req.config.readOnlyMasterKey;
  if (typeof req.config.readOnlyMasterKey != 'undefined' && req.config.readOnlyMasterKey && isReadOnlyMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true,
      isReadOnly: true
    });
    return handleRateLimit(req, res, next);
  }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
  const keys = ['clientKey', 'javascriptKey', 'dotNetKey', 'restAPIKey'];
  const oneKeyConfigured = keys.some(function (key) {
    return req.config[key] !== undefined;
  });
  const oneKeyMatches = keys.some(function (key) {
    return req.config[key] !== undefined && info[key] === req.config[key];
  });
  if (oneKeyConfigured && !oneKeyMatches) {
    return invalidRequest(req, res);
  }
  if (req.url == '/login') {
    delete info.sessionToken;
  }
  if (req.userFromJWT) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT
    });
    return handleRateLimit(req, res, next);
  }
  if (!info.sessionToken) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false
    });
  }
  handleRateLimit(req, res, next);
}
const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(rateLimits.map(async limit => {
      const pathExp = new RegExp(limit.path);
      if (pathExp.test(req.url)) {
        await limit.handler(req, res, err => {
          if (err) {
            if (err.code === _node.default.Error.CONNECTION_FAILED) {
              throw err;
            }
            req.config.loggerController.error('An unknown error occured when attempting to apply the rate limiter: ', err);
          }
        });
      }
    }));
  } catch (error) {
    res.status(429);
    res.json({
      code: _node.default.Error.CONNECTION_FAILED,
      error: error.message
    });
    return;
  }
  next();
};
const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth || req.url === '/sessions/me') {
      next();
      return;
    }
    let requestAuth = null;
    if (info.sessionToken && req.url === '/upgradeToRevocableSession' && info.sessionToken.indexOf('r:') != 0) {
      requestAuth = await _Auth.default.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    } else {
      requestAuth = await _Auth.default.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof _node.default.Error) {
      next(error);
      return;
    }
    // TODO: Determine the correct error scenario.
    req.config.loggerController.error('error getting auth for sessionToken', error);
    throw new _node.default.Error(_node.default.Error.UNKNOWN_ERROR, error);
  }
};
exports.handleParseSession = handleParseSession;
function getClientIp(req) {
  return req.ip;
}
function httpAuth(req) {
  if (!(req.req || req).headers.authorization) return;
  var header = (req.req || req).headers.authorization;
  var appId, masterKey, javascriptKey;

  // parse header
  var authPrefix = 'basic ';
  var match = header.toLowerCase().indexOf(authPrefix);
  if (match == 0) {
    var encodedAuth = header.substring(authPrefix.length, header.length);
    var credentials = decodeBase64(encodedAuth).split(':');
    if (credentials.length == 2) {
      appId = credentials[0];
      var key = credentials[1];
      var jsKeyPrefix = 'javascript-key=';
      var matchKey = key.indexOf(jsKeyPrefix);
      if (matchKey == 0) {
        javascriptKey = key.substring(jsKeyPrefix.length, key.length);
      } else {
        masterKey = key;
      }
    }
  }
  return {
    appId: appId,
    masterKey: masterKey,
    javascriptKey: javascriptKey
  };
}
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}
function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = _Config.default.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }
    const baseOrigins = typeof (config === null || config === void 0 ? void 0 : config.allowOrigin) === 'string' ? [config.allowOrigin] : (config === null || config === void 0 ? void 0 : config.allowOrigin) ?? ['*'];
    const requestOrigin = req.headers.origin;
    const allowOrigins = requestOrigin && baseOrigins.includes(requestOrigin) ? requestOrigin : baseOrigins[0];
    res.header('Access-Control-Allow-Origin', allowOrigins);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowHeaders);
    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}
function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body._method) {
    req.originalMethod = req.method;
    req.method = req.body._method;
    delete req.body._method;
  }
  next();
}
function handleParseErrors(err, req, res, next) {
  const log = req.config && req.config.loggerController || _logger.default;
  if (err instanceof _node.default.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case _node.default.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case _node.default.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({
      code: err.code,
      error: err.message
    });
    log.error('Parse error: ', err);
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({
      error: err.message
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.'
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}
function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    res.status(403);
    res.end('{"error":"unauthorized: master key is required"}');
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized: master key is required';
    throw error;
  }
  return Promise.resolve();
}
const addRateLimit = (route, config, cloud) => {
  if (typeof config === 'string') {
    config = _Config.default.get(config);
  }
  for (const key in route) {
    if (!_Definitions.RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  const redisStore = {
    connectionPromise: Promise.resolve(),
    store: null
  };
  if (route.redisUrl) {
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    redisStore.connectionPromise = async () => {
      if (client.isOpen) {
        return;
      }
      try {
        await client.connect();
      } catch (e) {
        var _config;
        const log = ((_config = config) === null || _config === void 0 ? void 0 : _config.loggerController) || _logger.default;
        log.error(`Could not connect to redisURL in rate limit: ${e}`);
      }
    };
    redisStore.connectionPromise();
    redisStore.store = new _rateLimitRedis.default({
      sendCommand: async (...args) => {
        await redisStore.connectionPromise();
        return client.sendCommand(args);
      }
    });
  }
  let transformPath = route.requestPath.split('/*').join('/(.*)');
  if (transformPath === '*') {
    transformPath = '(.*)';
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.pathToRegexp)(transformPath),
    handler: (0, _expressRateLimit.default)({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: _node.default.Error.CONNECTION_FAILED,
          message: options.message
        };
      },
      skip: request => {
        var _request$auth;
        if (request.ip === '127.0.0.1' && !route.includeInternalRequests) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.includes(request.method)) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (!regExp.test(request.method)) {
              return true;
            }
          }
        }
        return (_request$auth = request.auth) === null || _request$auth === void 0 ? void 0 : _request$auth.isMaster;
      },
      keyGenerator: async request => {
        if (route.zone === _node.default.Server.RateLimitZone.global) {
          return request.config.appId;
        }
        const token = request.info.sessionToken;
        if (route.zone === _node.default.Server.RateLimitZone.session && token) {
          return token;
        }
        if (route.zone === _node.default.Server.RateLimitZone.user && token) {
          var _request$auth2;
          if (!request.auth) {
            await new Promise(resolve => handleParseSession(request, null, resolve));
          }
          if ((_request$auth2 = request.auth) !== null && _request$auth2 !== void 0 && (_request$auth2 = _request$auth2.user) !== null && _request$auth2 !== void 0 && _request$auth2.id && request.zone === 'user') {
            return request.auth.user.id;
          }
        }
        return request.config.ip;
      },
      store: redisStore.store
    }),
    cloud
  });
  _Config.default.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
exports.addRateLimit = addRateLimit;
function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (!(req.config.database.adapter instanceof _MongoStorageAdapter.default || req.config.database.adapter instanceof _PostgresStorageAdapter.default)) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const {
    paths,
    ttl
  } = config.idempotencyOptions;
  if (!requestId || !config.idempotencyOptions) {
    return Promise.resolve();
  }
  // Request path may contain trailing slashes, depending on the original request, so remove
  // leading and trailing slashes to make it easier to specify paths in the configuration
  const reqPath = req.path.replace(/^\/|\/$/, '');
  // Determine whether idempotency is enabled for current request path
  let match = false;
  for (const path of paths) {
    // Assume one wants a path to always match from the beginning to prevent any mistakes
    const regex = new RegExp(path.charAt(0) === '^' ? path : '^' + path);
    if (reqPath.match(regex)) {
      match = true;
      break;
    }
  }
  if (!match) {
    return Promise.resolve();
  }
  // Try to store request
  const expiryDate = new Date(new Date().setSeconds(new Date().getSeconds() + ttl));
  return _rest.default.create(config, _Auth.default.master(config), '_Idempotency', {
    reqId: requestId,
    expire: _node.default._encode(expiryDate)
  }).catch(e => {
    if (e.code == _node.default.Error.DUPLICATE_VALUE) {
      throw new _node.default.Error(_node.default.Error.DUPLICATE_REQUEST, 'Duplicate request');
    }
    throw e;
  });
}
function invalidRequest(req, res) {
  res.status(403);
  res.end('{"error":"unauthorized"}');
}
function malformedContext(req, res) {
  res.status(400);
  res.json({
    code: _node.default.Error.INVALID_JSON,
    error: 'Invalid object for context.'
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJnZXRCbG9ja0xpc3QiLCJpcFJhbmdlTGlzdCIsInN0b3JlIiwiYmxvY2tMaXN0IiwiQmxvY2tMaXN0IiwiZm9yRWFjaCIsImZ1bGxJcCIsInNldCIsImlwIiwibWFzayIsInNwbGl0IiwiYWRkQWRkcmVzcyIsImlzSVB2NCIsImFkZFN1Ym5ldCIsIk51bWJlciIsImNoZWNrSXAiLCJpbmNvbWluZ0lwSXNWNCIsInJlc3VsdCIsImNoZWNrIiwiaW5jbHVkZXMiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZSIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwibWVzc2FnZSIsImhhbmRsZVJhdGVMaW1pdCIsImlzUmVhZE9ubHlNYXN0ZXIiLCJyZWFkT25seU1hc3RlcktleSIsImlzUmVhZE9ubHkiLCJrZXlzIiwib25lS2V5Q29uZmlndXJlZCIsInNvbWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJvbmVLZXlNYXRjaGVzIiwidXNlckZyb21KV1QiLCJ1c2VyIiwicmF0ZUxpbWl0cyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJsaW1pdCIsInBhdGhFeHAiLCJSZWdFeHAiLCJwYXRoIiwidGVzdCIsImhhbmRsZXIiLCJlcnIiLCJDT05ORUNUSU9OX0ZBSUxFRCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInJlZGlzVXJsIiwiY2xpZW50IiwiY3JlYXRlQ2xpZW50IiwiaXNPcGVuIiwiY29ubmVjdCIsIl9jb25maWciLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJfcmVxdWVzdCRhdXRoIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsIl9yZXF1ZXN0JGF1dGgyIiwiaWQiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG5jb25zdCBnZXRCbG9ja0xpc3QgPSAoaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGlmIChzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpKSByZXR1cm4gc3RvcmUuZ2V0KCdibG9ja0xpc3QnKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gbmV3IEJsb2NrTGlzdCgpO1xuICBpcFJhbmdlTGlzdC5mb3JFYWNoKGZ1bGxJcCA9PiB7XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzo6LzAnIHx8IGZ1bGxJcCA9PT0gJzo6Jykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjYnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzAuMC4wLjAvMCcgfHwgZnVsbElwID09PSAnMC4wLjAuMCcpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY0JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFtpcCwgbWFza10gPSBmdWxsSXAuc3BsaXQoJy8nKTtcbiAgICBpZiAoIW1hc2spIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRBZGRyZXNzKGlwLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmxvY2tMaXN0LmFkZFN1Ym5ldChpcCwgTnVtYmVyKG1hc2spLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9XG4gIH0pO1xuICBzdG9yZS5zZXQoJ2Jsb2NrTGlzdCcsIGJsb2NrTGlzdCk7XG4gIHJldHVybiBibG9ja0xpc3Q7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tJcCA9IChpcCwgaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGNvbnN0IGluY29taW5nSXBJc1Y0ID0gaXNJUHY0KGlwKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gZ2V0QmxvY2tMaXN0KGlwUmFuZ2VMaXN0LCBzdG9yZSk7XG5cbiAgaWYgKHN0b3JlLmdldChpcCkpIHJldHVybiB0cnVlO1xuICBpZiAoc3RvcmUuZ2V0KCdhbGxvd0FsbElwdjQnKSAmJiBpbmNvbWluZ0lwSXNWNCkgcmV0dXJuIHRydWU7XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NicpICYmICFpbmNvbWluZ0lwSXNWNCkgcmV0dXJuIHRydWU7XG4gIGNvbnN0IHJlc3VsdCA9IGJsb2NrTGlzdC5jaGVjayhpcCwgaW5jb21pbmdJcElzVjQgPyAnaXB2NCcgOiAnaXB2NicpO1xuXG4gIC8vIElmIHRoZSBpcCBpcyBpbiB0aGUgbGlzdCwgd2Ugc3RvcmUgdGhlIHJlc3VsdCBpbiB0aGUgc3RvcmVcbiAgLy8gc28gd2UgaGF2ZSBhIG9wdGltaXplZCBwYXRoIGZvciB0aGUgbmV4dCByZXF1ZXN0XG4gIGlmIChpcFJhbmdlTGlzdC5pbmNsdWRlcyhpcCkgJiYgcmVzdWx0KSB7XG4gICAgc3RvcmUuc2V0KGlwLCByZXN1bHQpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuICB2YXIgaW5mbyA9IHtcbiAgICBhcHBJZDogcmVxLmdldCgnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCcpLFxuICAgIHNlc3Npb25Ub2tlbjogcmVxLmdldCgnWC1QYXJzZS1TZXNzaW9uLVRva2VuJyksXG4gICAgbWFzdGVyS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1hc3Rlci1LZXknKSxcbiAgICBtYWludGVuYW5jZUtleTogcmVxLmdldCgnWC1QYXJzZS1NYWludGVuYW5jZS1LZXknKSxcbiAgICBpbnN0YWxsYXRpb25JZDogcmVxLmdldCgnWC1QYXJzZS1JbnN0YWxsYXRpb24tSWQnKSxcbiAgICBjbGllbnRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LUtleScpLFxuICAgIGphdmFzY3JpcHRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtSmF2YXNjcmlwdC1LZXknKSxcbiAgICBkb3ROZXRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtV2luZG93cy1LZXknKSxcbiAgICByZXN0QVBJS2V5OiByZXEuZ2V0KCdYLVBhcnNlLVJFU1QtQVBJLUtleScpLFxuICAgIGNsaWVudFZlcnNpb246IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LVZlcnNpb24nKSxcbiAgICBjb250ZXh0OiBjb250ZXh0LFxuICB9O1xuXG4gIHZhciBiYXNpY0F1dGggPSBodHRwQXV0aChyZXEpO1xuXG4gIGlmIChiYXNpY0F1dGgpIHtcbiAgICB2YXIgYmFzaWNBdXRoQXBwSWQgPSBiYXNpY0F1dGguYXBwSWQ7XG4gICAgaWYgKEFwcENhY2hlLmdldChiYXNpY0F1dGhBcHBJZCkpIHtcbiAgICAgIGluZm8uYXBwSWQgPSBiYXNpY0F1dGhBcHBJZDtcbiAgICAgIGluZm8ubWFzdGVyS2V5ID0gYmFzaWNBdXRoLm1hc3RlcktleSB8fCBpbmZvLm1hc3RlcktleTtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IGJhc2ljQXV0aC5qYXZhc2NyaXB0S2V5IHx8IGluZm8uamF2YXNjcmlwdEtleTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVxLmJvZHkpIHtcbiAgICAvLyBVbml0eSBTREsgc2VuZHMgYSBfbm9Cb2R5IGtleSB3aGljaCBuZWVkcyB0byBiZSByZW1vdmVkLlxuICAgIC8vIFVuY2xlYXIgYXQgdGhpcyBwb2ludCBpZiBhY3Rpb24gbmVlZHMgdG8gYmUgdGFrZW4uXG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9ub0JvZHk7XG4gIH1cblxuICB2YXIgZmlsZVZpYUpTT04gPSBmYWxzZTtcblxuICBpZiAoIWluZm8uYXBwSWQgfHwgIUFwcENhY2hlLmdldChpbmZvLmFwcElkKSkge1xuICAgIC8vIFNlZSBpZiB3ZSBjYW4gZmluZCB0aGUgYXBwIGlkIG9uIHRoZSBib2R5LlxuICAgIGlmIChyZXEuYm9keSBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgLy8gVGhlIG9ubHkgY2hhbmNlIHRvIGZpbmQgdGhlIGFwcCBpZCBpcyBpZiB0aGlzIGlzIGEgZmlsZVxuICAgICAgLy8gdXBsb2FkIHRoYXQgYWN0dWFsbHkgaXMgYSBKU09OIGJvZHkuIFNvIHRyeSB0byBwYXJzZSBpdC5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy82NTg5XG4gICAgICAvLyBJdCBpcyBhbHNvIHBvc3NpYmxlIHRoYXQgdGhlIGNsaWVudCBpcyB0cnlpbmcgdG8gdXBsb2FkIGEgZmlsZSBidXQgZm9yZ290XG4gICAgICAvLyB0byBwcm92aWRlIHgtcGFyc2UtYXBwLWlkIGluIGhlYWRlciBhbmQgcGFyc2UgYSBiaW5hcnkgZmlsZSB3aWxsIGZhaWxcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcS5ib2R5ID0gSlNPTi5wYXJzZShyZXEuYm9keSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGlmIChyZXEuYm9keS5fQ2xpZW50VmVyc2lvbikge1xuICAgICAgICBpbmZvLmNsaWVudFZlcnNpb24gPSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZCkge1xuICAgICAgICBpbmZvLmluc3RhbGxhdGlvbklkID0gcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fTWFzdGVyS2V5KSB7XG4gICAgICAgIGluZm8ubWFzdGVyS2V5ID0gcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQpIHtcbiAgICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0IGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgaW5mby5jb250ZXh0ID0gcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGluZm8uY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmJvZHkuX2NvbnRleHQpO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChpbmZvLmNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fQ29udGVudFR5cGUpIHtcbiAgICAgICAgcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmZvLnNlc3Npb25Ub2tlbiAmJiB0eXBlb2YgaW5mby5zZXNzaW9uVG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgaW5mby5zZXNzaW9uVG9rZW4gPSBpbmZvLnNlc3Npb25Ub2tlbi50b1N0cmluZygpO1xuICB9XG5cbiAgaWYgKGluZm8uY2xpZW50VmVyc2lvbikge1xuICAgIGluZm8uY2xpZW50U0RLID0gQ2xpZW50U0RLLmZyb21TdHJpbmcoaW5mby5jbGllbnRWZXJzaW9uKTtcbiAgfVxuXG4gIGlmIChmaWxlVmlhSlNPTikge1xuICAgIHJlcS5maWxlRGF0YSA9IHJlcS5ib2R5LmZpbGVEYXRhO1xuICAgIC8vIFdlIG5lZWQgdG8gcmVwb3B1bGF0ZSByZXEuYm9keSB3aXRoIGEgYnVmZmVyXG4gICAgdmFyIGJhc2U2NCA9IHJlcS5ib2R5LmJhc2U2NDtcbiAgICByZXEuYm9keSA9IEJ1ZmZlci5mcm9tKGJhc2U2NCwgJ2Jhc2U2NCcpO1xuICB9XG5cbiAgY29uc3QgY2xpZW50SXAgPSBnZXRDbGllbnRJcChyZXEpO1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGluZm8uYXBwSWQsIG1vdW50KTtcbiAgaWYgKGNvbmZpZy5zdGF0ZSAmJiBjb25maWcuc3RhdGUgIT09ICdvaycpIHtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgZXJyb3I6IGBJbnZhbGlkIHNlcnZlciBzdGF0ZTogJHtjb25maWcuc3RhdGV9YCxcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpbmZvLmFwcCA9IEFwcENhY2hlLmdldChpbmZvLmFwcElkKTtcbiAgcmVxLmNvbmZpZyA9IGNvbmZpZztcbiAgcmVxLmNvbmZpZy5oZWFkZXJzID0gcmVxLmhlYWRlcnMgfHwge307XG4gIHJlcS5jb25maWcuaXAgPSBjbGllbnRJcDtcbiAgcmVxLmluZm8gPSBpbmZvO1xuXG4gIGNvbnN0IGlzTWFpbnRlbmFuY2UgPVxuICAgIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXkgJiYgaW5mby5tYWludGVuYW5jZUtleSA9PT0gcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleTtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpZiAoY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlKSkge1xuICAgICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgaXNNYWludGVuYW5jZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFpbnRlbmFuY2Uga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21haW50ZW5hbmNlS2V5SXBzJy5gXG4gICAgKTtcbiAgfVxuXG4gIGxldCBpc01hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLm1hc3RlcktleTtcblxuICBpZiAoaXNNYXN0ZXIgJiYgIWNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFzdGVyS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlKSkge1xuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYXN0ZXIga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21hc3RlcktleUlwcycuYFxuICAgICk7XG4gICAgaXNNYXN0ZXIgPSBmYWxzZTtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gYHVuYXV0aG9yaXplZGA7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIHZhciBpc1JlYWRPbmx5TWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXk7XG4gIGlmIChcbiAgICB0eXBlb2YgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAhPSAndW5kZWZpbmVkJyAmJlxuICAgIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgJiZcbiAgICBpc1JlYWRPbmx5TWFzdGVyXG4gICkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgICAgaXNSZWFkT25seTogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIC8vIENsaWVudCBrZXlzIGFyZSBub3QgcmVxdWlyZWQgaW4gcGFyc2Utc2VydmVyLCBidXQgaWYgYW55IGhhdmUgYmVlbiBjb25maWd1cmVkIGluIHRoZSBzZXJ2ZXIsIHZhbGlkYXRlIHRoZW1cbiAgLy8gIHRvIHByZXNlcnZlIG9yaWdpbmFsIGJlaGF2aW9yLlxuICBjb25zdCBrZXlzID0gWydjbGllbnRLZXknLCAnamF2YXNjcmlwdEtleScsICdkb3ROZXRLZXknLCAncmVzdEFQSUtleSddO1xuICBjb25zdCBvbmVLZXlDb25maWd1cmVkID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQ7XG4gIH0pO1xuICBjb25zdCBvbmVLZXlNYXRjaGVzID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQgJiYgaW5mb1trZXldID09PSByZXEuY29uZmlnW2tleV07XG4gIH0pO1xuXG4gIGlmIChvbmVLZXlDb25maWd1cmVkICYmICFvbmVLZXlNYXRjaGVzKSB7XG4gICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgfVxuXG4gIGlmIChyZXEudXJsID09ICcvbG9naW4nKSB7XG4gICAgZGVsZXRlIGluZm8uc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIHVzZXI6IHJlcS51c2VyRnJvbUpXVCxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIGlmICghaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgfSk7XG4gIH1cbiAgaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbn1cblxuY29uc3QgaGFuZGxlUmF0ZUxpbWl0ID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIGNvbnN0IHJhdGVMaW1pdHMgPSByZXEuY29uZmlnLnJhdGVMaW1pdHMgfHwgW107XG4gIHRyeSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByYXRlTGltaXRzLm1hcChhc3luYyBsaW1pdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGhFeHAgPSBuZXcgUmVnRXhwKGxpbWl0LnBhdGgpO1xuICAgICAgICBpZiAocGF0aEV4cC50ZXN0KHJlcS51cmwpKSB7XG4gICAgICAgICAgYXdhaXQgbGltaXQuaGFuZGxlcihyZXEsIHJlcywgZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJlZCB3aGVuIGF0dGVtcHRpbmcgdG8gYXBwbHkgdGhlIHJhdGUgbGltaXRlcjogJyxcbiAgICAgICAgICAgICAgICBlcnJcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJlcy5zdGF0dXMoNDI5KTtcbiAgICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZVBhcnNlU2Vzc2lvbiA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSByZXEuaW5mbztcbiAgICBpZiAocmVxLmF1dGggfHwgcmVxLnVybCA9PT0gJy9zZXNzaW9ucy9tZScpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcXVlc3RBdXRoID0gbnVsbDtcbiAgICBpZiAoXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbiAmJlxuICAgICAgcmVxLnVybCA9PT0gJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJyAmJlxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4uaW5kZXhPZigncjonKSAhPSAwXG4gICAgKSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJlcS5hdXRoID0gcmVxdWVzdEF1dGg7XG4gICAgbmV4dCgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gVE9ETzogRGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGVycm9yIHNjZW5hcmlvLlxuICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcignZXJyb3IgZ2V0dGluZyBhdXRoIGZvciBzZXNzaW9uVG9rZW4nLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVOS05PV05fRVJST1IsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0Q2xpZW50SXAocmVxKSB7XG4gIHJldHVybiByZXEuaXA7XG59XG5cbmZ1bmN0aW9uIGh0dHBBdXRoKHJlcSkge1xuICBpZiAoIShyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uKSByZXR1cm47XG5cbiAgdmFyIGhlYWRlciA9IChyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICB2YXIgYXBwSWQsIG1hc3RlcktleSwgamF2YXNjcmlwdEtleTtcblxuICAvLyBwYXJzZSBoZWFkZXJcbiAgdmFyIGF1dGhQcmVmaXggPSAnYmFzaWMgJztcblxuICB2YXIgbWF0Y2ggPSBoZWFkZXIudG9Mb3dlckNhc2UoKS5pbmRleE9mKGF1dGhQcmVmaXgpO1xuXG4gIGlmIChtYXRjaCA9PSAwKSB7XG4gICAgdmFyIGVuY29kZWRBdXRoID0gaGVhZGVyLnN1YnN0cmluZyhhdXRoUHJlZml4Lmxlbmd0aCwgaGVhZGVyLmxlbmd0aCk7XG4gICAgdmFyIGNyZWRlbnRpYWxzID0gZGVjb2RlQmFzZTY0KGVuY29kZWRBdXRoKS5zcGxpdCgnOicpO1xuXG4gICAgaWYgKGNyZWRlbnRpYWxzLmxlbmd0aCA9PSAyKSB7XG4gICAgICBhcHBJZCA9IGNyZWRlbnRpYWxzWzBdO1xuICAgICAgdmFyIGtleSA9IGNyZWRlbnRpYWxzWzFdO1xuXG4gICAgICB2YXIganNLZXlQcmVmaXggPSAnamF2YXNjcmlwdC1rZXk9JztcblxuICAgICAgdmFyIG1hdGNoS2V5ID0ga2V5LmluZGV4T2YoanNLZXlQcmVmaXgpO1xuICAgICAgaWYgKG1hdGNoS2V5ID09IDApIHtcbiAgICAgICAgamF2YXNjcmlwdEtleSA9IGtleS5zdWJzdHJpbmcoanNLZXlQcmVmaXgubGVuZ3RoLCBrZXkubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hc3RlcktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhcHBJZDogYXBwSWQsIG1hc3RlcktleTogbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5OiBqYXZhc2NyaXB0S2V5IH07XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChzdHIpIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0Nyb3NzRG9tYWluKGFwcElkKSB7XG4gIHJldHVybiAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkLCBnZXRNb3VudEZvclJlcXVlc3QocmVxKSk7XG4gICAgbGV0IGFsbG93SGVhZGVycyA9IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTO1xuICAgIGlmIChjb25maWcgJiYgY29uZmlnLmFsbG93SGVhZGVycykge1xuICAgICAgYWxsb3dIZWFkZXJzICs9IGAsICR7Y29uZmlnLmFsbG93SGVhZGVycy5qb2luKCcsICcpfWA7XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZU9yaWdpbnMgPVxuICAgICAgdHlwZW9mIGNvbmZpZz8uYWxsb3dPcmlnaW4gPT09ICdzdHJpbmcnID8gW2NvbmZpZy5hbGxvd09yaWdpbl0gOiBjb25maWc/LmFsbG93T3JpZ2luID8/IFsnKiddO1xuICAgIGNvbnN0IHJlcXVlc3RPcmlnaW4gPSByZXEuaGVhZGVycy5vcmlnaW47XG4gICAgY29uc3QgYWxsb3dPcmlnaW5zID1cbiAgICAgIHJlcXVlc3RPcmlnaW4gJiYgYmFzZU9yaWdpbnMuaW5jbHVkZXMocmVxdWVzdE9yaWdpbikgPyByZXF1ZXN0T3JpZ2luIDogYmFzZU9yaWdpbnNbMF07XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgYWxsb3dPcmlnaW5zKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keS5fbWV0aG9kKSB7XG4gICAgcmVxLm9yaWdpbmFsTWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgICByZXEubWV0aG9kID0gcmVxLmJvZHkuX21ldGhvZDtcbiAgICBkZWxldGUgcmVxLmJvZHkuX21ldGhvZDtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUVycm9ycyhlcnIsIHJlcSwgcmVzLCBuZXh0KSB7XG4gIGNvbnN0IGxvZyA9IChyZXEuY29uZmlnICYmIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgaWYgKGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgaWYgKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5lbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gbmV4dChlcnIpO1xuICAgIH1cbiAgICBsZXQgaHR0cFN0YXR1cztcbiAgICAvLyBUT0RPOiBmaWxsIG91dCB0aGlzIG1hcHBpbmdcbiAgICBzd2l0Y2ggKGVyci5jb2RlKSB7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUjpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDUwMDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwMDtcbiAgICB9XG4gICAgcmVzLnN0YXR1cyhodHRwU3RhdHVzKTtcbiAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgbG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyKTtcbiAgfSBlbHNlIGlmIChlcnIuc3RhdHVzICYmIGVyci5tZXNzYWdlKSB7XG4gICAgcmVzLnN0YXR1cyhlcnIuc3RhdHVzKTtcbiAgICByZXMuanNvbih7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVyciwgZXJyLnN0YWNrKTtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvci4nLFxuICAgIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkXCJ9Jyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcsIGNsb3VkKSA9PiB7XG4gIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByb3V0ZSkge1xuICAgIGlmICghUmF0ZUxpbWl0T3B0aW9uc1trZXldKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCByYXRlIGxpbWl0IG9wdGlvbiBcIiR7a2V5fVwiYDtcbiAgICB9XG4gIH1cbiAgaWYgKCFjb25maWcucmF0ZUxpbWl0cykge1xuICAgIGNvbmZpZy5yYXRlTGltaXRzID0gW107XG4gIH1cbiAgY29uc3QgcmVkaXNTdG9yZSA9IHtcbiAgICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG4gICAgc3RvcmU6IG51bGwsXG4gIH07XG4gIGlmIChyb3V0ZS5yZWRpc1VybCkge1xuICAgIGNvbnN0IGNsaWVudCA9IGNyZWF0ZUNsaWVudCh7XG4gICAgICB1cmw6IHJvdXRlLnJlZGlzVXJsLFxuICAgIH0pO1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoY2xpZW50LmlzT3Blbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBsb2cgPSBjb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGxldCB0cmFuc2Zvcm1QYXRoID0gcm91dGUucmVxdWVzdFBhdGguc3BsaXQoJy8qJykuam9pbignLyguKiknKTtcbiAgaWYgKHRyYW5zZm9ybVBhdGggPT09ICcqJykge1xuICAgIHRyYW5zZm9ybVBhdGggPSAnKC4qKSc7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHRyYW5zZm9ybVBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiBhc3luYyByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLmdsb2JhbCkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5hcHBJZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b2tlbiA9IHJlcXVlc3QuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5zZXNzaW9uICYmIHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS51c2VyICYmIHRva2VuKSB7XG4gICAgICAgICAgaWYgKCFyZXF1ZXN0LmF1dGgpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlUGFyc2VTZXNzaW9uKHJlcXVlc3QsIG51bGwsIHJlc29sdmUpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlcXVlc3QuYXV0aD8udXNlcj8uaWQgJiYgcmVxdWVzdC56b25lID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGgudXNlci5pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICAgIHN0b3JlOiByZWRpc1N0b3JlLnN0b3JlLFxuICAgIH0pLFxuICAgIGNsb3VkLFxuICB9KTtcbiAgQ29uZmlnLnB1dChjb25maWcpO1xufTtcblxuLyoqXG4gKiBEZWR1cGxpY2F0ZXMgYSByZXF1ZXN0IHRvIGVuc3VyZSBpZGVtcG90ZW5jeS4gRHVwbGljYXRlcyBhcmUgZGV0ZXJtaW5lZCBieSB0aGUgcmVxdWVzdCBJRFxuICogaW4gdGhlIHJlcXVlc3QgaGVhZGVyLiBJZiBhIHJlcXVlc3QgaGFzIG5vIHJlcXVlc3QgSUQsIGl0IGlzIGV4ZWN1dGVkIGFueXdheS5cbiAqIEBwYXJhbSB7Kn0gcmVxIFRoZSByZXF1ZXN0IHRvIGV2YWx1YXRlLlxuICogQHJldHVybnMgUHJvbWlzZTx7fT5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeShyZXEpIHtcbiAgLy8gRW5hYmxlIGZlYXR1cmUgb25seSBmb3IgTW9uZ29EQlxuICBpZiAoXG4gICAgIShcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIgfHxcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXJcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBHZXQgcGFyYW1ldGVyc1xuICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICBjb25zdCByZXF1ZXN0SWQgPSAoKHJlcSB8fCB7fSkuaGVhZGVycyB8fCB7fSlbJ3gtcGFyc2UtcmVxdWVzdC1pZCddO1xuICBjb25zdCB7IHBhdGhzLCB0dGwgfSA9IGNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gIGlmICghcmVxdWVzdElkIHx8ICFjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJlcXVlc3QgcGF0aCBtYXkgY29udGFpbiB0cmFpbGluZyBzbGFzaGVzLCBkZXBlbmRpbmcgb24gdGhlIG9yaWdpbmFsIHJlcXVlc3QsIHNvIHJlbW92ZVxuICAvLyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIHRvIG1ha2UgaXQgZWFzaWVyIHRvIHNwZWNpZnkgcGF0aHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgcmVxUGF0aCA9IHJlcS5wYXRoLnJlcGxhY2UoL15cXC98XFwvJC8sICcnKTtcbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgaWRlbXBvdGVuY3kgaXMgZW5hYmxlZCBmb3IgY3VycmVudCByZXF1ZXN0IHBhdGhcbiAgbGV0IG1hdGNoID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuICAgIC8vIEFzc3VtZSBvbmUgd2FudHMgYSBwYXRoIHRvIGFsd2F5cyBtYXRjaCBmcm9tIHRoZSBiZWdpbm5pbmcgdG8gcHJldmVudCBhbnkgbWlzdGFrZXNcbiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0aC5jaGFyQXQoMCkgPT09ICdeJyA/IHBhdGggOiAnXicgKyBwYXRoKTtcbiAgICBpZiAocmVxUGF0aC5tYXRjaChyZWdleCkpIHtcbiAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFRyeSB0byBzdG9yZSByZXF1ZXN0XG4gIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShuZXcgRGF0ZSgpLnNldFNlY29uZHMobmV3IERhdGUoKS5nZXRTZWNvbmRzKCkgKyB0dGwpKTtcbiAgcmV0dXJuIHJlc3RcbiAgICAuY3JlYXRlKGNvbmZpZywgYXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19JZGVtcG90ZW5jeScsIHtcbiAgICAgIHJlcUlkOiByZXF1ZXN0SWQsXG4gICAgICBleHBpcmU6IFBhcnNlLl9lbmNvZGUoZXhwaXJ5RGF0ZSksXG4gICAgfSlcbiAgICAuY2F0Y2goZSA9PiB7XG4gICAgICBpZiAoZS5jb2RlID09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1JFUVVFU1QsICdEdXBsaWNhdGUgcmVxdWVzdCcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDMpO1xuICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkXCJ9Jyk7XG59XG5cbmZ1bmN0aW9uIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDApO1xuICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgZXJyb3I6ICdJbnZhbGlkIG9iamVjdCBmb3IgY29udGV4dC4nIH0pO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxLQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxVQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxvQkFBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsdUJBQUEsR0FBQVQsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFTLGlCQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxZQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxhQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxlQUFBLEdBQUFiLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBYSxNQUFBLEdBQUFiLE9BQUE7QUFDQSxJQUFBYyxJQUFBLEdBQUFkLE9BQUE7QUFBd0MsU0FBQUQsdUJBQUFnQixHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBRWpDLE1BQU1HLHVCQUF1QixHQUFBQyxPQUFBLENBQUFELHVCQUFBLEdBQ2xDLCtPQUErTztBQUVqUCxNQUFNRSxrQkFBa0IsR0FBRyxTQUFBQSxDQUFVQyxHQUFHLEVBQUU7RUFDeEMsTUFBTUMsZUFBZSxHQUFHRCxHQUFHLENBQUNFLFdBQVcsQ0FBQ0MsTUFBTSxHQUFHSCxHQUFHLENBQUNJLEdBQUcsQ0FB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