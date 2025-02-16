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
        const log = config?.loggerController || _logger.default;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiREVGQVVMVF9BTExPV0VEX0hFQURFUlMiLCJleHBvcnRzIiwiZ2V0TW91bnRGb3JSZXF1ZXN0IiwicmVxIiwibW91bnRQYXRoTGVuZ3RoIiwib3JpZ2luYWxVcmwiLCJsZW5ndGgiLCJ1cmwiLCJtb3VudFBhdGgiLCJzbGljZSIsInByb3RvY29sIiwiZ2V0IiwiZ2V0QmxvY2tMaXN0IiwiaXBSYW5nZUxpc3QiLCJzdG9yZSIsImJsb2NrTGlzdCIsIkJsb2NrTGlzdCIsImZvckVhY2giLCJmdWxsSXAiLCJzZXQiLCJpcCIsIm1hc2siLCJzcGxpdCIsImFkZEFkZHJlc3MiLCJpc0lQdjQiLCJhZGRTdWJuZXQiLCJOdW1iZXIiLCJjaGVja0lwIiwiaW5jb21pbmdJcElzVjQiLCJyZXN1bHQiLCJjaGVjayIsImluY2x1ZGVzIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwicmVzIiwibmV4dCIsIm1vdW50IiwiY29udGV4dCIsIkpTT04iLCJwYXJzZSIsIk9iamVjdCIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJtYWludGVuYW5jZUtleUlwcyIsIm1haW50ZW5hbmNlS2V5SXBzU3RvcmUiLCJhdXRoIiwiQXV0aCIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkZWZhdWx0TG9nZ2VyIiwibG9hZE1hc3RlcktleSIsImlzTWFzdGVyIiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5SXBzU3RvcmUiLCJtZXNzYWdlIiwiaGFuZGxlUmF0ZUxpbWl0IiwiaXNSZWFkT25seU1hc3RlciIsInJlYWRPbmx5TWFzdGVyS2V5IiwiaXNSZWFkT25seSIsImtleXMiLCJvbmVLZXlDb25maWd1cmVkIiwic29tZSIsImtleSIsInVuZGVmaW5lZCIsIm9uZUtleU1hdGNoZXMiLCJ1c2VyRnJvbUpXVCIsInVzZXIiLCJyYXRlTGltaXRzIiwiUHJvbWlzZSIsImFsbCIsIm1hcCIsImxpbWl0IiwicGF0aEV4cCIsIlJlZ0V4cCIsInBhdGgiLCJ0ZXN0IiwiaGFuZGxlciIsImVyciIsIkNPTk5FQ1RJT05fRkFJTEVEIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwicmVxdWVzdEF1dGgiLCJpbmRleE9mIiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJVTktOT1dOX0VSUk9SIiwiYXV0aG9yaXphdGlvbiIsImhlYWRlciIsImF1dGhQcmVmaXgiLCJtYXRjaCIsInRvTG93ZXJDYXNlIiwiZW5jb2RlZEF1dGgiLCJzdWJzdHJpbmciLCJjcmVkZW50aWFscyIsImRlY29kZUJhc2U2NCIsImpzS2V5UHJlZml4IiwibWF0Y2hLZXkiLCJzdHIiLCJhbGxvd0Nyb3NzRG9tYWluIiwiYWxsb3dIZWFkZXJzIiwiam9pbiIsImJhc2VPcmlnaW5zIiwiYWxsb3dPcmlnaW4iLCJyZXF1ZXN0T3JpZ2luIiwib3JpZ2luIiwiYWxsb3dPcmlnaW5zIiwibWV0aG9kIiwic2VuZFN0YXR1cyIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJfbWV0aG9kIiwib3JpZ2luYWxNZXRob2QiLCJoYW5kbGVQYXJzZUVycm9ycyIsImVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIiLCJodHRwU3RhdHVzIiwiT0JKRUNUX05PVF9GT1VORCIsInByb2Nlc3MiLCJlbnYiLCJURVNUSU5HIiwic3RhY2siLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZW5kIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJyZXF1ZXN0IiwicmVzb2x2ZSIsImFkZFJhdGVMaW1pdCIsInJvdXRlIiwiY2xvdWQiLCJSYXRlTGltaXRPcHRpb25zIiwicmVkaXNTdG9yZSIsImNvbm5lY3Rpb25Qcm9taXNlIiwicmVkaXNVcmwiLCJjbGllbnQiLCJjcmVhdGVDbGllbnQiLCJpc09wZW4iLCJjb25uZWN0IiwiUmVkaXNTdG9yZSIsInNlbmRDb21tYW5kIiwiYXJncyIsInRyYW5zZm9ybVBhdGgiLCJyZXF1ZXN0UGF0aCIsInB1c2giLCJwYXRoVG9SZWdleHAiLCJyYXRlTGltaXQiLCJ3aW5kb3dNcyIsInJlcXVlc3RUaW1lV2luZG93IiwibWF4IiwicmVxdWVzdENvdW50IiwiZXJyb3JSZXNwb25zZU1lc3NhZ2UiLCJyZXNwb25zZSIsIm9wdGlvbnMiLCJza2lwIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsImlkIiwicHV0IiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiZGF0YWJhc2UiLCJhZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJyZXF1ZXN0SWQiLCJwYXRocyIsInR0bCIsImlkZW1wb3RlbmN5T3B0aW9ucyIsInJlcVBhdGgiLCJyZXBsYWNlIiwicmVnZXgiLCJjaGFyQXQiLCJleHBpcnlEYXRlIiwiRGF0ZSIsInNldFNlY29uZHMiLCJnZXRTZWNvbmRzIiwicmVzdCIsImNyZWF0ZSIsIm1hc3RlciIsInJlcUlkIiwiZXhwaXJlIiwiX2VuY29kZSIsImNhdGNoIiwiRFVQTElDQVRFX1ZBTFVFIiwiRFVQTElDQVRFX1JFUVVFU1QiLCJJTlZBTElEX0pTT04iXSwic291cmNlcyI6WyIuLi9zcmMvbWlkZGxld2FyZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IGF1dGggZnJvbSAnLi9BdXRoJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IENsaWVudFNESyBmcm9tICcuL0NsaWVudFNESyc7XG5pbXBvcnQgZGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuL3Jlc3QnO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHJhdGVMaW1pdCBmcm9tICdleHByZXNzLXJhdGUtbGltaXQnO1xuaW1wb3J0IHsgUmF0ZUxpbWl0T3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgeyBwYXRoVG9SZWdleHAgfSBmcm9tICdwYXRoLXRvLXJlZ2V4cCc7XG5pbXBvcnQgUmVkaXNTdG9yZSBmcm9tICdyYXRlLWxpbWl0LXJlZGlzJztcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJ3JlZGlzJztcbmltcG9ydCB7IEJsb2NrTGlzdCwgaXNJUHY0IH0gZnJvbSAnbmV0JztcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTID1cbiAgJ1gtUGFyc2UtTWFzdGVyLUtleSwgWC1QYXJzZS1SRVNULUFQSS1LZXksIFgtUGFyc2UtSmF2YXNjcmlwdC1LZXksIFgtUGFyc2UtQXBwbGljYXRpb24tSWQsIFgtUGFyc2UtQ2xpZW50LVZlcnNpb24sIFgtUGFyc2UtU2Vzc2lvbi1Ub2tlbiwgWC1SZXF1ZXN0ZWQtV2l0aCwgWC1QYXJzZS1SZXZvY2FibGUtU2Vzc2lvbiwgWC1QYXJzZS1SZXF1ZXN0LUlkLCBDb250ZW50LVR5cGUsIFByYWdtYSwgQ2FjaGUtQ29udHJvbCc7XG5cbmNvbnN0IGdldE1vdW50Rm9yUmVxdWVzdCA9IGZ1bmN0aW9uIChyZXEpIHtcbiAgY29uc3QgbW91bnRQYXRoTGVuZ3RoID0gcmVxLm9yaWdpbmFsVXJsLmxlbmd0aCAtIHJlcS51cmwubGVuZ3RoO1xuICBjb25zdCBtb3VudFBhdGggPSByZXEub3JpZ2luYWxVcmwuc2xpY2UoMCwgbW91bnRQYXRoTGVuZ3RoKTtcbiAgcmV0dXJuIHJlcS5wcm90b2NvbCArICc6Ly8nICsgcmVxLmdldCgnaG9zdCcpICsgbW91bnRQYXRoO1xufTtcblxuY29uc3QgZ2V0QmxvY2tMaXN0ID0gKGlwUmFuZ2VMaXN0LCBzdG9yZSkgPT4ge1xuICBpZiAoc3RvcmUuZ2V0KCdibG9ja0xpc3QnKSkgeyByZXR1cm4gc3RvcmUuZ2V0KCdibG9ja0xpc3QnKTsgfVxuICBjb25zdCBibG9ja0xpc3QgPSBuZXcgQmxvY2tMaXN0KCk7XG4gIGlwUmFuZ2VMaXN0LmZvckVhY2goZnVsbElwID0+IHtcbiAgICBpZiAoZnVsbElwID09PSAnOjovMCcgfHwgZnVsbElwID09PSAnOjonKSB7XG4gICAgICBzdG9yZS5zZXQoJ2FsbG93QWxsSXB2NicsIHRydWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZnVsbElwID09PSAnMC4wLjAuMC8wJyB8fCBmdWxsSXAgPT09ICcwLjAuMC4wJykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjQnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgW2lwLCBtYXNrXSA9IGZ1bGxJcC5zcGxpdCgnLycpO1xuICAgIGlmICghbWFzaykge1xuICAgICAgYmxvY2tMaXN0LmFkZEFkZHJlc3MoaXAsIGlzSVB2NChpcCkgPyAnaXB2NCcgOiAnaXB2NicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBibG9ja0xpc3QuYWRkU3VibmV0KGlwLCBOdW1iZXIobWFzayksIGlzSVB2NChpcCkgPyAnaXB2NCcgOiAnaXB2NicpO1xuICAgIH1cbiAgfSk7XG4gIHN0b3JlLnNldCgnYmxvY2tMaXN0JywgYmxvY2tMaXN0KTtcbiAgcmV0dXJuIGJsb2NrTGlzdDtcbn07XG5cbmV4cG9ydCBjb25zdCBjaGVja0lwID0gKGlwLCBpcFJhbmdlTGlzdCwgc3RvcmUpID0+IHtcbiAgY29uc3QgaW5jb21pbmdJcElzVjQgPSBpc0lQdjQoaXApO1xuICBjb25zdCBibG9ja0xpc3QgPSBnZXRCbG9ja0xpc3QoaXBSYW5nZUxpc3QsIHN0b3JlKTtcblxuICBpZiAoc3RvcmUuZ2V0KGlwKSkgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAoc3RvcmUuZ2V0KCdhbGxvd0FsbElwdjQnKSAmJiBpbmNvbWluZ0lwSXNWNCkgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAoc3RvcmUuZ2V0KCdhbGxvd0FsbElwdjYnKSAmJiAhaW5jb21pbmdJcElzVjQpIHsgcmV0dXJuIHRydWU7IH1cbiAgY29uc3QgcmVzdWx0ID0gYmxvY2tMaXN0LmNoZWNrKGlwLCBpbmNvbWluZ0lwSXNWNCA/ICdpcHY0JyA6ICdpcHY2Jyk7XG5cbiAgLy8gSWYgdGhlIGlwIGlzIGluIHRoZSBsaXN0LCB3ZSBzdG9yZSB0aGUgcmVzdWx0IGluIHRoZSBzdG9yZVxuICAvLyBzbyB3ZSBoYXZlIGEgb3B0aW1pemVkIHBhdGggZm9yIHRoZSBuZXh0IHJlcXVlc3RcbiAgaWYgKGlwUmFuZ2VMaXN0LmluY2x1ZGVzKGlwKSAmJiByZXN1bHQpIHtcbiAgICBzdG9yZS5zZXQoaXAsIHJlc3VsdCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8vIENoZWNrcyB0aGF0IHRoZSByZXF1ZXN0IGlzIGF1dGhvcml6ZWQgZm9yIHRoaXMgYXBwIGFuZCBjaGVja3MgdXNlclxuLy8gYXV0aCB0b28uXG4vLyBUaGUgYm9keXBhcnNlciBzaG91bGQgcnVuIGJlZm9yZSB0aGlzIG1pZGRsZXdhcmUuXG4vLyBBZGRzIGluZm8gdG8gdGhlIHJlcXVlc3Q6XG4vLyByZXEuY29uZmlnIC0gdGhlIENvbmZpZyBmb3IgdGhpcyBhcHBcbi8vIHJlcS5hdXRoIC0gdGhlIEF1dGggZm9yIHRoaXMgcmVxdWVzdFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVBhcnNlSGVhZGVycyhyZXEsIHJlcywgbmV4dCkge1xuICB2YXIgbW91bnQgPSBnZXRNb3VudEZvclJlcXVlc3QocmVxKTtcblxuICBsZXQgY29udGV4dCA9IHt9O1xuICBpZiAocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykgIT0gbnVsbCkge1xuICAgIHRyeSB7XG4gICAgICBjb250ZXh0ID0gSlNPTi5wYXJzZShyZXEuZ2V0KCdYLVBhcnNlLUNsb3VkLUNvbnRleHQnKSk7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG4gIHZhciBpbmZvID0ge1xuICAgIGFwcElkOiByZXEuZ2V0KCdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJyksXG4gICAgc2Vzc2lvblRva2VuOiByZXEuZ2V0KCdYLVBhcnNlLVNlc3Npb24tVG9rZW4nKSxcbiAgICBtYXN0ZXJLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtTWFzdGVyLUtleScpLFxuICAgIG1haW50ZW5hbmNlS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1haW50ZW5hbmNlLUtleScpLFxuICAgIGluc3RhbGxhdGlvbklkOiByZXEuZ2V0KCdYLVBhcnNlLUluc3RhbGxhdGlvbi1JZCcpLFxuICAgIGNsaWVudEtleTogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtS2V5JyksXG4gICAgamF2YXNjcmlwdEtleTogcmVxLmdldCgnWC1QYXJzZS1KYXZhc2NyaXB0LUtleScpLFxuICAgIGRvdE5ldEtleTogcmVxLmdldCgnWC1QYXJzZS1XaW5kb3dzLUtleScpLFxuICAgIHJlc3RBUElLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtUkVTVC1BUEktS2V5JyksXG4gICAgY2xpZW50VmVyc2lvbjogcmVxLmdldCgnWC1QYXJzZS1DbGllbnQtVmVyc2lvbicpLFxuICAgIGNvbnRleHQ6IGNvbnRleHQsXG4gIH07XG5cbiAgdmFyIGJhc2ljQXV0aCA9IGh0dHBBdXRoKHJlcSk7XG5cbiAgaWYgKGJhc2ljQXV0aCkge1xuICAgIHZhciBiYXNpY0F1dGhBcHBJZCA9IGJhc2ljQXV0aC5hcHBJZDtcbiAgICBpZiAoQXBwQ2FjaGUuZ2V0KGJhc2ljQXV0aEFwcElkKSkge1xuICAgICAgaW5mby5hcHBJZCA9IGJhc2ljQXV0aEFwcElkO1xuICAgICAgaW5mby5tYXN0ZXJLZXkgPSBiYXNpY0F1dGgubWFzdGVyS2V5IHx8IGluZm8ubWFzdGVyS2V5O1xuICAgICAgaW5mby5qYXZhc2NyaXB0S2V5ID0gYmFzaWNBdXRoLmphdmFzY3JpcHRLZXkgfHwgaW5mby5qYXZhc2NyaXB0S2V5O1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXEuYm9keSkge1xuICAgIC8vIFVuaXR5IFNESyBzZW5kcyBhIF9ub0JvZHkga2V5IHdoaWNoIG5lZWRzIHRvIGJlIHJlbW92ZWQuXG4gICAgLy8gVW5jbGVhciBhdCB0aGlzIHBvaW50IGlmIGFjdGlvbiBuZWVkcyB0byBiZSB0YWtlbi5cbiAgICBkZWxldGUgcmVxLmJvZHkuX25vQm9keTtcbiAgfVxuXG4gIHZhciBmaWxlVmlhSlNPTiA9IGZhbHNlO1xuXG4gIGlmICghaW5mby5hcHBJZCB8fCAhQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpKSB7XG4gICAgLy8gU2VlIGlmIHdlIGNhbiBmaW5kIHRoZSBhcHAgaWQgb24gdGhlIGJvZHkuXG4gICAgaWYgKHJlcS5ib2R5IGluc3RhbmNlb2YgQnVmZmVyKSB7XG4gICAgICAvLyBUaGUgb25seSBjaGFuY2UgdG8gZmluZCB0aGUgYXBwIGlkIGlzIGlmIHRoaXMgaXMgYSBmaWxlXG4gICAgICAvLyB1cGxvYWQgdGhhdCBhY3R1YWxseSBpcyBhIEpTT04gYm9keS4gU28gdHJ5IHRvIHBhcnNlIGl0LlxuICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzY1ODlcbiAgICAgIC8vIEl0IGlzIGFsc28gcG9zc2libGUgdGhhdCB0aGUgY2xpZW50IGlzIHRyeWluZyB0byB1cGxvYWQgYSBmaWxlIGJ1dCBmb3Jnb3RcbiAgICAgIC8vIHRvIHByb3ZpZGUgeC1wYXJzZS1hcHAtaWQgaW4gaGVhZGVyIGFuZCBwYXJzZSBhIGJpbmFyeSBmaWxlIHdpbGwgZmFpbFxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVxLmJvZHkgPSBKU09OLnBhcnNlKHJlcS5ib2R5KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgICAgIH1cbiAgICAgIGZpbGVWaWFKU09OID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocmVxLmJvZHkpIHtcbiAgICAgIGRlbGV0ZSByZXEuYm9keS5fUmV2b2NhYmxlU2Vzc2lvbjtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICByZXEuYm9keSAmJlxuICAgICAgcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQgJiZcbiAgICAgIEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkgJiZcbiAgICAgICghaW5mby5tYXN0ZXJLZXkgfHwgQXBwQ2FjaGUuZ2V0KHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkKS5tYXN0ZXJLZXkgPT09IGluZm8ubWFzdGVyS2V5KVxuICAgICkge1xuICAgICAgaW5mby5hcHBJZCA9IHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgaW5mby5qYXZhc2NyaXB0S2V5ID0gcmVxLmJvZHkuX0phdmFTY3JpcHRLZXkgfHwgJyc7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQ7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX0phdmFTY3JpcHRLZXk7XG4gICAgICAvLyBUT0RPOiB0ZXN0IHRoYXQgdGhlIFJFU1QgQVBJIGZvcm1hdHMgZ2VuZXJhdGVkIGJ5IHRoZSBvdGhlclxuICAgICAgLy8gU0RLcyBhcmUgaGFuZGxlZCBva1xuICAgICAgaWYgKHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uKSB7XG4gICAgICAgIGluZm8uY2xpZW50VmVyc2lvbiA9IHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NsaWVudFZlcnNpb247XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX0luc3RhbGxhdGlvbklkKSB7XG4gICAgICAgIGluZm8uaW5zdGFsbGF0aW9uSWQgPSByZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQ7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fSW5zdGFsbGF0aW9uSWQ7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX1Nlc3Npb25Ub2tlbikge1xuICAgICAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW47XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9NYXN0ZXJLZXkpIHtcbiAgICAgICAgaW5mby5tYXN0ZXJLZXkgPSByZXEuYm9keS5fTWFzdGVyS2V5O1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fY29udGV4dCkge1xuICAgICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgICAgICBpbmZvLmNvbnRleHQgPSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaW5mby5jb250ZXh0ID0gSlNPTi5wYXJzZShyZXEuYm9keS5fY29udGV4dCk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGluZm8uY29udGV4dCkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgICAgICAgIHRocm93ICdDb250ZXh0IGlzIG5vdCBhbiBvYmplY3QnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9jb250ZXh0O1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9Db250ZW50VHlwZSkge1xuICAgICAgICByZXEuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSByZXEuYm9keS5fQ29udGVudFR5cGU7XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fQ29udGVudFR5cGU7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZm8uc2Vzc2lvblRva2VuICYmIHR5cGVvZiBpbmZvLnNlc3Npb25Ub2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICBpbmZvLnNlc3Npb25Ub2tlbiA9IGluZm8uc2Vzc2lvblRva2VuLnRvU3RyaW5nKCk7XG4gIH1cblxuICBpZiAoaW5mby5jbGllbnRWZXJzaW9uKSB7XG4gICAgaW5mby5jbGllbnRTREsgPSBDbGllbnRTREsuZnJvbVN0cmluZyhpbmZvLmNsaWVudFZlcnNpb24pO1xuICB9XG5cbiAgaWYgKGZpbGVWaWFKU09OKSB7XG4gICAgcmVxLmZpbGVEYXRhID0gcmVxLmJvZHkuZmlsZURhdGE7XG4gICAgLy8gV2UgbmVlZCB0byByZXBvcHVsYXRlIHJlcS5ib2R5IHdpdGggYSBidWZmZXJcbiAgICB2YXIgYmFzZTY0ID0gcmVxLmJvZHkuYmFzZTY0O1xuICAgIHJlcS5ib2R5ID0gQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0Jyk7XG4gIH1cblxuICBjb25zdCBjbGllbnRJcCA9IGdldENsaWVudElwKHJlcSk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoaW5mby5hcHBJZCwgbW91bnQpO1xuICBpZiAoY29uZmlnLnN0YXRlICYmIGNvbmZpZy5zdGF0ZSAhPT0gJ29rJykge1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBlcnJvcjogYEludmFsaWQgc2VydmVyIHN0YXRlOiAke2NvbmZpZy5zdGF0ZX1gLFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGluZm8uYXBwID0gQXBwQ2FjaGUuZ2V0KGluZm8uYXBwSWQpO1xuICByZXEuY29uZmlnID0gY29uZmlnO1xuICByZXEuY29uZmlnLmhlYWRlcnMgPSByZXEuaGVhZGVycyB8fCB7fTtcbiAgcmVxLmNvbmZpZy5pcCA9IGNsaWVudElwO1xuICByZXEuaW5mbyA9IGluZm87XG5cbiAgY29uc3QgaXNNYWludGVuYW5jZSA9XG4gICAgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleSAmJiBpbmZvLm1haW50ZW5hbmNlS2V5ID09PSByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5O1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlmIChjaGVja0lwKGNsaWVudElwLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzU3RvcmUpKSB7XG4gICAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBpc01haW50ZW5hbmNlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYWludGVuYW5jZSBrZXkgcmVqZWN0ZWQgYXMgdGhlIHJlcXVlc3QgSVAgYWRkcmVzcyAnJHtjbGllbnRJcH0nIGlzIG5vdCBzZXQgaW4gUGFyc2UgU2VydmVyIG9wdGlvbiAnbWFpbnRlbmFuY2VLZXlJcHMnLmBcbiAgICApO1xuICB9XG5cbiAgY29uc3QgbWFzdGVyS2V5ID0gYXdhaXQgcmVxLmNvbmZpZy5sb2FkTWFzdGVyS2V5KCk7XG4gIGxldCBpc01hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSBtYXN0ZXJLZXk7XG5cbiAgaWYgKGlzTWFzdGVyICYmICFjaGVja0lwKGNsaWVudElwLCByZXEuY29uZmlnLm1hc3RlcktleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYXN0ZXJLZXlJcHNTdG9yZSkpIHtcbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFzdGVyIGtleSByZWplY3RlZCBhcyB0aGUgcmVxdWVzdCBJUCBhZGRyZXNzICcke2NsaWVudElwfScgaXMgbm90IHNldCBpbiBQYXJzZSBTZXJ2ZXIgb3B0aW9uICdtYXN0ZXJLZXlJcHMnLmBcbiAgICApO1xuICAgIGlzTWFzdGVyID0gZmFsc2U7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoKTtcbiAgICBlcnJvci5zdGF0dXMgPSA0MDM7XG4gICAgZXJyb3IubWVzc2FnZSA9IGB1bmF1dGhvcml6ZWRgO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICB2YXIgaXNSZWFkT25seU1hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5O1xuICBpZiAoXG4gICAgdHlwZW9mIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgIT0gJ3VuZGVmaW5lZCcgJiZcbiAgICByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICYmXG4gICAgaXNSZWFkT25seU1hc3RlclxuICApIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICAgIGlzUmVhZE9ubHk6IHRydWUsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICAvLyBDbGllbnQga2V5cyBhcmUgbm90IHJlcXVpcmVkIGluIHBhcnNlLXNlcnZlciwgYnV0IGlmIGFueSBoYXZlIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgc2VydmVyLCB2YWxpZGF0ZSB0aGVtXG4gIC8vICB0byBwcmVzZXJ2ZSBvcmlnaW5hbCBiZWhhdmlvci5cbiAgY29uc3Qga2V5cyA9IFsnY2xpZW50S2V5JywgJ2phdmFzY3JpcHRLZXknLCAnZG90TmV0S2V5JywgJ3Jlc3RBUElLZXknXTtcbiAgY29uc3Qgb25lS2V5Q29uZmlndXJlZCA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkO1xuICB9KTtcbiAgY29uc3Qgb25lS2V5TWF0Y2hlcyA9IGtleXMuc29tZShmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWdba2V5XSAhPT0gdW5kZWZpbmVkICYmIGluZm9ba2V5XSA9PT0gcmVxLmNvbmZpZ1trZXldO1xuICB9KTtcblxuICBpZiAob25lS2V5Q29uZmlndXJlZCAmJiAhb25lS2V5TWF0Y2hlcykge1xuICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gIH1cblxuICBpZiAocmVxLnVybCA9PSAnL2xvZ2luJykge1xuICAgIGRlbGV0ZSBpbmZvLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChyZXEudXNlckZyb21KV1QpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICB1c2VyOiByZXEudXNlckZyb21KV1QsXG4gICAgfSk7XG4gICAgcmV0dXJuIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG4gIH1cblxuICBpZiAoIWluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIH0pO1xuICB9XG4gIGhhbmRsZVJhdGVMaW1pdChyZXEsIHJlcywgbmV4dCk7XG59XG5cbmNvbnN0IGhhbmRsZVJhdGVMaW1pdCA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICBjb25zdCByYXRlTGltaXRzID0gcmVxLmNvbmZpZy5yYXRlTGltaXRzIHx8IFtdO1xuICB0cnkge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgcmF0ZUxpbWl0cy5tYXAoYXN5bmMgbGltaXQgPT4ge1xuICAgICAgICBjb25zdCBwYXRoRXhwID0gbmV3IFJlZ0V4cChsaW1pdC5wYXRoKTtcbiAgICAgICAgaWYgKHBhdGhFeHAudGVzdChyZXEudXJsKSkge1xuICAgICAgICAgIGF3YWl0IGxpbWl0LmhhbmRsZXIocmVxLCByZXMsIGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICAgICdBbiB1bmtub3duIGVycm9yIG9jY3VyZWQgd2hlbiBhdHRlbXB0aW5nIHRvIGFwcGx5IHRoZSByYXRlIGxpbWl0ZXI6ICcsXG4gICAgICAgICAgICAgICAgZXJyXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXMuc3RhdHVzKDQyOSk7XG4gICAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVQYXJzZVNlc3Npb24gPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBpbmZvID0gcmVxLmluZm87XG4gICAgaWYgKHJlcS5hdXRoIHx8IHJlcS51cmwgPT09ICcvc2Vzc2lvbnMvbWUnKSB7XG4gICAgICBuZXh0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCByZXF1ZXN0QXV0aCA9IG51bGw7XG4gICAgaWYgKFxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4gJiZcbiAgICAgIHJlcS51cmwgPT09ICcvdXBncmFkZVRvUmV2b2NhYmxlU2Vzc2lvbicgJiZcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuLmluZGV4T2YoJ3I6JykgIT0gMFxuICAgICkge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXEuYXV0aCA9IHJlcXVlc3RBdXRoO1xuICAgIG5leHQoKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIFRPRE86IERldGVybWluZSB0aGUgY29ycmVjdCBlcnJvciBzY2VuYXJpby5cbiAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYXV0aCBmb3Igc2Vzc2lvblRva2VuJywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VTktOT1dOX0VSUk9SLCBlcnJvcik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldENsaWVudElwKHJlcSkge1xuICByZXR1cm4gcmVxLmlwO1xufVxuXG5mdW5jdGlvbiBodHRwQXV0aChyZXEpIHtcbiAgaWYgKCEocmVxLnJlcSB8fCByZXEpLmhlYWRlcnMuYXV0aG9yaXphdGlvbikgeyByZXR1cm47IH1cblxuICB2YXIgaGVhZGVyID0gKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb247XG4gIHZhciBhcHBJZCwgbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5O1xuXG4gIC8vIHBhcnNlIGhlYWRlclxuICB2YXIgYXV0aFByZWZpeCA9ICdiYXNpYyAnO1xuXG4gIHZhciBtYXRjaCA9IGhlYWRlci50b0xvd2VyQ2FzZSgpLmluZGV4T2YoYXV0aFByZWZpeCk7XG5cbiAgaWYgKG1hdGNoID09IDApIHtcbiAgICB2YXIgZW5jb2RlZEF1dGggPSBoZWFkZXIuc3Vic3RyaW5nKGF1dGhQcmVmaXgubGVuZ3RoLCBoZWFkZXIubGVuZ3RoKTtcbiAgICB2YXIgY3JlZGVudGlhbHMgPSBkZWNvZGVCYXNlNjQoZW5jb2RlZEF1dGgpLnNwbGl0KCc6Jyk7XG5cbiAgICBpZiAoY3JlZGVudGlhbHMubGVuZ3RoID09IDIpIHtcbiAgICAgIGFwcElkID0gY3JlZGVudGlhbHNbMF07XG4gICAgICB2YXIga2V5ID0gY3JlZGVudGlhbHNbMV07XG5cbiAgICAgIHZhciBqc0tleVByZWZpeCA9ICdqYXZhc2NyaXB0LWtleT0nO1xuXG4gICAgICB2YXIgbWF0Y2hLZXkgPSBrZXkuaW5kZXhPZihqc0tleVByZWZpeCk7XG4gICAgICBpZiAobWF0Y2hLZXkgPT0gMCkge1xuICAgICAgICBqYXZhc2NyaXB0S2V5ID0ga2V5LnN1YnN0cmluZyhqc0tleVByZWZpeC5sZW5ndGgsIGtleS5sZW5ndGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWFzdGVyS2V5ID0ga2V5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGFwcElkOiBhcHBJZCwgbWFzdGVyS2V5OiBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk6IGphdmFzY3JpcHRLZXkgfTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzZTY0KHN0cikge1xuICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93Q3Jvc3NEb21haW4oYXBwSWQpIHtcbiAgcmV0dXJuIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoYXBwSWQsIGdldE1vdW50Rm9yUmVxdWVzdChyZXEpKTtcbiAgICBsZXQgYWxsb3dIZWFkZXJzID0gREVGQVVMVF9BTExPV0VEX0hFQURFUlM7XG4gICAgaWYgKGNvbmZpZyAmJiBjb25maWcuYWxsb3dIZWFkZXJzKSB7XG4gICAgICBhbGxvd0hlYWRlcnMgKz0gYCwgJHtjb25maWcuYWxsb3dIZWFkZXJzLmpvaW4oJywgJyl9YDtcbiAgICB9XG5cbiAgICBjb25zdCBiYXNlT3JpZ2lucyA9XG4gICAgICB0eXBlb2YgY29uZmlnPy5hbGxvd09yaWdpbiA9PT0gJ3N0cmluZycgPyBbY29uZmlnLmFsbG93T3JpZ2luXSA6IGNvbmZpZz8uYWxsb3dPcmlnaW4gPz8gWycqJ107XG4gICAgY29uc3QgcmVxdWVzdE9yaWdpbiA9IHJlcS5oZWFkZXJzLm9yaWdpbjtcbiAgICBjb25zdCBhbGxvd09yaWdpbnMgPVxuICAgICAgcmVxdWVzdE9yaWdpbiAmJiBiYXNlT3JpZ2lucy5pbmNsdWRlcyhyZXF1ZXN0T3JpZ2luKSA/IHJlcXVlc3RPcmlnaW4gOiBiYXNlT3JpZ2luc1swXTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCBhbGxvd09yaWdpbnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULFBVVCxQT1NULERFTEVURSxPUFRJT05TJyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsIGFsbG93SGVhZGVycyk7XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtRXhwb3NlLUhlYWRlcnMnLCAnWC1QYXJzZS1Kb2ItU3RhdHVzLUlkLCBYLVBhcnNlLVB1c2gtU3RhdHVzLUlkJyk7XG4gICAgLy8gaW50ZXJjZXB0IE9QVElPTlMgbWV0aG9kXG4gICAgaWYgKCdPUFRJT05TJyA9PSByZXEubWV0aG9kKSB7XG4gICAgICByZXMuc2VuZFN0YXR1cygyMDApO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0KCk7XG4gICAgfVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWxsb3dNZXRob2RPdmVycmlkZShyZXEsIHJlcywgbmV4dCkge1xuICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnICYmIHJlcS5ib2R5Ll9tZXRob2QpIHtcbiAgICByZXEub3JpZ2luYWxNZXRob2QgPSByZXEubWV0aG9kO1xuICAgIHJlcS5tZXRob2QgPSByZXEuYm9keS5fbWV0aG9kO1xuICAgIGRlbGV0ZSByZXEuYm9keS5fbWV0aG9kO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVBhcnNlRXJyb3JzKGVyciwgcmVxLCByZXMsIG5leHQpIHtcbiAgY29uc3QgbG9nID0gKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyKSB8fCBkZWZhdWx0TG9nZ2VyO1xuICBpZiAoZXJyIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICBpZiAocmVxLmNvbmZpZyAmJiByZXEuY29uZmlnLmVuYWJsZUV4cHJlc3NFcnJvckhhbmRsZXIpIHtcbiAgICAgIHJldHVybiBuZXh0KGVycik7XG4gICAgfVxuICAgIGxldCBodHRwU3RhdHVzO1xuICAgIC8vIFRPRE86IGZpbGwgb3V0IHRoaXMgbWFwcGluZ1xuICAgIHN3aXRjaCAoZXJyLmNvZGUpIHtcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SOlxuICAgICAgICBodHRwU3RhdHVzID0gNTAwO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwNDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBodHRwU3RhdHVzID0gNDAwO1xuICAgIH1cbiAgICByZXMuc3RhdHVzKGh0dHBTdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBsb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnIpO1xuICB9IGVsc2UgaWYgKGVyci5zdGF0dXMgJiYgZXJyLm1lc3NhZ2UpIHtcbiAgICByZXMuc3RhdHVzKGVyci5zdGF0dXMpO1xuICAgIHJlcy5qc29uKHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyLCBlcnIuc3RhY2spO1xuICAgIHJlcy5zdGF0dXMoNTAwKTtcbiAgICByZXMuanNvbih7XG4gICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICBtZXNzYWdlOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yLicsXG4gICAgfSk7XG4gICAgaWYgKCEocHJvY2VzcyAmJiBwcm9jZXNzLmVudi5URVNUSU5HKSkge1xuICAgICAgbmV4dChlcnIpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5mb3JjZU1hc3RlcktleUFjY2VzcyhyZXEsIHJlcywgbmV4dCkge1xuICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVzLnN0YXR1cyg0MDMpO1xuICAgIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWQ6IG1hc3RlciBrZXkgaXMgcmVxdWlyZWRcIn0nKTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxdWVzdCkge1xuICBpZiAoIXJlcXVlc3QuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSAndW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJztcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59XG5cbmV4cG9ydCBjb25zdCBhZGRSYXRlTGltaXQgPSAocm91dGUsIGNvbmZpZywgY2xvdWQpID0+IHtcbiAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uZmlnID0gQ29uZmlnLmdldChjb25maWcpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJvdXRlKSB7XG4gICAgaWYgKCFSYXRlTGltaXRPcHRpb25zW2tleV0pIHtcbiAgICAgIHRocm93IGBJbnZhbGlkIHJhdGUgbGltaXQgb3B0aW9uIFwiJHtrZXl9XCJgO1xuICAgIH1cbiAgfVxuICBpZiAoIWNvbmZpZy5yYXRlTGltaXRzKSB7XG4gICAgY29uZmlnLnJhdGVMaW1pdHMgPSBbXTtcbiAgfVxuICBjb25zdCByZWRpc1N0b3JlID0ge1xuICAgIGNvbm5lY3Rpb25Qcm9taXNlOiBQcm9taXNlLnJlc29sdmUoKSxcbiAgICBzdG9yZTogbnVsbCxcbiAgfTtcbiAgaWYgKHJvdXRlLnJlZGlzVXJsKSB7XG4gICAgY29uc3QgY2xpZW50ID0gY3JlYXRlQ2xpZW50KHtcbiAgICAgIHVybDogcm91dGUucmVkaXNVcmwsXG4gICAgfSk7XG4gICAgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSA9IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChjbGllbnQuaXNPcGVuKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGxvZyA9IGNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgICAgICBsb2cuZXJyb3IoYENvdWxkIG5vdCBjb25uZWN0IHRvIHJlZGlzVVJMIGluIHJhdGUgbGltaXQ6ICR7ZX1gKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICByZWRpc1N0b3JlLnN0b3JlID0gbmV3IFJlZGlzU3RvcmUoe1xuICAgICAgc2VuZENvbW1hbmQ6IGFzeW5jICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGF3YWl0IHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZW5kQ29tbWFuZChhcmdzKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cbiAgbGV0IHRyYW5zZm9ybVBhdGggPSByb3V0ZS5yZXF1ZXN0UGF0aC5zcGxpdCgnLyonKS5qb2luKCcvKC4qKScpO1xuICBpZiAodHJhbnNmb3JtUGF0aCA9PT0gJyonKSB7XG4gICAgdHJhbnNmb3JtUGF0aCA9ICcoLiopJztcbiAgfVxuICBjb25maWcucmF0ZUxpbWl0cy5wdXNoKHtcbiAgICBwYXRoOiBwYXRoVG9SZWdleHAodHJhbnNmb3JtUGF0aCksXG4gICAgaGFuZGxlcjogcmF0ZUxpbWl0KHtcbiAgICAgIHdpbmRvd01zOiByb3V0ZS5yZXF1ZXN0VGltZVdpbmRvdyxcbiAgICAgIG1heDogcm91dGUucmVxdWVzdENvdW50LFxuICAgICAgbWVzc2FnZTogcm91dGUuZXJyb3JSZXNwb25zZU1lc3NhZ2UgfHwgUmF0ZUxpbWl0T3B0aW9ucy5lcnJvclJlc3BvbnNlTWVzc2FnZS5kZWZhdWx0LFxuICAgICAgaGFuZGxlcjogKHJlcXVlc3QsIHJlc3BvbnNlLCBuZXh0LCBvcHRpb25zKSA9PiB7XG4gICAgICAgIHRocm93IHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLm1lc3NhZ2UsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgc2tpcDogcmVxdWVzdCA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LmlwID09PSAnMTI3LjAuMC4xJyAmJiAhcm91dGUuaW5jbHVkZUludGVybmFsUmVxdWVzdHMpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUuaW5jbHVkZU1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUucmVxdWVzdE1ldGhvZHMpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyb3V0ZS5yZXF1ZXN0TWV0aG9kcykpIHtcbiAgICAgICAgICAgIGlmICghcm91dGUucmVxdWVzdE1ldGhvZHMuaW5jbHVkZXMocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKHJvdXRlLnJlcXVlc3RNZXRob2RzKTtcbiAgICAgICAgICAgIGlmICghcmVnRXhwLnRlc3QocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5hdXRoPy5pc01hc3RlcjtcbiAgICAgIH0sXG4gICAgICBrZXlHZW5lcmF0b3I6IGFzeW5jIHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocm91dGUuem9uZSA9PT0gUGFyc2UuU2VydmVyLlJhdGVMaW1pdFpvbmUuZ2xvYmFsKSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmFwcElkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRva2VuID0gcmVxdWVzdC5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnNlc3Npb24gJiYgdG9rZW4pIHtcbiAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnVzZXIgJiYgdG9rZW4pIHtcbiAgICAgICAgICBpZiAoIXJlcXVlc3QuYXV0aCkge1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBoYW5kbGVQYXJzZVNlc3Npb24ocmVxdWVzdCwgbnVsbCwgcmVzb2x2ZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVxdWVzdC5hdXRoPy51c2VyPy5pZCAmJiByZXF1ZXN0LnpvbmUgPT09ICd1c2VyJykge1xuICAgICAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aC51c2VyLmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5jb25maWcuaXA7XG4gICAgICB9LFxuICAgICAgc3RvcmU6IHJlZGlzU3RvcmUuc3RvcmUsXG4gICAgfSksXG4gICAgY2xvdWQsXG4gIH0pO1xuICBDb25maWcucHV0KGNvbmZpZyk7XG59O1xuXG4vKipcbiAqIERlZHVwbGljYXRlcyBhIHJlcXVlc3QgdG8gZW5zdXJlIGlkZW1wb3RlbmN5LiBEdXBsaWNhdGVzIGFyZSBkZXRlcm1pbmVkIGJ5IHRoZSByZXF1ZXN0IElEXG4gKiBpbiB0aGUgcmVxdWVzdCBoZWFkZXIuIElmIGEgcmVxdWVzdCBoYXMgbm8gcmVxdWVzdCBJRCwgaXQgaXMgZXhlY3V0ZWQgYW55d2F5LlxuICogQHBhcmFtIHsqfSByZXEgVGhlIHJlcXVlc3QgdG8gZXZhbHVhdGUuXG4gKiBAcmV0dXJucyBQcm9taXNlPHt9PlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5KHJlcSkge1xuICAvLyBFbmFibGUgZmVhdHVyZSBvbmx5IGZvciBNb25nb0RCXG4gIGlmIChcbiAgICAhKFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlciB8fFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlclxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIEdldCBwYXJhbWV0ZXJzXG4gIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gIGNvbnN0IHJlcXVlc3RJZCA9ICgocmVxIHx8IHt9KS5oZWFkZXJzIHx8IHt9KVsneC1wYXJzZS1yZXF1ZXN0LWlkJ107XG4gIGNvbnN0IHsgcGF0aHMsIHR0bCB9ID0gY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgaWYgKCFyZXF1ZXN0SWQgfHwgIWNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUmVxdWVzdCBwYXRoIG1heSBjb250YWluIHRyYWlsaW5nIHNsYXNoZXMsIGRlcGVuZGluZyBvbiB0aGUgb3JpZ2luYWwgcmVxdWVzdCwgc28gcmVtb3ZlXG4gIC8vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgdG8gbWFrZSBpdCBlYXNpZXIgdG8gc3BlY2lmeSBwYXRocyBpbiB0aGUgY29uZmlndXJhdGlvblxuICBjb25zdCByZXFQYXRoID0gcmVxLnBhdGgucmVwbGFjZSgvXlxcL3xcXC8kLywgJycpO1xuICAvLyBEZXRlcm1pbmUgd2hldGhlciBpZGVtcG90ZW5jeSBpcyBlbmFibGVkIGZvciBjdXJyZW50IHJlcXVlc3QgcGF0aFxuICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgZm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG4gICAgLy8gQXNzdW1lIG9uZSB3YW50cyBhIHBhdGggdG8gYWx3YXlzIG1hdGNoIGZyb20gdGhlIGJlZ2lubmluZyB0byBwcmV2ZW50IGFueSBtaXN0YWtlc1xuICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXRoLmNoYXJBdCgwKSA9PT0gJ14nID8gcGF0aCA6ICdeJyArIHBhdGgpO1xuICAgIGlmIChyZXFQYXRoLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVHJ5IHRvIHN0b3JlIHJlcXVlc3RcbiAgY29uc3QgZXhwaXJ5RGF0ZSA9IG5ldyBEYXRlKG5ldyBEYXRlKCkuc2V0U2Vjb25kcyhuZXcgRGF0ZSgpLmdldFNlY29uZHMoKSArIHR0bCkpO1xuICByZXR1cm4gcmVzdFxuICAgIC5jcmVhdGUoY29uZmlnLCBhdXRoLm1hc3Rlcihjb25maWcpLCAnX0lkZW1wb3RlbmN5Jywge1xuICAgICAgcmVxSWQ6IHJlcXVlc3RJZCxcbiAgICAgIGV4cGlyZTogUGFyc2UuX2VuY29kZShleHBpcnlEYXRlKSxcbiAgICB9KVxuICAgIC5jYXRjaChlID0+IHtcbiAgICAgIGlmIChlLmNvZGUgPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfUkVRVUVTVCwgJ0R1cGxpY2F0ZSByZXF1ZXN0Jyk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMyk7XG4gIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWRcIn0nKTtcbn1cblxuZnVuY3Rpb24gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMCk7XG4gIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBlcnJvcjogJ0ludmFsaWQgb2JqZWN0IGZvciBjb250ZXh0LicgfSk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLE1BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLFVBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUSx1QkFBQSxHQUFBVCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVMsaUJBQUEsR0FBQVYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFVLFlBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLGFBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLGVBQUEsR0FBQWIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFhLE1BQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLElBQUEsR0FBQWQsT0FBQTtBQUF3QyxTQUFBRCx1QkFBQWdCLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFFakMsTUFBTUcsdUJBQXVCLEdBQUFDLE9BQUEsQ0FBQUQsdUJBQUEsR0FDbEMsK09BQStPO0FBRWpQLE1BQU1FLGtCQUFrQixHQUFHLFNBQUFBLENBQVVDLEdBQUcsRUFBRTtFQUN4QyxNQUFNQyxlQUFlLEdBQUdELEdBQUcsQ0FBQ0UsV0FBVyxDQUFDQyxNQUFNLEdBQUdILEdBQUcsQ0FBQ0ks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