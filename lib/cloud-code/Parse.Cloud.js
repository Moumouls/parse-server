"use strict";

var _node = require("parse/node");
var triggers = _interopRequireWildcard(require("../triggers"));
var _middlewares = require("../middlewares");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const Config = require('../Config');
function isParseObjectConstructor(object) {
  return typeof object === 'function' && Object.prototype.hasOwnProperty.call(object, 'className');
}
function validateValidator(validator) {
  if (!validator || typeof validator === 'function') {
    return;
  }
  const fieldOptions = {
    type: ['Any'],
    constant: [Boolean],
    default: ['Any'],
    options: [Array, 'function', 'Any'],
    required: [Boolean],
    error: [String]
  };
  const allowedKeys = {
    requireUser: [Boolean],
    requireAnyUserRoles: [Array, 'function'],
    requireAllUserRoles: [Array, 'function'],
    requireMaster: [Boolean],
    validateMasterKey: [Boolean],
    skipWithMasterKey: [Boolean],
    requireUserKeys: [Array, Object],
    fields: [Array, Object],
    rateLimit: [Object]
  };
  const getType = fn => {
    if (Array.isArray(fn)) {
      return 'array';
    }
    if (fn === 'Any' || fn === 'function') {
      return fn;
    }
    const type = typeof fn;
    if (typeof fn === 'function') {
      const match = fn && fn.toString().match(/^\s*function (\w+)/);
      return (match ? match[1] : 'function').toLowerCase();
    }
    return type;
  };
  const checkKey = (key, data, validatorParam) => {
    const parameter = data[key];
    if (!parameter) {
      throw `${key} is not a supported parameter for Cloud Function validations.`;
    }
    const types = parameter.map(type => getType(type));
    const type = getType(validatorParam);
    if (!types.includes(type) && !types.includes('Any')) {
      throw `Invalid type for Cloud Function validation key ${key}. Expected ${types.join('|')}, actual ${type}`;
    }
  };
  for (const key in validator) {
    checkKey(key, allowedKeys, validator[key]);
    if (key === 'fields' || key === 'requireUserKeys') {
      const values = validator[key];
      if (Array.isArray(values)) {
        continue;
      }
      for (const value in values) {
        const data = values[value];
        for (const subKey in data) {
          checkKey(subKey, fieldOptions, data[subKey]);
        }
      }
    }
  }
}
const getRoute = parseClass => {
  const route = {
    _User: 'users',
    _Session: 'sessions',
    '@File': 'files',
    '@Config': 'config'
  }[parseClass] || 'classes';
  if (parseClass === '@File') {
    return `/${route}/:id?(.*)`;
  }
  if (parseClass === '@Config') {
    return `/${route}`;
  }
  return `/${route}/${parseClass}/:id?(.*)`;
};
/** @namespace
 * @name Parse
 * @description The Parse SDK.
 *  see [api docs](https://docs.parseplatform.org/js/api) and [guide](https://docs.parseplatform.org/js/guide)
 */

/** @namespace
 * @name Parse.Cloud
 * @memberof Parse
 * @description The Parse Cloud Code SDK.
 */

var ParseCloud = {};
/**
 * Defines a Cloud Function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.define('functionName', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.define('functionName', (request) => {
 *   // code here
 * }, { ...validationObject });
 * ```
 *
 * @static
 * @memberof Parse.Cloud
 * @param {String} name The name of the Cloud Function
 * @param {Function} data The Cloud Function to register. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.FunctionRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.define = function (functionName, handler, validationHandler) {
  validateValidator(validationHandler);
  triggers.addFunction(functionName, handler, validationHandler, _node.Parse.applicationId);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)({
      requestPath: `/functions/${functionName}`,
      ...validationHandler.rateLimit
    }, _node.Parse.applicationId, true);
  }
};

/**
 * Defines a Background Job.
 *
 * **Available in Cloud Code only.**
 *
 * @method job
 * @name Parse.Cloud.job
 * @param {String} name The name of the Background Job
 * @param {Function} func The Background Job to register. This function can be async should take a single parameters a {@link Parse.Cloud.JobRequest}
 *
 */
ParseCloud.job = function (functionName, handler) {
  triggers.addJob(functionName, handler, _node.Parse.applicationId);
};

/**
 *
 * Registers a before save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 *
 * ```
 * Parse.Cloud.beforeSave('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSave(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject })
 * ```
 *
 * @method beforeSave
 * @name Parse.Cloud.beforeSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a save. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeSave = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeSave, className, handler, _node.Parse.applicationId, validationHandler);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)({
      requestPath: getRoute(className),
      requestMethods: ['POST', 'PUT'],
      ...validationHandler.rateLimit
    }, _node.Parse.applicationId, true);
  }
};

/**
 * Registers a before delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeDelete('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeDelete(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject })
 *```
 *
 * @method beforeDelete
 * @name Parse.Cloud.beforeDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a delete. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeDelete = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeDelete, className, handler, _node.Parse.applicationId, validationHandler);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)({
      requestPath: getRoute(className),
      requestMethods: 'DELETE',
      ...validationHandler.rateLimit
    }, _node.Parse.applicationId, true);
  }
};

/**
 *
 * Registers the before login function.
 *
 * **Available in Cloud Code only.**
 *
 * This function provides further control
 * in validating a login attempt. Specifically,
 * it is triggered after a user enters
 * correct credentials (or other valid authData),
 * but prior to a session being generated.
 *
 * ```
 * Parse.Cloud.beforeLogin((request) => {
 *   // code here
 * })
 *
 * ```
 *
 * @method beforeLogin
 * @name Parse.Cloud.beforeLogin
 * @param {Function} func The function to run before a login. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */
ParseCloud.beforeLogin = function (handler, validationHandler) {
  let className = '_User';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
    validationHandler = arguments.length >= 2 ? arguments[2] : null;
  }
  triggers.addTrigger(triggers.Types.beforeLogin, className, handler, _node.Parse.applicationId);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)({
      requestPath: `/login`,
      requestMethods: 'POST',
      ...validationHandler.rateLimit
    }, _node.Parse.applicationId, true);
  }
};

/**
 *
 * Registers the after login function.
 *
 * **Available in Cloud Code only.**
 *
 * This function is triggered after a user logs in successfully,
 * and after a _Session object has been created.
 *
 * ```
 * Parse.Cloud.afterLogin((request) => {
 *   // code here
 * });
 * ```
 *
 * @method afterLogin
 * @name Parse.Cloud.afterLogin
 * @param {Function} func The function to run after a login. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */
ParseCloud.afterLogin = function (handler) {
  let className = '_User';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
  }
  triggers.addTrigger(triggers.Types.afterLogin, className, handler, _node.Parse.applicationId);
};

/**
 *
 * Registers the after logout function.
 *
 * **Available in Cloud Code only.**
 *
 * This function is triggered after a user logs out.
 *
 * ```
 * Parse.Cloud.afterLogout((request) => {
 *   // code here
 * });
 * ```
 *
 * @method afterLogout
 * @name Parse.Cloud.afterLogout
 * @param {Function} func The function to run after a logout. This function can be async and should take one parameter a {@link Parse.Cloud.TriggerRequest};
 */
ParseCloud.afterLogout = function (handler) {
  let className = '_Session';
  if (typeof handler === 'string' || isParseObjectConstructor(handler)) {
    // validation will occur downstream, this is to maintain internal
    // code consistency with the other hook types.
    className = triggers.getClassName(handler);
    handler = arguments[1];
  }
  triggers.addTrigger(triggers.Types.afterLogout, className, handler, _node.Parse.applicationId);
};

/**
 * Registers an after save function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterSave for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 *
 * ```
 * Parse.Cloud.afterSave('MyCustomClass', async function(request) {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterSave(Parse.User, async function(request) {
 *   // code here
 * }, { ...validationObject });
 * ```
 *
 * @method afterSave
 * @name Parse.Cloud.afterSave
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after save function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a save. This function can be an async function and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterSave = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterSave, className, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Registers an after delete function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterDelete for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.afterDelete('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterDelete(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterDelete
 * @name Parse.Cloud.afterDelete
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after delete function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a delete. This function can be async and should take just one parameter, {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterDelete = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterDelete, className, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Registers a before find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeFind('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeFind(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeFind
 * @name Parse.Cloud.beforeFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.BeforeFindRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.BeforeFindRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeFind = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.beforeFind, className, handler, _node.Parse.applicationId, validationHandler);
  if (validationHandler && validationHandler.rateLimit) {
    (0, _middlewares.addRateLimit)({
      requestPath: getRoute(className),
      requestMethods: 'GET',
      ...validationHandler.rateLimit
    }, _node.Parse.applicationId, true);
  }
};

/**
 * Registers an after find function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use afterFind for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.afterFind('MyCustomClass', async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterFind(Parse.User, async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterFind
 * @name Parse.Cloud.afterFind
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after find function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a find. This function can be async and should take just one parameter, {@link Parse.Cloud.AfterFindRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.AfterFindRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterFind = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterFind, className, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Registers a before live query server connect function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.beforeConnect(async (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeConnect(async (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeConnect
 * @name Parse.Cloud.beforeConnect
 * @param {Function} func The function to before connection is made. This function can be async and should take just one parameter, {@link Parse.Cloud.ConnectTriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.ConnectTriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeConnect = function (handler, validationHandler) {
  validateValidator(validationHandler);
  triggers.addConnectTrigger(triggers.Types.beforeConnect, handler, _node.Parse.applicationId, validationHandler);
};

/**
 * Sends an email through the Parse Server mail adapter.
 *
 * **Available in Cloud Code only.**
 * **Requires a mail adapter to be configured for Parse Server.**
 *
 * ```
 * Parse.Cloud.sendEmail({
 *   from: 'Example <test@example.com>',
 *   to: 'contact@example.com',
 *   subject: 'Test email',
 *   text: 'This email is a test.'
 * });
 *```
 *
 * @method sendEmail
 * @name Parse.Cloud.sendEmail
 * @param {Object} data The object of the mail data to send.
 */
ParseCloud.sendEmail = function (data) {
  const config = Config.get(_node.Parse.applicationId);
  const emailAdapter = config.userController.adapter;
  if (!emailAdapter) {
    config.loggerController.error('Failed to send email because no mail adapter is configured for Parse Server.');
    return;
  }
  return emailAdapter.sendMail(data);
};

/**
 * Registers a before live query subscription function.
 *
 * **Available in Cloud Code only.**
 *
 * If you want to use beforeSubscribe for a predefined class in the Parse JavaScript SDK (e.g. {@link Parse.User} or {@link Parse.File}), you should pass the class itself and not the String for arg1.
 * ```
 * Parse.Cloud.beforeSubscribe('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.beforeSubscribe(Parse.User, (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method beforeSubscribe
 * @name Parse.Cloud.beforeSubscribe
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the before subscription function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run before a subscription. This function can be async and should take one parameter, a {@link Parse.Cloud.TriggerRequest}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.TriggerRequest}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.beforeSubscribe = function (parseClass, handler, validationHandler) {
  validateValidator(validationHandler);
  const className = triggers.getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeSubscribe, className, handler, _node.Parse.applicationId, validationHandler);
};
ParseCloud.onLiveQueryEvent = function (handler) {
  triggers.addLiveQueryEventHandler(handler, _node.Parse.applicationId);
};

/**
 * Registers an after live query server event function.
 *
 * **Available in Cloud Code only.**
 *
 * ```
 * Parse.Cloud.afterLiveQueryEvent('MyCustomClass', (request) => {
 *   // code here
 * }, (request) => {
 *   // validation code here
 * });
 *
 * Parse.Cloud.afterLiveQueryEvent('MyCustomClass', (request) => {
 *   // code here
 * }, { ...validationObject });
 *```
 *
 * @method afterLiveQueryEvent
 * @name Parse.Cloud.afterLiveQueryEvent
 * @param {(String|Parse.Object)} arg1 The Parse.Object subclass to register the after live query event function for. This can instead be a String that is the className of the subclass.
 * @param {Function} func The function to run after a live query event. This function can be async and should take one parameter, a {@link Parse.Cloud.LiveQueryEventTrigger}.
 * @param {(Object|Function)} validator An optional function to help validating cloud code. This function can be an async function and should take one parameter a {@link Parse.Cloud.LiveQueryEventTrigger}, or a {@link Parse.Cloud.ValidatorObject}.
 */
ParseCloud.afterLiveQueryEvent = function (parseClass, handler, validationHandler) {
  const className = triggers.getClassName(parseClass);
  validateValidator(validationHandler);
  triggers.addTrigger(triggers.Types.afterEvent, className, handler, _node.Parse.applicationId, validationHandler);
};
ParseCloud._removeAllHooks = () => {
  triggers._unregisterAll();
  const config = Config.get(_node.Parse.applicationId);
  config?.unregisterRateLimiters();
};
ParseCloud.useMasterKey = () => {
  // eslint-disable-next-line
  console.warn('Parse.Cloud.useMasterKey is deprecated (and has no effect anymore) on parse-server, please refer to the cloud code migration notes: http://docs.parseplatform.org/parse-server/guide/#master-key-must-be-passed-explicitly');
};
module.exports = ParseCloud;

/**
 * @interface Parse.Cloud.TriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Boolean} isChallenge If true, means the current request is originally triggered by an auth challenge.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {String} ip The IP address of the client making the request. To ensure retrieving the correct IP address, set the Parse Server option `trustProxy: true` if Parse Server runs behind a proxy server, for example behind a load balancer.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Parse.Object} original If set, the object, as currently stored.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.FileTriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.File} file The file that triggered the hook.
 * @property {Integer} fileSize The size of the file in bytes.
 * @property {Integer} contentLength The value from Content-Length header
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.ConnectTriggerRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} useMasterKey If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Integer} clients The number of clients connected.
 * @property {Integer} subscriptions The number of subscriptions connected.
 * @property {String} sessionToken If set, the session of the user that made the request.
 */

/**
 * @interface Parse.Cloud.LiveQueryEventTrigger
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} useMasterKey If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {String} sessionToken If set, the session of the user that made the request.
 * @property {String} event The live query event that triggered the request.
 * @property {Parse.Object} object The object triggering the hook.
 * @property {Parse.Object} original If set, the object, as currently stored.
 * @property {Integer} clients The number of clients connected.
 * @property {Integer} subscriptions The number of subscriptions connected.
 * @property {Boolean} sendEvent If the LiveQuery event should be sent to the client. Set to false to prevent LiveQuery from pushing to the client.
 */

/**
 * @interface Parse.Cloud.BeforeFindRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Query} query The query triggering the hook.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Boolean} isGet wether the query a `get` or a `find`
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.AfterFindRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Parse.Query} query The query triggering the hook.
 * @property {Array<Parse.Object>} results The results the query yielded.
 * @property {String} ip The IP address of the client making the request.
 * @property {Object} headers The original HTTP headers for the request.
 * @property {String} triggerName The name of the trigger (`beforeSave`, `afterSave`, ...)
 * @property {Object} log The current logger inside Parse Server.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.FunctionRequest
 * @property {String} installationId If set, the installationId triggering the request.
 * @property {Boolean} master If true, means the master key was used.
 * @property {Parse.User} user If set, the user that made the request.
 * @property {Object} params The params passed to the cloud function.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.JobRequest
 * @property {Object} params The params passed to the background job.
 * @property {function} message If message is called with a string argument, will update the current message to be stored in the job status.
 * @property {Object} config The Parse Server config.
 */

/**
 * @interface Parse.Cloud.ValidatorObject
 * @property {Boolean} requireUser whether the cloud trigger requires a user.
 * @property {Boolean} requireMaster whether the cloud trigger requires a master key.
 * @property {Boolean} validateMasterKey whether the validator should run if masterKey is provided. Defaults to false.
 * @property {Boolean} skipWithMasterKey whether the cloud code function should be ignored using a masterKey.
 *
 * @property {Array<String>|Object} requireUserKeys If set, keys required on request.user to make the request.
 * @property {String} requireUserKeys.field If requireUserKeys is an object, name of field to validate on request user
 * @property {Array|function|Any} requireUserKeys.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} requireUserKeys.field.error custom error message if field is invalid.
 *
 * @property {Array<String>|function}requireAnyUserRoles If set, request.user has to be part of at least one roles name to make the request. If set to a function, function must return role names.
 * @property {Array<String>|function}requireAllUserRoles If set, request.user has to be part all roles name to make the request. If set to a function, function must return role names.
 *
 * @property {Object|Array<String>} fields if an array of strings, validator will look for keys in request.params, and throw if not provided. If Object, fields to validate. If the trigger is a cloud function, `request.params` will be validated, otherwise `request.object`.
 * @property {String} fields.field name of field to validate.
 * @property {String} fields.field.type expected type of data for field.
 * @property {Boolean} fields.field.constant whether the field can be modified on the object.
 * @property {Any} fields.field.default default value if field is `null`, or initial value `constant` is `true`.
 * @property {Array|function|Any} fields.field.options array of options that the field can be, function to validate field, or single value. Throw an error if value is invalid.
 * @property {String} fields.field.error custom error message if field is invalid.
 */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJ0cmlnZ2VycyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX21pZGRsZXdhcmVzIiwiZSIsInQiLCJXZWFrTWFwIiwiciIsIm4iLCJfX2VzTW9kdWxlIiwibyIsImkiLCJmIiwiX19wcm90b19fIiwiZGVmYXVsdCIsImhhcyIsImdldCIsInNldCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiQ29uZmlnIiwiaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yIiwib2JqZWN0IiwicHJvdG90eXBlIiwidmFsaWRhdGVWYWxpZGF0b3IiLCJ2YWxpZGF0b3IiLCJmaWVsZE9wdGlvbnMiLCJ0eXBlIiwiY29uc3RhbnQiLCJCb29sZWFuIiwib3B0aW9ucyIsIkFycmF5IiwicmVxdWlyZWQiLCJlcnJvciIsIlN0cmluZyIsImFsbG93ZWRLZXlzIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInNraXBXaXRoTWFzdGVyS2V5IiwicmVxdWlyZVVzZXJLZXlzIiwiZmllbGRzIiwicmF0ZUxpbWl0IiwiZ2V0VHlwZSIsImZuIiwiaXNBcnJheSIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImNoZWNrS2V5Iiwia2V5IiwiZGF0YSIsInZhbGlkYXRvclBhcmFtIiwicGFyYW1ldGVyIiwidHlwZXMiLCJtYXAiLCJpbmNsdWRlcyIsImpvaW4iLCJ2YWx1ZXMiLCJ2YWx1ZSIsInN1YktleSIsImdldFJvdXRlIiwicGFyc2VDbGFzcyIsInJvdXRlIiwiX1VzZXIiLCJfU2Vzc2lvbiIsIlBhcnNlQ2xvdWQiLCJkZWZpbmUiLCJmdW5jdGlvbk5hbWUiLCJoYW5kbGVyIiwidmFsaWRhdGlvbkhhbmRsZXIiLCJhZGRGdW5jdGlvbiIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImFkZFJhdGVMaW1pdCIsInJlcXVlc3RQYXRoIiwiam9iIiwiYWRkSm9iIiwiYmVmb3JlU2F2ZSIsImNsYXNzTmFtZSIsImdldENsYXNzTmFtZSIsImFkZFRyaWdnZXIiLCJUeXBlcyIsInJlcXVlc3RNZXRob2RzIiwiYmVmb3JlRGVsZXRlIiwiYmVmb3JlTG9naW4iLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJhZnRlckxvZ2luIiwiYWZ0ZXJMb2dvdXQiLCJhZnRlclNhdmUiLCJhZnRlckRlbGV0ZSIsImJlZm9yZUZpbmQiLCJhZnRlckZpbmQiLCJiZWZvcmVDb25uZWN0IiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJzZW5kRW1haWwiLCJjb25maWciLCJlbWFpbEFkYXB0ZXIiLCJ1c2VyQ29udHJvbGxlciIsImFkYXB0ZXIiLCJsb2dnZXJDb250cm9sbGVyIiwic2VuZE1haWwiLCJiZWZvcmVTdWJzY3JpYmUiLCJvbkxpdmVRdWVyeUV2ZW50IiwiYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyIiwiYWZ0ZXJMaXZlUXVlcnlFdmVudCIsImFmdGVyRXZlbnQiLCJfcmVtb3ZlQWxsSG9va3MiLCJfdW5yZWdpc3RlckFsbCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJ1c2VNYXN0ZXJLZXkiLCJjb25zb2xlIiwid2FybiIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvY2xvdWQtY29kZS9QYXJzZS5DbG91ZC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgdHJpZ2dlcnMgZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgYWRkUmF0ZUxpbWl0IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuY29uc3QgQ29uZmlnID0gcmVxdWlyZSgnLi4vQ29uZmlnJyk7XG5cbmZ1bmN0aW9uIGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihvYmplY3QpIHtcbiAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgJ2NsYXNzTmFtZScpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0b3IpIHtcbiAgaWYgKCF2YWxpZGF0b3IgfHwgdHlwZW9mIHZhbGlkYXRvciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBmaWVsZE9wdGlvbnMgPSB7XG4gICAgdHlwZTogWydBbnknXSxcbiAgICBjb25zdGFudDogW0Jvb2xlYW5dLFxuICAgIGRlZmF1bHQ6IFsnQW55J10sXG4gICAgb3B0aW9uczogW0FycmF5LCAnZnVuY3Rpb24nLCAnQW55J10sXG4gICAgcmVxdWlyZWQ6IFtCb29sZWFuXSxcbiAgICBlcnJvcjogW1N0cmluZ10sXG4gIH07XG4gIGNvbnN0IGFsbG93ZWRLZXlzID0ge1xuICAgIHJlcXVpcmVVc2VyOiBbQm9vbGVhbl0sXG4gICAgcmVxdWlyZUFueVVzZXJSb2xlczogW0FycmF5LCAnZnVuY3Rpb24nXSxcbiAgICByZXF1aXJlQWxsVXNlclJvbGVzOiBbQXJyYXksICdmdW5jdGlvbiddLFxuICAgIHJlcXVpcmVNYXN0ZXI6IFtCb29sZWFuXSxcbiAgICB2YWxpZGF0ZU1hc3RlcktleTogW0Jvb2xlYW5dLFxuICAgIHNraXBXaXRoTWFzdGVyS2V5OiBbQm9vbGVhbl0sXG4gICAgcmVxdWlyZVVzZXJLZXlzOiBbQXJyYXksIE9iamVjdF0sXG4gICAgZmllbGRzOiBbQXJyYXksIE9iamVjdF0sXG4gICAgcmF0ZUxpbWl0OiBbT2JqZWN0XSxcbiAgfTtcbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShmbikpIHtcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIH1cbiAgICBpZiAoZm4gPT09ICdBbnknIHx8IGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gZm47XG4gICAgfVxuICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgZm47XG4gICAgaWYgKHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgbWF0Y2ggPSBmbiAmJiBmbi50b1N0cmluZygpLm1hdGNoKC9eXFxzKmZ1bmN0aW9uIChcXHcrKS8pO1xuICAgICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJ2Z1bmN0aW9uJykudG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIHR5cGU7XG4gIH07XG4gIGNvbnN0IGNoZWNrS2V5ID0gKGtleSwgZGF0YSwgdmFsaWRhdG9yUGFyYW0pID0+IHtcbiAgICBjb25zdCBwYXJhbWV0ZXIgPSBkYXRhW2tleV07XG4gICAgaWYgKCFwYXJhbWV0ZXIpIHtcbiAgICAgIHRocm93IGAke2tleX0gaXMgbm90IGEgc3VwcG9ydGVkIHBhcmFtZXRlciBmb3IgQ2xvdWQgRnVuY3Rpb24gdmFsaWRhdGlvbnMuYDtcbiAgICB9XG4gICAgY29uc3QgdHlwZXMgPSBwYXJhbWV0ZXIubWFwKHR5cGUgPT4gZ2V0VHlwZSh0eXBlKSk7XG4gICAgY29uc3QgdHlwZSA9IGdldFR5cGUodmFsaWRhdG9yUGFyYW0pO1xuICAgIGlmICghdHlwZXMuaW5jbHVkZXModHlwZSkgJiYgIXR5cGVzLmluY2x1ZGVzKCdBbnknKSkge1xuICAgICAgdGhyb3cgYEludmFsaWQgdHlwZSBmb3IgQ2xvdWQgRnVuY3Rpb24gdmFsaWRhdGlvbiBrZXkgJHtrZXl9LiBFeHBlY3RlZCAke3R5cGVzLmpvaW4oXG4gICAgICAgICd8J1xuICAgICAgKX0sIGFjdHVhbCAke3R5cGV9YDtcbiAgICB9XG4gIH07XG4gIGZvciAoY29uc3Qga2V5IGluIHZhbGlkYXRvcikge1xuICAgIGNoZWNrS2V5KGtleSwgYWxsb3dlZEtleXMsIHZhbGlkYXRvcltrZXldKTtcbiAgICBpZiAoa2V5ID09PSAnZmllbGRzJyB8fCBrZXkgPT09ICdyZXF1aXJlVXNlcktleXMnKSB7XG4gICAgICBjb25zdCB2YWx1ZXMgPSB2YWxpZGF0b3Jba2V5XTtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHZhbHVlIGluIHZhbHVlcykge1xuICAgICAgICBjb25zdCBkYXRhID0gdmFsdWVzW3ZhbHVlXTtcbiAgICAgICAgZm9yIChjb25zdCBzdWJLZXkgaW4gZGF0YSkge1xuICAgICAgICAgIGNoZWNrS2V5KHN1YktleSwgZmllbGRPcHRpb25zLCBkYXRhW3N1YktleV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5jb25zdCBnZXRSb3V0ZSA9IHBhcnNlQ2xhc3MgPT4ge1xuICBjb25zdCByb3V0ZSA9XG4gICAge1xuICAgICAgX1VzZXI6ICd1c2VycycsXG4gICAgICBfU2Vzc2lvbjogJ3Nlc3Npb25zJyxcbiAgICAgICdARmlsZSc6ICdmaWxlcycsXG4gICAgICAnQENvbmZpZycgOiAnY29uZmlnJyxcbiAgICB9W3BhcnNlQ2xhc3NdIHx8ICdjbGFzc2VzJztcbiAgaWYgKHBhcnNlQ2xhc3MgPT09ICdARmlsZScpIHtcbiAgICByZXR1cm4gYC8ke3JvdXRlfS86aWQ/KC4qKWA7XG4gIH1cbiAgaWYgKHBhcnNlQ2xhc3MgPT09ICdAQ29uZmlnJykge1xuICAgIHJldHVybiBgLyR7cm91dGV9YDtcbiAgfVxuICByZXR1cm4gYC8ke3JvdXRlfS8ke3BhcnNlQ2xhc3N9LzppZD8oLiopYDtcbn07XG4vKiogQG5hbWVzcGFjZVxuICogQG5hbWUgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgU0RLLlxuICogIHNlZSBbYXBpIGRvY3NdKGh0dHBzOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9qcy9hcGkpIGFuZCBbZ3VpZGVdKGh0dHBzOi8vZG9jcy5wYXJzZXBsYXRmb3JtLm9yZy9qcy9ndWlkZSlcbiAqL1xuXG4vKiogQG5hbWVzcGFjZVxuICogQG5hbWUgUGFyc2UuQ2xvdWRcbiAqIEBtZW1iZXJvZiBQYXJzZVxuICogQGRlc2NyaXB0aW9uIFRoZSBQYXJzZSBDbG91ZCBDb2RlIFNESy5cbiAqL1xuXG52YXIgUGFyc2VDbG91ZCA9IHt9O1xuLyoqXG4gKiBEZWZpbmVzIGEgQ2xvdWQgRnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5kZWZpbmUoJ2Z1bmN0aW9uTmFtZScsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmRlZmluZSgnZnVuY3Rpb25OYW1lJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKiBgYGBcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyb2YgUGFyc2UuQ2xvdWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBDbG91ZCBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGF0YSBUaGUgQ2xvdWQgRnVuY3Rpb24gdG8gcmVnaXN0ZXIuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuZGVmaW5lID0gZnVuY3Rpb24gKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHZhbGlkYXRpb25IYW5kbGVyICYmIHZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCkge1xuICAgIGFkZFJhdGVMaW1pdChcbiAgICAgIHsgcmVxdWVzdFBhdGg6IGAvZnVuY3Rpb25zLyR7ZnVuY3Rpb25OYW1lfWAsIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCB9LFxuICAgICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG4vKipcbiAqIERlZmluZXMgYSBCYWNrZ3JvdW5kIEpvYi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBAbWV0aG9kIGpvYlxuICogQG5hbWUgUGFyc2UuQ2xvdWQuam9iXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgQmFja2dyb3VuZCBKb2JcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIEJhY2tncm91bmQgSm9iIHRvIHJlZ2lzdGVyLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBzaG91bGQgdGFrZSBhIHNpbmdsZSBwYXJhbWV0ZXJzIGEge0BsaW5rIFBhcnNlLkNsb3VkLkpvYlJlcXVlc3R9XG4gKlxuICovXG5QYXJzZUNsb3VkLmpvYiA9IGZ1bmN0aW9uIChmdW5jdGlvbk5hbWUsIGhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkSm9iKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgc2F2ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlU2F2ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSlcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBzYXZlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVTYXZlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xuICBpZiAodmFsaWRhdGlvbkhhbmRsZXIgJiYgdmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0KSB7XG4gICAgYWRkUmF0ZUxpbWl0KFxuICAgICAge1xuICAgICAgICByZXF1ZXN0UGF0aDogZ2V0Um91dGUoY2xhc3NOYW1lKSxcbiAgICAgICAgcmVxdWVzdE1ldGhvZHM6IFsnUE9TVCcsICdQVVQnXSxcbiAgICAgICAgLi4udmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0LFxuICAgICAgfSxcbiAgICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pXG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBkZWxldGUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRGVsZXRlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZURlbGV0ZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RQYXRoOiBnZXRSb3V0ZShjbGFzc05hbWUpLFxuICAgICAgICByZXF1ZXN0TWV0aG9kczogJ0RFTEVURScsXG4gICAgICAgIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCxcbiAgICAgIH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYmVmb3JlIGxvZ2luIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gcHJvdmlkZXMgZnVydGhlciBjb250cm9sXG4gKiBpbiB2YWxpZGF0aW5nIGEgbG9naW4gYXR0ZW1wdC4gU3BlY2lmaWNhbGx5LFxuICogaXQgaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBlbnRlcnNcbiAqIGNvcnJlY3QgY3JlZGVudGlhbHMgKG9yIG90aGVyIHZhbGlkIGF1dGhEYXRhKSxcbiAqIGJ1dCBwcmlvciB0byBhIHNlc3Npb24gYmVpbmcgZ2VuZXJhdGVkLlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlTG9naW4oKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KVxuICpcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgbG9naW4uIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgICB2YWxpZGF0aW9uSGFuZGxlciA9IGFyZ3VtZW50cy5sZW5ndGggPj0gMiA/IGFyZ3VtZW50c1syXSA6IG51bGw7XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHZhbGlkYXRpb25IYW5kbGVyICYmIHZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCkge1xuICAgIGFkZFJhdGVMaW1pdChcbiAgICAgIHsgcmVxdWVzdFBhdGg6IGAvbG9naW5gLCByZXF1ZXN0TWV0aG9kczogJ1BPU1QnLCAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQgfSxcbiAgICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBhZnRlciBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgbG9ncyBpbiBzdWNjZXNzZnVsbHksXG4gKiBhbmQgYWZ0ZXIgYSBfU2Vzc2lvbiBvYmplY3QgaGFzIGJlZW4gY3JlYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9naW4oKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMb2dpblxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9naW4uIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxvZ2luID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gIH1cbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlckxvZ2luLCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIHRoZSBhZnRlciBsb2dvdXQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3Mgb3V0LlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMb2dvdXQoKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMb2dvdXRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsb2dvdXQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fTtcbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxvZ291dCA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1Nlc3Npb24nO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dvdXQsIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBzYXZlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlclNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlKFBhcnNlLlVzZXIsIGFzeW5jIGZ1bmN0aW9uKHJlcXVlc3QpIHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyU2F2ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJTYXZlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBhZnRlciBzYXZlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgc2F2ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBhZnRlckRlbGV0ZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZSgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRGVsZXRlKFBhcnNlLlVzZXIsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyRGVsZXRlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgZGVsZXRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJEZWxldGUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgZmluZCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kKCdNeUN1c3RvbUNsYXNzJywgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVGaW5kXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZmluZCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBmaW5kLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5CZWZvcmVGaW5kUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlRmluZCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbiAgaWYgKHZhbGlkYXRpb25IYW5kbGVyICYmIHZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCkge1xuICAgIGFkZFJhdGVMaW1pdChcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFBhdGg6IGdldFJvdXRlKGNsYXNzTmFtZSksXG4gICAgICAgIHJlcXVlc3RNZXRob2RzOiAnR0VUJyxcbiAgICAgICAgLi4udmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0LFxuICAgICAgfSxcbiAgICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgZmluZCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJGaW5kIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyRmluZChQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckZpbmRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgZmluZCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBiZWZvcmUgYSBmaW5kLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQWZ0ZXJGaW5kUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRmluZCA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzZXJ2ZXIgY29ubmVjdCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdChhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBiZWZvcmVDb25uZWN0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBiZWZvcmUgY29ubmVjdGlvbiBpcyBtYWRlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2UganVzdCBvbmUgcGFyYW1ldGVyLCB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5iZWZvcmVDb25uZWN0ID0gZnVuY3Rpb24gKGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkQ29ubmVjdFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlQ29ubmVjdCxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogU2VuZHMgYW4gZW1haWwgdGhyb3VnaCB0aGUgUGFyc2UgU2VydmVyIG1haWwgYWRhcHRlci5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqICoqUmVxdWlyZXMgYSBtYWlsIGFkYXB0ZXIgdG8gYmUgY29uZmlndXJlZCBmb3IgUGFyc2UgU2VydmVyLioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5zZW5kRW1haWwoe1xuICogICBmcm9tOiAnRXhhbXBsZSA8dGVzdEBleGFtcGxlLmNvbT4nLFxuICogICB0bzogJ2NvbnRhY3RAZXhhbXBsZS5jb20nLFxuICogICBzdWJqZWN0OiAnVGVzdCBlbWFpbCcsXG4gKiAgIHRleHQ6ICdUaGlzIGVtYWlsIGlzIGEgdGVzdC4nXG4gKiB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBzZW5kRW1haWxcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLnNlbmRFbWFpbFxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEgVGhlIG9iamVjdCBvZiB0aGUgbWFpbCBkYXRhIHRvIHNlbmQuXG4gKi9cblBhcnNlQ2xvdWQuc2VuZEVtYWlsID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgY29uc3QgZW1haWxBZGFwdGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAnRmFpbGVkIHRvIHNlbmQgZW1haWwgYmVjYXVzZSBubyBtYWlsIGFkYXB0ZXIgaXMgY29uZmlndXJlZCBmb3IgUGFyc2UgU2VydmVyLidcbiAgICApO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gZW1haWxBZGFwdGVyLnNlbmRNYWlsKGRhdGEpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBiZWZvcmUgbGl2ZSBxdWVyeSBzdWJzY3JpcHRpb24gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVN1YnNjcmliZSBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmUoUGFyc2UuVXNlciwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlU3Vic2NyaWJlXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVTdWJzY3JpYmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGJlZm9yZSBzdWJzY3JpcHRpb24gZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgc3Vic2NyaXB0aW9uLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU3Vic2NyaWJlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVN1YnNjcmliZSxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLm9uTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICB0cmlnZ2Vycy5hZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBhZnRlciBsaXZlIHF1ZXJ5IHNlcnZlciBldmVudCBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgbGl2ZSBxdWVyeSBldmVudCBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxpdmUgcXVlcnkgZXZlbnQuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFzeW5jIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyLCBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5MaXZlUXVlcnlFdmVudFRyaWdnZXJ9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJFdmVudCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG5QYXJzZUNsb3VkLl9yZW1vdmVBbGxIb29rcyA9ICgpID0+IHtcbiAgdHJpZ2dlcnMuX3VucmVnaXN0ZXJBbGwoKTtcbiAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgY29uZmlnPy51bnJlZ2lzdGVyUmF0ZUxpbWl0ZXJzKCk7XG59O1xuXG5QYXJzZUNsb3VkLnVzZU1hc3RlcktleSA9ICgpID0+IHtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4gIGNvbnNvbGUud2FybihcbiAgICAnUGFyc2UuQ2xvdWQudXNlTWFzdGVyS2V5IGlzIGRlcHJlY2F0ZWQgKGFuZCBoYXMgbm8gZWZmZWN0IGFueW1vcmUpIG9uIHBhcnNlLXNlcnZlciwgcGxlYXNlIHJlZmVyIHRvIHRoZSBjbG91ZCBjb2RlIG1pZ3JhdGlvbiBub3RlczogaHR0cDovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2d1aWRlLyNtYXN0ZXIta2V5LW11c3QtYmUtcGFzc2VkLWV4cGxpY2l0bHknXG4gICk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBhcnNlQ2xvdWQ7XG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gaXNDaGFsbGVuZ2UgSWYgdHJ1ZSwgbWVhbnMgdGhlIGN1cnJlbnQgcmVxdWVzdCBpcyBvcmlnaW5hbGx5IHRyaWdnZXJlZCBieSBhbiBhdXRoIGNoYWxsZW5nZS5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LiBUbyBlbnN1cmUgcmV0cmlldmluZyB0aGUgY29ycmVjdCBJUCBhZGRyZXNzLCBzZXQgdGhlIFBhcnNlIFNlcnZlciBvcHRpb24gYHRydXN0UHJveHk6IHRydWVgIGlmIFBhcnNlIFNlcnZlciBydW5zIGJlaGluZCBhIHByb3h5IHNlcnZlciwgZm9yIGV4YW1wbGUgYmVoaW5kIGEgbG9hZCBiYWxhbmNlci5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZpbGVUcmlnZ2VyUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuRmlsZX0gZmlsZSBUaGUgZmlsZSB0aGF0IHRyaWdnZXJlZCB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gZmlsZVNpemUgVGhlIHNpemUgb2YgdGhlIGZpbGUgaW4gYnl0ZXMuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNvbnRlbnRMZW5ndGggVGhlIHZhbHVlIGZyb20gQ29udGVudC1MZW5ndGggaGVhZGVyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYClcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBsb2cgVGhlIGN1cnJlbnQgbG9nZ2VyIGluc2lkZSBQYXJzZSBTZXJ2ZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Db25uZWN0VHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB1c2VNYXN0ZXJLZXkgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNsaWVudHMgVGhlIG51bWJlciBvZiBjbGllbnRzIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gc3Vic2NyaXB0aW9ucyBUaGUgbnVtYmVyIG9mIHN1YnNjcmlwdGlvbnMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdXNlTWFzdGVyS2V5IElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHNlc3Npb25Ub2tlbiBJZiBzZXQsIHRoZSBzZXNzaW9uIG9mIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBldmVudCBUaGUgbGl2ZSBxdWVyeSBldmVudCB0aGF0IHRyaWdnZXJlZCB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0cmlnZ2VyaW5nIHRoZSBob29rLlxuICogQHByb3BlcnR5IHtQYXJzZS5PYmplY3R9IG9yaWdpbmFsIElmIHNldCwgdGhlIG9iamVjdCwgYXMgY3VycmVudGx5IHN0b3JlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gY2xpZW50cyBUaGUgbnVtYmVyIG9mIGNsaWVudHMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBzdWJzY3JpcHRpb25zIFRoZSBudW1iZXIgb2Ygc3Vic2NyaXB0aW9ucyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNlbmRFdmVudCBJZiB0aGUgTGl2ZVF1ZXJ5IGV2ZW50IHNob3VsZCBiZSBzZW50IHRvIHRoZSBjbGllbnQuIFNldCB0byBmYWxzZSB0byBwcmV2ZW50IExpdmVRdWVyeSBmcm9tIHB1c2hpbmcgdG8gdGhlIGNsaWVudC5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBpc0dldCB3ZXRoZXIgdGhlIHF1ZXJ5IGEgYGdldGAgb3IgYSBgZmluZGBcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLlF1ZXJ5fSBxdWVyeSBUaGUgcXVlcnkgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8UGFyc2UuT2JqZWN0Pn0gcmVzdWx0cyBUaGUgcmVzdWx0cyB0aGUgcXVlcnkgeWllbGRlZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBvcmlnaW5hbCBIVFRQIGhlYWRlcnMgZm9yIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRyaWdnZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSB0cmlnZ2VyIChgYmVmb3JlU2F2ZWAsIGBhZnRlclNhdmVgLCAuLi4pXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuRnVuY3Rpb25SZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1zIHBhc3NlZCB0byB0aGUgY2xvdWQgZnVuY3Rpb24uXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0XG4gKiBAcHJvcGVydHkge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbXMgcGFzc2VkIHRvIHRoZSBiYWNrZ3JvdW5kIGpvYi5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IG1lc3NhZ2UgSWYgbWVzc2FnZSBpcyBjYWxsZWQgd2l0aCBhIHN0cmluZyBhcmd1bWVudCwgd2lsbCB1cGRhdGUgdGhlIGN1cnJlbnQgbWVzc2FnZSB0byBiZSBzdG9yZWQgaW4gdGhlIGpvYiBzdGF0dXMuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3RcbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gcmVxdWlyZVVzZXIgd2hldGhlciB0aGUgY2xvdWQgdHJpZ2dlciByZXF1aXJlcyBhIHVzZXIuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHJlcXVpcmVNYXN0ZXIgd2hldGhlciB0aGUgY2xvdWQgdHJpZ2dlciByZXF1aXJlcyBhIG1hc3RlciBrZXkuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHZhbGlkYXRlTWFzdGVyS2V5IHdoZXRoZXIgdGhlIHZhbGlkYXRvciBzaG91bGQgcnVuIGlmIG1hc3RlcktleSBpcyBwcm92aWRlZC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHNraXBXaXRoTWFzdGVyS2V5IHdoZXRoZXIgdGhlIGNsb3VkIGNvZGUgZnVuY3Rpb24gc2hvdWxkIGJlIGlnbm9yZWQgdXNpbmcgYSBtYXN0ZXJLZXkuXG4gKlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fE9iamVjdH0gcmVxdWlyZVVzZXJLZXlzIElmIHNldCwga2V5cyByZXF1aXJlZCBvbiByZXF1ZXN0LnVzZXIgdG8gbWFrZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSByZXF1aXJlVXNlcktleXMuZmllbGQgSWYgcmVxdWlyZVVzZXJLZXlzIGlzIGFuIG9iamVjdCwgbmFtZSBvZiBmaWVsZCB0byB2YWxpZGF0ZSBvbiByZXF1ZXN0IHVzZXJcbiAqIEBwcm9wZXJ0eSB7QXJyYXl8ZnVuY3Rpb258QW55fSByZXF1aXJlVXNlcktleXMuZmllbGQub3B0aW9ucyBhcnJheSBvZiBvcHRpb25zIHRoYXQgdGhlIGZpZWxkIGNhbiBiZSwgZnVuY3Rpb24gdG8gdmFsaWRhdGUgZmllbGQsIG9yIHNpbmdsZSB2YWx1ZS4gVGhyb3cgYW4gZXJyb3IgaWYgdmFsdWUgaXMgaW52YWxpZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSByZXF1aXJlVXNlcktleXMuZmllbGQuZXJyb3IgY3VzdG9tIGVycm9yIG1lc3NhZ2UgaWYgZmllbGQgaXMgaW52YWxpZC5cbiAqXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58ZnVuY3Rpb259cmVxdWlyZUFueVVzZXJSb2xlcyBJZiBzZXQsIHJlcXVlc3QudXNlciBoYXMgdG8gYmUgcGFydCBvZiBhdCBsZWFzdCBvbmUgcm9sZXMgbmFtZSB0byBtYWtlIHRoZSByZXF1ZXN0LiBJZiBzZXQgdG8gYSBmdW5jdGlvbiwgZnVuY3Rpb24gbXVzdCByZXR1cm4gcm9sZSBuYW1lcy5cbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxmdW5jdGlvbn1yZXF1aXJlQWxsVXNlclJvbGVzIElmIHNldCwgcmVxdWVzdC51c2VyIGhhcyB0byBiZSBwYXJ0IGFsbCByb2xlcyBuYW1lIHRvIG1ha2UgdGhlIHJlcXVlc3QuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBmdW5jdGlvbiBtdXN0IHJldHVybiByb2xlIG5hbWVzLlxuICpcbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fEFycmF5PFN0cmluZz59IGZpZWxkcyBpZiBhbiBhcnJheSBvZiBzdHJpbmdzLCB2YWxpZGF0b3Igd2lsbCBsb29rIGZvciBrZXlzIGluIHJlcXVlc3QucGFyYW1zLCBhbmQgdGhyb3cgaWYgbm90IHByb3ZpZGVkLiBJZiBPYmplY3QsIGZpZWxkcyB0byB2YWxpZGF0ZS4gSWYgdGhlIHRyaWdnZXIgaXMgYSBjbG91ZCBmdW5jdGlvbiwgYHJlcXVlc3QucGFyYW1zYCB3aWxsIGJlIHZhbGlkYXRlZCwgb3RoZXJ3aXNlIGByZXF1ZXN0Lm9iamVjdGAuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkIG5hbWUgb2YgZmllbGQgdG8gdmFsaWRhdGUuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZmllbGRzLmZpZWxkLnR5cGUgZXhwZWN0ZWQgdHlwZSBvZiBkYXRhIGZvciBmaWVsZC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gZmllbGRzLmZpZWxkLmNvbnN0YW50IHdoZXRoZXIgdGhlIGZpZWxkIGNhbiBiZSBtb2RpZmllZCBvbiB0aGUgb2JqZWN0LlxuICogQHByb3BlcnR5IHtBbnl9IGZpZWxkcy5maWVsZC5kZWZhdWx0IGRlZmF1bHQgdmFsdWUgaWYgZmllbGQgaXMgYG51bGxgLCBvciBpbml0aWFsIHZhbHVlIGBjb25zdGFudGAgaXMgYHRydWVgLlxuICogQHByb3BlcnR5IHtBcnJheXxmdW5jdGlvbnxBbnl9IGZpZWxkcy5maWVsZC5vcHRpb25zIGFycmF5IG9mIG9wdGlvbnMgdGhhdCB0aGUgZmllbGQgY2FuIGJlLCBmdW5jdGlvbiB0byB2YWxpZGF0ZSBmaWVsZCwgb3Igc2luZ2xlIHZhbHVlLiBUaHJvdyBhbiBlcnJvciBpZiB2YWx1ZSBpcyBpbnZhbGlkLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZC5lcnJvciBjdXN0b20gZXJyb3IgbWVzc2FnZSBpZiBmaWVsZCBpcyBpbnZhbGlkLlxuICovXG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsUUFBQSxHQUFBQyx1QkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsWUFBQSxHQUFBSCxPQUFBO0FBQThDLFNBQUFFLHdCQUFBRSxDQUFBLEVBQUFDLENB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