"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowDoubleForwardSlash = allowDoubleForwardSlash;
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
  if (store.get('blockList')) {
    return store.get('blockList');
  }
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
  if (store.get(ip)) {
    return true;
  }
  if (store.get('allowAllIpv4') && incomingIpIsV4) {
    return true;
  }
  if (store.get('allowAllIpv6') && !incomingIpIsV4) {
    return true;
  }
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
async function handleParseHeaders(req, res, next) {
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
  if (fileViaJSON && req.body) {
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
    if (checkIp(clientIp, req.config.maintenanceKeyIps || [], req.config.maintenanceKeyIpsStore)) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = req.config?.loggerController || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  const masterKey = await req.config.loadMasterKey();
  let isMaster = info.masterKey === masterKey;
  if (isMaster && !checkIp(clientIp, req.config.masterKeyIps || [], req.config.masterKeyIpsStore)) {
    const log = req.config?.loggerController || _logger.default;
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
  if (!(req.req || req).headers.authorization) {
    return;
  }
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
    const baseOrigins = typeof config?.allowOrigin === 'string' ? [config.allowOrigin] : config?.allowOrigin ?? ['*'];
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
  if (req.method === 'POST' && req.body?._method) {
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
    const log = config?.loggerController || _logger.default;
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    client.on('error', err => {
      log.error('Middlewares addRateLimit Redis client error', {
        error: err
      });
    });
    client.on('connect', () => {});
    client.on('reconnecting', () => {});
    client.on('ready', () => {});
    redisStore.connectionPromise = async () => {
      if (client.isOpen) {
        return;
      }
      try {
        await client.connect();
      } catch (e) {
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
        return request.auth?.isMaster;
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
          if (!request.auth) {
            await new Promise(resolve => handleParseSession(request, null, resolve));
          }
          if (request.auth?.user?.id && request.zone === 'user') {
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

/**
 * Express 4 allowed a double forward slash between a route and router. Although
 * this should be considered an anti-pattern, we need to support it for backwards
 * compatibility.
 *
 * Technically valid URL with double foroward slash:
 * http://localhost:1337/parse//functions/testFunction
 */
function allowDoubleForwardSlash(req, res, next) {
  req.url = req.url.startsWith('//') ? req.url.substring(1) : req.url;
  next();
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiREVGQVVMVF9BTExPV0VEX0hFQURFUlMiLCJleHBvcnRzIiwiZ2V0TW91bnRGb3JSZXF1ZXN0IiwicmVxIiwibW91bnRQYXRoTGVuZ3RoIiwib3JpZ2luYWxVcmwiLCJsZW5ndGgiLCJ1cmwiLCJtb3VudFBhdGgiLCJzbGljZSIsInByb3RvY29sIiwiZ2V0IiwiZ2V0QmxvY2tMaXN0IiwiaXBSYW5nZUxpc3QiLCJzdG9yZSIsImJsb2NrTGlzdCIsIkJsb2NrTGlzdCIsImZvckVhY2giLCJmdWxsSXAiLCJzZXQiLCJpcCIsIm1hc2siLCJzcGxpdCIsImFkZEFkZHJlc3MiLCJpc0lQdjQiLCJhZGRTdWJuZXQiLCJOdW1iZXIiLCJjaGVja0lwIiwiaW5jb21pbmdJcElzVjQiLCJyZXN1bHQiLCJjaGVjayIsImluY2x1ZGVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVzIiwibmV4dCIsIm1vdW50IiwiY29udGV4dCIsIkpTT04iLCJwYXJzZSIsIk9iamVjdCIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJtYWludGVuYW5jZUtleUlwcyIsIm1haW50ZW5hbmNlS2V5SXBzU3RvcmUiLCJhdXRoIiwiQXV0aCIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkZWZhdWx0TG9nZ2VyIiwibG9hZE1hc3RlcktleSIsImlzTWFzdGVyIiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5SXBzU3RvcmUiLCJtZXNzYWdlIiwiaGFuZGxlUmF0ZUxpbWl0IiwiaXNSZWFkT25seU1hc3RlciIsInJlYWRPbmx5TWFzdGVyS2V5IiwiaXNSZWFkT25seSIsImtleXMiLCJvbmVLZXlDb25maWd1cmVkIiwic29tZSIsImtleSIsInVuZGVmaW5lZCIsIm9uZUtleU1hdGNoZXMiLCJ1c2VyRnJvbUpXVCIsInVzZXIiLCJyYXRlTGltaXRzIiwiUHJvbWlzZSIsImFsbCIsIm1hcCIsImxpbWl0IiwicGF0aEV4cCIsIlJlZ0V4cCIsInBhdGgiLCJ0ZXN0IiwiaGFuZGxlciIsImVyciIsIkNPTk5FQ1RJT05fRkFJTEVEIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwicmVxdWVzdEF1dGgiLCJpbmRleE9mIiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJVTktOT1dOX0VSUk9SIiwiYXV0aG9yaXphdGlvbiIsImhlYWRlciIsImF1dGhQcmVmaXgiLCJtYXRjaCIsInRvTG93ZXJDYXNlIiwiZW5jb2RlZEF1dGgiLCJzdWJzdHJpbmciLCJjcmVkZW50aWFscyIsImRlY29kZUJhc2U2NCIsImpzS2V5UHJlZml4IiwibWF0Y2hLZXkiLCJzdHIiLCJhbGxvd0Nyb3NzRG9tYWluIiwiYWxsb3dIZWFkZXJzIiwiam9pbiIsImJhc2VPcmlnaW5zIiwiYWxsb3dPcmlnaW4iLCJyZXF1ZXN0T3JpZ2luIiwib3JpZ2luIiwiYWxsb3dPcmlnaW5zIiwibWV0aG9kIiwic2VuZFN0YXR1cyIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJfbWV0aG9kIiwib3JpZ2luYWxNZXRob2QiLCJoYW5kbGVQYXJzZUVycm9ycyIsImVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIiLCJodHRwU3RhdHVzIiwiT0JKRUNUX05PVF9GT1VORCIsInByb2Nlc3MiLCJlbnYiLCJURVNUSU5HIiwic3RhY2siLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZW5kIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJyZXF1ZXN0IiwicmVzb2x2ZSIsImFkZFJhdGVMaW1pdCIsInJvdXRlIiwiY2xvdWQiLCJSYXRlTGltaXRPcHRpb25zIiwicmVkaXNTdG9yZSIsImNvbm5lY3Rpb25Qcm9taXNlIiwicmVkaXNVcmwiLCJjbGllbnQiLCJjcmVhdGVDbGllbnQiLCJvbiIsImlzT3BlbiIsImNvbm5lY3QiLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsImluY2x1ZGVNYXN0ZXJLZXkiLCJyZXF1ZXN0TWV0aG9kcyIsIkFycmF5IiwiaXNBcnJheSIsInJlZ0V4cCIsImtleUdlbmVyYXRvciIsInpvbmUiLCJTZXJ2ZXIiLCJSYXRlTGltaXRab25lIiwiZ2xvYmFsIiwidG9rZW4iLCJzZXNzaW9uIiwiaWQiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiIsImFsbG93RG91YmxlRm9yd2FyZFNsYXNoIiwic3RhcnRzV2l0aCJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG5jb25zdCBnZXRCbG9ja0xpc3QgPSAoaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGlmIChzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpKSB7IHJldHVybiBzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpOyB9XG4gIGNvbnN0IGJsb2NrTGlzdCA9IG5ldyBCbG9ja0xpc3QoKTtcbiAgaXBSYW5nZUxpc3QuZm9yRWFjaChmdWxsSXAgPT4ge1xuICAgIGlmIChmdWxsSXAgPT09ICc6Oi8wJyB8fCBmdWxsSXAgPT09ICc6OicpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY2JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChmdWxsSXAgPT09ICcwLjAuMC4wLzAnIHx8IGZ1bGxJcCA9PT0gJzAuMC4wLjAnKSB7XG4gICAgICBzdG9yZS5zZXQoJ2FsbG93QWxsSXB2NCcsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBbaXAsIG1hc2tdID0gZnVsbElwLnNwbGl0KCcvJyk7XG4gICAgaWYgKCFtYXNrKSB7XG4gICAgICBibG9ja0xpc3QuYWRkQWRkcmVzcyhpcCwgaXNJUHY0KGlwKSA/ICdpcHY0JyA6ICdpcHY2Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRTdWJuZXQoaXAsIE51bWJlcihtYXNrKSwgaXNJUHY0KGlwKSA/ICdpcHY0JyA6ICdpcHY2Jyk7XG4gICAgfVxuICB9KTtcbiAgc3RvcmUuc2V0KCdibG9ja0xpc3QnLCBibG9ja0xpc3QpO1xuICByZXR1cm4gYmxvY2tMaXN0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrSXAgPSAoaXAsIGlwUmFuZ2VMaXN0LCBzdG9yZSkgPT4ge1xuICBjb25zdCBpbmNvbWluZ0lwSXNWNCA9IGlzSVB2NChpcCk7XG4gIGNvbnN0IGJsb2NrTGlzdCA9IGdldEJsb2NrTGlzdChpcFJhbmdlTGlzdCwgc3RvcmUpO1xuXG4gIGlmIChzdG9yZS5nZXQoaXApKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NCcpICYmIGluY29taW5nSXBJc1Y0KSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NicpICYmICFpbmNvbWluZ0lwSXNWNCkgeyByZXR1cm4gdHJ1ZTsgfVxuICBjb25zdCByZXN1bHQgPSBibG9ja0xpc3QuY2hlY2soaXAsIGluY29taW5nSXBJc1Y0ID8gJ2lwdjQnIDogJ2lwdjYnKTtcblxuICAvLyBJZiB0aGUgaXAgaXMgaW4gdGhlIGxpc3QsIHdlIHN0b3JlIHRoZSByZXN1bHQgaW4gdGhlIHN0b3JlXG4gIC8vIHNvIHdlIGhhdmUgYSBvcHRpbWl6ZWQgcGF0aCBmb3IgdGhlIG5leHQgcmVxdWVzdFxuICBpZiAoaXBSYW5nZUxpc3QuaW5jbHVkZXMoaXApICYmIHJlc3VsdCkge1xuICAgIHN0b3JlLnNldChpcCwgcmVzdWx0KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLy8gQ2hlY2tzIHRoYXQgdGhlIHJlcXVlc3QgaXMgYXV0aG9yaXplZCBmb3IgdGhpcyBhcHAgYW5kIGNoZWNrcyB1c2VyXG4vLyBhdXRoIHRvby5cbi8vIFRoZSBib2R5cGFyc2VyIHNob3VsZCBydW4gYmVmb3JlIHRoaXMgbWlkZGxld2FyZS5cbi8vIEFkZHMgaW5mbyB0byB0aGUgcmVxdWVzdDpcbi8vIHJlcS5jb25maWcgLSB0aGUgQ29uZmlnIGZvciB0aGlzIGFwcFxuLy8gcmVxLmF1dGggLSB0aGUgQXV0aCBmb3IgdGhpcyByZXF1ZXN0XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlUGFyc2VIZWFkZXJzKHJlcSwgcmVzLCBuZXh0KSB7XG4gIHZhciBtb3VudCA9IGdldE1vdW50Rm9yUmVxdWVzdChyZXEpO1xuXG4gIGxldCBjb250ZXh0ID0ge307XG4gIGlmIChyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSAhPSBudWxsKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpKTtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cbiAgdmFyIGluZm8gPSB7XG4gICAgYXBwSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtQXBwbGljYXRpb24tSWQnKSxcbiAgICBzZXNzaW9uVG9rZW46IHJlcS5nZXQoJ1gtUGFyc2UtU2Vzc2lvbi1Ub2tlbicpLFxuICAgIG1hc3RlcktleTogcmVxLmdldCgnWC1QYXJzZS1NYXN0ZXItS2V5JyksXG4gICAgbWFpbnRlbmFuY2VLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFpbnRlbmFuY2UtS2V5JyksXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5nZXQoJ1gtUGFyc2UtSW5zdGFsbGF0aW9uLUlkJyksXG4gICAgY2xpZW50S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1LZXknKSxcbiAgICBqYXZhc2NyaXB0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLUphdmFzY3JpcHQtS2V5JyksXG4gICAgZG90TmV0S2V5OiByZXEuZ2V0KCdYLVBhcnNlLVdpbmRvd3MtS2V5JyksXG4gICAgcmVzdEFQSUtleTogcmVxLmdldCgnWC1QYXJzZS1SRVNULUFQSS1LZXknKSxcbiAgICBjbGllbnRWZXJzaW9uOiByZXEuZ2V0KCdYLVBhcnNlLUNsaWVudC1WZXJzaW9uJyksXG4gICAgY29udGV4dDogY29udGV4dCxcbiAgfTtcblxuICB2YXIgYmFzaWNBdXRoID0gaHR0cEF1dGgocmVxKTtcblxuICBpZiAoYmFzaWNBdXRoKSB7XG4gICAgdmFyIGJhc2ljQXV0aEFwcElkID0gYmFzaWNBdXRoLmFwcElkO1xuICAgIGlmIChBcHBDYWNoZS5nZXQoYmFzaWNBdXRoQXBwSWQpKSB7XG4gICAgICBpbmZvLmFwcElkID0gYmFzaWNBdXRoQXBwSWQ7XG4gICAgICBpbmZvLm1hc3RlcktleSA9IGJhc2ljQXV0aC5tYXN0ZXJLZXkgfHwgaW5mby5tYXN0ZXJLZXk7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSBiYXNpY0F1dGguamF2YXNjcmlwdEtleSB8fCBpbmZvLmphdmFzY3JpcHRLZXk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlcS5ib2R5KSB7XG4gICAgLy8gVW5pdHkgU0RLIHNlbmRzIGEgX25vQm9keSBrZXkgd2hpY2ggbmVlZHMgdG8gYmUgcmVtb3ZlZC5cbiAgICAvLyBVbmNsZWFyIGF0IHRoaXMgcG9pbnQgaWYgYWN0aW9uIG5lZWRzIHRvIGJlIHRha2VuLlxuICAgIGRlbGV0ZSByZXEuYm9keS5fbm9Cb2R5O1xuICB9XG5cbiAgdmFyIGZpbGVWaWFKU09OID0gZmFsc2U7XG5cbiAgaWYgKCFpbmZvLmFwcElkIHx8ICFBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCkpIHtcbiAgICAvLyBTZWUgaWYgd2UgY2FuIGZpbmQgdGhlIGFwcCBpZCBvbiB0aGUgYm9keS5cbiAgICBpZiAocmVxLmJvZHkgaW5zdGFuY2VvZiBCdWZmZXIpIHtcbiAgICAgIC8vIFRoZSBvbmx5IGNoYW5jZSB0byBmaW5kIHRoZSBhcHAgaWQgaXMgaWYgdGhpcyBpcyBhIGZpbGVcbiAgICAgIC8vIHVwbG9hZCB0aGF0IGFjdHVhbGx5IGlzIGEgSlNPTiBib2R5LiBTbyB0cnkgdG8gcGFyc2UgaXQuXG4gICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvNjU4OVxuICAgICAgLy8gSXQgaXMgYWxzbyBwb3NzaWJsZSB0aGF0IHRoZSBjbGllbnQgaXMgdHJ5aW5nIHRvIHVwbG9hZCBhIGZpbGUgYnV0IGZvcmdvdFxuICAgICAgLy8gdG8gcHJvdmlkZSB4LXBhcnNlLWFwcC1pZCBpbiBoZWFkZXIgYW5kIHBhcnNlIGEgYmluYXJ5IGZpbGUgd2lsbCBmYWlsXG4gICAgICB0cnkge1xuICAgICAgICByZXEuYm9keSA9IEpTT04ucGFyc2UocmVxLmJvZHkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgICAgfVxuICAgICAgZmlsZVZpYUpTT04gPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXEuYm9keSkge1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9SZXZvY2FibGVTZXNzaW9uO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHJlcS5ib2R5ICYmXG4gICAgICByZXEuYm9keS5fQXBwbGljYXRpb25JZCAmJlxuICAgICAgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKSAmJlxuICAgICAgKCFpbmZvLm1hc3RlcktleSB8fCBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpLm1hc3RlcktleSA9PT0gaW5mby5tYXN0ZXJLZXkpXG4gICAgKSB7XG4gICAgICBpbmZvLmFwcElkID0gcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBpbmZvLmphdmFzY3JpcHRLZXkgPSByZXEuYm9keS5fSmF2YVNjcmlwdEtleSB8fCAnJztcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fSmF2YVNjcmlwdEtleTtcbiAgICAgIC8vIFRPRE86IHRlc3QgdGhhdCB0aGUgUkVTVCBBUEkgZm9ybWF0cyBnZW5lcmF0ZWQgYnkgdGhlIG90aGVyXG4gICAgICAvLyBTREtzIGFyZSBoYW5kbGVkIG9rXG4gICAgICBpZiAocmVxLmJvZHkuX0NsaWVudFZlcnNpb24pIHtcbiAgICAgICAgaW5mby5jbGllbnRWZXJzaW9uID0gcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgaW5mby5pbnN0YWxsYXRpb25JZCA9IHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fU2Vzc2lvblRva2VuKSB7XG4gICAgICAgIGluZm8uc2Vzc2lvblRva2VuID0gcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX01hc3RlcktleSkge1xuICAgICAgICBpbmZvLm1hc3RlcktleSA9IHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0KSB7XG4gICAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICAgIGluZm8uY29udGV4dCA9IHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbmZvLmNvbnRleHQgPSBKU09OLnBhcnNlKHJlcS5ib2R5Ll9jb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoaW5mby5jb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0NvbnRlbnRUeXBlKSB7XG4gICAgICAgIHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9Db250ZW50VHlwZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaW5mby5zZXNzaW9uVG9rZW4gJiYgdHlwZW9mIGluZm8uc2Vzc2lvblRva2VuICE9PSAnc3RyaW5nJykge1xuICAgIGluZm8uc2Vzc2lvblRva2VuID0gaW5mby5zZXNzaW9uVG9rZW4udG9TdHJpbmcoKTtcbiAgfVxuXG4gIGlmIChpbmZvLmNsaWVudFZlcnNpb24pIHtcbiAgICBpbmZvLmNsaWVudFNESyA9IENsaWVudFNESy5mcm9tU3RyaW5nKGluZm8uY2xpZW50VmVyc2lvbik7XG4gIH1cblxuICBpZiAoZmlsZVZpYUpTT04gJiYgcmVxLmJvZHkpIHtcbiAgICByZXEuZmlsZURhdGEgPSByZXEuYm9keS5maWxlRGF0YTtcbiAgICAvLyBXZSBuZWVkIHRvIHJlcG9wdWxhdGUgcmVxLmJvZHkgd2l0aCBhIGJ1ZmZlclxuICAgIHZhciBiYXNlNjQgPSByZXEuYm9keS5iYXNlNjQ7XG4gICAgcmVxLmJvZHkgPSBCdWZmZXIuZnJvbShiYXNlNjQsICdiYXNlNjQnKTtcbiAgfVxuXG4gIGNvbnN0IGNsaWVudElwID0gZ2V0Q2xpZW50SXAocmVxKTtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChpbmZvLmFwcElkLCBtb3VudCk7XG4gIGlmIChjb25maWcuc3RhdGUgJiYgY29uZmlnLnN0YXRlICE9PSAnb2snKSB7XG4gICAgcmVzLnN0YXR1cyg1MDApO1xuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgIGVycm9yOiBgSW52YWxpZCBzZXJ2ZXIgc3RhdGU6ICR7Y29uZmlnLnN0YXRlfWAsXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaW5mby5hcHAgPSBBcHBDYWNoZS5nZXQoaW5mby5hcHBJZCk7XG4gIHJlcS5jb25maWcgPSBjb25maWc7XG4gIHJlcS5jb25maWcuaGVhZGVycyA9IHJlcS5oZWFkZXJzIHx8IHt9O1xuICByZXEuY29uZmlnLmlwID0gY2xpZW50SXA7XG4gIHJlcS5pbmZvID0gaW5mbztcblxuICBjb25zdCBpc01haW50ZW5hbmNlID1cbiAgICByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5ICYmIGluZm8ubWFpbnRlbmFuY2VLZXkgPT09IHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXk7XG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgaWYgKGNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHMgfHwgW10sIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSkpIHtcbiAgICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIGlzTWFpbnRlbmFuY2U6IHRydWUsXG4gICAgICB9KTtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbG9nID0gcmVxLmNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgIGxvZy5lcnJvcihcbiAgICAgIGBSZXF1ZXN0IHVzaW5nIG1haW50ZW5hbmNlIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYWludGVuYW5jZUtleUlwcycuYFxuICAgICk7XG4gIH1cblxuICBjb25zdCBtYXN0ZXJLZXkgPSBhd2FpdCByZXEuY29uZmlnLmxvYWRNYXN0ZXJLZXkoKTtcbiAgbGV0IGlzTWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IG1hc3RlcktleTtcblxuICBpZiAoaXNNYXN0ZXIgJiYgIWNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFzdGVyS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlKSkge1xuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYXN0ZXIga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21hc3RlcktleUlwcycuYFxuICAgICk7XG4gICAgaXNNYXN0ZXIgPSBmYWxzZTtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gYHVuYXV0aG9yaXplZGA7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIHZhciBpc1JlYWRPbmx5TWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXk7XG4gIGlmIChcbiAgICB0eXBlb2YgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAhPSAndW5kZWZpbmVkJyAmJlxuICAgIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgJiZcbiAgICBpc1JlYWRPbmx5TWFzdGVyXG4gICkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgICAgaXNSZWFkT25seTogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIC8vIENsaWVudCBrZXlzIGFyZSBub3QgcmVxdWlyZWQgaW4gcGFyc2Utc2VydmVyLCBidXQgaWYgYW55IGhhdmUgYmVlbiBjb25maWd1cmVkIGluIHRoZSBzZXJ2ZXIsIHZhbGlkYXRlIHRoZW1cbiAgLy8gIHRvIHByZXNlcnZlIG9yaWdpbmFsIGJlaGF2aW9yLlxuICBjb25zdCBrZXlzID0gWydjbGllbnRLZXknLCAnamF2YXNjcmlwdEtleScsICdkb3ROZXRLZXknLCAncmVzdEFQSUtleSddO1xuICBjb25zdCBvbmVLZXlDb25maWd1cmVkID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQ7XG4gIH0pO1xuICBjb25zdCBvbmVLZXlNYXRjaGVzID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQgJiYgaW5mb1trZXldID09PSByZXEuY29uZmlnW2tleV07XG4gIH0pO1xuXG4gIGlmIChvbmVLZXlDb25maWd1cmVkICYmICFvbmVLZXlNYXRjaGVzKSB7XG4gICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgfVxuXG4gIGlmIChyZXEudXJsID09ICcvbG9naW4nKSB7XG4gICAgZGVsZXRlIGluZm8uc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIHVzZXI6IHJlcS51c2VyRnJvbUpXVCxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIGlmICghaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgfSk7XG4gIH1cbiAgaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbn1cblxuY29uc3QgaGFuZGxlUmF0ZUxpbWl0ID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIGNvbnN0IHJhdGVMaW1pdHMgPSByZXEuY29uZmlnLnJhdGVMaW1pdHMgfHwgW107XG4gIHRyeSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByYXRlTGltaXRzLm1hcChhc3luYyBsaW1pdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGhFeHAgPSBuZXcgUmVnRXhwKGxpbWl0LnBhdGgpO1xuICAgICAgICBpZiAocGF0aEV4cC50ZXN0KHJlcS51cmwpKSB7XG4gICAgICAgICAgYXdhaXQgbGltaXQuaGFuZGxlcihyZXEsIHJlcywgZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJlZCB3aGVuIGF0dGVtcHRpbmcgdG8gYXBwbHkgdGhlIHJhdGUgbGltaXRlcjogJyxcbiAgICAgICAgICAgICAgICBlcnJcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJlcy5zdGF0dXMoNDI5KTtcbiAgICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZVBhcnNlU2Vzc2lvbiA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSByZXEuaW5mbztcbiAgICBpZiAocmVxLmF1dGggfHwgcmVxLnVybCA9PT0gJy9zZXNzaW9ucy9tZScpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcXVlc3RBdXRoID0gbnVsbDtcbiAgICBpZiAoXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbiAmJlxuICAgICAgcmVxLnVybCA9PT0gJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJyAmJlxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4uaW5kZXhPZigncjonKSAhPSAwXG4gICAgKSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJlcS5hdXRoID0gcmVxdWVzdEF1dGg7XG4gICAgbmV4dCgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gVE9ETzogRGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGVycm9yIHNjZW5hcmlvLlxuICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcignZXJyb3IgZ2V0dGluZyBhdXRoIGZvciBzZXNzaW9uVG9rZW4nLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVOS05PV05fRVJST1IsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0Q2xpZW50SXAocmVxKSB7XG4gIHJldHVybiByZXEuaXA7XG59XG5cbmZ1bmN0aW9uIGh0dHBBdXRoKHJlcSkge1xuICBpZiAoIShyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uKSB7IHJldHVybjsgfVxuXG4gIHZhciBoZWFkZXIgPSAocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbjtcbiAgdmFyIGFwcElkLCBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk7XG5cbiAgLy8gcGFyc2UgaGVhZGVyXG4gIHZhciBhdXRoUHJlZml4ID0gJ2Jhc2ljICc7XG5cbiAgdmFyIG1hdGNoID0gaGVhZGVyLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihhdXRoUHJlZml4KTtcblxuICBpZiAobWF0Y2ggPT0gMCkge1xuICAgIHZhciBlbmNvZGVkQXV0aCA9IGhlYWRlci5zdWJzdHJpbmcoYXV0aFByZWZpeC5sZW5ndGgsIGhlYWRlci5sZW5ndGgpO1xuICAgIHZhciBjcmVkZW50aWFscyA9IGRlY29kZUJhc2U2NChlbmNvZGVkQXV0aCkuc3BsaXQoJzonKTtcblxuICAgIGlmIChjcmVkZW50aWFscy5sZW5ndGggPT0gMikge1xuICAgICAgYXBwSWQgPSBjcmVkZW50aWFsc1swXTtcbiAgICAgIHZhciBrZXkgPSBjcmVkZW50aWFsc1sxXTtcblxuICAgICAgdmFyIGpzS2V5UHJlZml4ID0gJ2phdmFzY3JpcHQta2V5PSc7XG5cbiAgICAgIHZhciBtYXRjaEtleSA9IGtleS5pbmRleE9mKGpzS2V5UHJlZml4KTtcbiAgICAgIGlmIChtYXRjaEtleSA9PSAwKSB7XG4gICAgICAgIGphdmFzY3JpcHRLZXkgPSBrZXkuc3Vic3RyaW5nKGpzS2V5UHJlZml4Lmxlbmd0aCwga2V5Lmxlbmd0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXN0ZXJLZXkgPSBrZXk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgYXBwSWQ6IGFwcElkLCBtYXN0ZXJLZXk6IG1hc3RlcktleSwgamF2YXNjcmlwdEtleTogamF2YXNjcmlwdEtleSB9O1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjQoc3RyKSB7XG4gIHJldHVybiBCdWZmZXIuZnJvbShzdHIsICdiYXNlNjQnKS50b1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkge1xuICByZXR1cm4gKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCwgZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSkpO1xuICAgIGxldCBhbGxvd0hlYWRlcnMgPSBERUZBVUxUX0FMTE9XRURfSEVBREVSUztcbiAgICBpZiAoY29uZmlnICYmIGNvbmZpZy5hbGxvd0hlYWRlcnMpIHtcbiAgICAgIGFsbG93SGVhZGVycyArPSBgLCAke2NvbmZpZy5hbGxvd0hlYWRlcnMuam9pbignLCAnKX1gO1xuICAgIH1cblxuICAgIGNvbnN0IGJhc2VPcmlnaW5zID1cbiAgICAgIHR5cGVvZiBjb25maWc/LmFsbG93T3JpZ2luID09PSAnc3RyaW5nJyA/IFtjb25maWcuYWxsb3dPcmlnaW5dIDogY29uZmlnPy5hbGxvd09yaWdpbiA/PyBbJyonXTtcbiAgICBjb25zdCByZXF1ZXN0T3JpZ2luID0gcmVxLmhlYWRlcnMub3JpZ2luO1xuICAgIGNvbnN0IGFsbG93T3JpZ2lucyA9XG4gICAgICByZXF1ZXN0T3JpZ2luICYmIGJhc2VPcmlnaW5zLmluY2x1ZGVzKHJlcXVlc3RPcmlnaW4pID8gcmVxdWVzdE9yaWdpbiA6IGJhc2VPcmlnaW5zWzBdO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsIGFsbG93T3JpZ2lucyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcycsICdHRVQsUFVULFBPU1QsREVMRVRFLE9QVElPTlMnKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJywgYWxsb3dIZWFkZXJzKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1FeHBvc2UtSGVhZGVycycsICdYLVBhcnNlLUpvYi1TdGF0dXMtSWQsIFgtUGFyc2UtUHVzaC1TdGF0dXMtSWQnKTtcbiAgICAvLyBpbnRlcmNlcHQgT1BUSU9OUyBtZXRob2RcbiAgICBpZiAoJ09QVElPTlMnID09IHJlcS5tZXRob2QpIHtcbiAgICAgIHJlcy5zZW5kU3RhdHVzKDIwMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd01ldGhvZE92ZXJyaWRlKHJlcSwgcmVzLCBuZXh0KSB7XG4gIGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcgJiYgcmVxLmJvZHk/Ll9tZXRob2QpIHtcbiAgICByZXEub3JpZ2luYWxNZXRob2QgPSByZXEubWV0aG9kO1xuICAgIHJlcS5tZXRob2QgPSByZXEuYm9keS5fbWV0aG9kO1xuICAgIGRlbGV0ZSByZXEuYm9keS5fbWV0aG9kO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlRXJyb3JzKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgY29uc3QgbG9nID0gKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICBpZiAoZXJyIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICBpZiAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBuZXh0KGVycik7XG4gICAgfVxuICAgIGxldCBodHRwU3RhdHVzO1xuICAgIC8vIFRPRE86IGZpbGwgb3V0IHRoaXMgbWFwcGluZ1xuICAgIHN3aXRjaCAoZXJyLmNvZGUpIHtcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SOlxuICAgICAgICBodHRwU3RhdHVzID0gNTAwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwNDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBodHRwU3RhdHVzID0gNDAwO1xuICAgIH1cbiAgICByZXMuc3RhdHVzKGh0dHBTdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBsb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnIpO1xuICB9IGVsc2UgaWYgKGVyci5zdGF0dXMgJiYgZXJyLm1lc3NhZ2UpIHtcbiAgICByZXMuc3RhdHVzKGVyci5zdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyLCBlcnIuc3RhY2spO1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBtZXNzYWdlOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yLicsXG4gICAgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXEsIHJlcywgbmV4dCkge1xuICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWRcIn0nKTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxdWVzdCkge1xuICBpZiAoIXJlcXVlc3QuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSAndW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJztcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59XG5cbmV4cG9ydCBjb25zdCBhZGRSYXRlTGltaXQgPSAocm91dGUsIGNvbmZpZywgY2xvdWQpID0+IHtcbiAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uZmlnID0gQ29uZmlnLmdldChjb25maWcpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJvdXRlKSB7XG4gICAgaWYgKCFSYXRlTGltaXRPcHRpb25zW2tleV0pIHtcbiAgICAgIHRocm93IGBJbnZhbGlkIHJhdGUgbGltaXQgb3B0aW9uIFwiJHtrZXl9XCJgO1xuICAgIH1cbiAgfVxuICBpZiAoIWNvbmZpZy5yYXRlTGltaXRzKSB7XG4gICAgY29uZmlnLnJhdGVMaW1pdHMgPSBbXTtcbiAgfVxuICBjb25zdCByZWRpc1N0b3JlID0ge1xuICAgIGNvbm5lY3Rpb25Qcm9taXNlOiBQcm9taXNlLnJlc29sdmUoKSxcbiAgICBzdG9yZTogbnVsbCxcbiAgfTtcbiAgaWYgKHJvdXRlLnJlZGlzVXJsKSB7XG4gICAgY29uc3QgbG9nID0gY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgY29uc3QgY2xpZW50ID0gY3JlYXRlQ2xpZW50KHtcbiAgICAgIHVybDogcm91dGUucmVkaXNVcmwsXG4gICAgfSk7XG4gICAgY2xpZW50Lm9uKCdlcnJvcicsIGVyciA9PiB7IGxvZy5lcnJvcignTWlkZGxld2FyZXMgYWRkUmF0ZUxpbWl0IFJlZGlzIGNsaWVudCBlcnJvcicsIHsgZXJyb3I6IGVyciB9KSB9KTtcbiAgICBjbGllbnQub24oJ2Nvbm5lY3QnLCAoKSA9PiB7IH0pO1xuICAgIGNsaWVudC5vbigncmVjb25uZWN0aW5nJywgKCkgPT4geyB9KTtcbiAgICBjbGllbnQub24oJ3JlYWR5JywgKCkgPT4geyB9KTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlID0gYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKGNsaWVudC5pc09wZW4pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nLmVycm9yKGBDb3VsZCBub3QgY29ubmVjdCB0byByZWRpc1VSTCBpbiByYXRlIGxpbWl0OiAke2V9YCk7XG4gICAgICB9XG4gICAgfTtcbiAgICByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgcmVkaXNTdG9yZS5zdG9yZSA9IG5ldyBSZWRpc1N0b3JlKHtcbiAgICAgIHNlbmRDb21tYW5kOiBhc3luYyAoLi4uYXJncykgPT4ge1xuICAgICAgICBhd2FpdCByZWRpc1N0b3JlLmNvbm5lY3Rpb25Qcm9taXNlKCk7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2VuZENvbW1hbmQoYXJncyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIGxldCB0cmFuc2Zvcm1QYXRoID0gcm91dGUucmVxdWVzdFBhdGguc3BsaXQoJy8qJykuam9pbignLyguKiknKTtcbiAgaWYgKHRyYW5zZm9ybVBhdGggPT09ICcqJykge1xuICAgIHRyYW5zZm9ybVBhdGggPSAnKC4qKSc7XG4gIH1cbiAgY29uZmlnLnJhdGVMaW1pdHMucHVzaCh7XG4gICAgcGF0aDogcGF0aFRvUmVnZXhwKHRyYW5zZm9ybVBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiBhc3luYyByZXF1ZXN0ID0+IHtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLmdsb2JhbCkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0LmNvbmZpZy5hcHBJZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0b2tlbiA9IHJlcXVlc3QuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS5zZXNzaW9uICYmIHRva2VuKSB7XG4gICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyb3V0ZS56b25lID09PSBQYXJzZS5TZXJ2ZXIuUmF0ZUxpbWl0Wm9uZS51c2VyICYmIHRva2VuKSB7XG4gICAgICAgICAgaWYgKCFyZXF1ZXN0LmF1dGgpIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlUGFyc2VTZXNzaW9uKHJlcXVlc3QsIG51bGwsIHJlc29sdmUpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHJlcXVlc3QuYXV0aD8udXNlcj8uaWQgJiYgcmVxdWVzdC56b25lID09PSAndXNlcicpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0LmF1dGgudXNlci5pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICAgIHN0b3JlOiByZWRpc1N0b3JlLnN0b3JlLFxuICAgIH0pLFxuICAgIGNsb3VkLFxuICB9KTtcbiAgQ29uZmlnLnB1dChjb25maWcpO1xufTtcblxuLyoqXG4gKiBEZWR1cGxpY2F0ZXMgYSByZXF1ZXN0IHRvIGVuc3VyZSBpZGVtcG90ZW5jeS4gRHVwbGljYXRlcyBhcmUgZGV0ZXJtaW5lZCBieSB0aGUgcmVxdWVzdCBJRFxuICogaW4gdGhlIHJlcXVlc3QgaGVhZGVyLiBJZiBhIHJlcXVlc3QgaGFzIG5vIHJlcXVlc3QgSUQsIGl0IGlzIGV4ZWN1dGVkIGFueXdheS5cbiAqIEBwYXJhbSB7Kn0gcmVxIFRoZSByZXF1ZXN0IHRvIGV2YWx1YXRlLlxuICogQHJldHVybnMgUHJvbWlzZTx7fT5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeShyZXEpIHtcbiAgLy8gRW5hYmxlIGZlYXR1cmUgb25seSBmb3IgTW9uZ29EQlxuICBpZiAoXG4gICAgIShcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXIgfHxcbiAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UuYWRhcHRlciBpbnN0YW5jZW9mIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXJcbiAgICApXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBHZXQgcGFyYW1ldGVyc1xuICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICBjb25zdCByZXF1ZXN0SWQgPSAoKHJlcSB8fCB7fSkuaGVhZGVycyB8fCB7fSlbJ3gtcGFyc2UtcmVxdWVzdC1pZCddO1xuICBjb25zdCB7IHBhdGhzLCB0dGwgfSA9IGNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnM7XG4gIGlmICghcmVxdWVzdElkIHx8ICFjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJlcXVlc3QgcGF0aCBtYXkgY29udGFpbiB0cmFpbGluZyBzbGFzaGVzLCBkZXBlbmRpbmcgb24gdGhlIG9yaWdpbmFsIHJlcXVlc3QsIHNvIHJlbW92ZVxuICAvLyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIHRvIG1ha2UgaXQgZWFzaWVyIHRvIHNwZWNpZnkgcGF0aHMgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgcmVxUGF0aCA9IHJlcS5wYXRoLnJlcGxhY2UoL15cXC98XFwvJC8sICcnKTtcbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgaWRlbXBvdGVuY3kgaXMgZW5hYmxlZCBmb3IgY3VycmVudCByZXF1ZXN0IHBhdGhcbiAgbGV0IG1hdGNoID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuICAgIC8vIEFzc3VtZSBvbmUgd2FudHMgYSBwYXRoIHRvIGFsd2F5cyBtYXRjaCBmcm9tIHRoZSBiZWdpbm5pbmcgdG8gcHJldmVudCBhbnkgbWlzdGFrZXNcbiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0aC5jaGFyQXQoMCkgPT09ICdeJyA/IHBhdGggOiAnXicgKyBwYXRoKTtcbiAgICBpZiAocmVxUGF0aC5tYXRjaChyZWdleCkpIHtcbiAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFRyeSB0byBzdG9yZSByZXF1ZXN0XG4gIGNvbnN0IGV4cGlyeURhdGUgPSBuZXcgRGF0ZShuZXcgRGF0ZSgpLnNldFNlY29uZHMobmV3IERhdGUoKS5nZXRTZWNvbmRzKCkgKyB0dGwpKTtcbiAgcmV0dXJuIHJlc3RcbiAgICAuY3JlYXRlKGNvbmZpZywgYXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19JZGVtcG90ZW5jeScsIHtcbiAgICAgIHJlcUlkOiByZXF1ZXN0SWQsXG4gICAgICBleHBpcmU6IFBhcnNlLl9lbmNvZGUoZXhwaXJ5RGF0ZSksXG4gICAgfSlcbiAgICAuY2F0Y2goZSA9PiB7XG4gICAgICBpZiAoZS5jb2RlID09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1JFUVVFU1QsICdEdXBsaWNhdGUgcmVxdWVzdCcpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDMpO1xuICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkXCJ9Jyk7XG59XG5cbmZ1bmN0aW9uIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpIHtcbiAgcmVzLnN0YXR1cyg0MDApO1xuICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgZXJyb3I6ICdJbnZhbGlkIG9iamVjdCBmb3IgY29udGV4dC4nIH0pO1xufVxuXG4vKipcbiAqIEV4cHJlc3MgNCBhbGxvd2VkIGEgZG91YmxlIGZvcndhcmQgc2xhc2ggYmV0d2VlbiBhIHJvdXRlIGFuZCByb3V0ZXIuIEFsdGhvdWdoXG4gKiB0aGlzIHNob3VsZCBiZSBjb25zaWRlcmVkIGFuIGFudGktcGF0dGVybiwgd2UgbmVlZCB0byBzdXBwb3J0IGl0IGZvciBiYWNrd2FyZHNcbiAqIGNvbXBhdGliaWxpdHkuXG4gKlxuICogVGVjaG5pY2FsbHkgdmFsaWQgVVJMIHdpdGggZG91YmxlIGZvcm93YXJkIHNsYXNoOlxuICogaHR0cDovL2xvY2FsaG9zdDoxMzM3L3BhcnNlLy9mdW5jdGlvbnMvdGVzdEZ1bmN0aW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0RvdWJsZUZvcndhcmRTbGFzaChyZXEsIHJlcywgbmV4dCkge1xuICByZXEudXJsID0gcmVxLnVybC5zdGFydHNXaXRoKCcvLycpID8gcmVxLnVybC5zdWJzdHJpbmcoMSkgOiByZXEudXJsO1xuICBuZXh0KCk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNC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