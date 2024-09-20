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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiREVGQVVMVF9BTExPV0VEX0hFQURFUlMiLCJleHBvcnRzIiwiZ2V0TW91bnRGb3JSZXF1ZXN0IiwicmVxIiwibW91bnRQYXRoTGVuZ3RoIiwib3JpZ2luYWxVcmwiLCJsZW5ndGgiLCJ1cmwiLCJtb3VudFBhdGgiLCJzbGljZSIsInByb3RvY29sIiwiZ2V0IiwiZ2V0QmxvY2tMaXN0IiwiaXBSYW5nZUxpc3QiLCJzdG9yZSIsImJsb2NrTGlzdCIsIkJsb2NrTGlzdCIsImZvckVhY2giLCJmdWxsSXAiLCJzZXQiLCJpcCIsIm1hc2siLCJzcGxpdCIsImFkZEFkZHJlc3MiLCJpc0lQdjQiLCJhZGRTdWJuZXQiLCJOdW1iZXIiLCJjaGVja0lwIiwiaW5jb21pbmdJcElzVjQiLCJyZXN1bHQiLCJjaGVjayIsImluY2x1ZGVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVzIiwibmV4dCIsIm1vdW50IiwiY29udGV4dCIsIkpTT04iLCJwYXJzZSIsIk9iamVjdCIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwibWVzc2FnZSIsImhhbmRsZVJhdGVMaW1pdCIsImlzUmVhZE9ubHlNYXN0ZXIiLCJyZWFkT25seU1hc3RlcktleSIsImlzUmVhZE9ubHkiLCJrZXlzIiwib25lS2V5Q29uZmlndXJlZCIsInNvbWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJvbmVLZXlNYXRjaGVzIiwidXNlckZyb21KV1QiLCJ1c2VyIiwicmF0ZUxpbWl0cyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJsaW1pdCIsInBhdGhFeHAiLCJSZWdFeHAiLCJwYXRoIiwidGVzdCIsImhhbmRsZXIiLCJlcnIiLCJDT05ORUNUSU9OX0ZBSUxFRCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsInJlZGlzVXJsIiwiY2xpZW50IiwiY3JlYXRlQ2xpZW50IiwiaXNPcGVuIiwiY29ubmVjdCIsIl9jb25maWciLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJfcmVxdWVzdCRhdXRoIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsIl9yZXF1ZXN0JGF1dGgyIiwiaWQiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG5jb25zdCBnZXRCbG9ja0xpc3QgPSAoaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGlmIChzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpKSByZXR1cm4gc3RvcmUuZ2V0KCdibG9ja0xpc3QnKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gbmV3IEJsb2NrTGlzdCgpO1xuICBpcFJhbmdlTGlzdC5mb3JFYWNoKGZ1bGxJcCA9PiB7XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzo6LzAnIHx8IGZ1bGxJcCA9PT0gJzo6Jykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjYnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzAuMC4wLjAvMCcgfHwgZnVsbElwID09PSAnMC4wLjAuMCcpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY0JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFtpcCwgbWFza10gPSBmdWxsSXAuc3BsaXQoJy8nKTtcbiAgICBpZiAoIW1hc2spIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRBZGRyZXNzKGlwLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmxvY2tMaXN0LmFkZFN1Ym5ldChpcCwgTnVtYmVyKG1hc2spLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9XG4gIH0pO1xuICBzdG9yZS5zZXQoJ2Jsb2NrTGlzdCcsIGJsb2NrTGlzdCk7XG4gIHJldHVybiBibG9ja0xpc3Q7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tJcCA9IChpcCwgaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGNvbnN0IGluY29taW5nSXBJc1Y0ID0gaXNJUHY0KGlwKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gZ2V0QmxvY2tMaXN0KGlwUmFuZ2VMaXN0LCBzdG9yZSk7XG5cbiAgaWYgKHN0b3JlLmdldChpcCkpIHJldHVybiB0cnVlO1xuICBpZiAoc3RvcmUuZ2V0KCdhbGxvd0FsbElwdjQnKSAmJiBpbmNvbWluZ0lwSXNWNCkgcmV0dXJuIHRydWU7XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NicpICYmICFpbmNvbWluZ0lwSXNWNCkgcmV0dXJuIHRydWU7XG4gIGNvbnN0IHJlc3VsdCA9IGJsb2NrTGlzdC5jaGVjayhpcCwgaW5jb21pbmdJcElzVjQgPyAnaXB2NCcgOiAnaXB2NicpO1xuXG4gIC8vIElmIHRoZSBpcCBpcyBpbiB0aGUgbGlzdCwgd2Ugc3RvcmUgdGhlIHJlc3VsdCBpbiB0aGUgc3RvcmVcbiAgLy8gc28gd2UgaGF2ZSBhIG9wdGltaXplZCBwYXRoIGZvciB0aGUgbmV4dCByZXF1ZXN0XG4gIGlmIChpcFJhbmdlTGlzdC5pbmNsdWRlcyhpcCkgJiYgcmVzdWx0KSB7XG4gICAgc3RvcmUuc2V0KGlwLCByZXN1bHQpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuICB2YXIgaW5mbyA9IHtcbiAgICBhcHBJZDogcmVxLmdldCgnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCcpLFxuICAgIHNlc3Npb25Ub2tlbjogcmVxLmdldCgnWC1QYXJzZS1TZXNzaW9uLVRva2VuJyksXG4gICAgbWFzdGVyS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1hc3Rlci1LZXknKSxcbiAgICBtYWludGVuYW5jZUtleTogcmVxLmdldCgnWC1QYXJzZS1NYWludGVuYW5jZS1LZXknKSxcbiAgICBpbnN0YWxsYXRpb25JZDogcmVxLmdldCgnWC1QYXJzZS1JbnN0YWxsYXRpb24tSWQnKSxcbiAgICBjbGllbnRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LUtleScpLFxuICAgIGphdmFzY3JpcHRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtSmF2YXNjcmlwdC1LZXknKSxcbiAgICBkb3ROZXRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtV2luZG93cy1LZXknKSxcbiAgICByZXN0QVBJS2V5OiByZXEuZ2V0KCdYLVBhcnNlLVJFU1QtQVBJLUtleScpLFxuICAgIGNsaWVudFZlcnNpb246IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LVZlcnNpb24nKSxcbiAgICBjb250ZXh0OiBjb250ZXh0LFxuICB9O1xuXG4gIHZhciBiYXNpY0F1dGggPSBodHRwQXV0aChyZXEpO1xuXG4gIGlmIChiYXNpY0F1dGgpIHtcbiAgICB2YXIgYmFzaWNBdXRoQXBwSWQgPSBiYXNpY0F1dGguYXBwSWQ7XG4gICAgaWYgKEFwcENhY2hlLmdldChiYXNpY0F1dGhBcHBJZCkpIHtcbiAgICAgIGluZm8uYXBwSWQgPSBiYXNpY0F1dGhBcHBJZDtcbiAgICAgIGluZm8ubWFzdGVyS2V5ID0gYmFzaWNBdXRoLm1hc3RlcktleSB8fCBpbmZvLm1hc3RlcktleTtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IGJhc2ljQXV0aC5qYXZhc2NyaXB0S2V5IHx8IGluZm8uamF2YXNjcmlwdEtleTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVxLmJvZHkpIHtcbiAgICAvLyBVbml0eSBTREsgc2VuZHMgYSBfbm9Cb2R5IGtleSB3aGljaCBuZWVkcyB0byBiZSByZW1vdmVkLlxuICAgIC8vIFVuY2xlYXIgYXQgdGhpcyBwb2ludCBpZiBhY3Rpb24gbmVlZHMgdG8gYmUgdGFrZW4uXG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9ub0JvZHk7XG4gIH1cblxuICB2YXIgZmlsZVZpYUpTT04gPSBmYWxzZTtcblxuICBpZiAoIWluZm8uYXBwSWQgfHwgIUFwcENhY2hlLmdldChpbmZvLmFwcElkKSkge1xuICAgIC8vIFNlZSBpZiB3ZSBjYW4gZmluZCB0aGUgYXBwIGlkIG9uIHRoZSBib2R5LlxuICAgIGlmIChyZXEuYm9keSBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgLy8gVGhlIG9ubHkgY2hhbmNlIHRvIGZpbmQgdGhlIGFwcCBpZCBpcyBpZiB0aGlzIGlzIGEgZmlsZVxuICAgICAgLy8gdXBsb2FkIHRoYXQgYWN0dWFsbHkgaXMgYSBKU09OIGJvZHkuIFNvIHRyeSB0byBwYXJzZSBpdC5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy82NTg5XG4gICAgICAvLyBJdCBpcyBhbHNvIHBvc3NpYmxlIHRoYXQgdGhlIGNsaWVudCBpcyB0cnlpbmcgdG8gdXBsb2FkIGEgZmlsZSBidXQgZm9yZ290XG4gICAgICAvLyB0byBwcm92aWRlIHgtcGFyc2UtYXBwLWlkIGluIGhlYWRlciBhbmQgcGFyc2UgYSBiaW5hcnkgZmlsZSB3aWxsIGZhaWxcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcS5ib2R5ID0gSlNPTi5wYXJzZShyZXEuYm9keSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGlmIChyZXEuYm9keS5fQ2xpZW50VmVyc2lvbikge1xuICAgICAgICBpbmZvLmNsaWVudFZlcnNpb24gPSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZCkge1xuICAgICAgICBpbmZvLmluc3RhbGxhdGlvbklkID0gcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fTWFzdGVyS2V5KSB7XG4gICAgICAgIGluZm8ubWFzdGVyS2V5ID0gcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQpIHtcbiAgICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0IGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgaW5mby5jb250ZXh0ID0gcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGluZm8uY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmJvZHkuX2NvbnRleHQpO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChpbmZvLmNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fQ29udGVudFR5cGUpIHtcbiAgICAgICAgcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmZvLnNlc3Npb25Ub2tlbiAmJiB0eXBlb2YgaW5mby5zZXNzaW9uVG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgaW5mby5zZXNzaW9uVG9rZW4gPSBpbmZvLnNlc3Npb25Ub2tlbi50b1N0cmluZygpO1xuICB9XG5cbiAgaWYgKGluZm8uY2xpZW50VmVyc2lvbikge1xuICAgIGluZm8uY2xpZW50U0RLID0gQ2xpZW50U0RLLmZyb21TdHJpbmcoaW5mby5jbGllbnRWZXJzaW9uKTtcbiAgfVxuXG4gIGlmIChmaWxlVmlhSlNPTikge1xuICAgIHJlcS5maWxlRGF0YSA9IHJlcS5ib2R5LmZpbGVEYXRhO1xuICAgIC8vIFdlIG5lZWQgdG8gcmVwb3B1bGF0ZSByZXEuYm9keSB3aXRoIGEgYnVmZmVyXG4gICAgdmFyIGJhc2U2NCA9IHJlcS5ib2R5LmJhc2U2NDtcbiAgICByZXEuYm9keSA9IEJ1ZmZlci5mcm9tKGJhc2U2NCwgJ2Jhc2U2NCcpO1xuICB9XG5cbiAgY29uc3QgY2xpZW50SXAgPSBnZXRDbGllbnRJcChyZXEpO1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGluZm8uYXBwSWQsIG1vdW50KTtcbiAgaWYgKGNvbmZpZy5zdGF0ZSAmJiBjb25maWcuc3RhdGUgIT09ICdvaycpIHtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgZXJyb3I6IGBJbnZhbGlkIHNlcnZlciBzdGF0ZTogJHtjb25maWcuc3RhdGV9YCxcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpbmZvLmFwcCA9IEFwcENhY2hlLmdldChpbmZvLmFwcElkKTtcbiAgcmVxLmNvbmZpZyA9IGNvbmZpZztcbiAgcmVxLmNvbmZpZy5oZWFkZXJzID0gcmVxLmhlYWRlcnMgfHwge307XG4gIHJlcS5jb25maWcuaXAgPSBjbGllbnRJcDtcbiAgcmVxLmluZm8gPSBpbmZvO1xuXG4gIGNvbnN0IGlzTWFpbnRlbmFuY2UgPVxuICAgIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXkgJiYgaW5mby5tYWludGVuYW5jZUtleSA9PT0gcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleTtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpZiAoY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlKSkge1xuICAgICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgaXNNYWludGVuYW5jZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFpbnRlbmFuY2Uga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21haW50ZW5hbmNlS2V5SXBzJy5gXG4gICAgKTtcbiAgfVxuXG4gIGxldCBpc01hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLm1hc3RlcktleTtcblxuICBpZiAoaXNNYXN0ZXIgJiYgIWNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFzdGVyS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlKSkge1xuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYXN0ZXIga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21hc3RlcktleUlwcycuYFxuICAgICk7XG4gICAgaXNNYXN0ZXIgPSBmYWxzZTtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gYHVuYXV0aG9yaXplZGA7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIHZhciBpc1JlYWRPbmx5TWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXk7XG4gIGlmIChcbiAgICB0eXBlb2YgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAhPSAndW5kZWZpbmVkJyAmJlxuICAgIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgJiZcbiAgICBpc1JlYWRPbmx5TWFzdGVyXG4gICkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgICAgaXNSZWFkT25seTogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIC8vIENsaWVudCBrZXlzIGFyZSBub3QgcmVxdWlyZWQgaW4gcGFyc2Utc2VydmVyLCBidXQgaWYgYW55IGhhdmUgYmVlbiBjb25maWd1cmVkIGluIHRoZSBzZXJ2ZXIsIHZhbGlkYXRlIHRoZW1cbiAgLy8gIHRvIHByZXNlcnZlIG9yaWdpbmFsIGJlaGF2aW9yLlxuICBjb25zdCBrZXlzID0gWydjbGllbnRLZXknLCAnamF2YXNjcmlwdEtleScsICdkb3ROZXRLZXknLCAncmVzdEFQSUtleSddO1xuICBjb25zdCBvbmVLZXlDb25maWd1cmVkID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQ7XG4gIH0pO1xuICBjb25zdCBvbmVLZXlNYXRjaGVzID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQgJiYgaW5mb1trZXldID09PSByZXEuY29uZmlnW2tleV07XG4gIH0pO1xuXG4gIGlmIChvbmVLZXlDb25maWd1cmVkICYmICFvbmVLZXlNYXRjaGVzKSB7XG4gICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgfVxuXG4gIGlmIChyZXEudXJsID09ICcvbG9naW4nKSB7XG4gICAgZGVsZXRlIGluZm8uc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIHVzZXI6IHJlcS51c2VyRnJvbUpXVCxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIGlmICghaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgfSk7XG4gIH1cbiAgaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbn1cblxuY29uc3QgaGFuZGxlUmF0ZUxpbWl0ID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIGNvbnN0IHJhdGVMaW1pdHMgPSByZXEuY29uZmlnLnJhdGVMaW1pdHMgfHwgW107XG4gIHRyeSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByYXRlTGltaXRzLm1hcChhc3luYyBsaW1pdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGhFeHAgPSBuZXcgUmVnRXhwKGxpbWl0LnBhdGgpO1xuICAgICAgICBpZiAocGF0aEV4cC50ZXN0KHJlcS51cmwpKSB7XG4gICAgICAgICAgYXdhaXQgbGltaXQuaGFuZGxlcihyZXEsIHJlcywgZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJlZCB3aGVuIGF0dGVtcHRpbmcgdG8gYXBwbHkgdGhlIHJhdGUgbGltaXRlcjogJyxcbiAgICAgICAgICAgICAgICBlcnJcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJlcy5zdGF0dXMoNDI5KTtcbiAgICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZVBhcnNlU2Vzc2lvbiA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSByZXEuaW5mbztcbiAgICBpZiAocmVxLmF1dGggfHwgcmVxLnVybCA9PT0gJy9zZXNzaW9ucy9tZScpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcXVlc3RBdXRoID0gbnVsbDtcbiAgICBpZiAoXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbiAmJlxuICAgICAgcmVxLnVybCA9PT0gJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJyAmJlxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4uaW5kZXhPZigncjonKSAhPSAwXG4gICAgKSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJlcS5hdXRoID0gcmVxdWVzdEF1dGg7XG4gICAgbmV4dCgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gVE9ETzogRGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGVycm9yIHNjZW5hcmlvLlxuICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcignZXJyb3IgZ2V0dGluZyBhdXRoIGZvciBzZXNzaW9uVG9rZW4nLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVOS05PV05fRVJST1IsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0Q2xpZW50SXAocmVxKSB7XG4gIHJldHVybiByZXEuaXA7XG59XG5cbmZ1bmN0aW9uIGh0dHBBdXRoKHJlcSkge1xuICBpZiAoIShyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uKSByZXR1cm47XG5cbiAgdmFyIGhlYWRlciA9IChyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICB2YXIgYXBwSWQsIG1hc3RlcktleSwgamF2YXNjcmlwdEtleTtcblxuICAvLyBwYXJzZSBoZWFkZXJcbiAgdmFyIGF1dGhQcmVmaXggPSAnYmFzaWMgJztcblxuICB2YXIgbWF0Y2ggPSBoZWFkZXIudG9Mb3dlckNhc2UoKS5pbmRleE9mKGF1dGhQcmVmaXgpO1xuXG4gIGlmIChtYXRjaCA9PSAwKSB7XG4gICAgdmFyIGVuY29kZWRBdXRoID0gaGVhZGVyLnN1YnN0cmluZyhhdXRoUHJlZml4Lmxlbmd0aCwgaGVhZGVyLmxlbmd0aCk7XG4gICAgdmFyIGNyZWRlbnRpYWxzID0gZGVjb2RlQmFzZTY0KGVuY29kZWRBdXRoKS5zcGxpdCgnOicpO1xuXG4gICAgaWYgKGNyZWRlbnRpYWxzLmxlbmd0aCA9PSAyKSB7XG4gICAgICBhcHBJZCA9IGNyZWRlbnRpYWxzWzBdO1xuICAgICAgdmFyIGtleSA9IGNyZWRlbnRpYWxzWzFdO1xuXG4gICAgICB2YXIganNLZXlQcmVmaXggPSAnamF2YXNjcmlwdC1rZXk9JztcblxuICAgICAgdmFyIG1hdGNoS2V5ID0ga2V5LmluZGV4T2YoanNLZXlQcmVmaXgpO1xuICAgICAgaWYgKG1hdGNoS2V5ID09IDApIHtcbiAgICAgICAgamF2YXNjcmlwdEtleSA9IGtleS5zdWJzdHJpbmcoanNLZXlQcmVmaXgubGVuZ3RoLCBrZXkubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hc3RlcktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhcHBJZDogYXBwSWQsIG1hc3RlcktleTogbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5OiBqYXZhc2NyaXB0S2V5IH07XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChzdHIpIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0Nyb3NzRG9tYWluKGFwcElkKSB7XG4gIHJldHVybiAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkLCBnZXRNb3VudEZvclJlcXVlc3QocmVxKSk7XG4gICAgbGV0IGFsbG93SGVhZGVycyA9IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTO1xuICAgIGlmIChjb25maWcgJiYgY29uZmlnLmFsbG93SGVhZGVycykge1xuICAgICAgYWxsb3dIZWFkZXJzICs9IGAsICR7Y29uZmlnLmFsbG93SGVhZGVycy5qb2luKCcsICcpfWA7XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZU9yaWdpbnMgPVxuICAgICAgdHlwZW9mIGNvbmZpZz8uYWxsb3dPcmlnaW4gPT09ICdzdHJpbmcnID8gW2NvbmZpZy5hbGxvd09yaWdpbl0gOiBjb25maWc/LmFsbG93T3JpZ2luID8/IFsnKiddO1xuICAgIGNvbnN0IHJlcXVlc3RPcmlnaW4gPSByZXEuaGVhZGVycy5vcmlnaW47XG4gICAgY29uc3QgYWxsb3dPcmlnaW5zID1cbiAgICAgIHJlcXVlc3RPcmlnaW4gJiYgYmFzZU9yaWdpbnMuaW5jbHVkZXMocmVxdWVzdE9yaWdpbikgPyByZXF1ZXN0T3JpZ2luIDogYmFzZU9yaWdpbnNbMF07XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgYWxsb3dPcmlnaW5zKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keS5fbWV0aG9kKSB7XG4gICAgcmVxLm9yaWdpbmFsTWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgICByZXEubWV0aG9kID0gcmVxLmJvZHkuX21ldGhvZDtcbiAgICBkZWxldGUgcmVxLmJvZHkuX21ldGhvZDtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUVycm9ycyhlcnIsIHJlcSwgcmVzLCBuZXh0KSB7XG4gIGNvbnN0IGxvZyA9IChyZXEuY29uZmlnICYmIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgaWYgKGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgaWYgKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5lbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gbmV4dChlcnIpO1xuICAgIH1cbiAgICBsZXQgaHR0cFN0YXR1cztcbiAgICAvLyBUT0RPOiBmaWxsIG91dCB0aGlzIG1hcHBpbmdcbiAgICBzd2l0Y2ggKGVyci5jb2RlKSB7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUjpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDUwMDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwMDtcbiAgICB9XG4gICAgcmVzLnN0YXR1cyhodHRwU3RhdHVzKTtcbiAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgbG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyKTtcbiAgfSBlbHNlIGlmIChlcnIuc3RhdHVzICYmIGVyci5tZXNzYWdlKSB7XG4gICAgcmVzLnN0YXR1cyhlcnIuc3RhdHVzKTtcbiAgICByZXMuanNvbih7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVyciwgZXJyLnN0YWNrKTtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvci4nLFxuICAgIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkXCJ9Jyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcsIGNsb3VkKSA9PiB7XG4gIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByb3V0ZSkge1xuICAgIGlmICghUmF0ZUxpbWl0T3B0aW9uc1trZXldKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCByYXRlIGxpbWl0IG9wdGlvbiBcIiR7a2V5fVwiYDtcbiAgICB9XG4gIH1cbiAgaWYgKCFjb25maWcucmF0ZUxpbWl0cykge1xuICAgIGNvbmZpZy5yYXRlTGltaXRzID0gW107XG4gIH1cbiAgY29uc3QgcmVkaXNTdG9yZSA9IHtcbiAgICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG4gICAgc3RvcmU6IG51bGwsXG4gIH07XG4gIGlmIChyb3V0ZS5yZWRpc1VybCkge1xuICAgIGNvbnN0IGNsaWVudCA9IGNyZWF0ZUNsaWVudCh7XG4gICAgICB1cmw6IHJvdXRlLnJlZGlzVXJsLFxuICAgIH0pO1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoY2xpZW50LmlzT3Blbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBsb2cgPSBjb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGxldCB0cmFuc2Zvcm1QYXRoID0gcm91dGUucmVxdWVzdFBhdGguc3BsaXQoJy8qJykuam9pbignLyguKiknKTtcbiAgaWYgKHRyYW5zZm9ybVBhdGggPT09ICcqJykge1xuICAgIHRyYW5zZm9ybVBhdGggPSAnKC4qKSc7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHRyYW5zZm9ybVBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiBhc3luYyByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLmdsb2JhbCkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5hcHBJZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b2tlbiA9IHJlcXVlc3QuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5zZXNzaW9uICYmIHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS51c2VyICYmIHRva2VuKSB7XG4gICAgICAgICAgaWYgKCFyZXF1ZXN0LmF1dGgpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlUGFyc2VTZXNzaW9uKHJlcXVlc3QsIG51bGwsIHJlc29sdmUpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlcXVlc3QuYXV0aD8udXNlcj8uaWQgJiYgcmVxdWVzdC56b25lID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGgudXNlci5pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICAgIHN0b3JlOiByZWRpc1N0b3JlLnN0b3JlLFxuICAgIH0pLFxuICAgIGNsb3VkLFxuICB9KTtcbiAgQ29uZmlnLnB1dChjb25maWcpO1xufTtcblxuLyoqXG4gKiBEZWR1cGxpY2F0ZXMgYSByZXF1ZXN0IHRvIGVuc3VyZSBpZGVtcG90ZW5jeS4gRHVwbGljYXRlcyBhcmUgZGV0ZXJtaW5lZCBieSB0aGUgcmVxdWVzdCBJRFxuICogaW4gdGhlIHJlcXVlc3QgaGVhZGVyLiBJZiBhIHJlcXVlc3QgaGFzIG5vIHJlcXVlc3QgSUQsIGl0IGlzIGV4ZWN1dGVkIGFueXdheS5cbiAqIEBwYXJhbSB7Kn0gcmVxIFRoZSByZXF1ZXN0IHRvIGV2YWx1YXRlLlxuICogQHJldHVybnMgUHJvbWlzZTx7fT5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeShyZXEpIHtcbiAgLy8gRW5hYmxlIGZlYXR1cmUgb25seSBmb3IgTW9uZ29EQlxuICBpZiAoXG4gICAgIShcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIgfHxcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXJcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBHZXQgcGFyYW1ldGVyc1xuICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICBjb25zdCByZXF1ZXN0SWQgPSAoKHJlcSB8fCB7fSkuaGVhZGVycyB8fCB7fSlbJ3gtcGFyc2UtcmVxdWVzdC1pZCddO1xuICBjb25zdCB7IHBhdGhzLCB0dGwgfSA9IGNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gIGlmICghcmVxdWVzdElkIHx8ICFjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJlcXVlc3QgcGF0aCBtYXkgY29udGFpbiB0cmFpbGluZyBzbGFzaGVzLCBkZXBlbmRpbmcgb24gdGhlIG9yaWdpbmFsIHJlcXVlc3QsIHNvIHJlbW92ZVxuICAvLyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIHRvIG1ha2UgaXQgZWFzaWVyIHRvIHNwZWNpZnkgcGF0aHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgcmVxUGF0aCA9IHJlcS5wYXRoLnJlcGxhY2UoL15cXC98XFwvJC8sICcnKTtcbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgaWRlbXBvdGVuY3kgaXMgZW5hYmxlZCBmb3IgY3VycmVudCByZXF1ZXN0IHBhdGhcbiAgbGV0IG1hdGNoID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuICAgIC8vIEFzc3VtZSBvbmUgd2FudHMgYSBwYXRoIHRvIGFsd2F5cyBtYXRjaCBmcm9tIHRoZSBiZWdpbm5pbmcgdG8gcHJldmVudCBhbnkgbWlzdGFrZXNcbiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0aC5jaGFyQXQoMCkgPT09ICdeJyA/IHBhdGggOiAnXicgKyBwYXRoKTtcbiAgICBpZiAocmVxUGF0aC5tYXRjaChyZWdleCkpIHtcbiAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFRyeSB0byBzdG9yZSByZXF1ZXN0XG4gIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShuZXcgRGF0ZSgpLnNldFNlY29uZHMobmV3IERhdGUoKS5nZXRTZWNvbmRzKCkgKyB0dGwpKTtcbiAgcmV0dXJuIHJlc3RcbiAgICAuY3JlYXRlKGNvbmZpZywgYXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19JZGVtcG90ZW5jeScsIHtcbiAgICAgIHJlcUlkOiByZXF1ZXN0SWQsXG4gICAgICBleHBpcmU6IFBhcnNlLl9lbmNvZGUoZXhwaXJ5RGF0ZSksXG4gICAgfSlcbiAgICAuY2F0Y2goZSA9PiB7XG4gICAgICBpZiAoZS5jb2RlID09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1JFUVVFU1QsICdEdXBsaWNhdGUgcmVxdWVzdCcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDMpO1xuICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkXCJ9Jyk7XG59XG5cbmZ1bmN0aW9uIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDApO1xuICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLklO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