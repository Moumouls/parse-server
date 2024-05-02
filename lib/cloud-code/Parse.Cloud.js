"use strict";

var _node = require("parse/node");
var triggers = _interopRequireWildcard(require("../triggers"));
var _middlewares = require("../middlewares");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
    '@File': 'files'
  }[parseClass] || 'classes';
  if (parseClass === '@File') {
    return `/${route}/:id?(.*)`;
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
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: `/functions/${functionName}`
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
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
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: getRoute(className),
      requestMethods: ['POST', 'PUT']
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
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
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: getRoute(className),
      requestMethods: 'DELETE'
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
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
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: `/login`,
      requestMethods: 'POST'
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
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
    (0, _middlewares.addRateLimit)(_objectSpread({
      requestPath: getRoute(className),
      requestMethods: 'GET'
    }, validationHandler.rateLimit), _node.Parse.applicationId, true);
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
  config === null || config === void 0 || config.unregisterRateLimiters();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJ0cmlnZ2VycyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX21pZGRsZXdhcmVzIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwiZSIsIldlYWtNYXAiLCJyIiwidCIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0Iiwib3duS2V5cyIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJ2YWx1ZSIsIl90b1Byb3BlcnR5S2V5IiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIkNvbmZpZyIsImlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvciIsIm9iamVjdCIsInByb3RvdHlwZSIsInZhbGlkYXRlVmFsaWRhdG9yIiwidmFsaWRhdG9yIiwiZmllbGRPcHRpb25zIiwidHlwZSIsImNvbnN0YW50IiwiQm9vbGVhbiIsIm9wdGlvbnMiLCJBcnJheSIsInJlcXVpcmVkIiwiZXJyb3IiLCJhbGxvd2VkS2V5cyIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJza2lwV2l0aE1hc3RlcktleSIsInJlcXVpcmVVc2VyS2V5cyIsImZpZWxkcyIsInJhdGVMaW1pdCIsImdldFR5cGUiLCJmbiIsImlzQXJyYXkiLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJjaGVja0tleSIsImRhdGEiLCJ2YWxpZGF0b3JQYXJhbSIsInBhcmFtZXRlciIsInR5cGVzIiwibWFwIiwiaW5jbHVkZXMiLCJqb2luIiwidmFsdWVzIiwic3ViS2V5IiwiZ2V0Um91dGUiLCJwYXJzZUNsYXNzIiwicm91dGUiLCJfVXNlciIsIl9TZXNzaW9uIiwiUGFyc2VDbG91ZCIsImRlZmluZSIsImZ1bmN0aW9uTmFtZSIsImhhbmRsZXIiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEZ1bmN0aW9uIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiYWRkUmF0ZUxpbWl0IiwicmVxdWVzdFBhdGgiLCJqb2IiLCJhZGRKb2IiLCJiZWZvcmVTYXZlIiwiY2xhc3NOYW1lIiwiZ2V0Q2xhc3NOYW1lIiwiYWRkVHJpZ2dlciIsIlR5cGVzIiwicmVxdWVzdE1ldGhvZHMiLCJiZWZvcmVEZWxldGUiLCJiZWZvcmVMb2dpbiIsImFmdGVyTG9naW4iLCJhZnRlckxvZ291dCIsImFmdGVyU2F2ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJhZGRDb25uZWN0VHJpZ2dlciIsInNlbmRFbWFpbCIsImNvbmZpZyIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzZW5kTWFpbCIsImJlZm9yZVN1YnNjcmliZSIsIm9uTGl2ZVF1ZXJ5RXZlbnQiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJhZnRlckxpdmVRdWVyeUV2ZW50IiwiYWZ0ZXJFdmVudCIsIl9yZW1vdmVBbGxIb29rcyIsIl91bnJlZ2lzdGVyQWxsIiwidW5yZWdpc3RlclJhdGVMaW1pdGVycyIsInVzZU1hc3RlcktleSIsImNvbnNvbGUiLCJ3YXJuIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBhZGRSYXRlTGltaXQgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5jb25zdCBDb25maWcgPSByZXF1aXJlKCcuLi9Db25maWcnKTtcblxuZnVuY3Rpb24gaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKG9iamVjdCkge1xuICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCAnY2xhc3NOYW1lJyk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRvcikge1xuICBpZiAoIXZhbGlkYXRvciB8fCB0eXBlb2YgdmFsaWRhdG9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGZpZWxkT3B0aW9ucyA9IHtcbiAgICB0eXBlOiBbJ0FueSddLFxuICAgIGNvbnN0YW50OiBbQm9vbGVhbl0sXG4gICAgZGVmYXVsdDogWydBbnknXSxcbiAgICBvcHRpb25zOiBbQXJyYXksICdmdW5jdGlvbicsICdBbnknXSxcbiAgICByZXF1aXJlZDogW0Jvb2xlYW5dLFxuICAgIGVycm9yOiBbU3RyaW5nXSxcbiAgfTtcbiAgY29uc3QgYWxsb3dlZEtleXMgPSB7XG4gICAgcmVxdWlyZVVzZXI6IFtCb29sZWFuXSxcbiAgICByZXF1aXJlQW55VXNlclJvbGVzOiBbQXJyYXksICdmdW5jdGlvbiddLFxuICAgIHJlcXVpcmVBbGxVc2VyUm9sZXM6IFtBcnJheSwgJ2Z1bmN0aW9uJ10sXG4gICAgcmVxdWlyZU1hc3RlcjogW0Jvb2xlYW5dLFxuICAgIHZhbGlkYXRlTWFzdGVyS2V5OiBbQm9vbGVhbl0sXG4gICAgc2tpcFdpdGhNYXN0ZXJLZXk6IFtCb29sZWFuXSxcbiAgICByZXF1aXJlVXNlcktleXM6IFtBcnJheSwgT2JqZWN0XSxcbiAgICBmaWVsZHM6IFtBcnJheSwgT2JqZWN0XSxcbiAgICByYXRlTGltaXQ6IFtPYmplY3RdLFxuICB9O1xuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGZuKSkge1xuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgfVxuICAgIGlmIChmbiA9PT0gJ0FueScgfHwgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBmbjtcbiAgICB9XG4gICAgY29uc3QgdHlwZSA9IHR5cGVvZiBmbjtcbiAgICBpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnZnVuY3Rpb24nKS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfTtcbiAgY29uc3QgY2hlY2tLZXkgPSAoa2V5LCBkYXRhLCB2YWxpZGF0b3JQYXJhbSkgPT4ge1xuICAgIGNvbnN0IHBhcmFtZXRlciA9IGRhdGFba2V5XTtcbiAgICBpZiAoIXBhcmFtZXRlcikge1xuICAgICAgdGhyb3cgYCR7a2V5fSBpcyBub3QgYSBzdXBwb3J0ZWQgcGFyYW1ldGVyIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9ucy5gO1xuICAgIH1cbiAgICBjb25zdCB0eXBlcyA9IHBhcmFtZXRlci5tYXAodHlwZSA9PiBnZXRUeXBlKHR5cGUpKTtcbiAgICBjb25zdCB0eXBlID0gZ2V0VHlwZSh2YWxpZGF0b3JQYXJhbSk7XG4gICAgaWYgKCF0eXBlcy5pbmNsdWRlcyh0eXBlKSAmJiAhdHlwZXMuaW5jbHVkZXMoJ0FueScpKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCB0eXBlIGZvciBDbG91ZCBGdW5jdGlvbiB2YWxpZGF0aW9uIGtleSAke2tleX0uIEV4cGVjdGVkICR7dHlwZXMuam9pbihcbiAgICAgICAgJ3wnXG4gICAgICApfSwgYWN0dWFsICR7dHlwZX1gO1xuICAgIH1cbiAgfTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdmFsaWRhdG9yKSB7XG4gICAgY2hlY2tLZXkoa2V5LCBhbGxvd2VkS2V5cywgdmFsaWRhdG9yW2tleV0pO1xuICAgIGlmIChrZXkgPT09ICdmaWVsZHMnIHx8IGtleSA9PT0gJ3JlcXVpcmVVc2VyS2V5cycpIHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IHZhbGlkYXRvcltrZXldO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgdmFsdWUgaW4gdmFsdWVzKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB2YWx1ZXNbdmFsdWVdO1xuICAgICAgICBmb3IgKGNvbnN0IHN1YktleSBpbiBkYXRhKSB7XG4gICAgICAgICAgY2hlY2tLZXkoc3ViS2V5LCBmaWVsZE9wdGlvbnMsIGRhdGFbc3ViS2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmNvbnN0IGdldFJvdXRlID0gcGFyc2VDbGFzcyA9PiB7XG4gIGNvbnN0IHJvdXRlID1cbiAgICB7XG4gICAgICBfVXNlcjogJ3VzZXJzJyxcbiAgICAgIF9TZXNzaW9uOiAnc2Vzc2lvbnMnLFxuICAgICAgJ0BGaWxlJzogJ2ZpbGVzJyxcbiAgICB9W3BhcnNlQ2xhc3NdIHx8ICdjbGFzc2VzJztcbiAgaWYgKHBhcnNlQ2xhc3MgPT09ICdARmlsZScpIHtcbiAgICByZXR1cm4gYC8ke3JvdXRlfS86aWQ/KC4qKWA7XG4gIH1cbiAgcmV0dXJuIGAvJHtyb3V0ZX0vJHtwYXJzZUNsYXNzfS86aWQ/KC4qKWA7XG59O1xuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlXG4gKiBAZGVzY3JpcHRpb24gVGhlIFBhcnNlIFNESy5cbiAqICBzZWUgW2FwaSBkb2NzXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvYXBpKSBhbmQgW2d1aWRlXShodHRwczovL2RvY3MucGFyc2VwbGF0Zm9ybS5vcmcvanMvZ3VpZGUpXG4gKi9cblxuLyoqIEBuYW1lc3BhY2VcbiAqIEBuYW1lIFBhcnNlLkNsb3VkXG4gKiBAbWVtYmVyb2YgUGFyc2VcbiAqIEBkZXNjcmlwdGlvbiBUaGUgUGFyc2UgQ2xvdWQgQ29kZSBTREsuXG4gKi9cblxudmFyIFBhcnNlQ2xvdWQgPSB7fTtcbi8qKlxuICogRGVmaW5lcyBhIENsb3VkIEZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuZGVmaW5lKCdmdW5jdGlvbk5hbWUnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5kZWZpbmUoJ2Z1bmN0aW9uTmFtZScsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlcm9mIFBhcnNlLkNsb3VkXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgQ2xvdWQgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRhdGEgVGhlIENsb3VkIEZ1bmN0aW9uIHRvIHJlZ2lzdGVyLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5GdW5jdGlvblJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmRlZmluZSA9IGZ1bmN0aW9uIChmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7IHJlcXVlc3RQYXRoOiBgL2Z1bmN0aW9ucy8ke2Z1bmN0aW9uTmFtZX1gLCAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQgfSxcbiAgICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxufTtcblxuLyoqXG4gKiBEZWZpbmVzIGEgQmFja2dyb3VuZCBKb2IuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogQG1ldGhvZCBqb2JcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmpvYlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIEJhY2tncm91bmQgSm9iXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBCYWNrZ3JvdW5kIEpvYiB0byByZWdpc3Rlci4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgc2hvdWxkIHRha2UgYSBzaW5nbGUgcGFyYW1ldGVycyBhIHtAbGluayBQYXJzZS5DbG91ZC5Kb2JSZXF1ZXN0fVxuICpcbiAqL1xuUGFyc2VDbG91ZC5qb2IgPSBmdW5jdGlvbiAoZnVuY3Rpb25OYW1lLCBoYW5kbGVyKSB7XG4gIHRyaWdnZXJzLmFkZEpvYihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIHNhdmUgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZVNhdmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmUoJ015Q3VzdG9tQ2xhc3MnLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVTYXZlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmJlZm9yZVNhdmVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIHNhdmUgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgc2F2ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9O1xuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlU2F2ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbiAgaWYgKHZhbGlkYXRpb25IYW5kbGVyICYmIHZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCkge1xuICAgIGFkZFJhdGVMaW1pdChcbiAgICAgIHtcbiAgICAgICAgcmVxdWVzdFBhdGg6IGdldFJvdXRlKGNsYXNzTmFtZSksXG4gICAgICAgIHJlcXVlc3RNZXRob2RzOiBbJ1BPU1QnLCAnUFVUJ10sXG4gICAgICAgIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCxcbiAgICAgIH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYmVmb3JlRGVsZXRlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZSgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZURlbGV0ZShQYXJzZS5Vc2VyLCAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KVxuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZURlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRGVsZXRlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgZGVsZXRlIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZURlbGV0ZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBjb25zdCBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUocGFyc2VDbGFzcyk7XG4gIHZhbGlkYXRlVmFsaWRhdG9yKHZhbGlkYXRpb25IYW5kbGVyKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xuICBpZiAodmFsaWRhdGlvbkhhbmRsZXIgJiYgdmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0KSB7XG4gICAgYWRkUmF0ZUxpbWl0KFxuICAgICAge1xuICAgICAgICByZXF1ZXN0UGF0aDogZ2V0Um91dGUoY2xhc3NOYW1lKSxcbiAgICAgICAgcmVxdWVzdE1ldGhvZHM6ICdERUxFVEUnLFxuICAgICAgICAuLi52YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQsXG4gICAgICB9LFxuICAgICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG59O1xuXG4vKipcbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGJlZm9yZSBsb2dpbiBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHByb3ZpZGVzIGZ1cnRoZXIgY29udHJvbFxuICogaW4gdmFsaWRhdGluZyBhIGxvZ2luIGF0dGVtcHQuIFNwZWNpZmljYWxseSxcbiAqIGl0IGlzIHRyaWdnZXJlZCBhZnRlciBhIHVzZXIgZW50ZXJzXG4gKiBjb3JyZWN0IGNyZWRlbnRpYWxzIChvciBvdGhlciB2YWxpZCBhdXRoRGF0YSksXG4gKiBidXQgcHJpb3IgdG8gYSBzZXNzaW9uIGJlaW5nIGdlbmVyYXRlZC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSlcbiAqXG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZUxvZ2luXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5iZWZvcmVMb2dpblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlTG9naW4gPSBmdW5jdGlvbiAoaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgbGV0IGNsYXNzTmFtZSA9ICdfVXNlcic7XG4gIGlmICh0eXBlb2YgaGFuZGxlciA9PT0gJ3N0cmluZycgfHwgaXNQYXJzZU9iamVjdENvbnN0cnVjdG9yKGhhbmRsZXIpKSB7XG4gICAgLy8gdmFsaWRhdGlvbiB3aWxsIG9jY3VyIGRvd25zdHJlYW0sIHRoaXMgaXMgdG8gbWFpbnRhaW4gaW50ZXJuYWxcbiAgICAvLyBjb2RlIGNvbnNpc3RlbmN5IHdpdGggdGhlIG90aGVyIGhvb2sgdHlwZXMuXG4gICAgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKGhhbmRsZXIpO1xuICAgIGhhbmRsZXIgPSBhcmd1bWVudHNbMV07XG4gICAgdmFsaWRhdGlvbkhhbmRsZXIgPSBhcmd1bWVudHMubGVuZ3RoID49IDIgPyBhcmd1bWVudHNbMl0gOiBudWxsO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIGNsYXNzTmFtZSwgaGFuZGxlciwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7IHJlcXVlc3RQYXRoOiBgL2xvZ2luYCwgcmVxdWVzdE1ldGhvZHM6ICdQT1NUJywgLi4udmFsaWRhdGlvbkhhbmRsZXIucmF0ZUxpbWl0IH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9naW4gZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyB0cmlnZ2VyZWQgYWZ0ZXIgYSB1c2VyIGxvZ3MgaW4gc3VjY2Vzc2Z1bGx5LFxuICogYW5kIGFmdGVyIGEgX1Nlc3Npb24gb2JqZWN0IGhhcyBiZWVuIGNyZWF0ZWQuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxvZ2luKChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9naW5cbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTG9naW5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGxvZ2luLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dpbiA9IGZ1bmN0aW9uIChoYW5kbGVyKSB7XG4gIGxldCBjbGFzc05hbWUgPSAnX1VzZXInO1xuICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IGlzUGFyc2VPYmplY3RDb25zdHJ1Y3RvcihoYW5kbGVyKSkge1xuICAgIC8vIHZhbGlkYXRpb24gd2lsbCBvY2N1ciBkb3duc3RyZWFtLCB0aGlzIGlzIHRvIG1haW50YWluIGludGVybmFsXG4gICAgLy8gY29kZSBjb25zaXN0ZW5jeSB3aXRoIHRoZSBvdGhlciBob29rIHR5cGVzLlxuICAgIGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShoYW5kbGVyKTtcbiAgICBoYW5kbGVyID0gYXJndW1lbnRzWzFdO1xuICB9XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJMb2dpbiwgY2xhc3NOYW1lLCBoYW5kbGVyLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbn07XG5cbi8qKlxuICpcbiAqIFJlZ2lzdGVycyB0aGUgYWZ0ZXIgbG9nb3V0IGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgdHJpZ2dlcmVkIGFmdGVyIGEgdXNlciBsb2dzIG91dC5cbiAqXG4gKiBgYGBcbiAqIFBhcnNlLkNsb3VkLmFmdGVyTG9nb3V0KChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTG9nb3V0XG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckxvZ291dFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGFmdGVyIGEgbG9nb3V0LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH07XG4gKi9cblBhcnNlQ2xvdWQuYWZ0ZXJMb2dvdXQgPSBmdW5jdGlvbiAoaGFuZGxlcikge1xuICBsZXQgY2xhc3NOYW1lID0gJ19TZXNzaW9uJztcbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnc3RyaW5nJyB8fCBpc1BhcnNlT2JqZWN0Q29uc3RydWN0b3IoaGFuZGxlcikpIHtcbiAgICAvLyB2YWxpZGF0aW9uIHdpbGwgb2NjdXIgZG93bnN0cmVhbSwgdGhpcyBpcyB0byBtYWludGFpbiBpbnRlcm5hbFxuICAgIC8vIGNvZGUgY29uc2lzdGVuY3kgd2l0aCB0aGUgb3RoZXIgaG9vayB0eXBlcy5cbiAgICBjbGFzc05hbWUgPSB0cmlnZ2Vycy5nZXRDbGFzc05hbWUoaGFuZGxlcik7XG4gICAgaGFuZGxlciA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKHRyaWdnZXJzLlR5cGVzLmFmdGVyTG9nb3V0LCBjbGFzc05hbWUsIGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgc2F2ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJTYXZlIGZvciBhIHByZWRlZmluZWQgY2xhc3MgaW4gdGhlIFBhcnNlIEphdmFTY3JpcHQgU0RLIChlLmcuIHtAbGluayBQYXJzZS5Vc2VyfSBvciB7QGxpbmsgUGFyc2UuRmlsZX0pLCB5b3Ugc2hvdWxkIHBhc3MgdGhlIGNsYXNzIGl0c2VsZiBhbmQgbm90IHRoZSBTdHJpbmcgZm9yIGFyZzEuXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlclNhdmUoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZShQYXJzZS5Vc2VyLCBhc3luYyBmdW5jdGlvbihyZXF1ZXN0KSB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICogYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlclNhdmVcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyU2F2ZVxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYWZ0ZXIgc2F2ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIHNhdmUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBqdXN0IG9uZSBwYXJhbWV0ZXIsIHtAbGluayBQYXJzZS5DbG91ZC5UcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlclNhdmUgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbi5cbiAqXG4gKiAqKkF2YWlsYWJsZSBpbiBDbG91ZCBDb2RlIG9ubHkuKipcbiAqXG4gKiBJZiB5b3Ugd2FudCB0byB1c2UgYWZ0ZXJEZWxldGUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGUoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckRlbGV0ZShQYXJzZS5Vc2VyLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIHsgLi4udmFsaWRhdGlvbk9iamVjdCB9KTtcbiAqYGBgXG4gKlxuICogQG1ldGhvZCBhZnRlckRlbGV0ZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYWZ0ZXJEZWxldGVcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGRlbGV0ZSBmdW5jdGlvbiBmb3IuIFRoaXMgY2FuIGluc3RlYWQgYmUgYSBTdHJpbmcgdGhhdCBpcyB0aGUgY2xhc3NOYW1lIG9mIHRoZSBzdWJjbGFzcy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1biBhZnRlciBhIGRlbGV0ZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmFmdGVyRGVsZXRlID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGJlZm9yZUZpbmQgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlRmluZCgnTXlDdXN0b21DbGFzcycsIGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlRmluZFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlRmluZFxuICogQHBhcmFtIHsoU3RyaW5nfFBhcnNlLk9iamVjdCl9IGFyZzEgVGhlIFBhcnNlLk9iamVjdCBzdWJjbGFzcyB0byByZWdpc3RlciB0aGUgYmVmb3JlIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuQmVmb3JlRmluZFJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZUZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICBjbGFzc05hbWUsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG4gIGlmICh2YWxpZGF0aW9uSGFuZGxlciAmJiB2YWxpZGF0aW9uSGFuZGxlci5yYXRlTGltaXQpIHtcbiAgICBhZGRSYXRlTGltaXQoXG4gICAgICB7XG4gICAgICAgIHJlcXVlc3RQYXRoOiBnZXRSb3V0ZShjbGFzc05hbWUpLFxuICAgICAgICByZXF1ZXN0TWV0aG9kczogJ0dFVCcsXG4gICAgICAgIC4uLnZhbGlkYXRpb25IYW5kbGVyLnJhdGVMaW1pdCxcbiAgICAgIH0sXG4gICAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIGFmdGVyIGZpbmQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogSWYgeW91IHdhbnQgdG8gdXNlIGFmdGVyRmluZCBmb3IgYSBwcmVkZWZpbmVkIGNsYXNzIGluIHRoZSBQYXJzZSBKYXZhU2NyaXB0IFNESyAoZS5nLiB7QGxpbmsgUGFyc2UuVXNlcn0gb3Ige0BsaW5rIFBhcnNlLkZpbGV9KSwgeW91IHNob3VsZCBwYXNzIHRoZSBjbGFzcyBpdHNlbGYgYW5kIG5vdCB0aGUgU3RyaW5nIGZvciBhcmcxLlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoJ015Q3VzdG9tQ2xhc3MnLCBhc3luYyAocmVxdWVzdCkgPT4ge1xuICogICAvLyBjb2RlIGhlcmVcbiAqIH0sIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIHZhbGlkYXRpb24gY29kZSBoZXJlXG4gKiB9KTtcbiAqXG4gKiBQYXJzZS5DbG91ZC5hZnRlckZpbmQoUGFyc2UuVXNlciwgYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYWZ0ZXJGaW5kXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5hZnRlckZpbmRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGZpbmQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYmVmb3JlIGEgZmluZC4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkFmdGVyRmluZFJlcXVlc3R9LlxuICogQHBhcmFtIHsoT2JqZWN0fEZ1bmN0aW9uKX0gdmFsaWRhdG9yIEFuIG9wdGlvbmFsIGZ1bmN0aW9uIHRvIGhlbHAgdmFsaWRhdGluZyBjbG91ZCBjb2RlLiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhbiBhc3luYyBmdW5jdGlvbiBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciBhIHtAbGluayBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0fSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckZpbmQgPSBmdW5jdGlvbiAocGFyc2VDbGFzcywgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gdHJpZ2dlcnMuZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpO1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZFRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIGNsYXNzTmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIFBhcnNlLmFwcGxpY2F0aW9uSWQsXG4gICAgdmFsaWRhdGlvbkhhbmRsZXJcbiAgKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGxpdmUgcXVlcnkgc2VydmVyIGNvbm5lY3QgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5iZWZvcmVDb25uZWN0KGFzeW5jIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gdmFsaWRhdGlvbiBjb2RlIGhlcmVcbiAqIH0pO1xuICpcbiAqIFBhcnNlLkNsb3VkLmJlZm9yZUNvbm5lY3QoYXN5bmMgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCB7IC4uLnZhbGlkYXRpb25PYmplY3QgfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2QgYmVmb3JlQ29ubmVjdFxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlQ29ubmVjdFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYmVmb3JlIGNvbm5lY3Rpb24gaXMgbWFkZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIGp1c3Qgb25lIHBhcmFtZXRlciwge0BsaW5rIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdH0uXG4gKiBAcGFyYW0geyhPYmplY3R8RnVuY3Rpb24pfSB2YWxpZGF0b3IgQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gaGVscCB2YWxpZGF0aW5nIGNsb3VkIGNvZGUuIFRoaXMgZnVuY3Rpb24gY2FuIGJlIGFuIGFzeW5jIGZ1bmN0aW9uIGFuZCBzaG91bGQgdGFrZSBvbmUgcGFyYW1ldGVyIGEge0BsaW5rIFBhcnNlLkNsb3VkLkNvbm5lY3RUcmlnZ2VyUmVxdWVzdH0sIG9yIGEge0BsaW5rIFBhcnNlLkNsb3VkLlZhbGlkYXRvck9iamVjdH0uXG4gKi9cblBhcnNlQ2xvdWQuYmVmb3JlQ29ubmVjdCA9IGZ1bmN0aW9uIChoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIHRyaWdnZXJzLmFkZENvbm5lY3RUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUNvbm5lY3QsXG4gICAgaGFuZGxlcixcbiAgICBQYXJzZS5hcHBsaWNhdGlvbklkLFxuICAgIHZhbGlkYXRpb25IYW5kbGVyXG4gICk7XG59O1xuXG4vKipcbiAqIFNlbmRzIGFuIGVtYWlsIHRocm91Z2ggdGhlIFBhcnNlIFNlcnZlciBtYWlsIGFkYXB0ZXIuXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKiAqKlJlcXVpcmVzIGEgbWFpbCBhZGFwdGVyIHRvIGJlIGNvbmZpZ3VyZWQgZm9yIFBhcnNlIFNlcnZlci4qKlxuICpcbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuc2VuZEVtYWlsKHtcbiAqICAgZnJvbTogJ0V4YW1wbGUgPHRlc3RAZXhhbXBsZS5jb20+JyxcbiAqICAgdG86ICdjb250YWN0QGV4YW1wbGUuY29tJyxcbiAqICAgc3ViamVjdDogJ1Rlc3QgZW1haWwnLFxuICogICB0ZXh0OiAnVGhpcyBlbWFpbCBpcyBhIHRlc3QuJ1xuICogfSk7XG4gKmBgYFxuICpcbiAqIEBtZXRob2Qgc2VuZEVtYWlsXG4gKiBAbmFtZSBQYXJzZS5DbG91ZC5zZW5kRW1haWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhIFRoZSBvYmplY3Qgb2YgdGhlIG1haWwgZGF0YSB0byBzZW5kLlxuICovXG5QYXJzZUNsb3VkLnNlbmRFbWFpbCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGNvbnN0IGVtYWlsQWRhcHRlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgIGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKFxuICAgICAgJ0ZhaWxlZCB0byBzZW5kIGVtYWlsIGJlY2F1c2Ugbm8gbWFpbCBhZGFwdGVyIGlzIGNvbmZpZ3VyZWQgZm9yIFBhcnNlIFNlcnZlci4nXG4gICAgKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGVtYWlsQWRhcHRlci5zZW5kTWFpbChkYXRhKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgYmVmb3JlIGxpdmUgcXVlcnkgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uLlxuICpcbiAqICoqQXZhaWxhYmxlIGluIENsb3VkIENvZGUgb25seS4qKlxuICpcbiAqIElmIHlvdSB3YW50IHRvIHVzZSBiZWZvcmVTdWJzY3JpYmUgZm9yIGEgcHJlZGVmaW5lZCBjbGFzcyBpbiB0aGUgUGFyc2UgSmF2YVNjcmlwdCBTREsgKGUuZy4ge0BsaW5rIFBhcnNlLlVzZXJ9IG9yIHtAbGluayBQYXJzZS5GaWxlfSksIHlvdSBzaG91bGQgcGFzcyB0aGUgY2xhc3MgaXRzZWxmIGFuZCBub3QgdGhlIFN0cmluZyBmb3IgYXJnMS5cbiAqIGBgYFxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlKFBhcnNlLlVzZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGJlZm9yZVN1YnNjcmliZVxuICogQG5hbWUgUGFyc2UuQ2xvdWQuYmVmb3JlU3Vic2NyaWJlXG4gKiBAcGFyYW0geyhTdHJpbmd8UGFyc2UuT2JqZWN0KX0gYXJnMSBUaGUgUGFyc2UuT2JqZWN0IHN1YmNsYXNzIHRvIHJlZ2lzdGVyIHRoZSBiZWZvcmUgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGZvci4gVGhpcyBjYW4gaW5zdGVhZCBiZSBhIFN0cmluZyB0aGF0IGlzIHRoZSBjbGFzc05hbWUgb2YgdGhlIHN1YmNsYXNzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuIGJlZm9yZSBhIHN1YnNjcmlwdGlvbi4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYXN5bmMgYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIsIGEge0BsaW5rIFBhcnNlLkNsb3VkLlRyaWdnZXJSZXF1ZXN0fS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3R9LCBvciBhIHtAbGluayBQYXJzZS5DbG91ZC5WYWxpZGF0b3JPYmplY3R9LlxuICovXG5QYXJzZUNsb3VkLmJlZm9yZVN1YnNjcmliZSA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZVZhbGlkYXRvcih2YWxpZGF0aW9uSGFuZGxlcik7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdHJpZ2dlcnMuYWRkVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTdWJzY3JpYmUsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5vbkxpdmVRdWVyeUV2ZW50ID0gZnVuY3Rpb24gKGhhbmRsZXIpIHtcbiAgdHJpZ2dlcnMuYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyKGhhbmRsZXIsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gYWZ0ZXIgbGl2ZSBxdWVyeSBzZXJ2ZXIgZXZlbnQgZnVuY3Rpb24uXG4gKlxuICogKipBdmFpbGFibGUgaW4gQ2xvdWQgQ29kZSBvbmx5LioqXG4gKlxuICogYGBgXG4gKiBQYXJzZS5DbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50KCdNeUN1c3RvbUNsYXNzJywgKHJlcXVlc3QpID0+IHtcbiAqICAgLy8gY29kZSBoZXJlXG4gKiB9LCAocmVxdWVzdCkgPT4ge1xuICogICAvLyB2YWxpZGF0aW9uIGNvZGUgaGVyZVxuICogfSk7XG4gKlxuICogUGFyc2UuQ2xvdWQuYWZ0ZXJMaXZlUXVlcnlFdmVudCgnTXlDdXN0b21DbGFzcycsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIC8vIGNvZGUgaGVyZVxuICogfSwgeyAuLi52YWxpZGF0aW9uT2JqZWN0IH0pO1xuICpgYGBcbiAqXG4gKiBAbWV0aG9kIGFmdGVyTGl2ZVF1ZXJ5RXZlbnRcbiAqIEBuYW1lIFBhcnNlLkNsb3VkLmFmdGVyTGl2ZVF1ZXJ5RXZlbnRcbiAqIEBwYXJhbSB7KFN0cmluZ3xQYXJzZS5PYmplY3QpfSBhcmcxIFRoZSBQYXJzZS5PYmplY3Qgc3ViY2xhc3MgdG8gcmVnaXN0ZXIgdGhlIGFmdGVyIGxpdmUgcXVlcnkgZXZlbnQgZnVuY3Rpb24gZm9yLiBUaGlzIGNhbiBpbnN0ZWFkIGJlIGEgU3RyaW5nIHRoYXQgaXMgdGhlIGNsYXNzTmFtZSBvZiB0aGUgc3ViY2xhc3MuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBydW4gYWZ0ZXIgYSBsaXZlIHF1ZXJ5IGV2ZW50LiBUaGlzIGZ1bmN0aW9uIGNhbiBiZSBhc3luYyBhbmQgc2hvdWxkIHRha2Ugb25lIHBhcmFtZXRlciwgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyfS5cbiAqIEBwYXJhbSB7KE9iamVjdHxGdW5jdGlvbil9IHZhbGlkYXRvciBBbiBvcHRpb25hbCBmdW5jdGlvbiB0byBoZWxwIHZhbGlkYXRpbmcgY2xvdWQgY29kZS4gVGhpcyBmdW5jdGlvbiBjYW4gYmUgYW4gYXN5bmMgZnVuY3Rpb24gYW5kIHNob3VsZCB0YWtlIG9uZSBwYXJhbWV0ZXIgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuTGl2ZVF1ZXJ5RXZlbnRUcmlnZ2VyfSwgb3IgYSB7QGxpbmsgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0fS5cbiAqL1xuUGFyc2VDbG91ZC5hZnRlckxpdmVRdWVyeUV2ZW50ID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3MsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHRyaWdnZXJzLmdldENsYXNzTmFtZShwYXJzZUNsYXNzKTtcbiAgdmFsaWRhdGVWYWxpZGF0b3IodmFsaWRhdGlvbkhhbmRsZXIpO1xuICB0cmlnZ2Vycy5hZGRUcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRXZlbnQsXG4gICAgY2xhc3NOYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgUGFyc2UuYXBwbGljYXRpb25JZCxcbiAgICB2YWxpZGF0aW9uSGFuZGxlclxuICApO1xufTtcblxuUGFyc2VDbG91ZC5fcmVtb3ZlQWxsSG9va3MgPSAoKSA9PiB7XG4gIHRyaWdnZXJzLl91bnJlZ2lzdGVyQWxsKCk7XG4gIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGNvbmZpZz8udW5yZWdpc3RlclJhdGVMaW1pdGVycygpO1xufTtcblxuUGFyc2VDbG91ZC51c2VNYXN0ZXJLZXkgPSAoKSA9PiB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuICBjb25zb2xlLndhcm4oXG4gICAgJ1BhcnNlLkNsb3VkLnVzZU1hc3RlcktleSBpcyBkZXByZWNhdGVkIChhbmQgaGFzIG5vIGVmZmVjdCBhbnltb3JlKSBvbiBwYXJzZS1zZXJ2ZXIsIHBsZWFzZSByZWZlciB0byB0aGUgY2xvdWQgY29kZSBtaWdyYXRpb24gbm90ZXM6IGh0dHA6Ly9kb2NzLnBhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9ndWlkZS8jbWFzdGVyLWtleS1tdXN0LWJlLXBhc3NlZC1leHBsaWNpdGx5J1xuICApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQYXJzZUNsb3VkO1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGlzQ2hhbGxlbmdlIElmIHRydWUsIG1lYW5zIHRoZSBjdXJyZW50IHJlcXVlc3QgaXMgb3JpZ2luYWxseSB0cmlnZ2VyZWQgYnkgYW4gYXV0aCBjaGFsbGVuZ2UuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpcCBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgY2xpZW50IG1ha2luZyB0aGUgcmVxdWVzdC4gVG8gZW5zdXJlIHJldHJpZXZpbmcgdGhlIGNvcnJlY3QgSVAgYWRkcmVzcywgc2V0IHRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIGB0cnVzdFByb3h5OiB0cnVlYCBpZiBQYXJzZSBTZXJ2ZXIgcnVucyBiZWhpbmQgYSBwcm94eSBzZXJ2ZXIsIGZvciBleGFtcGxlIGJlaGluZCBhIGxvYWQgYmFsYW5jZXIuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvcmlnaW5hbCBJZiBzZXQsIHRoZSBvYmplY3QsIGFzIGN1cnJlbnRseSBzdG9yZWQuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5GaWxlVHJpZ2dlclJlcXVlc3RcbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBpbnN0YWxsYXRpb25JZCBJZiBzZXQsIHRoZSBpbnN0YWxsYXRpb25JZCB0cmlnZ2VyaW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtCb29sZWFufSBtYXN0ZXIgSWYgdHJ1ZSwgbWVhbnMgdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4gKiBAcHJvcGVydHkge1BhcnNlLlVzZXJ9IHVzZXIgSWYgc2V0LCB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLkZpbGV9IGZpbGUgVGhlIGZpbGUgdGhhdCB0cmlnZ2VyZWQgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGZpbGVTaXplIFRoZSBzaXplIG9mIHRoZSBmaWxlIGluIGJ5dGVzLlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjb250ZW50TGVuZ3RoIFRoZSB2YWx1ZSBmcm9tIENvbnRlbnQtTGVuZ3RoIGhlYWRlclxuICogQHByb3BlcnR5IHtTdHJpbmd9IGlwIFRoZSBJUCBhZGRyZXNzIG9mIHRoZSBjbGllbnQgbWFraW5nIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtPYmplY3R9IGhlYWRlcnMgVGhlIG9yaWdpbmFsIEhUVFAgaGVhZGVycyBmb3IgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gdHJpZ2dlck5hbWUgVGhlIG5hbWUgb2YgdGhlIHRyaWdnZXIgKGBiZWZvcmVTYXZlYCwgYGFmdGVyU2F2ZWApXG4gKiBAcHJvcGVydHkge09iamVjdH0gbG9nIFRoZSBjdXJyZW50IGxvZ2dlciBpbnNpZGUgUGFyc2UgU2VydmVyLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuQ29ubmVjdFRyaWdnZXJSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gdXNlTWFzdGVyS2V5IElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtJbnRlZ2VyfSBjbGllbnRzIFRoZSBudW1iZXIgb2YgY2xpZW50cyBjb25uZWN0ZWQuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IHN1YnNjcmlwdGlvbnMgVGhlIG51bWJlciBvZiBzdWJzY3JpcHRpb25zIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBzZXNzaW9uVG9rZW4gSWYgc2V0LCB0aGUgc2Vzc2lvbiBvZiB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkxpdmVRdWVyeUV2ZW50VHJpZ2dlclxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHVzZU1hc3RlcktleSBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBzZXNzaW9uVG9rZW4gSWYgc2V0LCB0aGUgc2Vzc2lvbiBvZiB0aGUgdXNlciB0aGF0IG1hZGUgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gZXZlbnQgVGhlIGxpdmUgcXVlcnkgZXZlbnQgdGhhdCB0cmlnZ2VyZWQgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1BhcnNlLk9iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdHJpZ2dlcmluZyB0aGUgaG9vay5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuT2JqZWN0fSBvcmlnaW5hbCBJZiBzZXQsIHRoZSBvYmplY3QsIGFzIGN1cnJlbnRseSBzdG9yZWQuXG4gKiBAcHJvcGVydHkge0ludGVnZXJ9IGNsaWVudHMgVGhlIG51bWJlciBvZiBjbGllbnRzIGNvbm5lY3RlZC5cbiAqIEBwcm9wZXJ0eSB7SW50ZWdlcn0gc3Vic2NyaXB0aW9ucyBUaGUgbnVtYmVyIG9mIHN1YnNjcmlwdGlvbnMgY29ubmVjdGVkLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBzZW5kRXZlbnQgSWYgdGhlIExpdmVRdWVyeSBldmVudCBzaG91bGQgYmUgc2VudCB0byB0aGUgY2xpZW50LiBTZXQgdG8gZmFsc2UgdG8gcHJldmVudCBMaXZlUXVlcnkgZnJvbSBwdXNoaW5nIHRvIHRoZSBjbGllbnQuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkJlZm9yZUZpbmRSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5RdWVyeX0gcXVlcnkgVGhlIHF1ZXJ5IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gaXNHZXQgd2V0aGVyIHRoZSBxdWVyeSBhIGBnZXRgIG9yIGEgYGZpbmRgXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29uZmlnIFRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlnLlxuICovXG5cbi8qKlxuICogQGludGVyZmFjZSBQYXJzZS5DbG91ZC5BZnRlckZpbmRSZXF1ZXN0XG4gKiBAcHJvcGVydHkge1N0cmluZ30gaW5zdGFsbGF0aW9uSWQgSWYgc2V0LCB0aGUgaW5zdGFsbGF0aW9uSWQgdHJpZ2dlcmluZyB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7Qm9vbGVhbn0gbWFzdGVyIElmIHRydWUsIG1lYW5zIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuICogQHByb3BlcnR5IHtQYXJzZS5Vc2VyfSB1c2VyIElmIHNldCwgdGhlIHVzZXIgdGhhdCBtYWRlIHRoZSByZXF1ZXN0LlxuICogQHByb3BlcnR5IHtQYXJzZS5RdWVyeX0gcXVlcnkgVGhlIHF1ZXJ5IHRyaWdnZXJpbmcgdGhlIGhvb2suXG4gKiBAcHJvcGVydHkge0FycmF5PFBhcnNlLk9iamVjdD59IHJlc3VsdHMgVGhlIHJlc3VsdHMgdGhlIHF1ZXJ5IHlpZWxkZWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gaXAgVGhlIElQIGFkZHJlc3Mgb2YgdGhlIGNsaWVudCBtYWtpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge09iamVjdH0gaGVhZGVycyBUaGUgb3JpZ2luYWwgSFRUUCBoZWFkZXJzIGZvciB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0cmlnZ2VyTmFtZSBUaGUgbmFtZSBvZiB0aGUgdHJpZ2dlciAoYGJlZm9yZVNhdmVgLCBgYWZ0ZXJTYXZlYCwgLi4uKVxuICogQHByb3BlcnR5IHtPYmplY3R9IGxvZyBUaGUgY3VycmVudCBsb2dnZXIgaW5zaWRlIFBhcnNlIFNlcnZlci5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWcuXG4gKi9cblxuLyoqXG4gKiBAaW50ZXJmYWNlIFBhcnNlLkNsb3VkLkZ1bmN0aW9uUmVxdWVzdFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGluc3RhbGxhdGlvbklkIElmIHNldCwgdGhlIGluc3RhbGxhdGlvbklkIHRyaWdnZXJpbmcgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IG1hc3RlciBJZiB0cnVlLCBtZWFucyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7UGFyc2UuVXNlcn0gdXNlciBJZiBzZXQsIHRoZSB1c2VyIHRoYXQgbWFkZSB0aGUgcmVxdWVzdC5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtcyBwYXNzZWQgdG8gdGhlIGNsb3VkIGZ1bmN0aW9uLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuSm9iUmVxdWVzdFxuICogQHByb3BlcnR5IHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1zIHBhc3NlZCB0byB0aGUgYmFja2dyb3VuZCBqb2IuXG4gKiBAcHJvcGVydHkge2Z1bmN0aW9ufSBtZXNzYWdlIElmIG1lc3NhZ2UgaXMgY2FsbGVkIHdpdGggYSBzdHJpbmcgYXJndW1lbnQsIHdpbGwgdXBkYXRlIHRoZSBjdXJyZW50IG1lc3NhZ2UgdG8gYmUgc3RvcmVkIGluIHRoZSBqb2Igc3RhdHVzLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvbmZpZyBUaGUgUGFyc2UgU2VydmVyIGNvbmZpZy5cbiAqL1xuXG4vKipcbiAqIEBpbnRlcmZhY2UgUGFyc2UuQ2xvdWQuVmFsaWRhdG9yT2JqZWN0XG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IHJlcXVpcmVVc2VyIHdoZXRoZXIgdGhlIGNsb3VkIHRyaWdnZXIgcmVxdWlyZXMgYSB1c2VyLlxuICogQHByb3BlcnR5IHtCb29sZWFufSByZXF1aXJlTWFzdGVyIHdoZXRoZXIgdGhlIGNsb3VkIHRyaWdnZXIgcmVxdWlyZXMgYSBtYXN0ZXIga2V5LlxuICogQHByb3BlcnR5IHtCb29sZWFufSB2YWxpZGF0ZU1hc3RlcktleSB3aGV0aGVyIHRoZSB2YWxpZGF0b3Igc2hvdWxkIHJ1biBpZiBtYXN0ZXJLZXkgaXMgcHJvdmlkZWQuIERlZmF1bHRzIHRvIGZhbHNlLlxuICogQHByb3BlcnR5IHtCb29sZWFufSBza2lwV2l0aE1hc3RlcktleSB3aGV0aGVyIHRoZSBjbG91ZCBjb2RlIGZ1bmN0aW9uIHNob3VsZCBiZSBpZ25vcmVkIHVzaW5nIGEgbWFzdGVyS2V5LlxuICpcbiAqIEBwcm9wZXJ0eSB7QXJyYXk8U3RyaW5nPnxPYmplY3R9IHJlcXVpcmVVc2VyS2V5cyBJZiBzZXQsIGtleXMgcmVxdWlyZWQgb24gcmVxdWVzdC51c2VyIHRvIG1ha2UgdGhlIHJlcXVlc3QuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gcmVxdWlyZVVzZXJLZXlzLmZpZWxkIElmIHJlcXVpcmVVc2VyS2V5cyBpcyBhbiBvYmplY3QsIG5hbWUgb2YgZmllbGQgdG8gdmFsaWRhdGUgb24gcmVxdWVzdCB1c2VyXG4gKiBAcHJvcGVydHkge0FycmF5fGZ1bmN0aW9ufEFueX0gcmVxdWlyZVVzZXJLZXlzLmZpZWxkLm9wdGlvbnMgYXJyYXkgb2Ygb3B0aW9ucyB0aGF0IHRoZSBmaWVsZCBjYW4gYmUsIGZ1bmN0aW9uIHRvIHZhbGlkYXRlIGZpZWxkLCBvciBzaW5nbGUgdmFsdWUuIFRocm93IGFuIGVycm9yIGlmIHZhbHVlIGlzIGludmFsaWQuXG4gKiBAcHJvcGVydHkge1N0cmluZ30gcmVxdWlyZVVzZXJLZXlzLmZpZWxkLmVycm9yIGN1c3RvbSBlcnJvciBtZXNzYWdlIGlmIGZpZWxkIGlzIGludmFsaWQuXG4gKlxuICogQHByb3BlcnR5IHtBcnJheTxTdHJpbmc+fGZ1bmN0aW9ufXJlcXVpcmVBbnlVc2VyUm9sZXMgSWYgc2V0LCByZXF1ZXN0LnVzZXIgaGFzIHRvIGJlIHBhcnQgb2YgYXQgbGVhc3Qgb25lIHJvbGVzIG5hbWUgdG8gbWFrZSB0aGUgcmVxdWVzdC4gSWYgc2V0IHRvIGEgZnVuY3Rpb24sIGZ1bmN0aW9uIG11c3QgcmV0dXJuIHJvbGUgbmFtZXMuXG4gKiBAcHJvcGVydHkge0FycmF5PFN0cmluZz58ZnVuY3Rpb259cmVxdWlyZUFsbFVzZXJSb2xlcyBJZiBzZXQsIHJlcXVlc3QudXNlciBoYXMgdG8gYmUgcGFydCBhbGwgcm9sZXMgbmFtZSB0byBtYWtlIHRoZSByZXF1ZXN0LiBJZiBzZXQgdG8gYSBmdW5jdGlvbiwgZnVuY3Rpb24gbXVzdCByZXR1cm4gcm9sZSBuYW1lcy5cbiAqXG4gKiBAcHJvcGVydHkge09iamVjdHxBcnJheTxTdHJpbmc+fSBmaWVsZHMgaWYgYW4gYXJyYXkgb2Ygc3RyaW5ncywgdmFsaWRhdG9yIHdpbGwgbG9vayBmb3Iga2V5cyBpbiByZXF1ZXN0LnBhcmFtcywgYW5kIHRocm93IGlmIG5vdCBwcm92aWRlZC4gSWYgT2JqZWN0LCBmaWVsZHMgdG8gdmFsaWRhdGUuIElmIHRoZSB0cmlnZ2VyIGlzIGEgY2xvdWQgZnVuY3Rpb24sIGByZXF1ZXN0LnBhcmFtc2Agd2lsbCBiZSB2YWxpZGF0ZWQsIG90aGVyd2lzZSBgcmVxdWVzdC5vYmplY3RgLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZCBuYW1lIG9mIGZpZWxkIHRvIHZhbGlkYXRlLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IGZpZWxkcy5maWVsZC50eXBlIGV4cGVjdGVkIHR5cGUgb2YgZGF0YSBmb3IgZmllbGQuXG4gKiBAcHJvcGVydHkge0Jvb2xlYW59IGZpZWxkcy5maWVsZC5jb25zdGFudCB3aGV0aGVyIHRoZSBmaWVsZCBjYW4gYmUgbW9kaWZpZWQgb24gdGhlIG9iamVjdC5cbiAqIEBwcm9wZXJ0eSB7QW55fSBmaWVsZHMuZmllbGQuZGVmYXVsdCBkZWZhdWx0IHZhbHVlIGlmIGZpZWxkIGlzIGBudWxsYCwgb3IgaW5pdGlhbCB2YWx1ZSBgY29uc3RhbnRgIGlzIGB0cnVlYC5cbiAqIEBwcm9wZXJ0eSB7QXJyYXl8ZnVuY3Rpb258QW55fSBmaWVsZHMuZmllbGQub3B0aW9ucyBhcnJheSBvZiBvcHRpb25zIHRoYXQgdGhlIGZpZWxkIGNhbiBiZSwgZnVuY3Rpb24gdG8gdmFsaWRhdGUgZmllbGQsIG9yIHNpbmdsZSB2YWx1ZS4gVGhyb3cgYW4gZXJyb3IgaWYgdmFsdWUgaXMgaW52YWxpZC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBmaWVsZHMuZmllbGQuZXJyb3IgY3VzdG9tIGVycm9yIG1lc3NhZ2UgaWYgZmllbGQgaXMgaW52YWxpZC5cbiAqL1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFFBQUEsR0FBQUMsdUJBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLFlBQUEsR0FBQUgsT0FBQTtBQUE4QyxTQUFBSSx5QkFBQUMsQ0FBQSw2QkFBQUMsT0FBQSxtQkFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxDQUFBLFdBQUFBLENBQUEsR0FBQUcsQ0FBQSxHQUFBRCxDQUFBLEtBQUFGLENBQUE7QUFBQSxTQUFBSCx3QkFBQUcsQ0FBQSxFQUFBRSxDQUFBLFNBQUFBLENBQUEsSUFBQUYsQ0FBQSxJQUFBQSxDQUFBLENBQUFJLFVBQUEsU0FBQUosQ0FBQSxlQUFBQSxDQUFBLHVCQUFBQSxDQUFBLHlCQUFBQSxDQUFBLFdBQUFLLE9BQUEsRUFBQUwsQ0FBQSxRQUFBRyxDQUFBLEdBQUFKLHdCQUFBLENBQUFHLENBQUEsT0FBQUMsQ0FBQSxJQUFBQSxDQUFBLENBQUFHLEdBQUEsQ0FBQU4sQ0FBQSxVQUFBRyxDQUFBLENBQUFJLEdBQUEsQ0FBQVAsQ0FBQSxPQUFBUSxDQUFBLEtBQUFDLFNBQUEsVUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLGNBQUEsSUFBQUQsTUFBQSxDQUFBRSx3QkFBQSxXQUFBQyxDQUFBLElBQUFkLENBQUEsb0JBQUFjLENBQUEsT0FBQUMsY0FBQSxDQUFBQyxJQUFBLENBQUFoQixDQUFBLEVBQUFjLENBQUEsU0FBQUcsQ0FBQSxHQUFBUCxDQUFBLEdBQUFDLE1BQUEsQ0FBQUUsd0JBQUEsQ0FBQWIsQ0FBQSxFQUFBYyxDQUFBLFVBQUFHLENBQUEsS0FBQUEsQ0FBQSxDQUFBVixHQUFBLElBQUFVLENBQUEsQ0FBQUMsR0FBQSxJQUFBUCxNQUFBLENBQUFDLGNBQUEsQ0FBQUos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