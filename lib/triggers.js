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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsImUiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsImtleSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJUeXBlcyIsImV4cG9ydHMiLCJiZWZvcmVMb2dpbiIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImJlZm9yZVNhdmUiLCJhZnRlclNhdmUiLCJiZWZvcmVEZWxldGUiLCJhZnRlckRlbGV0ZSIsImJlZm9yZUZpbmQiLCJhZnRlckZpbmQiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkNvbm5lY3RDbGFzc05hbWUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwicmVkdWNlIiwiYmFzZSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJpbnZhbGlkTmFtZVJlZ2V4IiwidGVzdCIsInBhdGgiLCJzcGxpdCIsInNwbGljZSIsIlBhcnNlIiwic3RvcmUiLCJjb21wb25lbnQiLCJhZGQiLCJoYW5kbGVyIiwibGFzdENvbXBvbmVudCIsImxvZ2dlciIsIndhcm4iLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInJlbW92ZUZ1bmN0aW9uIiwicmVtb3ZlVHJpZ2dlciIsIl91bnJlZ2lzdGVyQWxsIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsInRyaWdnZXJFeGlzdHMiLCJ1bmRlZmluZWQiLCJnZXRGdW5jdGlvbiIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzIiwiZXh0cmFjdEZ1bmN0aW9uTmFtZXMiLCJuYW1lc3BhY2UiLCJnZXRKb2IiLCJnZXRKb2JzIiwibWFuYWdlciIsImdldFZhbGlkYXRvciIsImdldFJlcXVlc3RPYmplY3QiLCJwYXJzZU9iamVjdCIsIm9yaWdpbmFsUGFyc2VPYmplY3QiLCJjb25maWciLCJjb250ZXh0IiwidHJpZ2dlck5hbWUiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJpZCIsImVycm9yIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJsb2dUcmlnZ2VyQWZ0ZXJIb29rIiwiaW5wdXQiLCJsb2dMZXZlbCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsImxvZ0xldmVscyIsInRyaWdnZXJCZWZvcmVTdWNjZXNzIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsInRyaWdnZXJBZnRlciIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJjb21tZW50IiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZXJyIiwiZGVmYXVsdE9wdHMiLCJzdGFjayIsInRoZVZhbGlkYXRvciIsImJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yIiwiY2F0Y2giLCJWQUxJREFUSU9OX0VSUk9SIiwib3B0aW9ucyIsInZhbGlkYXRlTWFzdGVyS2V5IiwicmVxVXNlciIsImV4aXN0ZWQiLCJyZXF1aXJlVXNlciIsInJlcXVpcmVBbnlVc2VyUm9sZXMiLCJyZXF1aXJlQWxsVXNlclJvbGVzIiwicmVxdWlyZU1hc3RlciIsInBhcmFtcyIsInJlcXVpcmVkUGFyYW0iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJvcHQiLCJvcHRzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZXMiLCJqb2luIiwiZ2V0VHlwZSIsImZuIiwibWF0Y2giLCJ0b1N0cmluZyIsInRvTG93ZXJDYXNlIiwiZmllbGRzIiwib3B0aW9uUHJvbWlzZXMiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInN0YXJ0c1dpdGgiLCJ0cmlnZ2VyQmVmb3JlRXJyb3IiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJnZXRSZXF1ZXN0RmlsZU9iamVjdCIsImZpbGVPYmplY3QiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiRmlsZUNsYXNzTmFtZSIsIkZpbGUiLCJmaWxlVHJpZ2dlciIsImZpbGUiLCJmaWxlU2l6ZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ2luOiAnYWZ0ZXJMb2dpbicsXG4gIGFmdGVyTG9nb3V0OiAnYWZ0ZXJMb2dvdXQnLFxuICBiZWZvcmVTYXZlOiAnYmVmb3JlU2F2ZScsXG4gIGFmdGVyU2F2ZTogJ2FmdGVyU2F2ZScsXG4gIGJlZm9yZURlbGV0ZTogJ2JlZm9yZURlbGV0ZScsXG4gIGFmdGVyRGVsZXRlOiAnYWZ0ZXJEZWxldGUnLFxuICBiZWZvcmVGaW5kOiAnYmVmb3JlRmluZCcsXG4gIGFmdGVyRmluZDogJ2FmdGVyRmluZCcsXG4gIGJlZm9yZUNvbm5lY3Q6ICdiZWZvcmVDb25uZWN0JyxcbiAgYmVmb3JlU3Vic2NyaWJlOiAnYmVmb3JlU3Vic2NyaWJlJyxcbiAgYWZ0ZXJFdmVudDogJ2FmdGVyRXZlbnQnLFxufTtcblxuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLm5hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5uYW1lLnJlcGxhY2UoJ1BhcnNlJywgJ0AnKTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGludmFsaWROYW1lUmVnZXggPSAvWydcImBdLztcbiAgaWYgKGludmFsaWROYW1lUmVnZXgudGVzdChuYW1lKSkge1xuICAgIC8vIFByZXZlbnQgYSBtYWxpY2lvdXMgdXNlciBmcm9tIGluamVjdGluZyBwcm9wZXJ0aWVzIGludG8gdGhlIHN0b3JlXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgY29uc3QgcGF0aCA9IG5hbWUuc3BsaXQoJy4nKTtcbiAgcGF0aC5zcGxpY2UoLTEpOyAvLyByZW1vdmUgbGFzdCBjb21wb25lbnRcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIGxldCBzdG9yZSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bY2F0ZWdvcnldO1xuICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBwYXRoKSB7XG4gICAgc3RvcmUgPSBzdG9yZVtjb21wb25lbnRdO1xuICAgIGlmICghc3RvcmUpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QsIGNsYXNzTmFtZSkge1xuICBpZiAoIW9iamVjdCB8fCAhb2JqZWN0LnRvSlNPTikge1xuICAgIHJldHVybiB7fTtcbiAgfVxuICBjb25zdCB0b0pTT04gPSBvYmplY3QudG9KU09OKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhvYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcGVuZGluZykge1xuICAgIGNvbnN0IHZhbCA9IG9iamVjdC5nZXQoa2V5KTtcbiAgICBpZiAoIXZhbCB8fCAhdmFsLl90b0Z1bGxKU09OKSB7XG4gICAgICB0b0pTT05ba2V5XSA9IHZhbDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0b0pTT05ba2V5XSA9IHZhbC5fdG9GdWxsSlNPTigpO1xuICB9XG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9XG4gIHJldHVybiB0b0pTT047XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVHJpZ2dlcih0cmlnZ2VyLCBuYW1lLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBuYW1lLCBhdXRoKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGF3YWl0IHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFwcGxpY2F0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4gfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddWydvYmplY3RJZCddID0gcmVxdWVzdC5vYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIHJlc3VsdCwgYXV0aCwgbG9nTGV2ZWwpIHtcbiAgaWYgKGxvZ0xldmVsID09PSAnc2lsZW50Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgZXJyb3IsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZyxcbiAgcXVlcnksXG4gIGNvbnRleHRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHtcbiAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQpO1xuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICAnQWZ0ZXJGaW5kJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICApO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckFmdGVyXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blF1ZXJ5VHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlLFxuICByZXN0T3B0aW9ucyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICByZXN0V2hlcmUsXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gcmVzdFdoZXJlO1xuXG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcblxuICBsZXQgY291bnQgPSBmYWxzZTtcbiAgaWYgKHJlc3RPcHRpb25zKSB7XG4gICAgY291bnQgPSAhIXJlc3RPcHRpb25zLmNvdW50O1xuICB9XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0UXVlcnlPYmplY3QoXG4gICAgdHJpZ2dlclR5cGUsXG4gICAgYXV0aCxcbiAgICBwYXJzZVF1ZXJ5LFxuICAgIGNvdW50LFxuICAgIGNvbmZpZyxcbiAgICBjb250ZXh0LFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0T2JqZWN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVxdWVzdE9iamVjdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gcmVxdWVzdE9iamVjdC5xdWVyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5jb21tZW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5jb21tZW50ID0ganNvblF1ZXJ5LmNvbW1lbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVFcnJvcihtZXNzYWdlLCBkZWZhdWx0T3B0cykge1xuICBpZiAoIWRlZmF1bHRPcHRzKSB7XG4gICAgZGVmYXVsdE9wdHMgPSB7fTtcbiAgfVxuICBpZiAoIW1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgZGVmYXVsdE9wdHMubWVzc2FnZSB8fCAnU2NyaXB0IGZhaWxlZC4nXG4gICAgKTtcbiAgfVxuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cblxuICBjb25zdCBjb2RlID0gZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVEO1xuICAvLyBJZiBpdCdzIGFuIGVycm9yLCBtYXJrIGl0IGFzIGEgc2NyaXB0IGZhaWxlZFxuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlKTtcbiAgfVxuICBjb25zdCBlcnJvciA9IG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlLm1lc3NhZ2UgfHwgbWVzc2FnZSk7XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBlcnJvci5zdGFjayA9IG1lc3NhZ2Uuc3RhY2s7XG4gIH1cbiAgcmV0dXJuIGVycm9yO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGZ1bmN0aW9uTmFtZSwgYXV0aCkge1xuICBjb25zdCB0aGVWYWxpZGF0b3IgPSBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0aGVWYWxpZGF0b3IpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnICYmIHRoZVZhbGlkYXRvci5za2lwV2l0aE1hc3RlcktleSAmJiByZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkgPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0J1xuICAgICAgICAgID8gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IodGhlVmFsaWRhdG9yLCByZXF1ZXN0LCBhdXRoKVxuICAgICAgICAgIDogdGhlVmFsaWRhdG9yKHJlcXVlc3QpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgbWVzc2FnZTogJ1ZhbGlkYXRpb24gZmFpbGVkLicsXG4gICAgICAgIH0pO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gIH0pO1xufVxuYXN5bmMgZnVuY3Rpb24gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3Iob3B0aW9ucywgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAocmVxdWVzdC5tYXN0ZXIgJiYgIW9wdGlvbnMudmFsaWRhdGVNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHJlcVVzZXIgPSByZXF1ZXN0LnVzZXI7XG4gIGlmIChcbiAgICAhcmVxVXNlciAmJlxuICAgIHJlcXVlc3Qub2JqZWN0ICYmXG4gICAgcmVxdWVzdC5vYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgIXJlcXVlc3Qub2JqZWN0LmV4aXN0ZWQoKVxuICApIHtcbiAgICByZXFVc2VyID0gcmVxdWVzdC5vYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIChvcHRpb25zLnJlcXVpcmVVc2VyIHx8IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcyB8fCBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXMpICYmXG4gICAgIXJlcVVzZXJcbiAgKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuJztcbiAgfVxuICBpZiAob3B0aW9ucy5yZXF1aXJlTWFzdGVyICYmICFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gTWFzdGVyIGtleSBpcyByZXF1aXJlZCB0byBjb21wbGV0ZSB0aGlzIHJlcXVlc3QuJztcbiAgfVxuICBsZXQgcGFyYW1zID0gcmVxdWVzdC5wYXJhbXMgfHwge307XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHBhcmFtcyA9IHJlcXVlc3Qub2JqZWN0LnRvSlNPTigpO1xuICB9XG4gIGNvbnN0IHJlcXVpcmVkUGFyYW0gPSBrZXkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNwZWNpZnkgZGF0YSBmb3IgJHtrZXl9LmA7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHZhbGlkYXRlT3B0aW9ucyA9IGFzeW5jIChvcHQsIGtleSwgdmFsKSA9PiB7XG4gICAgbGV0IG9wdHMgPSBvcHQub3B0aW9ucztcbiAgICBpZiAodHlwZW9mIG9wdHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wdHModmFsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgcmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoIWUpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBlLm1lc3NhZ2UgfHwgZTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wdHMpKSB7XG4gICAgICBvcHRzID0gW29wdC5vcHRpb25zXTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdHMuaW5jbHVkZXModmFsKSkge1xuICAgICAgdGhyb3cgKFxuICAgICAgICBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIG9wdGlvbiBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHtvcHRzLmpvaW4oJywgJyl9YFxuICAgICAgKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJycpLnRvTG93ZXJDYXNlKCk7XG4gIH07XG4gIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuZmllbGRzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMuZmllbGRzW2tleV07XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZWRQYXJhbShvcHQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsICYmIHZhbCA9PSBudWxsKSB7XG4gICAgICAgICAgdmFsID0gb3B0LmRlZmF1bHQ7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB2YWw7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LmNvbnN0YW50ICYmIHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub3JpZ2luYWwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnJldmVydChrZXkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgb3B0LmRlZmF1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnJlcXVpcmVkKSB7XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gIW9wdC5yZXF1aXJlZCAmJiB2YWwgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCFvcHRpb25hbCkge1xuICAgICAgICAgIGlmIChvcHQudHlwZSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGdldFR5cGUob3B0LnR5cGUpO1xuICAgICAgICAgICAgY29uc3QgdmFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsKSA/ICdhcnJheScgOiB0eXBlb2YgdmFsO1xuICAgICAgICAgICAgaWYgKHZhbFR5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHR5cGUgZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7dHlwZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCB2YWwpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG4gIGxldCB1c2VyUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXM7XG4gIGxldCByZXF1aXJlQWxsUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXM7XG4gIGNvbnN0IHByb21pc2VzID0gW1Byb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCldO1xuICBpZiAodXNlclJvbGVzIHx8IHJlcXVpcmVBbGxSb2xlcykge1xuICAgIHByb21pc2VzWzBdID0gYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHVzZXJSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzFdID0gdXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiByZXF1aXJlQWxsUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1syXSA9IHJlcXVpcmVBbGxSb2xlcygpO1xuICB9XG4gIGNvbnN0IFtyb2xlcywgcmVzb2x2ZWRVc2VyUm9sZXMsIHJlc29sdmVkUmVxdWlyZUFsbF0gPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIGlmIChyZXNvbHZlZFVzZXJSb2xlcyAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkVXNlclJvbGVzKSkge1xuICAgIHVzZXJSb2xlcyA9IHJlc29sdmVkVXNlclJvbGVzO1xuICB9XG4gIGlmIChyZXNvbHZlZFJlcXVpcmVBbGwgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFJlcXVpcmVBbGwpKSB7XG4gICAgcmVxdWlyZUFsbFJvbGVzID0gcmVzb2x2ZWRSZXF1aXJlQWxsO1xuICB9XG4gIGlmICh1c2VyUm9sZXMpIHtcbiAgICBjb25zdCBoYXNSb2xlID0gdXNlclJvbGVzLnNvbWUocmVxdWlyZWRSb2xlID0+IHJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKTtcbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICB9XG4gIH1cbiAgaWYgKHJlcXVpcmVBbGxSb2xlcykge1xuICAgIGZvciAoY29uc3QgcmVxdWlyZWRSb2xlIG9mIHJlcXVpcmVBbGxSb2xlcykge1xuICAgICAgaWYgKCFyb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggYWxsIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB1c2VyS2V5cyA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzIHx8IFtdO1xuICBpZiAoQXJyYXkuaXNBcnJheSh1c2VyS2V5cykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1c2VyS2V5cykge1xuICAgICAgaWYgKCFyZXFVc2VyKSB7XG4gICAgICAgIHRocm93ICdQbGVhc2UgbG9naW4gdG8gbWFrZSB0aGlzIHJlcXVlc3QuJztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcVVzZXIuZ2V0KGtleSkgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzZXQgZGF0YSBmb3IgJHtrZXl9IG9uIHlvdXIgYWNjb3VudC5gO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdXNlcktleXMgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXNba2V5XTtcbiAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgcmVxVXNlci5nZXQoa2V5KSkpO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihwYXJzZU9iamVjdC5jbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIHRyaWdnZXJUeXBlLnN0YXJ0c1dpdGgoJ2FmdGVyJylcbiAgICAgICAgICAgID8gY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICAgICAgICAgIDogY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBmaWxlT2JqZWN0O1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFELE9BQUE7QUFBa0MsU0FBQUQsdUJBQUFHLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxDQUFBLEVBQUFDLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQUosQ0FBQSxPQUFBRyxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgsTUFBQSxDQUFBRSxxQkFBQSxDQUFBTCxDQUFBLEdBQUFDLENBQUEsS0FBQUssQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQU4sQ0FBQSxXQUFBRSxNQUFBLENBQUFLLHdCQUFBLENBQUFSLENBQUEsRUFBQUMsQ0FBQSxFQUFBUSxVQUFBLE9BQUFQLENBQUEsQ0FBQVEsSUFBQSxDQUFBQyxLQUFBLENBQUFULENBQUEsRUFBQUksQ0FBQSxZQUFBSixDQUFBO0FBQUEsU0FBQVUsY0FBQVosQ0FBQSxhQUFBQyxDQUFBLE1BQUFBLENBQUEsR0FBQVksU0FBQSxDQUFBQyxNQUFBLEVBQUFiLENBQUEsVUFBQUMsQ0FBQSxXQUFBVyxTQUFBLENBQUFaLENBQUEsSUFBQVksU0FBQSxDQUFBWixDQUFBLFFBQUFBLENBQUEsT0FBQUYsT0FBQSxDQUFBSSxNQUFBLENBQUFELENBQUEsT0FBQWEsT0FBQSxXQUFBZCxDQUFBLElBQUFlLGVBQUEsQ0FBQWhCLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLENBQUFELENBQUEs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NkIsY0FBYztFQUNqRDtFQUNBLE9BQU85QixPQUFPO0FBQ2hCO0FBRU8sZUFBZTBKLG1CQUFtQkEsQ0FBQzdKLFdBQVcsRUFBRTRKLFVBQVUsRUFBRXZJLE1BQU0sRUFBRWpCLElBQUksRUFBRTtFQUMvRSxNQUFNMEosYUFBYSxHQUFHak4sWUFBWSxDQUFDaUIsYUFBSyxDQUFDaU0sSUFBSSxDQUFDO0VBQzlDLE1BQU1DLFdBQVcsR0FBR2pLLFVBQVUsQ0FBQytKLGFBQWEsRUFBRTlKLFdBQVcsRUFBRXFCLE1BQU0sQ0FBQzdELGFBQWEsQ0FBQztFQUNoRixJQUFJLE9BQU93TSxXQUFXLEtBQUssVUFBVSxFQUFFO0lBQ3JDLElBQUk7TUFDRixNQUFNN0osT0FBTyxHQUFHd0osb0JBQW9CLENBQUMzSixXQUFXLEVBQUVJLElBQUksRUFBRXdKLFVBQVUsRUFBRXZJLE1BQU0sQ0FBQztNQUMzRSxNQUFNaEIsaUJBQWlCLENBQUNGLE9BQU8sRUFBRyxHQUFFSCxXQUFZLElBQUc4SixhQUFjLEVBQUMsRUFBRTFKLElBQUksQ0FBQztNQUN6RSxJQUFJRCxPQUFPLENBQUNHLGlCQUFpQixFQUFFO1FBQzdCLE9BQU9zSixVQUFVO01BQ25CO01BQ0EsTUFBTTdGLE1BQU0sR0FBRyxNQUFNaUcsV0FBVyxDQUFDN0osT0FBTyxDQUFDO01BQ3pDMkQsMkJBQTJCLENBQ3pCOUQsV0FBVyxFQUNYLFlBQVksRUFBQWhHLGFBQUEsQ0FBQUEsYUFBQSxLQUNQNFAsVUFBVSxDQUFDSyxJQUFJLENBQUMzSyxNQUFNLENBQUMsQ0FBQztRQUFFNEssUUFBUSxFQUFFTixVQUFVLENBQUNNO01BQVEsSUFDNURuRyxNQUFNLEVBQ04zRCxJQUFJLEVBQ0ppQixNQUFNLENBQUMrQyxTQUFTLENBQUNDLG9CQUNuQixDQUFDO01BQ0QsT0FBT04sTUFBTSxJQUFJNkYsVUFBVTtJQUM3QixDQUFDLENBQUMsT0FBTzVHLEtBQUssRUFBRTtNQUNkaUIseUJBQXlCLENBQ3ZCakUsV0FBVyxFQUNYLFlBQVksRUFBQWhHLGFBQUEsQ0FBQUEsYUFBQSxLQUNQNFAsVUFBVSxDQUFDSyxJQUFJLENBQUMzSyxNQUFNLENBQUMsQ0FBQztRQUFFNEssUUFBUSxFQUFFTixVQUFVLENBQUNNO01BQVEsSUFDNUQ5SixJQUFJLEVBQ0o0QyxLQUFLLEVBQ0wzQixNQUFNLENBQUMrQyxTQUFTLENBQUNnRixrQkFDbkIsQ0FBQztNQUNELE1BQU1wRyxLQUFLO0lBQ2I7RUFDRjtFQUNBLE9BQU80RyxVQUFVO0FBQ25CIiwiaWdub3JlTGlzdCI6W119