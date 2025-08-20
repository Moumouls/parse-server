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
// triggers.js

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
    if (!trigger) {
      return resolve();
    }
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
  const request = {
    ...fileObject,
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
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
      if (request.forceDownload) {
        fileObject.forceDownload = true;
      }
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', {
        ...fileObject.file.toJSON(),
        fileSize: fileObject.fileSize
      }, result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', {
        ...fileObject.file.toJSON(),
        fileSize: fileObject.fileSize
      }, auth, error, config.logLevels.triggerBeforeError);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlR5cGVzIiwiZXhwb3J0cyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJiZWZvcmVTdWJzY3JpYmUiLCJhZnRlckV2ZW50IiwiQ29ubmVjdENsYXNzTmFtZSIsImJhc2VTdG9yZSIsIlZhbGlkYXRvcnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJpbnZhbGlkTmFtZVJlZ2V4IiwidGVzdCIsInBhdGgiLCJzcGxpdCIsInNwbGljZSIsIlBhcnNlIiwic3RvcmUiLCJjb21wb25lbnQiLCJhZGQiLCJoYW5kbGVyIiwibGFzdENvbXBvbmVudCIsImxvZ2dlciIsIndhcm4iLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInB1c2giLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImZvckVhY2giLCJhcHBJZCIsInRvSlNPTndpdGhPYmplY3RzIiwib2JqZWN0IiwidG9KU09OIiwic3RhdGVDb250cm9sbGVyIiwiQ29yZU1hbmFnZXIiLCJnZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIiLCJwZW5kaW5nIiwiZ2V0UGVuZGluZ09wcyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJ2YWwiLCJfdG9GdWxsSlNPTiIsImdldFRyaWdnZXIiLCJ0cmlnZ2VyVHlwZSIsInJ1blRyaWdnZXIiLCJ0cmlnZ2VyIiwicmVxdWVzdCIsImF1dGgiLCJtYXliZVJ1blZhbGlkYXRvciIsInNraXBXaXRoTWFzdGVyS2V5IiwidHJpZ2dlckV4aXN0cyIsInVuZGVmaW5lZCIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInRyaWdnZXJOYW1lIiwibWFzdGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiaXNHZXQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsInJlc29sdmVFcnJvciIsImNvZGUiLCJFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlcklkRm9yTG9nIiwibG9nVHJpZ2dlckFmdGVySG9vayIsImlucHV0IiwibG9nTGV2ZWwiLCJjbGVhbklucHV0IiwidHJ1bmNhdGVMb2dNZXNzYWdlIiwiSlNPTiIsInN0cmluZ2lmeSIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJsb2dMZXZlbHMiLCJ0cmlnZ2VyQmVmb3JlU3VjY2VzcyIsImZyb21KU09OIiwidGhlbiIsInJlc3VsdHMiLCJ0cmlnZ2VyQWZ0ZXIiLCJtYXliZVJ1blF1ZXJ5VHJpZ2dlciIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwianNvbiIsIndoZXJlIiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJyZXF1ZXN0T2JqZWN0IiwicXVlcnlSZXN1bHQiLCJqc29uUXVlcnkiLCJsaW1pdCIsInNraXAiLCJpbmNsdWRlIiwiZXhjbHVkZUtleXMiLCJleHBsYWluIiwib3JkZXIiLCJoaW50IiwiY29tbWVudCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsImRlZmF1bHRPcHRzIiwic3RhY2siLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblByb21pc2VzIiwic2V0IiwiY29uc3RhbnQiLCJyZXZlcnQiLCJyZXF1aXJlZCIsIm9wdGlvbmFsIiwidmFsVHlwZSIsImFsbCIsInVzZXJSb2xlcyIsInJlcXVpcmVBbGxSb2xlcyIsInByb21pc2VzIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJyZXNvbHZlZFVzZXJSb2xlcyIsInJlc29sdmVkUmVxdWlyZUFsbCIsImhhc1JvbGUiLCJzb21lIiwicmVxdWlyZWRSb2xlIiwidXNlcktleXMiLCJyZXF1aXJlVXNlcktleXMiLCJtYXliZVJ1blRyaWdnZXIiLCJzdGFydHNXaXRoIiwidHJpZ2dlckJlZm9yZUVycm9yIiwicHJvbWlzZSIsImluZmxhdGUiLCJkYXRhIiwicmVzdE9iamVjdCIsImNvcHkiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZ2V0UmVxdWVzdEZpbGVPYmplY3QiLCJmaWxlT2JqZWN0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsIkZpbGVDbGFzc05hbWUiLCJGaWxlIiwiZmlsZVRyaWdnZXIiLCJmb3JjZURvd25sb2FkIiwiZmlsZSIsImZpbGVTaXplIiwibWF5YmVSdW5HbG9iYWxDb25maWdUcmlnZ2VyIiwiY29uZmlnT2JqZWN0Iiwib3JpZ2luYWxDb25maWdPYmplY3QiLCJHbG9iYWxDb25maWdDbGFzc05hbWUiLCJDb25maWciLCJjb25maWdUcmlnZ2VyIl0sInNvdXJjZXMiOlsiLi4vc3JjL3RyaWdnZXJzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlQ29ubmVjdDogJ2JlZm9yZUNvbm5lY3QnLFxuICBiZWZvcmVTdWJzY3JpYmU6ICdiZWZvcmVTdWJzY3JpYmUnLFxuICBhZnRlckV2ZW50OiAnYWZ0ZXJFdmVudCcsXG59O1xuXG5jb25zdCBDb25uZWN0Q2xhc3NOYW1lID0gJ0BDb25uZWN0JztcblxuY29uc3QgYmFzZVN0b3JlID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBWYWxpZGF0b3JzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbiAoYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0ge307XG4gICAgcmV0dXJuIGJhc2U7XG4gIH0sIHt9KTtcbiAgY29uc3QgRnVuY3Rpb25zID0ge307XG4gIGNvbnN0IEpvYnMgPSB7fTtcbiAgY29uc3QgTGl2ZVF1ZXJ5ID0gW107XG4gIGNvbnN0IFRyaWdnZXJzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbiAoYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0ge307XG4gICAgcmV0dXJuIGJhc2U7XG4gIH0sIHt9KTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgRnVuY3Rpb25zLFxuICAgIEpvYnMsXG4gICAgVmFsaWRhdG9ycyxcbiAgICBUcmlnZ2VycyxcbiAgICBMaXZlUXVlcnksXG4gIH0pO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXNzTmFtZShwYXJzZUNsYXNzKSB7XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MuY2xhc3NOYW1lKSB7XG4gICAgcmV0dXJuIHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICB9XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MubmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLm5hbWUucmVwbGFjZSgnUGFyc2UnLCAnQCcpO1xuICB9XG4gIHJldHVybiBwYXJzZUNsYXNzO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSkge1xuICBpZiAodHlwZSA9PSBUeXBlcy5iZWZvcmVTYXZlICYmIGNsYXNzTmFtZSA9PT0gJ19QdXNoU3RhdHVzJykge1xuICAgIC8vIF9QdXNoU3RhdHVzIHVzZXMgdW5kb2N1bWVudGVkIG5lc3RlZCBrZXkgaW5jcmVtZW50IG9wc1xuICAgIC8vIGFsbG93aW5nIGJlZm9yZVNhdmUgd291bGQgbWVzcyB1cCB0aGUgb2JqZWN0cyBiaWcgdGltZVxuICAgIC8vIFRPRE86IEFsbG93IHByb3BlciBkb2N1bWVudGVkIHdheSBvZiB1c2luZyBuZXN0ZWQgaW5jcmVtZW50IG9wc1xuICAgIHRocm93ICdPbmx5IGFmdGVyU2F2ZSBpcyBhbGxvd2VkIG9uIF9QdXNoU3RhdHVzJztcbiAgfVxuICBpZiAoKHR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8IHR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4pICYmIGNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1VzZXIgY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGJlZm9yZUxvZ2luIGFuZCBhZnRlckxvZ2luIHRyaWdnZXJzJztcbiAgfVxuICBpZiAodHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dvdXQgJiYgY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfU2Vzc2lvbiBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlci4nO1xuICB9XG4gIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgdHlwZSAhPT0gVHlwZXMuYWZ0ZXJMb2dvdXQpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIgaXMgYWxsb3dlZCBmb3IgdGhlIF9TZXNzaW9uIGNsYXNzLic7XG4gIH1cbiAgcmV0dXJuIGNsYXNzTmFtZTtcbn1cblxuY29uc3QgX3RyaWdnZXJTdG9yZSA9IHt9O1xuXG5jb25zdCBDYXRlZ29yeSA9IHtcbiAgRnVuY3Rpb25zOiAnRnVuY3Rpb25zJyxcbiAgVmFsaWRhdG9yczogJ1ZhbGlkYXRvcnMnLFxuICBKb2JzOiAnSm9icycsXG4gIFRyaWdnZXJzOiAnVHJpZ2dlcnMnLFxufTtcblxuZnVuY3Rpb24gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgaW52YWxpZE5hbWVSZWdleCA9IC9bJ1wiYF0vO1xuICBpZiAoaW52YWxpZE5hbWVSZWdleC50ZXN0KG5hbWUpKSB7XG4gICAgLy8gUHJldmVudCBhIG1hbGljaW91cyB1c2VyIGZyb20gaW5qZWN0aW5nIHByb3BlcnRpZXMgaW50byB0aGUgc3RvcmVcbiAgICByZXR1cm4ge307XG4gIH1cblxuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSkge1xuICAgIHRvSlNPTi5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgYXBwbGljYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkgIT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lcyhhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHN0b3JlID1cbiAgICAoX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSAmJiBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8IHt9O1xuICBjb25zdCBmdW5jdGlvbk5hbWVzID0gW107XG4gIGNvbnN0IGV4dHJhY3RGdW5jdGlvbk5hbWVzID0gKG5hbWVzcGFjZSwgc3RvcmUpID0+IHtcbiAgICBPYmplY3Qua2V5cyhzdG9yZSkuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gc3RvcmVbbmFtZV07XG4gICAgICBpZiAobmFtZXNwYWNlKSB7XG4gICAgICAgIG5hbWUgPSBgJHtuYW1lc3BhY2V9LiR7bmFtZX1gO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBmdW5jdGlvbk5hbWVzLnB1c2gobmFtZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBleHRyYWN0RnVuY3Rpb25OYW1lcyhuYW1lLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG4gIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG51bGwsIHN0b3JlKTtcbiAgcmV0dXJuIGZ1bmN0aW9uTmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9icyhhcHBsaWNhdGlvbklkKSB7XG4gIHZhciBtYW5hZ2VyID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXTtcbiAgaWYgKG1hbmFnZXIgJiYgbWFuYWdlci5Kb2JzKSB7XG4gICAgcmV0dXJuIG1hbmFnZXIuSm9icztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG9iamVjdDogcGFyc2VPYmplY3QsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgY29uZmlnLFxuICB9O1xuXG4gIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IG9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbiB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckZpbmRcbiAgKSB7XG4gICAgLy8gU2V0IGEgY29weSBvZiB0aGUgY29udGV4dCBvbiB0aGUgcmVxdWVzdCBvYmplY3QuXG4gICAgcmVxdWVzdC5jb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbnRleHQ6IGNvbnRleHQgfHwge30sXG4gICAgY29uZmlnLFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuLy8gQ3JlYXRlcyB0aGUgcmVzcG9uc2Ugb2JqZWN0LCBhbmQgdXNlcyB0aGUgcmVxdWVzdCBvYmplY3QgdG8gcGFzcyBkYXRhXG4vLyBUaGUgQVBJIHdpbGwgY2FsbCB0aGlzIHdpdGggUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdHMsIHRoaXMgd2lsbFxuLy8gdHJhbnNmb3JtIHRoZW0gdG8gUGFyc2UuT2JqZWN0IGluc3RhbmNlcyBleHBlY3RlZCBieSBDbG91ZCBDb2RlLlxuLy8gQW55IGNoYW5nZXMgbWFkZSB0byB0aGUgb2JqZWN0IGluIGEgYmVmb3JlU2F2ZSB3aWxsIGJlIGluY2x1ZGVkLlxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlc3BvbnNlT2JqZWN0KHJlcXVlc3QsIHJlc29sdmUsIHJlamVjdCkge1xuICByZXR1cm4ge1xuICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyRmluZCkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgPSByZXNwb25zZS5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICByZXR1cm4gdG9KU09Od2l0aE9iamVjdHMob2JqZWN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSB0aGUgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKFxuICAgICAgICByZXNwb25zZSAmJlxuICAgICAgICB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmXG4gICAgICAgICFyZXF1ZXN0Lm9iamVjdC5lcXVhbHMocmVzcG9uc2UpICYmXG4gICAgICAgIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJiByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgfVxuICAgICAgcmVzcG9uc2UgPSB7fTtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHJlcXVlc3Qub2JqZWN0Ll9nZXRTYXZlSlNPTigpO1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J11bJ29iamVjdElkJ10gPSByZXF1ZXN0Lm9iamVjdC5pZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9LFxuICAgIGVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyb3IsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgcmVqZWN0KGUpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgbG9nTGV2ZWwpIHtcbiAgaWYgKGxvZ0xldmVsID09PSAnc2lsZW50Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgcmVzdWx0LCBhdXRoLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgUmVzdWx0OiAke2NsZWFuUmVzdWx0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBlcnJvciwgbG9nTGV2ZWwpIHtcbiAgaWYgKGxvZ0xldmVsID09PSAnc2lsZW50Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSBmYWlsZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBFcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGVycm9yLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0cyxcbiAgY29uZmlnLFxuICBxdWVyeSxcbiAgY29udGV4dFxuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZywgY29udGV4dCk7XG4gICAgaWYgKHF1ZXJ5KSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIHJlc29sdmUob2JqZWN0KTtcbiAgICAgIH0sXG4gICAgICBlcnJvciA9PiB7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcbiAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgICdBZnRlckZpbmQnLFxuICAgICAgSlNPTi5zdHJpbmdpZnkob2JqZWN0cyksXG4gICAgICBhdXRoLFxuICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICk7XG4gICAgcmVxdWVzdC5vYmplY3RzID0gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgIC8vc2V0dGluZyB0aGUgY2xhc3MgbmFtZSB0byB0cmFuc2Zvcm0gaW50byBwYXJzZSBvYmplY3RcbiAgICAgIG9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iamVjdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByZXR1cm4gcmVzcG9uc2UudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksXG4gICAgICBhdXRoLFxuICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNvbnRleHQsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3RPYmplY3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiByZXF1ZXN0T2JqZWN0LnF1ZXJ5O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4Y2x1ZGVLZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IGpzb25RdWVyeS5leGNsdWRlS2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4cGxhaW4pIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4cGxhaW4gPSBqc29uUXVlcnkuZXhwbGFpbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmhpbnQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmhpbnQgPSBqc29uUXVlcnkuaGludDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmNvbW1lbnQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmNvbW1lbnQgPSBqc29uUXVlcnkuY29tbWVudDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUVycm9yKG1lc3NhZ2UsIGRlZmF1bHRPcHRzKSB7XG4gIGlmICghZGVmYXVsdE9wdHMpIHtcbiAgICBkZWZhdWx0T3B0cyA9IHt9O1xuICB9XG4gIGlmICghbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICBkZWZhdWx0T3B0cy5tZXNzYWdlIHx8ICdTY3JpcHQgZmFpbGVkLidcbiAgICApO1xuICB9XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGNvbnN0IGNvZGUgPSBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQ7XG4gIC8vIElmIGl0J3MgYW4gZXJyb3IsIG1hcmsgaXQgYXMgYSBzY3JpcHQgZmFpbGVkXG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IGVycm9yID0gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UubWVzc2FnZSB8fCBtZXNzYWdlKTtcbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgZnVuY3Rpb25OYW1lLCBhdXRoKSB7XG4gIGNvbnN0IHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRoZVZhbGlkYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCcgJiYgdGhlVmFsaWRhdG9yLnNraXBXaXRoTWFzdGVyS2V5ICYmIHJlcXVlc3QubWFzdGVyKSB7XG4gICAgcmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBidWlsdEluVHJpZ2dlclZhbGlkYXRvcih0aGVWYWxpZGF0b3IsIHJlcXVlc3QsIGF1dGgpXG4gICAgICAgICAgOiB0aGVWYWxpZGF0b3IocmVxdWVzdCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBmYWlsZWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiBidWlsdEluVHJpZ2dlclZhbGlkYXRvcihvcHRpb25zLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmIChyZXF1ZXN0Lm1hc3RlciAmJiAhb3B0aW9ucy52YWxpZGF0ZU1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgcmVxVXNlciA9IHJlcXVlc3QudXNlcjtcbiAgaWYgKFxuICAgICFyZXFVc2VyICYmXG4gICAgcmVxdWVzdC5vYmplY3QgJiZcbiAgICByZXF1ZXN0Lm9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAhcmVxdWVzdC5vYmplY3QuZXhpc3RlZCgpXG4gICkge1xuICAgIHJlcVVzZXIgPSByZXF1ZXN0Lm9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgKG9wdGlvbnMucmVxdWlyZVVzZXIgfHwgb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzIHx8IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcykgJiZcbiAgICAhcmVxVXNlclxuICApIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gYXN5bmMgKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5maWVsZHNba2V5XTtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlZFBhcmFtKG9wdCk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwgJiYgdmFsID09IG51bGwpIHtcbiAgICAgICAgICB2YWwgPSBvcHQuZGVmYXVsdDtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbDtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQuY29uc3RhbnQgJiYgcmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3QucmV2ZXJ0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCBvcHQuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQucmVxdWlyZWQpIHtcbiAgICAgICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSAhb3B0LnJlcXVpcmVkICYmIHZhbCA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIW9wdGlvbmFsKSB7XG4gICAgICAgICAgaWYgKG9wdC50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgICBjb25zdCB2YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWwpID8gJ2FycmF5JyA6IHR5cGVvZiB2YWw7XG4gICAgICAgICAgICBpZiAodmFsVHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHZhbCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbiAgbGV0IHVzZXJSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcztcbiAgbGV0IHJlcXVpcmVBbGxSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcztcbiAgY29uc3QgcHJvbWlzZXMgPSBbUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKV07XG4gIGlmICh1c2VyUm9sZXMgfHwgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgcHJvbWlzZXNbMF0gPSBhdXRoLmdldFVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgdXNlclJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMV0gPSB1c2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHJlcXVpcmVBbGxSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzJdID0gcmVxdWlyZUFsbFJvbGVzKCk7XG4gIH1cbiAgY29uc3QgW3JvbGVzLCByZXNvbHZlZFVzZXJSb2xlcywgcmVzb2x2ZWRSZXF1aXJlQWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgaWYgKHJlc29sdmVkVXNlclJvbGVzICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRVc2VyUm9sZXMpKSB7XG4gICAgdXNlclJvbGVzID0gcmVzb2x2ZWRVc2VyUm9sZXM7XG4gIH1cbiAgaWYgKHJlc29sdmVkUmVxdWlyZUFsbCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkUmVxdWlyZUFsbCkpIHtcbiAgICByZXF1aXJlQWxsUm9sZXMgPSByZXNvbHZlZFJlcXVpcmVBbGw7XG4gIH1cbiAgaWYgKHVzZXJSb2xlcykge1xuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyUm9sZXMuc29tZShyZXF1aXJlZFJvbGUgPT4gcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpO1xuICAgIGlmICghaGFzUm9sZSkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgIH1cbiAgfVxuICBpZiAocmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgZm9yIChjb25zdCByZXF1aXJlZFJvbGUgb2YgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgICBpZiAoIXJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCBhbGwgdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHVzZXJLZXlzID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMgfHwgW107XG4gIGlmIChBcnJheS5pc0FycmF5KHVzZXJLZXlzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHVzZXJLZXlzKSB7XG4gICAgICBpZiAoIXJlcVVzZXIpIHtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBsb2dpbiB0byBtYWtlIHRoaXMgcmVxdWVzdC4nO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxVXNlci5nZXQoa2V5KSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNldCBkYXRhIGZvciAke2tleX0gb24geW91ciBhY2NvdW50LmA7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB1c2VyS2V5cyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHsgcmV0dXJuIHJlc29sdmUoKTsgfVxuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIHRyaWdnZXJUeXBlLnN0YXJ0c1dpdGgoJ2FmdGVyJylcbiAgICAgICAgICAgID8gY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICAgICAgICAgIDogY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgaWYgKHJlcXVlc3QuZm9yY2VEb3dubG9hZCkge1xuICAgICAgICBmaWxlT2JqZWN0LmZvcmNlRG93bmxvYWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBmaWxlT2JqZWN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5HbG9iYWxDb25maWdUcmlnZ2VyKHRyaWdnZXJUeXBlLCBhdXRoLCBjb25maWdPYmplY3QsIG9yaWdpbmFsQ29uZmlnT2JqZWN0LCBjb25maWcsIGNvbnRleHQpIHtcbiAgY29uc3QgR2xvYmFsQ29uZmlnQ2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKFBhcnNlLkNvbmZpZyk7XG4gIGNvbnN0IGNvbmZpZ1RyaWdnZXIgPSBnZXRUcmlnZ2VyKEdsb2JhbENvbmZpZ0NsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBjb25maWdUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBjb25maWdPYmplY3QsIG9yaWdpbmFsQ29uZmlnT2JqZWN0LCBjb25maWcsIGNvbnRleHQpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7R2xvYmFsQ29uZmlnQ2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIGNvbmZpZ09iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpZ1RyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuQ29uZmlnJyxcbiAgICAgICAgY29uZmlnT2JqZWN0LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGNvbmZpZ09iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5Db25maWcnLFxuICAgICAgICBjb25maWdPYmplY3QsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29uZmlnT2JqZWN0O1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRCxPQUFBO0FBQWtDLFNBQUFELHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRmxDOztBQUlPLE1BQU1HLEtBQUssR0FBQUMsT0FBQSxDQUFBRCxLQUFBLEdBQUc7RUFDbkJFLFdBQVcsRUFBRSxhQUFhO0VBQzFCQyxVQUFVLEVBQUUsWUFBWTtFQUN4QkMsV0FBVyxFQUFFLGFBQWE7RUFDMUJDLFVBQVUsRUFBRSxZQUFZO0VBQ3hCQyxTQUFTLEVBQUUsV0FBVztFQUN0QkMsWUFBWSxFQUFFLGNBQWM7RUFDNUJDLFdBQVcsRUFBRSxhQUFhO0VBQzFCQyxVQUFVLEVBQUUsWUFBWTtFQUN4QkMsU0FBUyxFQUFFLFdBQVc7RUFDdEJDLGFBQWEsRUFBRSxlQUFlO0VBQzlCQyxlQUFlLEVBQUUsaUJBQWlCO0VBQ2xDQyxVQUFVLEVBQUU7QUFDZCxDQUFDO0FBRUQsTUFBTUMsZ0JBQWdCLEdBQUcsVUFBVTtBQUVuQyxNQUFNQyxTQUFTLEdBQUcsU0FBQUEsQ0FBQSxFQUFZO0VBQzVCLE1BQU1DLFVBQVUsR0FBR0MsTUFBTSxDQUFDQyxJ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