"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = _interopRequireDefault(require("./logger"));
var _SchemaController = require("./Controllers/SchemaController");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
var deepcopy = require('deepcopy');
const Auth = require('./Auth');
const Utils = require('./Utils');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var Parse = require('parse/node');
var triggers = require('./triggers');
var ClientSDK = require('./ClientSDK');
const util = require('util');
// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, clientSDK, context, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = context || {};
  if (action) {
    this.runOptions.action = action;
  }
  if (!query) {
    if (this.config.allowCustomObjectId) {
      if (Object.prototype.hasOwnProperty.call(data, 'objectId') && !data.objectId) {
        throw new Parse.Error(Parse.Error.MISSING_OBJECT_ID, 'objectId must not be empty, null or undefined');
      }
    } else {
      if (data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
      }
      if (data.id) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
      }
    }
  }

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = deepcopy(query);
  this.data = deepcopy(data);
  // We never change originalData, so we do not need a deep copy
  this.originalData = originalData;

  // The timestamp we'll use for this whole operation
  this.updatedAt = Parse._encode(new Date()).iso;

  // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable
  this.validSchemaController = null;
  this.pendingOps = {
    operations: null,
    identifier: null
  };
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.handleInstallation();
  }).then(() => {
    return this.handleSession();
  }).then(() => {
    return this.validateAuthData();
  }).then(() => {
    return this.checkRestrictedFields();
  }).then(() => {
    return this.runBeforeSaveTrigger();
  }).then(() => {
    return this.ensureUniqueAuthDataId();
  }).then(() => {
    return this.deleteEmailResetTokenIfNeeded();
  }).then(() => {
    return this.validateSchema();
  }).then(schemaController => {
    this.validSchemaController = schemaController;
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.destroyDuplicatedSessions();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterSaveTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    // Append the authDataResponse if exists
    if (this.authDataResponse) {
      if (this.response && this.response.response) {
        this.response.response.authDataResponse = this.authDataResponse;
      }
    }
    if (this.storage.rejectSignup && this.config.preventSignupWithUnverifiedEmail) {
      throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
    }
    return this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return Promise.resolve();
  }
  this.runOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.runOptions.acl = this.runOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the allowClientClassCreation config.
RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && !this.auth.isMaintenance && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions, this.auth.isMaintenance);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  const identifier = updatedObject._getStateIdentifier();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(identifier);
  this.pendingOps = {
    operations: _objectSpread({}, pending),
    identifier
  };
  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;
    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    }
    // In the case that there is no permission for the operation, it throws an error
    return databasePromise.then(result => {
      if (!result || result.length <= 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    });
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config, this.context);
  }).then(response => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _lodash.default.reduce(response.object, (result, value, key) => {
        if (!_lodash.default.isEqual(this.data[key], value)) {
          result.push(key);
        }
        return result;
      }, []);
      this.data = response.object;
      // We should delete the objectId for an update write
      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
    try {
      Utils.checkProhibitedKeywords(this.config, this.data);
    } catch (error) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, error);
    }
  });
};
RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  }

  // Cloud code gets a bit of extra data for its objects
  const extraData = {
    className: this.className
  };

  // Expand file objects
  this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData);

  // no need to return a response
  await triggers.maybeRunTrigger(triggers.Types.beforeLogin, this.auth, user, null, this.config, this.context);
};
RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    return this.validSchemaController.getAllClasses().then(allClasses => {
      const schema = allClasses.find(oneClass => oneClass.className === this.className);
      const setRequiredFieldIfNeeded = (fieldName, setDefault) => {
        if (this.data[fieldName] === undefined || this.data[fieldName] === null || this.data[fieldName] === '' || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete') {
          if (setDefault && schema.fields[fieldName] && schema.fields[fieldName].defaultValue !== null && schema.fields[fieldName].defaultValue !== undefined && (this.data[fieldName] === undefined || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete')) {
            this.data[fieldName] = schema.fields[fieldName].defaultValue;
            this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];
            if (this.storage.fieldsChangedByTrigger.indexOf(fieldName) < 0) {
              this.storage.fieldsChangedByTrigger.push(fieldName);
            }
          } else if (schema.fields[fieldName] && schema.fields[fieldName].required === true) {
            throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} is required`);
          }
        }
      };

      // Add default fields
      if (!this.query) {
        // allow customizing createdAt and updatedAt when using maintenance key
        if (this.auth.isMaintenance && this.data.createdAt && this.data.createdAt.__type === 'Date') {
          this.data.createdAt = this.data.createdAt.iso;
          if (this.data.updatedAt && this.data.updatedAt.__type === 'Date') {
            const createdAt = new Date(this.data.createdAt);
            const updatedAt = new Date(this.data.updatedAt.iso);
            if (updatedAt < createdAt) {
              throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'updatedAt cannot occur before createdAt');
            }
            this.data.updatedAt = this.data.updatedAt.iso;
          }
          // if no updatedAt is provided, set it to createdAt to match default behavior
          else {
            this.data.updatedAt = this.data.createdAt;
          }
        } else {
          this.data.updatedAt = this.updatedAt;
          this.data.createdAt = this.updatedAt;
        }

        // Only assign new objectId if we are creating new object
        if (!this.data.objectId) {
          this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
        }
        if (schema) {
          Object.keys(schema.fields).forEach(fieldName => {
            setRequiredFieldIfNeeded(fieldName, true);
          });
        }
      } else if (schema) {
        this.data.updatedAt = this.updatedAt;
        Object.keys(this.data).forEach(fieldName => {
          setRequiredFieldIfNeeded(fieldName, false);
        });
      }
    });
  }
  return Promise.resolve();
};

// Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }
  const authData = this.data.authData;
  const hasUsernameAndPassword = typeof this.data.username === 'string' && typeof this.data.password === 'string';
  if (!this.query && !authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }
  if (authData && !Object.keys(authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Nothing to validate here
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }
  var providers = Object.keys(authData);
  if (providers.length > 0) {
    const canHandleAuthData = providers.some(provider => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return hasToken || providerAuthData === null;
    });
    if (canHandleAuthData || hasUsernameAndPassword || this.auth.isMaster || this.getUserId()) {
      return this.handleAuthData(authData);
    }
  }
  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};
RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return objects;
  }
  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    }
    // Regular users that have been locked out.
    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};
RestWrite.prototype.getUserId = function () {
  if (this.query && this.query.objectId && this.className === '_User') {
    return this.query.objectId;
  } else if (this.auth && this.auth.user && this.auth.user.id) {
    return this.auth.user.id;
  }
};

// Developers are allowed to change authData via before save trigger
// we need after before save to ensure that the developer
// is not currently duplicating auth data ID
RestWrite.prototype.ensureUniqueAuthDataId = async function () {
  if (this.className !== '_User' || !this.data.authData) {
    return;
  }
  const hasAuthDataId = Object.keys(this.data.authData).some(key => this.data.authData[key] && this.data.authData[key].id);
  if (!hasAuthDataId) return;
  const r = await Auth.findUsersWithAuthData(this.config, this.data.authData);
  const results = this.filteredObjectsByACL(r);
  if (results.length > 1) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
  // use data.objectId in case of login time and found user during handle validateAuthData
  const userId = this.getUserId() || this.data.objectId;
  if (results.length === 1 && userId !== results[0].objectId) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
};
RestWrite.prototype.handleAuthData = async function (authData) {
  const r = await Auth.findUsersWithAuthData(this.config, authData);
  const results = this.filteredObjectsByACL(r);
  const userId = this.getUserId();
  const userResult = results[0];
  const foundUserIsNotCurrentUser = userId && userResult && userId !== userResult.objectId;
  if (results.length > 1 || foundUserIsNotCurrentUser) {
    // To avoid https://github.com/parse-community/parse-server/security/advisories/GHSA-8w3j-g983-8jh5
    // Let's run some validation before throwing
    await Auth.handleAuthDataValidation(authData, this, userResult);
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }

  // No user found with provided authData we need to validate
  if (!results.length) {
    const {
      authData: validatedAuthData,
      authDataResponse
    } = await Auth.handleAuthDataValidation(authData, this);
    this.authDataResponse = authDataResponse;
    // Replace current authData by the new validated one
    this.data.authData = validatedAuthData;
    return;
  }

  // User found with provided authData
  if (results.length === 1) {
    this.storage.authProvider = Object.keys(authData).join(',');
    const {
      hasMutatedAuthData,
      mutatedAuthData
    } = Auth.hasMutatedAuthData(authData, userResult.authData);
    const isCurrentUserLoggedOrMaster = this.auth && this.auth.user && this.auth.user.id === userResult.objectId || this.auth.isMaster;
    const isLogin = !userId;
    if (isLogin || isCurrentUserLoggedOrMaster) {
      // no user making the call
      // OR the user making the call is the right one
      // Login with auth data
      delete results[0].password;

      // need to set the objectId first otherwise location has trailing undefined
      this.data.objectId = userResult.objectId;
      if (!this.query || !this.query.objectId) {
        this.response = {
          response: userResult,
          location: this.location()
        };
        // Run beforeLogin hook before storing any updates
        // to authData on the db; changes to userResult
        // will be ignored.
        await this.runBeforeLoginTrigger(deepcopy(userResult));

        // If we are in login operation via authData
        // we need to be sure that the user has provided
        // required authData
        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin({
          config: this.config,
          auth: this.auth
        }, authData, userResult.authData, this.config);
      }

      // Prevent validating if no mutated data detected on update
      if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
        return;
      }

      // Force to validate all provided authData on login
      // on update only validate mutated ones
      if (hasMutatedAuthData || !this.config.allowExpiredAuthDataToken) {
        const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
        this.data.authData = res.authData;
        this.authDataResponse = res.authDataResponse;
      }

      // IF we are in login we'll skip the database operation / beforeSave / afterSave etc...
      // we need to set it up there.
      // We are supposed to have a response only on LOGIN with authData, so we skip those
      // If we're not logging in, but just updating the current user, we can safely skip that part
      if (this.response) {
        // Assign the new authData in the response
        Object.keys(mutatedAuthData).forEach(provider => {
          this.response.response.authData[provider] = mutatedAuthData[provider];
        });

        // Run the DB update directly, as 'master' only if authData contains some keys
        // authData could not contains keys after validation if the authAdapter
        // uses the `doNotSave` option. Just update the authData part
        // Then we're good for the user, early exit of sorts
        if (Object.keys(this.data.authData).length) {
          await this.config.database.update(this.className, {
            objectId: this.data.objectId
          }, {
            authData: this.data.authData
          }, {});
        }
      }
    }
  }
};
RestWrite.prototype.checkRestrictedFields = async function () {
  if (this.className !== '_User') {
    return;
  }
  if (!this.auth.isMaintenance && !this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = async function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
  }

  // Do not cleanup session if objectId is not set
  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    const query = await (0, _RestQuery.default)({
      method: _RestQuery.default.Method.find,
      config: this.config,
      auth: Auth.master(this.config),
      className: '_Session',
      runBeforeFind: false,
      restWhere: {
        user: {
          __type: 'Pointer',
          className: '_User',
          objectId: this.objectId()
        }
      }
    });
    promise = query.execute().then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }
  return promise.then(() => {
    // Transform the password
    if (this.data.password === undefined) {
      // ignore only if undefined. should proceed if empty ('')
      return Promise.resolve();
    }
    if (this.query) {
      this.storage['clearSessions'] = true;
      // Generate a new session only if the user requested
      if (!this.auth.isMaster && !this.auth.isMaintenance) {
        this.storage['generateNewSession'] = true;
      }
    }
    return this._validatePasswordPolicy().then(() => {
      return passwordCrypto.hash(this.data.password).then(hashedPassword => {
        this.data._hashed_password = hashedPassword;
        delete this.data.password;
      });
    });
  }).then(() => {
    return this._validateUserName();
  }).then(() => {
    return this._validateEmail();
  });
};
RestWrite.prototype._validateUserName = function () {
  // Check for username uniqueness
  if (!this.data.username) {
    if (!this.query) {
      this.data.username = cryptoUtils.randomString(25);
      this.responseShouldHaveUsername = true;
    }
    return Promise.resolve();
  }
  /*
    Usernames should be unique when compared case insensitively
     Users should be able to make case sensitive usernames and
    login using the case they entered.  I.e. 'Snoopy' should preclude
    'snoopy' as a valid username.
  */
  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }
    return;
  });
};

/*
  As with usernames, Parse should not allow case insensitive collisions of email.
  unlike with usernames (which can have case insensitive collisions in the case of
  auth adapters), emails should never have a case insensitive collision.

  This behavior can be enforced through a properly configured index see:
  https://docs.mongodb.com/manual/core/index-case-insensitive/#create-a-case-insensitive-index
  which could be implemented instead of this code based validation.

  Given that this lookup should be a relatively low use case and that the case sensitive
  unique index will be used by the db for the query, this is an adequate solution.
*/
RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  }
  // Validate basic email address format
  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  }
  // Case insensitive match, see note above function.
  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }
    if (!this.data.authData || !Object.keys(this.data.authData).length || Object.keys(this.data.authData).length === 1 && Object.keys(this.data.authData)[0] === 'anonymous') {
      // We updated the email, send a new validation
      const {
        originalObject,
        updatedObject
      } = this.buildParseObjects();
      const request = {
        original: originalObject,
        object: updatedObject,
        master: this.auth.isMaster,
        ip: this.config.ip,
        installationId: this.auth.installationId
      };
      return this.config.userController.setEmailVerifyToken(this.data, request, this.storage);
    }
  });
};
RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) return Promise.resolve();
  return this._validatePasswordRequirements().then(() => {
    return this._validatePasswordHistory();
  });
};
RestWrite.prototype._validatePasswordRequirements = function () {
  // check if the password conforms to the defined password policy if configured
  // If we specified a custom error in our configuration use it.
  // Example: "Passwords must include a Capital Letter, Lowercase Letter, and a number."
  //
  // This is especially useful on the generic "password reset" page,
  // as it allows the programmer to communicate specific requirements instead of:
  // a. making the user guess whats wrong
  // b. making a custom password reset page that shows the requirements
  const policyError = this.config.passwordPolicy.validationError ? this.config.passwordPolicy.validationError : 'Password does not meet the Password Policy requirements.';
  const containsUsernameError = 'Password cannot contain your username.';

  // check whether the password meets the password strength requirements
  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  }

  // check whether password contain username
  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        if (this.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        return Promise.resolve();
      });
    }
  }
  return Promise.resolve();
};
RestWrite.prototype._validatePasswordHistory = function () {
  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', {
      objectId: this.objectId()
    }, {
      keys: ['_password_history', '_hashed_password']
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw undefined;
      }
      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
        throw err;
      });
    });
  }
  return Promise.resolve();
};
RestWrite.prototype.createSessionTokenIfNeeded = async function () {
  if (this.className !== '_User') {
    return;
  }
  // Don't generate session for updating user (this.query is set) unless authData exists
  if (this.query && !this.data.authData) {
    return;
  }
  // Don't generate new sessionToken if linking via sessionToken
  if (this.auth.user && this.data.authData) {
    return;
  }
  // If sign-up call
  if (!this.storage.authProvider) {
    // Create request object for verification functions
    const {
      originalObject,
      updatedObject
    } = this.buildParseObjects();
    const request = {
      original: originalObject,
      object: updatedObject,
      master: this.auth.isMaster,
      ip: this.config.ip,
      installationId: this.auth.installationId
    };
    // Get verification conditions which can be booleans or functions; the purpose of this async/await
    // structure is to avoid unnecessarily executing subsequent functions if previous ones fail in the
    // conditional statement below, as a developer may decide to execute expensive operations in them
    const verifyUserEmails = async () => this.config.verifyUserEmails === true || typeof this.config.verifyUserEmails === 'function' && (await Promise.resolve(this.config.verifyUserEmails(request))) === true;
    const preventLoginWithUnverifiedEmail = async () => this.config.preventLoginWithUnverifiedEmail === true || typeof this.config.preventLoginWithUnverifiedEmail === 'function' && (await Promise.resolve(this.config.preventLoginWithUnverifiedEmail(request))) === true;
    // If verification is required
    if ((await verifyUserEmails()) && (await preventLoginWithUnverifiedEmail())) {
      this.storage.rejectSignup = true;
      return;
    }
  }
  return this.createSessionToken();
};
RestWrite.prototype.createSessionToken = async function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }
  if (this.storage.authProvider == null && this.data.authData) {
    this.storage.authProvider = Object.keys(this.data.authData).join(',');
  }
  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage.authProvider ? 'login' : 'signup',
      authProvider: this.storage.authProvider || 'password'
    },
    installationId: this.auth.installationId
  });
  if (this.response && this.response.response) {
    this.response.response.sessionToken = sessionData.sessionToken;
  }
  return createSession();
};
RestWrite.createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    expiresAt: Parse._encode(expiresAt)
  };
  if (installationId) {
    sessionData.installationId = installationId;
  }
  Object.assign(sessionData, additionalSessionData);
  return {
    sessionData,
    createSession: () => new RestWrite(config, Auth.master(config), '_Session', null, sessionData).execute()
  };
};

// Delete email reset tokens if user is changing password or email.
RestWrite.prototype.deleteEmailResetTokenIfNeeded = function () {
  if (this.className !== '_User' || this.query === null) {
    // null query means create
    return;
  }
  if ('password' in this.data || 'email' in this.data) {
    const addOps = {
      _perishable_token: {
        __op: 'Delete'
      },
      _perishable_token_expires_at: {
        __op: 'Delete'
      }
    };
    this.data = Object.assign(this.data, addOps);
  }
};
RestWrite.prototype.destroyDuplicatedSessions = function () {
  // Only for _Session, and at creation time
  if (this.className != '_Session' || this.query) {
    return;
  }
  // Destroy the sessions in 'Background'
  const {
    user,
    installationId,
    sessionToken
  } = this.data;
  if (!user || !installationId) {
    return;
  }
  if (!user.objectId) {
    return;
  }
  this.config.database.destroy('_Session', {
    user,
    installationId,
    sessionToken: {
      $ne: sessionToken
    }
  }, {}, this.validSchemaController);
};

// Handles any followup logic
RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken().then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['sendVerificationEmail']) {
    delete this.storage['sendVerificationEmail'];
    // Fire and forget!
    this.config.userController.sendVerificationEmail(this.data, {
      auth: this.auth
    });
    return this.handleFollowup.bind(this);
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.
RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }
  if (!this.auth.user && !this.auth.isMaster && !this.auth.isMaintenance) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  // TODO: Verify proper error to throw
  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }
  if (this.query) {
    if (this.data.user && !this.auth.isMaster && this.data.user.objectId != this.auth.user.id) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.installationId) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    }
    if (!this.auth.isMaster) {
      this.query = {
        $and: [this.query, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  if (!this.query && !this.auth.isMaster && !this.auth.isMaintenance) {
    const additionalSessionData = {};
    for (var key in this.data) {
      if (key === 'objectId' || key === 'user') {
        continue;
      }
      additionalSessionData[key] = this.data[key];
    }
    const {
      sessionData,
      createSession
    } = RestWrite.createSession(this.config, {
      userId: this.auth.user.id,
      createdWith: {
        action: 'create'
      },
      additionalSessionData
    });
    return createSession().then(results => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }
      sessionData['objectId'] = results.response['objectId'];
      this.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
};

// Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.handleInstallation = function () {
  if (this.response || this.className !== '_Installation') {
    return;
  }
  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  }

  // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.
  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  }

  // We lowercase the installationId if present
  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }
  let installationId = this.data.installationId;

  // If data.installationId is not set and we're not master, we can lookup in auth
  if (!installationId && !this.auth.isMaster && !this.auth.isMaintenance) {
    installationId = this.auth.installationId;
  }
  if (installationId) {
    installationId = installationId.toLowerCase();
  }

  // Updating _Installation but not updating anything critical
  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }
  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId
  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = [];

  // Instead of issuing 3 reads, let's do it with one OR.
  const orQueries = [];
  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }
  if (installationId) {
    orQueries.push({
      installationId: installationId
    });
  }
  if (this.data.deviceToken) {
    orQueries.push({
      deviceToken: this.data.deviceToken
    });
  }
  if (orQueries.length == 0) {
    return;
  }
  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
      $or: orQueries
    }, {});
  }).then(results => {
    results.forEach(result => {
      if (this.query && this.query.objectId && result.objectId == this.query.objectId) {
        objectIdMatch = result;
      }
      if (result.installationId == installationId) {
        installationIdMatch = result;
      }
      if (result.deviceToken == this.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    });

    // Sanity checks when running a query
    if (this.query && this.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }
      if (this.data.installationId && objectIdMatch.installationId && this.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }
      if (this.data.deviceToken && objectIdMatch.deviceToken && this.data.deviceToken !== objectIdMatch.deviceToken && !this.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }
      if (this.data.deviceType && this.data.deviceType && this.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }
    if (this.query && this.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }
    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    }
    // need to specify deviceType only if it's new
    if (!this.query && !this.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          deviceToken: this.data.deviceToken,
          installationId: {
            $ne: installationId
          }
        };
        if (this.data.appIdentifier) {
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }
        this.config.database.destroy('_Installation', delQuery).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored.
            return;
          }
          // rethrow the error
          throw err;
        });
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        const delQuery = {
          objectId: idMatch.objectId
        };
        return this.config.database.destroy('_Installation', delQuery).then(() => {
          return deviceTokenMatches[0]['objectId'];
        }).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored
            return;
          }
          // rethrow the error
          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          };
          // We have a unique install Id, use that to preserve
          // the interesting installation
          if (this.data.installationId) {
            delQuery['installationId'] = {
              $ne: this.data.installationId
            };
          } else if (idMatch.objectId && this.data.objectId && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              $ne: idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }
          if (this.data.appIdentifier) {
            delQuery['appIdentifier'] = this.data.appIdentifier;
          }
          this.config.database.destroy('_Installation', delQuery).catch(err => {
            if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
              // no deletions were made. Can be ignored.
              return;
            }
            // rethrow the error
            throw err;
          });
        }
        // In non-merge scenarios, just return the installation match id
        return idMatch.objectId;
      }
    }
  }).then(objId => {
    if (objId) {
      this.query = {
        objectId: objId
      };
      delete this.data.objectId;
      delete this.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });
  return promise;
};

// If we short-circuited the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User
RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};
RestWrite.prototype.runDatabaseOperation = function () {
  if (this.response) {
    return;
  }
  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
    if (this.config.liveQueryController) {
      this.config.liveQueryController.clearCachedRoles(this.auth.user);
    }
  }
  if (this.className === '_User' && this.query && this.auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`);
  }
  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  }

  // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.
  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }
  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true && this.auth.isMaintenance !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    }
    // update password timestamp if user password is being changed
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    }
    // Ignore createdAt when update
    delete this.data.createdAt;
    let defer = Promise.resolve();
    // if password history is enabled then save the current password to history
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }, Auth.maintenance(this.config)).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        const user = results[0];
        let oldPasswords = [];
        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        }
        //n-1 passwords go into history including last password
        while (oldPasswords.length > Math.max(0, this.config.passwordPolicy.maxPasswordHistory - 2)) {
          oldPasswords.shift();
        }
        oldPasswords.push(user.password);
        this.data._password_history = oldPasswords;
      });
    }
    return defer.then(() => {
      // Run an update
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).then(response => {
        response.updatedAt = this.updatedAt;
        this._updateResponseWithData(response, this.data);
        this.response = {
          response
        };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL;
      // default public r/w ACL
      if (!ACL) {
        ACL = {};
        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      }
      // make sure the user is not locked down
      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL;
      // password timestamp to be used when password expiry policy is enforced
      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }

      // Quick check, if we were able to infer the duplicated field name
      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }
      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      }

      // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.
      // Fallback to the original method
      // TODO: See if we can later do this without additional queries by using named indexes.
      return this.config.database.find(this.className, {
        username: this.data.username,
        objectId: {
          $ne: this.objectId()
        }
      }, {
        limit: 1
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }
        return this.config.database.find(this.className, {
          email: this.data.email,
          objectId: {
            $ne: this.objectId()
          }
        }, {
          limit: 1
        });
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(response => {
      response.objectId = this.data.objectId;
      response.createdAt = this.data.createdAt;
      if (this.responseShouldHaveUsername) {
        response.username = this.data.username;
      }
      this._updateResponseWithData(response, this.data);
      this.response = {
        status: 201,
        response,
        location: this.location()
      };
    });
  }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
  const hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  const hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);
  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);
  if (hasLiveQuery) {
    this.config.database.loadSchema().then(schemaController => {
      // Notify LiveQueryServer if possible
      const perms = schemaController.getClassLevelPermissions(updatedObject.className);
      this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
    });
  }
  if (!hasAfterSaveHook) {
    return Promise.resolve();
  }
  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;
    if (jsonReturned) {
      this.pendingOps.operations = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data);
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
};

// Returns an updated copy of the object
RestWrite.prototype.buildParseObjects = function () {
  var _this$query;
  const extraData = {
    className: this.className,
    objectId: (_this$query = this.query) === null || _this$query === void 0 ? void 0 : _this$query.objectId
  };
  let originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];
  if (!this.originalData) {
    for (const attribute of readOnlyAttributes) {
      extraData[attribute] = this.data[attribute];
    }
  }
  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      if (typeof data[key].__op === 'string') {
        if (!readOnlyAttributes.includes(key)) {
          updatedObject.set(key, data[key]);
        }
      } else {
        // subdocument key with dot notation { 'x.y': v } => { 'x': { 'y' : v } })
        const splittedKey = key.split('.');
        const parentProp = splittedKey[0];
        let parentVal = updatedObject.get(parentProp);
        if (typeof parentVal !== 'object') {
          parentVal = {};
        }
        parentVal[splittedKey[1]] = data[key];
        updatedObject.set(parentProp, parentVal);
      }
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  const sanitized = this.sanitizedData();
  for (const attribute of readOnlyAttributes) {
    delete sanitized[attribute];
  }
  updatedObject.set(sanitized);
  return {
    updatedObject,
    originalObject
  };
};
RestWrite.prototype.cleanUserAuthData = function () {
  if (this.response && this.response.response && this.className === '_User') {
    const user = this.response.response;
    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });
      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
};
RestWrite.prototype._updateResponseWithData = function (response, data) {
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(this.pendingOps.identifier);
  for (const key in this.pendingOps.operations) {
    if (!pending[key]) {
      data[key] = this.originalData ? this.originalData[key] : {
        __op: 'Delete'
      };
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }
  const skipKeys = [...(_SchemaController.requiredColumns.read[this.className] || [])];
  if (!this.query) {
    skipKeys.push('objectId', 'createdAt');
  } else {
    skipKeys.push('updatedAt');
    delete response.objectId;
  }
  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }
    const value = response[key];
    if (value == null || value.__type && value.__type === 'Pointer' || util.isDeepStrictEqual(data[key], value) || util.isDeepStrictEqual((this.originalData || {})[key], value)) {
      delete response[key];
    }
  }
  if (_lodash.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }
  const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];
    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    }

    // Strips operations from responses
    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];
      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};
var _default = exports.default = RestWrite;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9TY2hlbWFDb250cm9sbGVyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwidXRpbCIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJjb250ZXh0IiwiYWN0aW9uIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5Iiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwZW5kaW5nT3BzIiwib3BlcmF0aW9ucyIsImlkZW50aWZpZXIiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsImNoZWNrUmVzdHJpY3RlZEZpZWxkcyIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZW5zdXJlVW5pcXVlQXV0aERhdGFJZCIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJhdXRoRGF0YVJlc3BvbnNlIiwicmVqZWN0U2lnbnVwIiwicHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwiLCJFTUFJTF9OT1RfRk9VTkQiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJtYW55IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwiaXNFcXVhbCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwiX190eXBlIiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJBQ0wiLCJoYXNBdXRoRGF0YUlkIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJ1c2VySWQiLCJ1c2VyUmVzdWx0IiwiZm91bmRVc2VySXNOb3RDdXJyZW50VXNlciIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInZhbGlkYXRlZEF1dGhEYXRhIiwiYXV0aFByb3ZpZGVyIiwiam9pbiIsImhhc011dGF0ZWRBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciIsImlzTG9naW4iLCJsb2NhdGlvbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwicmVzIiwicHJvbWlzZSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsIk1ldGhvZCIsIm1hc3RlciIsInJ1bkJlZm9yZUZpbmQiLCJyZXN0V2hlcmUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJjYXNlSW5zZW5zaXRpdmUiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInJlcXVlc3QiLCJvcmlnaW5hbCIsImlwIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyQ29udHJvbGxlciIsInNldEVtYWlsVmVyaWZ5VG9rZW4iLCJwYXNzd29yZFBvbGljeSIsIl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzIiwiX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5IiwicG9saWN5RXJyb3IiLCJ2YWxpZGF0aW9uRXJyb3IiLCJjb250YWluc1VzZXJuYW1lRXJyb3IiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJtYWludGVuYW5jZSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJtYXAiLCJjb21wYXJlIiwiYWxsIiwiY2F0Y2giLCJlcnIiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsInNlc3Npb25EYXRhIiwiY3JlYXRlU2Vzc2lvbiIsImNyZWF0ZWRXaXRoIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwidG9rZW4iLCJuZXdUb2tlbiIsImV4cGlyZXNBdCIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImFzc2lnbiIsImFkZE9wcyIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsImRlc3Ryb3kiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0Iiwic2Vzc2lvblF1ZXJ5IiwiYmluZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJzdGF0dXMiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsIiRvciIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsImNvZGUiLCJvYmpJZCIsInJvbGUiLCJjbGVhciIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJjbGVhckNhY2hlZFJvbGVzIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImpzb25SZXR1cm5lZCIsIl90b0Z1bGxKU09OIiwidG9KU09OIiwibG9nZ2VyIiwid2FybiIsIm1pZGRsZSIsIm1vdW50Iiwic2VydmVyVVJMIiwic2FuaXRpemVkRGF0YSIsInRlc3QiLCJfZGVjb2RlIiwiX3RoaXMkcXVlcnkiLCJmcm9tSlNPTiIsInJlYWRPbmx5QXR0cmlidXRlcyIsImNvbnN0cnVjdG9yIiwiYXR0cmlidXRlIiwiaW5jbHVkZXMiLCJzZXQiLCJzcGxpdHRlZEtleSIsInNwbGl0IiwicGFyZW50UHJvcCIsInBhcmVudFZhbCIsImdldCIsInNhbml0aXplZCIsInNraXBLZXlzIiwicmVxdWlyZWRDb2x1bW5zIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJjbGllbnRTdXBwb3J0c0RlbGV0ZSIsInN1cHBvcnRzRm9yd2FyZERlbGV0ZSIsImRhdGFWYWx1ZSIsIl9kZWZhdWx0IiwiZXhwb3J0cyIsIm1vZHVsZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQSBSZXN0V3JpdGUgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYW4gb3BlcmF0aW9uXG4vLyB0aGF0IHdyaXRlcyB0byB0aGUgZGF0YWJhc2UuXG4vLyBUaGlzIGNvdWxkIGJlIGVpdGhlciBhIFwiY3JlYXRlXCIgb3IgYW4gXCJ1cGRhdGVcIi5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBkZWVwY29weSA9IHJlcXVpcmUoJ2RlZXBjb3B5Jyk7XG5cbmNvbnN0IEF1dGggPSByZXF1aXJlKCcuL0F1dGgnKTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi9VdGlscycpO1xudmFyIGNyeXB0b1V0aWxzID0gcmVxdWlyZSgnLi9jcnlwdG9VdGlscycpO1xudmFyIHBhc3N3b3JkQ3J5cHRvID0gcmVxdWlyZSgnLi9wYXNzd29yZCcpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xudmFyIENsaWVudFNESyA9IHJlcXVpcmUoJy4vQ2xpZW50U0RLJyk7XG5jb25zdCB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyByZXF1aXJlZENvbHVtbnMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjbGllbnRTREssIGNvbnRleHQsIGFjdGlvbikge1xuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5J1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5zdG9yYWdlID0ge307XG4gIHRoaXMucnVuT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuXG4gIGlmIChhY3Rpb24pIHtcbiAgICB0aGlzLnJ1bk9wdGlvbnMuYWN0aW9uID0gYWN0aW9uO1xuICB9XG5cbiAgaWYgKCFxdWVyeSkge1xuICAgIGlmICh0aGlzLmNvbmZpZy5hbGxvd0N1c3RvbU9iamVjdElkKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRhdGEsICdvYmplY3RJZCcpICYmICFkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5NSVNTSU5HX09CSkVDVF9JRCxcbiAgICAgICAgICAnb2JqZWN0SWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwgb3IgdW5kZWZpbmVkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ29iamVjdElkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChkYXRhLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnaWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG4gIHRoaXMucGVuZGluZ09wcyA9IHtcbiAgICBvcGVyYXRpb25zOiBudWxsLFxuICAgIGlkZW50aWZpZXI6IG51bGwsXG4gIH07XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgdGhlXG4vLyB3cml0ZSwgaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2UsIHN0YXR1cywgbG9jYXRpb259IG9iamVjdC5cbi8vIHN0YXR1cyBhbmQgbG9jYXRpb24gYXJlIG9wdGlvbmFsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbnN0YWxsYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVNlc3Npb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNoZWNrUmVzdHJpY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEFwcGVuZCB0aGUgYXV0aERhdGFSZXNwb25zZSBpZiBleGlzdHNcbiAgICAgIGlmICh0aGlzLmF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFSZXNwb25zZSA9IHRoaXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgJiYgdGhpcy5jb25maWcucHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zLFxuICAgIHRoaXMuYXV0aC5pc01haW50ZW5hbmNlXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCBpZGVudGlmaWVyID0gdXBkYXRlZE9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhpZGVudGlmaWVyKTtcbiAgdGhpcy5wZW5kaW5nT3BzID0ge1xuICAgIG9wZXJhdGlvbnM6IHsgLi4ucGVuZGluZyB9LFxuICAgIGlkZW50aWZpZXIsXG4gIH07XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQmVmb3JlIGNhbGxpbmcgdGhlIHRyaWdnZXIsIHZhbGlkYXRlIHRoZSBwZXJtaXNzaW9ucyBmb3IgdGhlIHNhdmUgb3BlcmF0aW9uXG4gICAgICBsZXQgZGF0YWJhc2VQcm9taXNlID0gbnVsbDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciB1cGRhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMuY29uZmlnLCB0aGlzLmRhdGEpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24gKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcblxuICAvLyBFeHBhbmQgZmlsZSBvYmplY3RzXG4gIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBhbGxvdyBjdXN0b21pemluZyBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCB3aGVuIHVzaW5nIG1haW50ZW5hbmNlIGtleVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdC5fX3R5cGUgPT09ICdEYXRlJ1xuICAgICAgICApIHtcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdC5pc287XG5cbiAgICAgICAgICBpZiAodGhpcy5kYXRhLnVwZGF0ZWRBdCAmJiB0aGlzLmRhdGEudXBkYXRlZEF0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICBjb25zdCBjcmVhdGVkQXQgPSBuZXcgRGF0ZSh0aGlzLmRhdGEuY3JlYXRlZEF0KTtcbiAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRBdCA9IG5ldyBEYXRlKHRoaXMuZGF0YS51cGRhdGVkQXQuaXNvKTtcblxuICAgICAgICAgICAgaWYgKHVwZGF0ZWRBdCA8IGNyZWF0ZWRBdCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAndXBkYXRlZEF0IGNhbm5vdCBvY2N1ciBiZWZvcmUgY3JlYXRlZEF0J1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy5kYXRhLnVwZGF0ZWRBdC5pc287XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGlmIG5vIHVwZGF0ZWRBdCBpcyBwcm92aWRlZCwgc2V0IGl0IHRvIGNyZWF0ZWRBdCB0byBtYXRjaCBkZWZhdWx0IGJlaGF2aW9yXG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG4vLyBUcmFuc2Zvcm1zIGF1dGggZGF0YSBmb3IgYSB1c2VyIG9iamVjdC5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGEgdXNlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGF1dGhEYXRhID0gdGhpcy5kYXRhLmF1dGhEYXRhO1xuICBjb25zdCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkID1cbiAgICB0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkID09PSAnc3RyaW5nJztcblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIWF1dGhEYXRhKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEudXNlcm5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ2JhZCBvciBtaXNzaW5nIHVzZXJuYW1lJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnBhc3N3b3JkKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAoYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKGF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIE5vdGhpbmcgdG8gdmFsaWRhdGUgaGVyZVxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gaGFzVG9rZW4gfHwgcHJvdmlkZXJBdXRoRGF0YSA9PT0gbnVsbDtcbiAgICB9KTtcbiAgICBpZiAoY2FuSGFuZGxlQXV0aERhdGEgfHwgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCB8fCB0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5nZXRVc2VySWQoKSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIgfHwgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlcklkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC51c2VyLmlkO1xuICB9XG59O1xuXG4vLyBEZXZlbG9wZXJzIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSBhdXRoRGF0YSB2aWEgYmVmb3JlIHNhdmUgdHJpZ2dlclxuLy8gd2UgbmVlZCBhZnRlciBiZWZvcmUgc2F2ZSB0byBlbnN1cmUgdGhhdCB0aGUgZGV2ZWxvcGVyXG4vLyBpcyBub3QgY3VycmVudGx5IGR1cGxpY2F0aW5nIGF1dGggZGF0YSBJRFxuUmVzdFdyaXRlLnByb3RvdHlwZS5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGhhc0F1dGhEYXRhSWQgPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLnNvbWUoXG4gICAga2V5ID0+IHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldICYmIHRoaXMuZGF0YS5hdXRoRGF0YVtrZXldLmlkXG4gICk7XG5cbiAgaWYgKCFoYXNBdXRoRGF0YUlkKSByZXR1cm47XG5cbiAgY29uc3QgciA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHRoaXMuY29uZmlnLCB0aGlzLmRhdGEuYXV0aERhdGEpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG4gIC8vIHVzZSBkYXRhLm9iamVjdElkIGluIGNhc2Ugb2YgbG9naW4gdGltZSBhbmQgZm91bmQgdXNlciBkdXJpbmcgaGFuZGxlIHZhbGlkYXRlQXV0aERhdGFcbiAgY29uc3QgdXNlcklkID0gdGhpcy5nZXRVc2VySWQoKSB8fCB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSAmJiB1c2VySWQgIT09IHJlc3VsdHNbMF0ub2JqZWN0SWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGFzeW5jIGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIGF1dGhEYXRhKTtcbiAgY29uc3QgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG5cbiAgY29uc3QgdXNlcklkID0gdGhpcy5nZXRVc2VySWQoKTtcbiAgY29uc3QgdXNlclJlc3VsdCA9IHJlc3VsdHNbMF07XG4gIGNvbnN0IGZvdW5kVXNlcklzTm90Q3VycmVudFVzZXIgPSB1c2VySWQgJiYgdXNlclJlc3VsdCAmJiB1c2VySWQgIT09IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSB8fCBmb3VuZFVzZXJJc05vdEN1cnJlbnRVc2VyKSB7XG4gICAgLy8gVG8gYXZvaWQgaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvc2VjdXJpdHkvYWR2aXNvcmllcy9HSFNBLTh3M2otZzk4My04amg1XG4gICAgLy8gTGV0J3MgcnVuIHNvbWUgdmFsaWRhdGlvbiBiZWZvcmUgdGhyb3dpbmdcbiAgICBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSwgdGhpcywgdXNlclJlc3VsdCk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cblxuICAvLyBObyB1c2VyIGZvdW5kIHdpdGggcHJvdmlkZWQgYXV0aERhdGEgd2UgbmVlZCB0byB2YWxpZGF0ZVxuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgY29uc3QgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB0aGlzXG4gICAgKTtcbiAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIC8vIFJlcGxhY2UgY3VycmVudCBhdXRoRGF0YSBieSB0aGUgbmV3IHZhbGlkYXRlZCBvbmVcbiAgICB0aGlzLmRhdGEuYXV0aERhdGEgPSB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBVc2VyIGZvdW5kIHdpdGggcHJvdmlkZWQgYXV0aERhdGFcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG5cbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmpvaW4oJywnKTtcblxuICAgIGNvbnN0IHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfSA9IEF1dGguaGFzTXV0YXRlZEF1dGhEYXRhKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhXG4gICAgKTtcblxuICAgIGNvbnN0IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciA9XG4gICAgICAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB8fFxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyO1xuXG4gICAgY29uc3QgaXNMb2dpbiA9ICF1c2VySWQ7XG5cbiAgICBpZiAoaXNMb2dpbiB8fCBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgIC8vIHRvIGF1dGhEYXRhIG9uIHRoZSBkYjsgY2hhbmdlcyB0byB1c2VyUmVzdWx0XG4gICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuXG4gICAgICAgIC8vIElmIHdlIGFyZSBpbiBsb2dpbiBvcGVyYXRpb24gdmlhIGF1dGhEYXRhXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gYmUgc3VyZSB0aGF0IHRoZSB1c2VyIGhhcyBwcm92aWRlZFxuICAgICAgICAvLyByZXF1aXJlZCBhdXRoRGF0YVxuICAgICAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICAgICAgeyBjb25maWc6IHRoaXMuY29uZmlnLCBhdXRoOiB0aGlzLmF1dGggfSxcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByZXZlbnQgdmFsaWRhdGluZyBpZiBubyBtdXRhdGVkIGRhdGEgZGV0ZWN0ZWQgb24gdXBkYXRlXG4gICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSAmJiBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBGb3JjZSB0byB2YWxpZGF0ZSBhbGwgcHJvdmlkZWQgYXV0aERhdGEgb24gbG9naW5cbiAgICAgIC8vIG9uIHVwZGF0ZSBvbmx5IHZhbGlkYXRlIG11dGF0ZWQgb25lc1xuICAgICAgaWYgKGhhc011dGF0ZWRBdXRoRGF0YSB8fCAhdGhpcy5jb25maWcuYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgICBpc0xvZ2luID8gYXV0aERhdGEgOiBtdXRhdGVkQXV0aERhdGEsXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICB1c2VyUmVzdWx0XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICAgICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIElGIHdlIGFyZSBpbiBsb2dpbiB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFbcHJvdmlkZXJdID0gbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInIG9ubHkgaWYgYXV0aERhdGEgY29udGFpbnMgc29tZSBrZXlzXG4gICAgICAgIC8vIGF1dGhEYXRhIGNvdWxkIG5vdCBjb250YWlucyBrZXlzIGFmdGVyIHZhbGlkYXRpb24gaWYgdGhlIGF1dGhBZGFwdGVyXG4gICAgICAgIC8vIHVzZXMgdGhlIGBkb05vdFNhdmVgIG9wdGlvbi4gSnVzdCB1cGRhdGUgdGhlIGF1dGhEYXRhIHBhcnRcbiAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9LFxuICAgICAgICAgICAgeyBhdXRoRGF0YTogdGhpcy5kYXRhLmF1dGhEYXRhIH0sXG4gICAgICAgICAgICB7fVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2hlY2tSZXN0cmljdGVkRmllbGRzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgJ2VtYWlsVmVyaWZpZWQnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGVycm9yID0gYENsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5gO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcik7XG4gIH1cbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHByb21pc2UgPSBxdWVyeS5leGVjdXRlKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLicpXG4gICAgKTtcbiAgfVxuICAvLyBDYXNlIGluc2Vuc2l0aXZlIG1hdGNoLCBzZWUgbm90ZSBhYm92ZSBmdW5jdGlvbi5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgIXRoaXMuZGF0YS5hdXRoRGF0YSB8fFxuICAgICAgICAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggfHxcbiAgICAgICAgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKVswXSA9PT0gJ2Fub255bW91cycpXG4gICAgICApIHtcbiAgICAgICAgLy8gV2UgdXBkYXRlZCB0aGUgZW1haWwsIHNlbmQgYSBuZXcgdmFsaWRhdGlvblxuICAgICAgICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICAgIG9iamVjdDogdXBkYXRlZE9iamVjdCxcbiAgICAgICAgICBtYXN0ZXI6IHRoaXMuYXV0aC5pc01hc3RlcixcbiAgICAgICAgICBpcDogdGhpcy5jb25maWcuaXAsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhLCByZXF1ZXN0LCB0aGlzLnN0b3JhZ2UpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICAgICk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbiAoaGFzaCkge1xuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKG5ld1Bhc3N3b3JkLCBoYXNoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gd2FpdCBmb3IgYWxsIGNvbXBhcmlzb25zIHRvIGNvbXBsZXRlXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIgPT09ICdSRVBFQVRfUEFTU1dPUkQnKVxuICAgICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIG5ldyBzZXNzaW9uVG9rZW4gaWYgbGlua2luZyB2aWEgc2Vzc2lvblRva2VuXG4gIGlmICh0aGlzLmF1dGgudXNlciAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gSWYgc2lnbi11cCBjYWxsXG4gIGlmICghdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlcikge1xuICAgIC8vIENyZWF0ZSByZXF1ZXN0IG9iamVjdCBmb3IgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uc1xuICAgIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsT2JqZWN0LFxuICAgICAgb2JqZWN0OiB1cGRhdGVkT2JqZWN0LFxuICAgICAgbWFzdGVyOiB0aGlzLmF1dGguaXNNYXN0ZXIsXG4gICAgICBpcDogdGhpcy5jb25maWcuaXAsXG4gICAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgIH07XG4gICAgLy8gR2V0IHZlcmlmaWNhdGlvbiBjb25kaXRpb25zIHdoaWNoIGNhbiBiZSBib29sZWFucyBvciBmdW5jdGlvbnM7IHRoZSBwdXJwb3NlIG9mIHRoaXMgYXN5bmMvYXdhaXRcbiAgICAvLyBzdHJ1Y3R1cmUgaXMgdG8gYXZvaWQgdW5uZWNlc3NhcmlseSBleGVjdXRpbmcgc3Vic2VxdWVudCBmdW5jdGlvbnMgaWYgcHJldmlvdXMgb25lcyBmYWlsIGluIHRoZVxuICAgIC8vIGNvbmRpdGlvbmFsIHN0YXRlbWVudCBiZWxvdywgYXMgYSBkZXZlbG9wZXIgbWF5IGRlY2lkZSB0byBleGVjdXRlIGV4cGVuc2l2ZSBvcGVyYXRpb25zIGluIHRoZW1cbiAgICBjb25zdCB2ZXJpZnlVc2VyRW1haWxzID0gYXN5bmMgKCkgPT4gdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gdHJ1ZSB8fCAodHlwZW9mIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICBjb25zdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID0gYXN5bmMgKCkgPT4gdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gdHJ1ZSB8fCAodHlwZW9mIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICAvLyBJZiB2ZXJpZmljYXRpb24gaXMgcmVxdWlyZWRcbiAgICBpZiAoYXdhaXQgdmVyaWZ5VXNlckVtYWlscygpICYmIGF3YWl0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwoKSkge1xuICAgICAgdGhpcy5zdG9yYWdlLnJlamVjdFNpZ251cCA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIGNsb3VkIGluc3RhbGxhdGlvbklkIGZyb20gQ2xvdWQgQ29kZSxcbiAgLy8gbmV2ZXIgY3JlYXRlIHNlc3Npb24gdG9rZW5zIGZyb20gdGhlcmUuXG4gIGlmICh0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgJiYgdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkID09PSAnY2xvdWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPT0gbnVsbCAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5qb2luKCcsJyk7XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG5SZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbiA9IGZ1bmN0aW9uIChcbiAgY29uZmlnLFxuICB7IHVzZXJJZCwgY3JlYXRlZFdpdGgsIGluc3RhbGxhdGlvbklkLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgfVxuKSB7XG4gIGNvbnN0IHRva2VuID0gJ3I6JyArIGNyeXB0b1V0aWxzLm5ld1Rva2VuKCk7XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgY29uc3Qgc2Vzc2lvbkRhdGEgPSB7XG4gICAgc2Vzc2lvblRva2VuOiB0b2tlbixcbiAgICB1c2VyOiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgfSxcbiAgICBjcmVhdGVkV2l0aCxcbiAgICBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSxcbiAgfTtcblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBzZXNzaW9uRGF0YS5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihzZXNzaW9uRGF0YSwgYWRkaXRpb25hbFNlc3Npb25EYXRhKTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb25EYXRhLFxuICAgIGNyZWF0ZVNlc3Npb246ICgpID0+XG4gICAgICBuZXcgUmVzdFdyaXRlKGNvbmZpZywgQXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gT25seSBmb3IgX1Nlc3Npb24sIGFuZCBhdCBjcmVhdGlvbiB0aW1lXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPSAnX1Nlc3Npb24nIHx8IHRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRGVzdHJveSB0aGUgc2Vzc2lvbnMgaW4gJ0JhY2tncm91bmQnXG4gIGNvbnN0IHsgdXNlciwgaW5zdGFsbGF0aW9uSWQsIHNlc3Npb25Ub2tlbiB9ID0gdGhpcy5kYXRhO1xuICBpZiAoIXVzZXIgfHwgIWluc3RhbGxhdGlvbklkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5vYmplY3RJZCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KFxuICAgICdfU2Vzc2lvbicsXG4gICAge1xuICAgICAgdXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgc2Vzc2lvblRva2VuOiB7ICRuZTogc2Vzc2lvblRva2VuIH0sXG4gICAgfSxcbiAgICB7fSxcbiAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICApO1xufTtcblxuLy8gSGFuZGxlcyBhbnkgZm9sbG93dXAgbG9naWNcblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlRm9sbG93dXAgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiYgdGhpcy5jb25maWcucmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhLCB7IGF1dGg6IHRoaXMuYXV0aCB9KTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gcmVxdWlyZWQuJyk7XG4gIH1cblxuICAvLyBUT0RPOiBWZXJpZnkgcHJvcGVyIGVycm9yIHRvIHRocm93XG4gIGlmICh0aGlzLmRhdGEuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdDYW5ub3Qgc2V0ICcgKyAnQUNMIG9uIGEgU2Vzc2lvbi4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgdGhpcy5kYXRhLnVzZXIub2JqZWN0SWQgIT0gdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhpcy5xdWVyeSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIGNvbnN0IGFkZGl0aW9uYWxTZXNzaW9uRGF0YSA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmRhdGEpIHtcbiAgICAgIGlmIChrZXkgPT09ICdvYmplY3RJZCcgfHwga2V5ID09PSAndXNlcicpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGFba2V5XSA9IHRoaXMuZGF0YVtrZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnY3JlYXRlJyxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMucmVzcG9uc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0Vycm9yIGNyZWF0aW5nIHNlc3Npb24uJyk7XG4gICAgICB9XG4gICAgICBzZXNzaW9uRGF0YVsnb2JqZWN0SWQnXSA9IHJlc3VsdHMucmVzcG9uc2VbJ29iamVjdElkJ107XG4gICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgbG9jYXRpb246IHJlc3VsdHMubG9jYXRpb24sXG4gICAgICAgIHJlc3BvbnNlOiBzZXNzaW9uRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9JbnN0YWxsYXRpb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBpbnN0YWxsYXRpb24gb2JqZWN0LlxuLy8gSWYgYW4gaW5zdGFsbGF0aW9uIGlzIGZvdW5kLCB0aGlzIGNhbiBtdXRhdGUgdGhpcy5xdWVyeSBhbmQgdHVybiBhIGNyZWF0ZVxuLy8gaW50byBhbiB1cGRhdGUuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUluc3RhbGxhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfSW5zdGFsbGF0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgKyAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsXG4gICAgICBgQ2Fubm90IG1vZGlmeSB1c2VyICR7dGhpcy5xdWVyeS5vYmplY3RJZH0uYFxuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLkFDTCAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlICYmXG4gICAgICB0aGlzLmF1dGguaXNNYWludGVuYW5jZSAhPT0gdHJ1ZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLkFDTFt0aGlzLnF1ZXJ5Lm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICB9XG4gICAgLy8gdXBkYXRlIHBhc3N3b3JkIHRpbWVzdGFtcCBpZiB1c2VyIHBhc3N3b3JkIGlzIGJlaW5nIGNoYW5nZWRcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICB9XG4gICAgLy8gSWdub3JlIGNyZWF0ZWRBdCB3aGVuIHVwZGF0ZVxuICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgbGV0IGRlZmVyID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgLy8gaWYgcGFzc3dvcmQgaGlzdG9yeSBpcyBlbmFibGVkIHRoZW4gc2F2ZSB0aGUgY3VycmVudCBwYXNzd29yZCB0byBoaXN0b3J5XG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgKSB7XG4gICAgICBkZWZlciA9IHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy9uLTEgcGFzc3dvcmRzIGdvIGludG8gaGlzdG9yeSBpbmNsdWRpbmcgbGFzdCBwYXNzd29yZFxuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5sZW5ndGggPiBNYXRoLm1heCgwLCB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAyKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfaGlzdG9yeSA9IG9sZFBhc3N3b3JkcztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVyLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gUnVuIGFuIHVwZGF0ZVxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzcG9uc2UgfTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gU2V0IHRoZSBkZWZhdWx0IEFDTCBhbmQgcGFzc3dvcmQgdGltZXN0YW1wIGZvciB0aGUgbmV3IF9Vc2VyXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICB2YXIgQUNMID0gdGhpcy5kYXRhLkFDTDtcbiAgICAgIC8vIGRlZmF1bHQgcHVibGljIHIvdyBBQ0xcbiAgICAgIGlmICghQUNMKSB7XG4gICAgICAgIEFDTCA9IHt9O1xuICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICAgICAgICBBQ0xbJyonXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKHRoaXMuY2xhc3NOYW1lLCB0aGlzLmRhdGEsIHRoaXMucnVuT3B0aW9ucywgZmFsc2UsIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgbm90aGluZyAtIGRvZXNuJ3Qgd2FpdCBmb3IgdGhlIHRyaWdnZXIuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkFmdGVyU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2sgJiYgIWhhc0xpdmVRdWVyeSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgdXBkYXRlZE9iamVjdC5faGFuZGxlU2F2ZVJlc3BvbnNlKHRoaXMucmVzcG9uc2UucmVzcG9uc2UsIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMCk7XG5cbiAgaWYgKGhhc0xpdmVRdWVyeSkge1xuICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy8gTm90aWZ5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHBlcm1zXG4gICAgICApO1xuICAgIH0pO1xuICB9XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBjb25zdCBqc29uUmV0dXJuZWQgPSByZXN1bHQgJiYgIXJlc3VsdC5fdG9GdWxsSlNPTjtcbiAgICAgIGlmIChqc29uUmV0dXJuZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzLm9wZXJhdGlvbnMgPSB7fTtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKFxuICAgICAgICAgIChyZXN1bHQgfHwgdXBkYXRlZE9iamVjdCkudG9KU09OKCksXG4gICAgICAgICAgdGhpcy5kYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSlcbiAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlkZGxlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgPyAnL3VzZXJzLycgOiAnL2NsYXNzZXMvJyArIHRoaXMuY2xhc3NOYW1lICsgJy8nO1xuICBjb25zdCBtb3VudCA9IHRoaXMuY29uZmlnLm1vdW50IHx8IHRoaXMuY29uZmlnLnNlcnZlclVSTDtcbiAgcmV0dXJuIG1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBkYXRhID0gT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoKGRhdGEsIGtleSkgPT4ge1xuICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICBpZiAoIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG4gIHJldHVybiBQYXJzZS5fZGVjb2RlKHVuZGVmaW5lZCwgZGF0YSk7XG59O1xuXG4vLyBSZXR1cm5zIGFuIHVwZGF0ZWQgY29weSBvZiB0aGUgb2JqZWN0XG5SZXN0V3JpdGUucHJvdG90eXBlLmJ1aWxkUGFyc2VPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUsIG9iamVjdElkOiB0aGlzLnF1ZXJ5Py5vYmplY3RJZCB9O1xuICBsZXQgb3JpZ2luYWxPYmplY3Q7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICBjb25zdCBjbGFzc05hbWUgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04oZXh0cmFEYXRhKTtcbiAgY29uc3QgcmVhZE9ubHlBdHRyaWJ1dGVzID0gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlc1xuICAgID8gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlcygpXG4gICAgOiBbXTtcbiAgaWYgKCF0aGlzLm9yaWdpbmFsRGF0YSkge1xuICAgIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgICAgZXh0cmFEYXRhW2F0dHJpYnV0ZV0gPSB0aGlzLmRhdGFbYXR0cmlidXRlXTtcbiAgICB9XG4gIH1cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKGZ1bmN0aW9uIChkYXRhLCBrZXkpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YVtrZXldLl9fb3AgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcmVhZE9ubHlBdHRyaWJ1dGVzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChrZXksIGRhdGFba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHN1YmRvY3VtZW50IGtleSB3aXRoIGRvdCBub3RhdGlvbiB7ICd4LnknOiB2IH0gPT4geyAneCc6IHsgJ3knIDogdiB9IH0pXG4gICAgICAgIGNvbnN0IHNwbGl0dGVkS2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBzcGxpdHRlZEtleVswXTtcbiAgICAgICAgbGV0IHBhcmVudFZhbCA9IHVwZGF0ZWRPYmplY3QuZ2V0KHBhcmVudFByb3ApO1xuICAgICAgICBpZiAodHlwZW9mIHBhcmVudFZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXJlbnRWYWwgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBwYXJlbnRWYWxbc3BsaXR0ZWRLZXlbMV1dID0gZGF0YVtrZXldO1xuICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChwYXJlbnRQcm9wLCBwYXJlbnRWYWwpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuXG4gIGNvbnN0IHNhbml0aXplZCA9IHRoaXMuc2FuaXRpemVkRGF0YSgpO1xuICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICBkZWxldGUgc2FuaXRpemVkW2F0dHJpYnV0ZV07XG4gIH1cbiAgdXBkYXRlZE9iamVjdC5zZXQoc2FuaXRpemVkKTtcbiAgcmV0dXJuIHsgdXBkYXRlZE9iamVjdCwgb3JpZ2luYWxPYmplY3QgfTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xlYW5Vc2VyQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24gKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh0aGlzLnBlbmRpbmdPcHMuaWRlbnRpZmllcik7XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zKSB7XG4gICAgaWYgKCFwZW5kaW5nW2tleV0pIHtcbiAgICAgIGRhdGFba2V5XSA9IHRoaXMub3JpZ2luYWxEYXRhID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XSA6IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2tpcEtleXMgPSBbLi4uKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSldO1xuICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICBza2lwS2V5cy5wdXNoKCdvYmplY3RJZCcsICdjcmVhdGVkQXQnKTtcbiAgfSBlbHNlIHtcbiAgICBza2lwS2V5cy5wdXNoKCd1cGRhdGVkQXQnKTtcbiAgICBkZWxldGUgcmVzcG9uc2Uub2JqZWN0SWQ7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAoXG4gICAgICB2YWx1ZSA9PSBudWxsIHx8XG4gICAgICAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbChkYXRhW2tleV0sIHZhbHVlKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbCgodGhpcy5vcmlnaW5hbERhdGEgfHwge30pW2tleV0sIHZhbHVlKVxuICAgICkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICB9XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBZUEsSUFBQUEsVUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0Es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