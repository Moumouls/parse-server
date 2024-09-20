"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = void 0;
exports._unregisterAll = _unregisterAll;
exports.addConnectTrigger = addConnectTrigger;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.addTrigger = addTrigger;
exports.getClassName = getClassName;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getRequestFileObject = getRequestFileObject;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.getTrigger = getTrigger;
exports.getValidator = getValidator;
exports.inflate = inflate;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunGlobalConfigTrigger = maybeRunGlobalConfigTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.maybeRunValidator = maybeRunValidator;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports.resolveError = resolveError;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.runTrigger = runTrigger;
exports.toJSONwithObjects = toJSONwithObjects;
exports.triggerExists = triggerExists;
var _node = _interopRequireDefault(require("parse/node"));
var _logger = require("./logger");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // triggers.js
const Types = exports.Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
const ConnectClassName = '@Connect';
const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  const Functions = {};
  const Jobs = {};
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  return Object.freeze({
    Functions,
    Jobs,
    Validators,
    Triggers,
    LiveQuery
  });
};
function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  if (parseClass && parseClass.name) {
    return parseClass.name.replace('Parse', '@');
  }
  return parseClass;
}
function validateClassNameForTriggers(className, type) {
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }
  if ((type === Types.beforeLogin || type === Types.afterLogin) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin and afterLogin triggers';
  }
  if (type === Types.afterLogout && className !== '_Session') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }
  if (className === '_Session' && type !== Types.afterLogout) {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }
  return className;
}
const _triggerStore = {};
const Category = {
  Functions: 'Functions',
  Validators: 'Validators',
  Jobs: 'Jobs',
  Triggers: 'Triggers'
};
function getStore(category, name, applicationId) {
  const invalidNameRegex = /['"`]/;
  if (invalidNameRegex.test(name)) {
    // Prevent a malicious user from injecting properties into the store
    return {};
  }
  const path = name.split('.');
  path.splice(-1); // remove last component
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];
  for (const component of path) {
    store = store[component];
    if (!store) {
      return {};
    }
  }
  return store;
}
function add(category, name, handler, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  if (store[lastComponent]) {
    _logger.logger.warn(`Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`);
  }
  store[lastComponent] = handler;
}
function remove(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  delete store[lastComponent];
}
function get(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  return store[lastComponent];
}
function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}
function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}
function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}
function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}
function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}
function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}
function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}
function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}
function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }
  const toJSON = object.toJSON();
  const stateController = _node.default.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(object._getStateIdentifier());
  for (const key in pending) {
    const val = object.get(key);
    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }
    toJSON[key] = val._toFullJSON();
  }
  if (className) {
    toJSON.className = className;
  }
  return toJSON;
}
function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}
async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }
  await maybeRunValidator(request, name, auth);
  if (request.skipWithMasterKey) {
    return;
  }
  return await trigger(request);
}
function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}
function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}
function getFunctionNames(applicationId) {
  const store = _triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions] || {};
  const functionNames = [];
  const extractFunctionNames = (namespace, store) => {
    Object.keys(store).forEach(name => {
      const value = store[name];
      if (namespace) {
        name = `${namespace}.${name}`;
      }
      if (typeof value === 'function') {
        functionNames.push(name);
      } else {
        extractFunctionNames(name, value);
      }
    });
  };
  extractFunctionNames(null, store);
  return functionNames;
}
function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}
function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs;
  }
  return undefined;
}
function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}
function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    config
  };
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.beforeLogin || triggerType === Types.afterLogin || triggerType === Types.afterFind) {
    // Set a copy of the context on the request object.
    request.context = Object.assign({}, context);
  }
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip,
    context: context || {},
    config
  };
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
function getResponseObject(request, resolve, reject) {
  return {
    success: function (response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }
        response = response.map(object => {
          return toJSONwithObjects(object);
        });
        return resolve(response);
      }
      // Use the JSON response
      if (response && typeof response === 'object' && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }
      if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
        return resolve(response);
      }
      if (request.triggerName === Types.afterSave) {
        return resolve();
      }
      response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
        response['object']['objectId'] = request.object.id;
      }
      return resolve(response);
    },
    error: function (error) {
      const e = resolveError(error, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.'
      });
      reject(e);
    }
  };
}
function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}
function logTriggerAfterHook(triggerType, className, input, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerErrorBeforeHook(triggerType, className, input, auth, error, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
    className,
    triggerType,
    error,
    user: userIdForLog(auth)
  });
}
function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config, query, context) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    const request = getRequestObject(triggerType, auth, null, null, config, context);
    if (query) {
      request.query = query;
    }
    const {
      success,
      error
    } = getResponseObject(request, object => {
      resolve(object);
    }, error => {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth, config.logLevels.triggerBeforeSuccess);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node.default.Object.fromJSON(object);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }
      const response = trigger(request);
      if (response && typeof response.then === 'function') {
        return response.then(results => {
          return results;
        });
      }
      return response;
    }).then(success, error);
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth, config.logLevels.triggerAfter);
    return results;
  });
}
function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, context, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }
  const json = Object.assign({}, restOptions);
  json.where = restWhere;
  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(json);
  let count = false;
  if (restOptions) {
    count = !!restOptions.count;
  }
  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, context, isGet);
  return Promise.resolve().then(() => {
    return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
  }).then(() => {
    if (requestObject.skipWithMasterKey) {
      return requestObject.query;
    }
    return trigger(requestObject);
  }).then(result => {
    let queryResult = parseQuery;
    if (result && result instanceof _node.default.Query) {
      queryResult = result;
    }
    const jsonQuery = queryResult.toJSON();
    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }
    if (jsonQuery.limit) {
      restOptions = restOptions || {};
      restOptions.limit = jsonQuery.limit;
    }
    if (jsonQuery.skip) {
      restOptions = restOptions || {};
      restOptions.skip = jsonQuery.skip;
    }
    if (jsonQuery.include) {
      restOptions = restOptions || {};
      restOptions.include = jsonQuery.include;
    }
    if (jsonQuery.excludeKeys) {
      restOptions = restOptions || {};
      restOptions.excludeKeys = jsonQuery.excludeKeys;
    }
    if (jsonQuery.explain) {
      restOptions = restOptions || {};
      restOptions.explain = jsonQuery.explain;
    }
    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }
    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }
    if (jsonQuery.hint) {
      restOptions = restOptions || {};
      restOptions.hint = jsonQuery.hint;
    }
    if (jsonQuery.comment) {
      restOptions = restOptions || {};
      restOptions.comment = jsonQuery.comment;
    }
    if (requestObject.readPreference) {
      restOptions = restOptions || {};
      restOptions.readPreference = requestObject.readPreference;
    }
    if (requestObject.includeReadPreference) {
      restOptions = restOptions || {};
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }
    if (requestObject.subqueryReadPreference) {
      restOptions = restOptions || {};
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }
    return {
      restWhere,
      restOptions
    };
  }, err => {
    const error = resolveError(err, {
      code: _node.default.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.'
    });
    throw error;
  });
}
function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }
  if (!message) {
    return new _node.default.Error(defaultOpts.code || _node.default.Error.SCRIPT_FAILED, defaultOpts.message || 'Script failed.');
  }
  if (message instanceof _node.default.Error) {
    return message;
  }
  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }
  const error = new _node.default.Error(code, message.message || message);
  if (message instanceof Error) {
    error.stack = message.stack;
  }
  return error;
}
function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, _node.default.applicationId);
  if (!theValidator) {
    return;
  }
  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }
  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request, auth) : theValidator(request);
    }).then(() => {
      resolve();
    }).catch(e => {
      const error = resolveError(e, {
        code: _node.default.Error.VALIDATION_ERROR,
        message: 'Validation failed.'
      });
      reject(error);
    });
  });
}
async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }
  let reqUser = request.user;
  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }
  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }
  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }
  let params = request.params || {};
  if (request.object) {
    params = request.object.toJSON();
  }
  const requiredParam = key => {
    const value = params[key];
    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };
  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;
    if (typeof opts === 'function') {
      try {
        const result = await opts(val);
        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
        throw opt.error || e.message || e;
      }
      return;
    }
    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }
    if (!opts.includes(val)) {
      throw opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`;
    }
  };
  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };
  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    const optionPromises = [];
    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];
      if (typeof opt === 'string') {
        requiredParam(opt);
      }
      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;
          if (request.object) {
            request.object.set(key, val);
          }
        }
        if (opt.constant && request.object) {
          if (request.original) {
            request.object.revert(key);
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }
        if (opt.required) {
          requiredParam(key);
        }
        const optional = !opt.required && val === undefined;
        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;
            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }
          if (opt.options) {
            optionPromises.push(validateOptions(opt, key, val));
          }
        }
      }
    }
    await Promise.all(optionPromises);
  }
  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }
  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }
  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }
  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);
  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }
  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }
  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));
    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }
  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
      }
    }
  }
  const userKeys = options.requireUserKeys || [];
  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }
      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    const optionPromises = [];
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];
      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }
    await Promise.all(optionPromises);
  }
}

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions
function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config, context) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth, triggerType.startsWith('after') ? config.logLevels.triggerAfter : config.logLevels.triggerBeforeSuccess);
      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }
      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error, config.logLevels.triggerBeforeError);
      reject(error);
    });

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }
      const promise = trigger(request);
      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth, config.logLevels.triggerAfter);
      }
      // beforeSave is expected to return null (nothing)
      if (triggerType === Types.beforeSave) {
        if (promise && typeof promise.then === 'function') {
          return promise.then(response => {
            // response.object may come from express routing before hook
            if (response && response.object) {
              return response;
            }
            return null;
          });
        }
        return null;
      }
      return promise;
    }).then(success, error);
  });
}

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {
    className: data
  };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node.default.Object.fromJSON(copy);
}
function runLiveQueryEventHandlers(data, applicationId = _node.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}
function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = _objectSpread(_objectSpread({}, fileObject), {}, {
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    config
  });
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const FileClassName = getClassName(_node.default.File);
  const fileTrigger = getTrigger(FileClassName, triggerType, config.applicationId);
  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
      if (request.skipWithMasterKey) {
        return fileObject;
      }
      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return fileObject;
}
async function maybeRunGlobalConfigTrigger(triggerType, auth, configObject, originalConfigObject, config, context) {
  const GlobalConfigClassName = getClassName(_node.default.Config);
  const configTrigger = getTrigger(GlobalConfigClassName, triggerType, config.applicationId);
  if (typeof configTrigger === 'function') {
    try {
      const request = getRequestObject(triggerType, auth, configObject, originalConfigObject, config, context);
      await maybeRunValidator(request, `${triggerType}.${GlobalConfigClassName}`, auth);
      if (request.skipWithMasterKey) {
        return configObject;
      }
      const result = await configTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.Config', configObject, result, auth, config.logLevels.triggerBeforeSuccess);
      return result || configObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.Config', configObject, auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return configObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJUeXBlcyIsImV4cG9ydHMiLCJiZWZvcmVMb2dpbiIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImJlZm9yZVNhdmUiLCJhZnRlclNhdmUiLCJiZWZvcmVEZWxldGUiLCJhZnRlckRlbGV0ZSIsImJlZm9yZUZpbmQiLCJhZnRlckZpbmQiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkNvbm5lY3RDbGFzc05hbWUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJpbnZhbGlkTmFtZVJlZ2V4IiwidGVzdCIsInBhdGgiLCJzcGxpdCIsInNwbGljZSIsIlBhcnNlIiwic3RvcmUiLCJjb21wb25lbnQiLCJhZGQiLCJoYW5kbGVyIiwibGFzdENvbXBvbmVudCIsImxvZ2dlciIsIndhcm4iLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInJlbW92ZUZ1bmN0aW9uIiwicmVtb3ZlVHJpZ2dlciIsIl91bnJlZ2lzdGVyQWxsIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsInRyaWdnZXJFeGlzdHMiLCJ1bmRlZmluZWQiLCJnZXRGdW5jdGlvbiIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzIiwiZXh0cmFjdEZ1bmN0aW9uTmFtZXMiLCJuYW1lc3BhY2UiLCJnZXRKb2IiLCJnZXRKb2JzIiwibWFuYWdlciIsImdldFZhbGlkYXRvciIsImdldFJlcXVlc3RPYmplY3QiLCJwYXJzZU9iamVjdCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJjb25maWciLCJjb250ZXh0IiwidHJpZ2dlck5hbWUiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJpZCIsImVycm9yIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJsb2dUcmlnZ2VyQWZ0ZXJIb29rIiwiaW5wdXQiLCJsb2dMZXZlbCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsImxvZ0xldmVscyIsInRyaWdnZXJCZWZvcmVTdWNjZXNzIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsInRyaWdnZXJBZnRlciIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJjb21tZW50IiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZXJyIiwiZGVmYXVsdE9wdHMiLCJzdGFjayIsInRoZVZhbGlkYXRvciIsImJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yIiwiY2F0Y2giLCJWQUxJREFUSU9OX0VSUk9SIiwib3B0aW9ucyIsInZhbGlkYXRlTWFzdGVyS2V5IiwicmVxVXNlciIsImV4aXN0ZWQiLCJyZXF1aXJlVXNlciIsInJlcXVpcmVBbnlVc2VyUm9sZXMiLCJyZXF1aXJlQWxsVXNlclJvbGVzIiwicmVxdWlyZU1hc3RlciIsInBhcmFtcyIsInJlcXVpcmVkUGFyYW0iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJvcHQiLCJvcHRzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZXMiLCJqb2luIiwiZ2V0VHlwZSIsImZuIiwibWF0Y2giLCJ0b1N0cmluZyIsInRvTG93ZXJDYXNlIiwiZmllbGRzIiwib3B0aW9uUHJvbWlzZXMiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInN0YXJ0c1dpdGgiLCJ0cmlnZ2VyQmVmb3JlRXJyb3IiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJnZXRSZXF1ZXN0RmlsZU9iamVjdCIsImZpbGVPYmplY3QiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiRmlsZUNsYXNzTmFtZSIsIkZpbGUiLCJmaWxlVHJpZ2dlciIsImZpbGUiLCJmaWxlU2l6ZSIsIm1heWJlUnVuR2xvYmFsQ29uZmlnVHJpZ2dlciIsImNvbmZpZ09iamVjdCIsIm9yaWdpbmFsQ29uZmlnT2JqZWN0IiwiR2xvYmFsQ29uZmlnQ2xhc3NOYW1lIiwiQ29uZmlnIiwiY29uZmlnVHJpZ2dlciJdLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ2luOiAnYWZ0ZXJMb2dpbicsXG4gIGFmdGVyTG9nb3V0OiAnYWZ0ZXJMb2dvdXQnLFxuICBiZWZvcmVTYXZlOiAnYmVmb3JlU2F2ZScsXG4gIGFmdGVyU2F2ZTogJ2FmdGVyU2F2ZScsXG4gIGJlZm9yZURlbGV0ZTogJ2JlZm9yZURlbGV0ZScsXG4gIGFmdGVyRGVsZXRlOiAnYWZ0ZXJEZWxldGUnLFxuICBiZWZvcmVGaW5kOiAnYmVmb3JlRmluZCcsXG4gIGFmdGVyRmluZDogJ2FmdGVyRmluZCcsXG4gIGJlZm9yZUNvbm5lY3Q6ICdiZWZvcmVDb25uZWN0JyxcbiAgYmVmb3JlU3Vic2NyaWJlOiAnYmVmb3JlU3Vic2NyaWJlJyxcbiAgYWZ0ZXJFdmVudDogJ2FmdGVyRXZlbnQnLFxufTtcblxuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLm5hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5uYW1lLnJlcGxhY2UoJ1BhcnNlJywgJ0AnKTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGludmFsaWROYW1lUmVnZXggPSAvWydcImBdLztcbiAgaWYgKGludmFsaWROYW1lUmVnZXgudGVzdChuYW1lKSkge1xuICAgIC8vIFByZXZlbnQgYSBtYWxpY2lvdXMgdXNlciBmcm9tIGluamVjdGluZyBwcm9wZXJ0aWVzIGludG8gdGhlIHN0b3JlXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgY29uc3QgcGF0aCA9IG5hbWUuc3BsaXQoJy4nKTtcbiAgcGF0aC5zcGxpY2UoLTEpOyAvLyByZW1vdmUgbGFzdCBjb21wb25lbnRcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIGxldCBzdG9yZSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bY2F0ZWdvcnldO1xuICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBwYXRoKSB7XG4gICAgc3RvcmUgPSBzdG9yZVtjb21wb25lbnRdO1xuICAgIGlmICghc3RvcmUpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QsIGNsYXNzTmFtZSkge1xuICBpZiAoIW9iamVjdCB8fCAhb2JqZWN0LnRvSlNPTikge1xuICAgIHJldHVybiB7fTtcbiAgfVxuICBjb25zdCB0b0pTT04gPSBvYmplY3QudG9KU09OKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhvYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcGVuZGluZykge1xuICAgIGNvbnN0IHZhbCA9IG9iamVjdC5nZXQoa2V5KTtcbiAgICBpZiAoIXZhbCB8fCAhdmFsLl90b0Z1bGxKU09OKSB7XG4gICAgICB0b0pTT05ba2V5XSA9IHZhbDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0b0pTT05ba2V5XSA9IHZhbC5fdG9GdWxsSlNPTigpO1xuICB9XG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9XG4gIHJldHVybiB0b0pTT047XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVHJpZ2dlcih0cmlnZ2VyLCBuYW1lLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBuYW1lLCBhdXRoKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGF3YWl0IHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFwcGxpY2F0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4gfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddWydvYmplY3RJZCddID0gcmVxdWVzdC5vYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIHJlc3VsdCwgYXV0aCwgbG9nTGV2ZWwpIHtcbiAgaWYgKGxvZ0xldmVsID09PSAnc2lsZW50Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgZXJyb3IsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZyxcbiAgcXVlcnksXG4gIGNvbnRleHRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHtcbiAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQpO1xuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICAnQWZ0ZXJGaW5kJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICApO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckFmdGVyXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blF1ZXJ5VHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlLFxuICByZXN0T3B0aW9ucyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICByZXN0V2hlcmUsXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gcmVzdFdoZXJlO1xuXG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcblxuICBsZXQgY291bnQgPSBmYWxzZTtcbiAgaWYgKHJlc3RPcHRpb25zKSB7XG4gICAgY291bnQgPSAhIXJlc3RPcHRpb25zLmNvdW50O1xuICB9XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0UXVlcnlPYmplY3QoXG4gICAgdHJpZ2dlclR5cGUsXG4gICAgYXV0aCxcbiAgICBwYXJzZVF1ZXJ5LFxuICAgIGNvdW50LFxuICAgIGNvbmZpZyxcbiAgICBjb250ZXh0LFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0T2JqZWN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVxdWVzdE9iamVjdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gcmVxdWVzdE9iamVjdC5xdWVyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5jb21tZW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5jb21tZW50ID0ganNvblF1ZXJ5LmNvbW1lbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVFcnJvcihtZXNzYWdlLCBkZWZhdWx0T3B0cykge1xuICBpZiAoIWRlZmF1bHRPcHRzKSB7XG4gICAgZGVmYXVsdE9wdHMgPSB7fTtcbiAgfVxuICBpZiAoIW1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgZGVmYXVsdE9wdHMubWVzc2FnZSB8fCAnU2NyaXB0IGZhaWxlZC4nXG4gICAgKTtcbiAgfVxuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cblxuICBjb25zdCBjb2RlID0gZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVEO1xuICAvLyBJZiBpdCdzIGFuIGVycm9yLCBtYXJrIGl0IGFzIGEgc2NyaXB0IGZhaWxlZFxuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlKTtcbiAgfVxuICBjb25zdCBlcnJvciA9IG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlLm1lc3NhZ2UgfHwgbWVzc2FnZSk7XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBlcnJvci5zdGFjayA9IG1lc3NhZ2Uuc3RhY2s7XG4gIH1cbiAgcmV0dXJuIGVycm9yO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGZ1bmN0aW9uTmFtZSwgYXV0aCkge1xuICBjb25zdCB0aGVWYWxpZGF0b3IgPSBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0aGVWYWxpZGF0b3IpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnICYmIHRoZVZhbGlkYXRvci5za2lwV2l0aE1hc3RlcktleSAmJiByZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkgPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0J1xuICAgICAgICAgID8gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IodGhlVmFsaWRhdG9yLCByZXF1ZXN0LCBhdXRoKVxuICAgICAgICAgIDogdGhlVmFsaWRhdG9yKHJlcXVlc3QpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgbWVzc2FnZTogJ1ZhbGlkYXRpb24gZmFpbGVkLicsXG4gICAgICAgIH0pO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gIH0pO1xufVxuYXN5bmMgZnVuY3Rpb24gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3Iob3B0aW9ucywgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAocmVxdWVzdC5tYXN0ZXIgJiYgIW9wdGlvbnMudmFsaWRhdGVNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHJlcVVzZXIgPSByZXF1ZXN0LnVzZXI7XG4gIGlmIChcbiAgICAhcmVxVXNlciAmJlxuICAgIHJlcXVlc3Qub2JqZWN0ICYmXG4gICAgcmVxdWVzdC5vYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgIXJlcXVlc3Qub2JqZWN0LmV4aXN0ZWQoKVxuICApIHtcbiAgICByZXFVc2VyID0gcmVxdWVzdC5vYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIChvcHRpb25zLnJlcXVpcmVVc2VyIHx8IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcyB8fCBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXMpICYmXG4gICAgIXJlcVVzZXJcbiAgKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuJztcbiAgfVxuICBpZiAob3B0aW9ucy5yZXF1aXJlTWFzdGVyICYmICFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gTWFzdGVyIGtleSBpcyByZXF1aXJlZCB0byBjb21wbGV0ZSB0aGlzIHJlcXVlc3QuJztcbiAgfVxuICBsZXQgcGFyYW1zID0gcmVxdWVzdC5wYXJhbXMgfHwge307XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHBhcmFtcyA9IHJlcXVlc3Qub2JqZWN0LnRvSlNPTigpO1xuICB9XG4gIGNvbnN0IHJlcXVpcmVkUGFyYW0gPSBrZXkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNwZWNpZnkgZGF0YSBmb3IgJHtrZXl9LmA7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHZhbGlkYXRlT3B0aW9ucyA9IGFzeW5jIChvcHQsIGtleSwgdmFsKSA9PiB7XG4gICAgbGV0IG9wdHMgPSBvcHQub3B0aW9ucztcbiAgICBpZiAodHlwZW9mIG9wdHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wdHModmFsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgcmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoIWUpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBlLm1lc3NhZ2UgfHwgZTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wdHMpKSB7XG4gICAgICBvcHRzID0gW29wdC5vcHRpb25zXTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdHMuaW5jbHVkZXModmFsKSkge1xuICAgICAgdGhyb3cgKFxuICAgICAgICBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIG9wdGlvbiBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHtvcHRzLmpvaW4oJywgJyl9YFxuICAgICAgKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJycpLnRvTG93ZXJDYXNlKCk7XG4gIH07XG4gIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuZmllbGRzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMuZmllbGRzW2tleV07XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZWRQYXJhbShvcHQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsICYmIHZhbCA9PSBudWxsKSB7XG4gICAgICAgICAgdmFsID0gb3B0LmRlZmF1bHQ7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB2YWw7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LmNvbnN0YW50ICYmIHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub3JpZ2luYWwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnJldmVydChrZXkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgb3B0LmRlZmF1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnJlcXVpcmVkKSB7XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gIW9wdC5yZXF1aXJlZCAmJiB2YWwgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCFvcHRpb25hbCkge1xuICAgICAgICAgIGlmIChvcHQudHlwZSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGdldFR5cGUob3B0LnR5cGUpO1xuICAgICAgICAgICAgY29uc3QgdmFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsKSA/ICdhcnJheScgOiB0eXBlb2YgdmFsO1xuICAgICAgICAgICAgaWYgKHZhbFR5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHR5cGUgZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7dHlwZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCB2YWwpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG4gIGxldCB1c2VyUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXM7XG4gIGxldCByZXF1aXJlQWxsUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXM7XG4gIGNvbnN0IHByb21pc2VzID0gW1Byb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCldO1xuICBpZiAodXNlclJvbGVzIHx8IHJlcXVpcmVBbGxSb2xlcykge1xuICAgIHByb21pc2VzWzBdID0gYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHVzZXJSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzFdID0gdXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiByZXF1aXJlQWxsUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1syXSA9IHJlcXVpcmVBbGxSb2xlcygpO1xuICB9XG4gIGNvbnN0IFtyb2xlcywgcmVzb2x2ZWRVc2VyUm9sZXMsIHJlc29sdmVkUmVxdWlyZUFsbF0gPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIGlmIChyZXNvbHZlZFVzZXJSb2xlcyAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkVXNlclJvbGVzKSkge1xuICAgIHVzZXJSb2xlcyA9IHJlc29sdmVkVXNlclJvbGVzO1xuICB9XG4gIGlmIChyZXNvbHZlZFJlcXVpcmVBbGwgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFJlcXVpcmVBbGwpKSB7XG4gICAgcmVxdWlyZUFsbFJvbGVzID0gcmVzb2x2ZWRSZXF1aXJlQWxsO1xuICB9XG4gIGlmICh1c2VyUm9sZXMpIHtcbiAgICBjb25zdCBoYXNSb2xlID0gdXNlclJvbGVzLnNvbWUocmVxdWlyZWRSb2xlID0+IHJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKTtcbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICB9XG4gIH1cbiAgaWYgKHJlcXVpcmVBbGxSb2xlcykge1xuICAgIGZvciAoY29uc3QgcmVxdWlyZWRSb2xlIG9mIHJlcXVpcmVBbGxSb2xlcykge1xuICAgICAgaWYgKCFyb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggYWxsIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB1c2VyS2V5cyA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzIHx8IFtdO1xuICBpZiAoQXJyYXkuaXNBcnJheSh1c2VyS2V5cykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1c2VyS2V5cykge1xuICAgICAgaWYgKCFyZXFVc2VyKSB7XG4gICAgICAgIHRocm93ICdQbGVhc2UgbG9naW4gdG8gbWFrZSB0aGlzIHJlcXVlc3QuJztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcVVzZXIuZ2V0KGtleSkgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzZXQgZGF0YSBmb3IgJHtrZXl9IG9uIHlvdXIgYWNjb3VudC5gO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdXNlcktleXMgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXNba2V5XTtcbiAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgcmVxVXNlci5nZXQoa2V5KSkpO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihwYXJzZU9iamVjdC5jbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIHRyaWdnZXJUeXBlLnN0YXJ0c1dpdGgoJ2FmdGVyJylcbiAgICAgICAgICAgID8gY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICAgICAgICAgIDogY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBmaWxlT2JqZWN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5HbG9iYWxDb25maWdUcmlnZ2VyKHRyaWdnZXJUeXBlLCBhdXRoLCBjb25maWdPYmplY3QsIG9yaWdpbmFsQ29uZmlnT2JqZWN0LCBjb25maWcsIGNvbnRleHQpIHtcbiAgY29uc3QgR2xvYmFsQ29uZmlnQ2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKFBhcnNlLkNvbmZpZyk7XG4gIGNvbnN0IGNvbmZpZ1RyaWdnZXIgPSBnZXRUcmlnZ2VyKEdsb2JhbENvbmZpZ0NsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBjb25maWdUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBjb25maWdPYmplY3QsIG9yaWdpbmFsQ29uZmlnT2JqZWN0LCBjb25maWcsIGNvbnRleHQpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7R2xvYmFsQ29uZmlnQ2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIGNvbmZpZ09iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpZ1RyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuQ29uZmlnJyxcbiAgICAgICAgY29uZmlnT2JqZWN0LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGNvbmZpZ09iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5Db25maWcnLFxuICAgICAgICBjb25maWdPYmplY3QsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29uZmlnT2JqZWN0O1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRCxPQUFBO0FBQWtDLFNBQUFELHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBQUEsU0FBQUcsUUFBQUgsQ0FBQSxFQUFBSSxDQUFBLFFBQUFDLENBQUEsR0FBQUMsTUFBQSxDQUFBQyxJQUFBLENBQUFQLENBQUEsT0FBQU0sTUFBQSxDQUFBRSxxQkFBQSxRQUFBQyxDQUFBLEdBQUFILE1BQUEsQ0FBQUUscUJBQUEsQ0FBQVIsQ0FBQSxHQUFBSSxDQUFBLEtBQUFLLENBQUEsR0FBQUEsQ0FBQSxDQUFBQyxN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