"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = _interopRequireDefault(require("./logger"));
var _SchemaController = require("./Controllers/SchemaController");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
    operations: {
      ...pending
    },
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
  await this.config.filesController.expandFilesInObject(this.config, userData);
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
  if (!hasAuthDataId) {
    return;
  }
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
  if (!this.config.passwordPolicy) {
    return Promise.resolve();
  }
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
      if (this.data.password.indexOf(this.data.username) >= 0) {
        return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
      }
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        if (this.data.password.indexOf(results[0].username) >= 0) {
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        }
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
      if (user._password_history) {
        oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      }
      oldPasswords.push(user.password);
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            {
              return Promise.reject('REPEAT_PASSWORD');
            }
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
          {
            return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
          }
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
RestWrite.prototype.expandFilesForExistingObjects = async function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    await this.config.filesController.expandFilesInObject(this.config, this.response.response);
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
  const extraData = {
    className: this.className,
    objectId: this.query?.objectId
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9TY2hlbWFDb250cm9sbGVyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiU2NoZW1hQ29udHJvbGxlciIsImRlZXBjb3B5IiwiQXV0aCIsIlV0aWxzIiwiY3J5cHRvVXRpbHMiLCJwYXNzd29yZENyeXB0byIsIlBhcnNlIiwidHJpZ2dlcnMiLCJDbGllbnRTREsiLCJ1dGlsIiwiUmVzdFdyaXRlIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInF1ZXJ5IiwiZGF0YSIsIm9yaWdpbmFsRGF0YSIsImNsaWVudFNESyIsImNvbnRleHQiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwZW5kaW5nT3BzIiwib3BlcmF0aW9ucyIsImlkZW50aWZpZXIiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsImNoZWNrUmVzdHJpY3RlZEZpZWxkcyIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZW5zdXJlVW5pcXVlQXV0aERhdGFJZCIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJhdXRoRGF0YVJlc3BvbnNlIiwicmVqZWN0U2lnbnVwIiwicHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwiLCJFTUFJTF9OT1RfRk9VTkQiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJtYW55IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwibGVuZ3RoIiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwidmFsdWUiLCJrZXkiLCJpc0VxdWFsIiwicHVzaCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwiX190eXBlIiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwiaGFzVXNlcm5hbWVBbmRQYXNzd29yZCIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwicHJvdmlkZXJzIiwiY2FuSGFuZGxlQXV0aERhdGEiLCJzb21lIiwicHJvdmlkZXIiLCJwcm92aWRlckF1dGhEYXRhIiwiaGFzVG9rZW4iLCJnZXRVc2VySWQiLCJoYW5kbGVBdXRoRGF0YSIsImZpbHRlcmVkT2JqZWN0c0J5QUNMIiwib2JqZWN0cyIsImZpbHRlciIsIkFDTCIsImhhc0F1dGhEYXRhSWQiLCJyIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJ1c2VySWQiLCJ1c2VyUmVzdWx0IiwiZm91bmRVc2VySXNOb3RDdXJyZW50VXNlciIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInZhbGlkYXRlZEF1dGhEYXRhIiwiYXV0aFByb3ZpZGVyIiwiam9pbiIsImhhc011dGF0ZWRBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciIsImlzTG9naW4iLCJsb2NhdGlvbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwicmVzIiwicHJvbWlzZSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsIk1ldGhvZCIsIm1hc3RlciIsInJ1bkJlZm9yZUZpbmQiLCJyZXN0V2hlcmUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJjYXNlSW5zZW5zaXRpdmUiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwibWF0Y2giLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInJlcXVlc3QiLCJvcmlnaW5hbCIsImlwIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyQ29udHJvbGxlciIsInNldEVtYWlsVmVyaWZ5VG9rZW4iLCJwYXNzd29yZFBvbGljeSIsIl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzIiwiX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5IiwicG9saWN5RXJyb3IiLCJ2YWxpZGF0aW9uRXJyb3IiLCJjb250YWluc1VzZXJuYW1lRXJyb3IiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJtYWludGVuYW5jZSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJtYXAiLCJjb21wYXJlIiwiYWxsIiwiY2F0Y2giLCJlcnIiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsInNlc3Npb25EYXRhIiwiY3JlYXRlU2Vzc2lvbiIsImNyZWF0ZWRXaXRoIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwidG9rZW4iLCJuZXdUb2tlbiIsImV4cGlyZXNBdCIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImFzc2lnbiIsImFkZE9wcyIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsImRlc3Ryb3kiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0Iiwic2Vzc2lvblF1ZXJ5IiwiYmluZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJzdGF0dXMiLCJkZXZpY2VUb2tlbiIsInRvTG93ZXJDYXNlIiwiZGV2aWNlVHlwZSIsImlkTWF0Y2giLCJvYmplY3RJZE1hdGNoIiwiaW5zdGFsbGF0aW9uSWRNYXRjaCIsImRldmljZVRva2VuTWF0Y2hlcyIsIm9yUXVlcmllcyIsIiRvciIsImRlbFF1ZXJ5IiwiYXBwSWRlbnRpZmllciIsImNvZGUiLCJvYmpJZCIsInJvbGUiLCJjbGVhciIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJjbGVhckNhY2hlZFJvbGVzIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImpzb25SZXR1cm5lZCIsIl90b0Z1bGxKU09OIiwidG9KU09OIiwibG9nZ2VyIiwid2FybiIsIm1pZGRsZSIsIm1vdW50Iiwic2VydmVyVVJMIiwic2FuaXRpemVkRGF0YSIsInRlc3QiLCJfZGVjb2RlIiwiZnJvbUpTT04iLCJyZWFkT25seUF0dHJpYnV0ZXMiLCJjb25zdHJ1Y3RvciIsImF0dHJpYnV0ZSIsImluY2x1ZGVzIiwic2V0Iiwic3BsaXR0ZWRLZXkiLCJzcGxpdCIsInBhcmVudFByb3AiLCJwYXJlbnRWYWwiLCJnZXQiLCJzYW5pdGl6ZWQiLCJza2lwS2V5cyIsInJlcXVpcmVkQ29sdW1ucyIsImlzRGVlcFN0cmljdEVxdWFsIiwiY2xpZW50U3VwcG9ydHNEZWxldGUiLCJzdXBwb3J0c0ZvcndhcmREZWxldGUiLCJkYXRhVmFsdWUiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJtb2R1bGUiXSwic291cmNlcyI6WyIuLi9zcmMvUmVzdFdyaXRlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgUmVzdFdyaXRlIGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGFuIG9wZXJhdGlvblxuLy8gdGhhdCB3cml0ZXMgdG8gdGhlIGRhdGFiYXNlLlxuLy8gVGhpcyBjb3VsZCBiZSBlaXRoZXIgYSBcImNyZWF0ZVwiIG9yIGFuIFwidXBkYXRlXCIuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgZGVlcGNvcHkgPSByZXF1aXJlKCdkZWVwY29weScpO1xuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vVXRpbHMnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbnZhciBDbGllbnRTREsgPSByZXF1aXJlKCcuL0NsaWVudFNESycpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgcmVxdWlyZWRDb2x1bW5zIH0gZnJvbSAnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcblxuLy8gcXVlcnkgYW5kIGRhdGEgYXJlIGJvdGggcHJvdmlkZWQgaW4gUkVTVCBBUEkgZm9ybWF0LiBTbyBkYXRhXG4vLyB0eXBlcyBhcmUgZW5jb2RlZCBieSBwbGFpbiBvbGQgb2JqZWN0cy5cbi8vIElmIHF1ZXJ5IGlzIG51bGwsIHRoaXMgaXMgYSBcImNyZWF0ZVwiIGFuZCB0aGUgZGF0YSBpbiBkYXRhIHNob3VsZCBiZVxuLy8gY3JlYXRlZC5cbi8vIE90aGVyd2lzZSB0aGlzIGlzIGFuIFwidXBkYXRlXCIgLSB0aGUgb2JqZWN0IG1hdGNoaW5nIHRoZSBxdWVyeVxuLy8gc2hvdWxkIGdldCB1cGRhdGVkIHdpdGggZGF0YS5cbi8vIFJlc3RXcml0ZSB3aWxsIGhhbmRsZSBvYmplY3RJZCwgY3JlYXRlZEF0LCBhbmQgdXBkYXRlZEF0IGZvclxuLy8gZXZlcnl0aGluZy4gSXQgYWxzbyBrbm93cyB0byB1c2UgdHJpZ2dlcnMgYW5kIHNwZWNpYWwgbW9kaWZpY2F0aW9uc1xuLy8gZm9yIHRoZSBfVXNlciBjbGFzcy5cbmZ1bmN0aW9uIFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcXVlcnksIGRhdGEsIG9yaWdpbmFsRGF0YSwgY2xpZW50U0RLLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJiAhZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdvYmplY3RJZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogbnVsbCxcbiAgICBpZGVudGlmaWVyOiBudWxsLFxuICB9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jaGVja1Jlc3RyaWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5lbnN1cmVVbmlxdWVBdXRoRGF0YUlkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWEoKTtcbiAgICB9KVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBzY2hlbWFDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHRoaXMuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtVXNlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkRhdGFiYXNlT3BlcmF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNsZWFuVXNlckF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBBcHBlbmQgdGhlIGF1dGhEYXRhUmVzcG9uc2UgaWYgZXhpc3RzXG4gICAgICBpZiAodGhpcy5hdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhUmVzcG9uc2UgPSB0aGlzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnN0b3JhZ2UucmVqZWN0U2lnbnVwICYmIHRoaXMuY29uZmlnLnByZXZlbnRTaWdudXBXaXRoVW52ZXJpZmllZEVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gdGhpcy5ydW5PcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgc2NoZW1hLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZVNjaGVtYSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnZhbGlkYXRlT2JqZWN0KFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRoaXMuZGF0YSxcbiAgICB0aGlzLnF1ZXJ5LFxuICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICB0aGlzLmF1dGguaXNNYWludGVuYW5jZVxuICApO1xufTtcblxuLy8gUnVucyBhbnkgYmVmb3JlU2F2ZSB0cmlnZ2VycyBhZ2FpbnN0IHRoaXMgb3BlcmF0aW9uLlxuLy8gQW55IGNoYW5nZSBsZWFkcyB0byBvdXIgZGF0YSBiZWluZyBtdXRhdGVkLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3QgaWRlbnRpZmllciA9IHVwZGF0ZWRPYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpO1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHMoaWRlbnRpZmllcik7XG4gIHRoaXMucGVuZGluZ09wcyA9IHtcbiAgICBvcGVyYXRpb25zOiB7IC4uLnBlbmRpbmcgfSxcbiAgICBpZGVudGlmaWVyLFxuICB9O1xuXG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEJlZm9yZSBjYWxsaW5nIHRoZSB0cmlnZ2VyLCB2YWxpZGF0ZSB0aGUgcGVybWlzc2lvbnMgZm9yIHRoZSBzYXZlIG9wZXJhdGlvblxuICAgICAgbGV0IGRhdGFiYXNlUHJvbWlzZSA9IG51bGw7XG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgdXBkYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciBjcmVhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5jcmVhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJbiB0aGUgY2FzZSB0aGF0IHRoZXJlIGlzIG5vIHBlcm1pc3Npb24gZm9yIHRoZSBvcGVyYXRpb24sIGl0IHRocm93cyBhbiBlcnJvclxuICAgICAgcmV0dXJuIGRhdGFiYXNlUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICB0aGlzLmNvbmZpZyxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IF8ucmVkdWNlKFxuICAgICAgICAgIHJlc3BvbnNlLm9iamVjdCxcbiAgICAgICAgICAocmVzdWx0LCB2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmRhdGFba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgW11cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhID0gcmVzcG9uc2Uub2JqZWN0O1xuICAgICAgICAvLyBXZSBzaG91bGQgZGVsZXRlIHRoZSBvYmplY3RJZCBmb3IgYW4gdXBkYXRlIHdyaXRlXG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyh0aGlzLmNvbmZpZywgdGhpcy5kYXRhKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcik7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uICh1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG5cbiAgLy8gRXhwYW5kIGZpbGUgb2JqZWN0c1xuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICByZXR1cm4gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBjb25zdCBzY2hlbWEgPSBhbGxDbGFzc2VzLmZpbmQob25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQgPSAoZmllbGROYW1lLCBzZXREZWZhdWx0KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IG51bGwgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJycgfHxcbiAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIGRlZmF1bHQgZmllbGRzXG4gICAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gYWxsb3cgY3VzdG9taXppbmcgY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQgd2hlbiB1c2luZyBtYWludGVuYW5jZSBrZXlcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuYXV0aC5pc01haW50ZW5hbmNlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQuX190eXBlID09PSAnRGF0ZSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQuaXNvO1xuXG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS51cGRhdGVkQXQgJiYgdGhpcy5kYXRhLnVwZGF0ZWRBdC5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgICAgY29uc3QgY3JlYXRlZEF0ID0gbmV3IERhdGUodGhpcy5kYXRhLmNyZWF0ZWRBdCk7XG4gICAgICAgICAgICBjb25zdCB1cGRhdGVkQXQgPSBuZXcgRGF0ZSh0aGlzLmRhdGEudXBkYXRlZEF0Lmlzbyk7XG5cbiAgICAgICAgICAgIGlmICh1cGRhdGVkQXQgPCBjcmVhdGVkQXQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgJ3VwZGF0ZWRBdCBjYW5ub3Qgb2NjdXIgYmVmb3JlIGNyZWF0ZWRBdCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMuZGF0YS51cGRhdGVkQXQuaXNvO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBpZiBubyB1cGRhdGVkQXQgaXMgcHJvdmlkZWQsIHNldCBpdCB0byBjcmVhdGVkQXQgdG8gbWF0Y2ggZGVmYXVsdCBiZWhhdmlvclxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPbmx5IGFzc2lnbiBuZXcgb2JqZWN0SWQgaWYgd2UgYXJlIGNyZWF0aW5nIG5ldyBvYmplY3RcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSBjcnlwdG9VdGlscy5uZXdPYmplY3RJZCh0aGlzLmNvbmZpZy5vYmplY3RJZFNpemUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCB0cnVlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEpIHtcbiAgICAgICAgdGhpcy5kYXRhLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuXG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuLy8gVHJhbnNmb3JtcyBhdXRoIGRhdGEgZm9yIGEgdXNlciBvYmplY3QuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhIHVzZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgY29uc3QgaGFzVXNlcm5hbWVBbmRQYXNzd29yZCA9XG4gICAgdHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gJ3N0cmluZyc7XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICFhdXRoRGF0YSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdiYWQgb3IgbWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgKGF1dGhEYXRhICYmICFPYmplY3Qua2V5cyhhdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBOb3RoaW5nIHRvIHZhbGlkYXRlIGhlcmVcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBpZiAocHJvdmlkZXJzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjYW5IYW5kbGVBdXRoRGF0YSA9IHByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICAgIHZhciBwcm92aWRlckF1dGhEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgdmFyIGhhc1Rva2VuID0gcHJvdmlkZXJBdXRoRGF0YSAmJiBwcm92aWRlckF1dGhEYXRhLmlkO1xuICAgICAgcmV0dXJuIGhhc1Rva2VuIHx8IHByb3ZpZGVyQXV0aERhdGEgPT09IG51bGw7XG4gICAgfSk7XG4gICAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhIHx8IGhhc1VzZXJuYW1lQW5kUGFzc3dvcmQgfHwgdGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuZ2V0VXNlcklkKCkpIHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhKGF1dGhEYXRhKTtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbiAob2JqZWN0cykge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyIHx8IHRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdHM7XG4gIH1cbiAgcmV0dXJuIG9iamVjdHMuZmlsdGVyKG9iamVjdCA9PiB7XG4gICAgaWYgKCFvYmplY3QuQUNMKSB7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gbGVnYWN5IHVzZXJzIHRoYXQgaGF2ZSBubyBBQ0wgZmllbGQgb24gdGhlbVxuICAgIH1cbiAgICAvLyBSZWd1bGFyIHVzZXJzIHRoYXQgaGF2ZSBiZWVuIGxvY2tlZCBvdXQuXG4gICAgcmV0dXJuIG9iamVjdC5BQ0wgJiYgT2JqZWN0LmtleXMob2JqZWN0LkFDTCkubGVuZ3RoID4gMDtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJJZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHJldHVybiB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9IGVsc2UgaWYgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgIHJldHVybiB0aGlzLmF1dGgudXNlci5pZDtcbiAgfVxufTtcblxuLy8gRGV2ZWxvcGVycyBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgYXV0aERhdGEgdmlhIGJlZm9yZSBzYXZlIHRyaWdnZXJcbi8vIHdlIG5lZWQgYWZ0ZXIgYmVmb3JlIHNhdmUgdG8gZW5zdXJlIHRoYXQgdGhlIGRldmVsb3BlclxuLy8gaXMgbm90IGN1cnJlbnRseSBkdXBsaWNhdGluZyBhdXRoIGRhdGEgSURcblJlc3RXcml0ZS5wcm90b3R5cGUuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8ICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBoYXNBdXRoRGF0YUlkID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5zb21lKFxuICAgIGtleSA9PiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XSAmJiB0aGlzLmRhdGEuYXV0aERhdGFba2V5XS5pZFxuICApO1xuXG4gIGlmICghaGFzQXV0aERhdGFJZCkgeyByZXR1cm47IH1cblxuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbiAgLy8gdXNlIGRhdGEub2JqZWN0SWQgaW4gY2FzZSBvZiBsb2dpbiB0aW1lIGFuZCBmb3VuZCB1c2VyIGR1cmluZyBoYW5kbGUgdmFsaWRhdGVBdXRoRGF0YVxuICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpIHx8IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxICYmIHVzZXJJZCAhPT0gcmVzdWx0c1swXS5vYmplY3RJZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhID0gYXN5bmMgZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgYXV0aERhdGEpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcblxuICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpO1xuICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgY29uc3QgZm91bmRVc2VySXNOb3RDdXJyZW50VXNlciA9IHVzZXJJZCAmJiB1c2VyUmVzdWx0ICYmIHVzZXJJZCAhPT0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxIHx8IGZvdW5kVXNlcklzTm90Q3VycmVudFVzZXIpIHtcbiAgICAvLyBUbyBhdm9pZCBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9zZWN1cml0eS9hZHZpc29yaWVzL0dIU0EtOHczai1nOTgzLThqaDVcbiAgICAvLyBMZXQncyBydW4gc29tZSB2YWxpZGF0aW9uIGJlZm9yZSB0aHJvd2luZ1xuICAgIGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCB0aGlzLCB1c2VyUmVzdWx0KTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgfVxuXG4gIC8vIE5vIHVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YSB3ZSBuZWVkIHRvIHZhbGlkYXRlXG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICBjb25zdCB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSwgYXV0aERhdGFSZXNwb25zZSB9ID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHRoaXNcbiAgICApO1xuICAgIHRoaXMuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgLy8gUmVwbGFjZSBjdXJyZW50IGF1dGhEYXRhIGJ5IHRoZSBuZXcgdmFsaWRhdGVkIG9uZVxuICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFVzZXIgZm91bmQgd2l0aCBwcm92aWRlZCBhdXRoRGF0YVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcblxuICAgIHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgY29uc3QgeyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9ID0gQXV0aC5oYXNNdXRhdGVkQXV0aERhdGEoXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGFcbiAgICApO1xuXG4gICAgY29uc3QgaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyID1cbiAgICAgICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHx8XG4gICAgICB0aGlzLmF1dGguaXNNYXN0ZXI7XG5cbiAgICBjb25zdCBpc0xvZ2luID0gIXVzZXJJZDtcblxuICAgIGlmIChpc0xvZ2luIHx8IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG5cbiAgICAgICAgLy8gSWYgd2UgYXJlIGluIGxvZ2luIG9wZXJhdGlvbiB2aWEgYXV0aERhdGFcbiAgICAgICAgLy8gd2UgbmVlZCB0byBiZSBzdXJlIHRoYXQgdGhlIHVzZXIgaGFzIHByb3ZpZGVkXG4gICAgICAgIC8vIHJlcXVpcmVkIGF1dGhEYXRhXG4gICAgICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgICAgICB7IGNvbmZpZzogdGhpcy5jb25maWcsIGF1dGg6IHRoaXMuYXV0aCB9LFxuICAgICAgICAgIGF1dGhEYXRhLFxuICAgICAgICAgIHVzZXJSZXN1bHQuYXV0aERhdGEsXG4gICAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJldmVudCB2YWxpZGF0aW5nIGlmIG5vIG11dGF0ZWQgZGF0YSBkZXRlY3RlZCBvbiB1cGRhdGVcbiAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhICYmIGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3Rlcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEZvcmNlIHRvIHZhbGlkYXRlIGFsbCBwcm92aWRlZCBhdXRoRGF0YSBvbiBsb2dpblxuICAgICAgLy8gb24gdXBkYXRlIG9ubHkgdmFsaWRhdGUgbXV0YXRlZCBvbmVzXG4gICAgICBpZiAoaGFzTXV0YXRlZEF1dGhEYXRhIHx8ICF0aGlzLmNvbmZpZy5hbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICAgIGlzTG9naW4gPyBhdXRoRGF0YSA6IG11dGF0ZWRBdXRoRGF0YSxcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHVzZXJSZXN1bHRcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhLmF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgICAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIH1cblxuICAgICAgLy8gSUYgd2UgYXJlIGluIGxvZ2luIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3Rlcicgb25seSBpZiBhdXRoRGF0YSBjb250YWlucyBzb21lIGtleXNcbiAgICAgICAgLy8gYXV0aERhdGEgY291bGQgbm90IGNvbnRhaW5zIGtleXMgYWZ0ZXIgdmFsaWRhdGlvbiBpZiB0aGUgYXV0aEFkYXB0ZXJcbiAgICAgICAgLy8gdXNlcyB0aGUgYGRvTm90U2F2ZWAgb3B0aW9uLiBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICB7IGF1dGhEYXRhOiB0aGlzLmRhdGEuYXV0aERhdGEgfSxcbiAgICAgICAgICAgIHt9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jaGVja1Jlc3RyaWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgcmVzdFdoZXJlOiB7XG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcHJvbWlzZSA9IHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxPYmplY3QsXG4gICAgICAgICAgb2JqZWN0OiB1cGRhdGVkT2JqZWN0LFxuICAgICAgICAgIG1hc3RlcjogdGhpcy5hdXRoLmlzTWFzdGVyLFxuICAgICAgICAgIGlwOiB0aGlzLmNvbmZpZy5pcCxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEsIHJlcXVlc3QsIHRoaXMuc3RvcmFnZSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICB7IHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7IH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICB7IHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICApOyB9XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICB7IG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgKTsgfVxuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpOyB9XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApOyB9XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIElmIHNpZ24tdXAgY2FsbFxuICBpZiAoIXRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIpIHtcbiAgICAvLyBDcmVhdGUgcmVxdWVzdCBvYmplY3QgZm9yIHZlcmlmaWNhdGlvbiBmdW5jdGlvbnNcbiAgICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbE9iamVjdCxcbiAgICAgIG9iamVjdDogdXBkYXRlZE9iamVjdCxcbiAgICAgIG1hc3RlcjogdGhpcy5hdXRoLmlzTWFzdGVyLFxuICAgICAgaXA6IHRoaXMuY29uZmlnLmlwLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICB9O1xuICAgIC8vIEdldCB2ZXJpZmljYXRpb24gY29uZGl0aW9ucyB3aGljaCBjYW4gYmUgYm9vbGVhbnMgb3IgZnVuY3Rpb25zOyB0aGUgcHVycG9zZSBvZiB0aGlzIGFzeW5jL2F3YWl0XG4gICAgLy8gc3RydWN0dXJlIGlzIHRvIGF2b2lkIHVubmVjZXNzYXJpbHkgZXhlY3V0aW5nIHN1YnNlcXVlbnQgZnVuY3Rpb25zIGlmIHByZXZpb3VzIG9uZXMgZmFpbCBpbiB0aGVcbiAgICAvLyBjb25kaXRpb25hbCBzdGF0ZW1lbnQgYmVsb3csIGFzIGEgZGV2ZWxvcGVyIG1heSBkZWNpZGUgdG8gZXhlY3V0ZSBleHBlbnNpdmUgb3BlcmF0aW9ucyBpbiB0aGVtXG4gICAgY29uc3QgdmVyaWZ5VXNlckVtYWlscyA9IGFzeW5jICgpID0+IHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09IHRydWUgfHwgKHR5cGVvZiB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgY29uc3QgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9IGFzeW5jICgpID0+IHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09IHRydWUgfHwgKHR5cGVvZiB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgLy8gSWYgdmVyaWZpY2F0aW9uIGlzIHJlcXVpcmVkXG4gICAgaWYgKGF3YWl0IHZlcmlmeVVzZXJFbWFpbHMoKSAmJiBhd2FpdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKCkpIHtcbiAgICAgIHRoaXMuc3RvcmFnZS5yZWplY3RTaWdudXAgPSB0cnVlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlciA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSwgeyBhdXRoOiB0aGlzLmF1dGggfSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRoaXMucXVlcnkgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIGluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFVwZGF0aW5nIF9JbnN0YWxsYXRpb24gYnV0IG5vdCB1cGRhdGluZyBhbnl0aGluZyBjcml0aWNhbFxuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmICFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHJlc3VsdC5vYmplY3RJZCA9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgb2JqZWN0SWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0Lmluc3RhbGxhdGlvbklkID09IGluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0LmRldmljZVRva2VuID09IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYW5pdHkgY2hlY2tzIHdoZW4gcnVubmluZyBhIHF1ZXJ5XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmICghb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZCBmb3IgdXBkYXRlLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICE9PSBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdpbnN0YWxsYXRpb25JZCBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgICFvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUb2tlbiBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVHlwZVxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVHlwZSBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gb2JqZWN0SWRNYXRjaDtcbiAgICAgIH1cblxuICAgICAgaWYgKGluc3RhbGxhdGlvbklkICYmIGluc3RhbGxhdGlvbklkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBuZWVkIHRvIHNwZWNpZnkgZGV2aWNlVHlwZSBvbmx5IGlmIGl0J3MgbmV3XG4gICAgICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlICYmICFpZE1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzUsICdkZXZpY2VUeXBlIG11c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJyk7XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAoIWlkTWF0Y2gpIHtcbiAgICAgICAgaWYgKCFkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICghZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddIHx8ICFpbnN0YWxsYXRpb25JZClcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gU2luZ2xlIG1hdGNoIG9uIGRldmljZSB0b2tlbiBidXQgbm9uZSBvbiBpbnN0YWxsYXRpb25JZCwgYW5kIGVpdGhlclxuICAgICAgICAgIC8vIHRoZSBwYXNzZWQgb2JqZWN0IG9yIHRoZSBtYXRjaCBpcyBtaXNzaW5nIGFuIGluc3RhbGxhdGlvbklkLCBzbyB3ZVxuICAgICAgICAgIC8vIGNhbiBqdXN0IHJldHVybiB0aGUgbWF0Y2guXG4gICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTMyLFxuICAgICAgICAgICAgJ011c3Qgc3BlY2lmeSBpbnN0YWxsYXRpb25JZCB3aGVuIGRldmljZVRva2VuICcgK1xuICAgICAgICAgICAgICAnbWF0Y2hlcyBtdWx0aXBsZSBJbnN0YWxsYXRpb24gb2JqZWN0cydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE11bHRpcGxlIGRldmljZSB0b2tlbiBtYXRjaGVzIGFuZCB3ZSBzcGVjaWZpZWQgYW4gaW5zdGFsbGF0aW9uIElELFxuICAgICAgICAgIC8vIG9yIGEgc2luZ2xlIG1hdGNoIHdoZXJlIGJvdGggdGhlIHBhc3NlZCBhbmQgbWF0Y2hpbmcgb2JqZWN0cyBoYXZlXG4gICAgICAgICAgLy8gYW4gaW5zdGFsbGF0aW9uIElELiBUcnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2hcbiAgICAgICAgICAvLyB0aGUgZGV2aWNlVG9rZW4sIGFuZCByZXR1cm4gbmlsIHRvIHNpZ25hbCB0aGF0IGEgbmV3IG9iamVjdCBzaG91bGRcbiAgICAgICAgICAvLyBiZSBjcmVhdGVkLlxuICAgICAgICAgIHZhciBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDoge1xuICAgICAgICAgICAgICAkbmU6IGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiYgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSkge1xuICAgICAgICAgIC8vIEV4YWN0bHkgb25lIGRldmljZSB0b2tlbiBtYXRjaCBhbmQgaXQgZG9lc24ndCBoYXZlIGFuIGluc3RhbGxhdGlvblxuICAgICAgICAgIC8vIElELiBUaGlzIGlzIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSB3YW50IHRvIG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nXG4gICAgICAgICAgLy8gb2JqZWN0LlxuICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0geyBvYmplY3RJZDogaWRNYXRjaC5vYmplY3RJZCB9O1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIGlkTWF0Y2guZGV2aWNlVG9rZW4gIT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBzZXR0aW5nIHRoZSBkZXZpY2UgdG9rZW4gb24gYW4gZXhpc3RpbmcgaW5zdGFsbGF0aW9uLCBzb1xuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaCB0aGlzXG4gICAgICAgICAgICAvLyBkZXZpY2UgdG9rZW4uXG4gICAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBXZSBoYXZlIGEgdW5pcXVlIGluc3RhbGwgSWQsIHVzZSB0aGF0IHRvIHByZXNlcnZlXG4gICAgICAgICAgICAvLyB0aGUgaW50ZXJlc3RpbmcgaW5zdGFsbGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydpbnN0YWxsYXRpb25JZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCA9PSB0aGlzLmRhdGEub2JqZWN0SWRcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyB3ZSBwYXNzZWQgYW4gb2JqZWN0SWQsIHByZXNlcnZlIHRoYXQgaW5zdGFsYXRpb25cbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ29iamVjdElkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiBpZE1hdGNoLm9iamVjdElkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2hhdCB0byBkbyBoZXJlPyBjYW4ndCByZWFsbHkgY2xlYW4gdXAgZXZlcnl0aGluZy4uLlxuICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3VpdGVkIHRoZSBvYmplY3QgcmVzcG9uc2UgLSB0aGVuIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHdlIGV4cGFuZCBhbGwgdGhlIGZpbGVzLFxuLy8gc2luY2UgdGhpcyBtaWdodCBub3QgaGF2ZSBhIHF1ZXJ5LCBtZWFuaW5nIGl0IHdvbid0IHJldHVybiB0aGUgZnVsbCByZXN1bHQgYmFjay5cbi8vIFRPRE86IChubHV0c2Vua28pIFRoaXMgc2hvdWxkIGRpZSB3aGVuIHdlIG1vdmUgdG8gcGVyLWNsYXNzIGJhc2VkIGNvbnRyb2xsZXJzIG9uIF9TZXNzaW9uL19Vc2VyXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayB3aGV0aGVyIHdlIGhhdmUgYSBzaG9ydC1jaXJjdWl0ZWQgcmVzcG9uc2UgLSBvbmx5IHRoZW4gcnVuIGV4cGFuc2lvbi5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIGF3YWl0IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5EYXRhYmFzZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICAgIGlmICh0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyKSB7XG4gICAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmNsZWFyQ2FjaGVkUm9sZXModGhpcy5hdXRoLnVzZXIpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLnF1ZXJ5ICYmIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5BQ0wgJiZcbiAgICAgIHRoaXMuYXV0aC5pc01hc3RlciAhPT0gdHJ1ZSAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UgIT09IHRydWVcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfSxcbiAgICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID4gTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIGlmIChoYXNMaXZlUXVlcnkpIHtcbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vIE5vdGlmeSBMaXZlUXVlcnlTZXJ2ZXIgaWYgcG9zc2libGVcbiAgICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnModXBkYXRlZE9iamVjdC5jbGFzc05hbWUpO1xuICAgICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgICAgdXBkYXRlZE9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICBwZXJtc1xuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgY29uc3QganNvblJldHVybmVkID0gcmVzdWx0ICYmICFyZXN1bHQuX3RvRnVsbEpTT047XG4gICAgICBpZiAoanNvblJldHVybmVkKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHModGhpcy5wZW5kaW5nT3BzLmlkZW50aWZpZXIpO1xuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnBlbmRpbmdPcHMub3BlcmF0aW9ucykge1xuICAgIGlmICghcGVuZGluZ1trZXldKSB7XG4gICAgICBkYXRhW2tleV0gPSB0aGlzLm9yaWdpbmFsRGF0YSA/IHRoaXMub3JpZ2luYWxEYXRhW2tleV0gOiB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IHNraXBLZXlzID0gWy4uLihyZXF1aXJlZENvbHVtbnMucmVhZFt0aGlzLmNsYXNzTmFtZV0gfHwgW10pXTtcbiAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgc2tpcEtleXMucHVzaCgnb2JqZWN0SWQnLCAnY3JlYXRlZEF0Jyk7XG4gIH0gZWxzZSB7XG4gICAgc2tpcEtleXMucHVzaCgndXBkYXRlZEF0Jyk7XG4gICAgZGVsZXRlIHJlc3BvbnNlLm9iamVjdElkO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJlc3BvbnNlKSB7XG4gICAgaWYgKHNraXBLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZSA9IHJlc3BvbnNlW2tleV07XG4gICAgaWYgKFxuICAgICAgdmFsdWUgPT0gbnVsbCB8fFxuICAgICAgKHZhbHVlLl9fdHlwZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoZGF0YVtrZXldLCB2YWx1ZSkgfHxcbiAgICAgIHV0aWwuaXNEZWVwU3RyaWN0RXF1YWwoKHRoaXMub3JpZ2luYWxEYXRhIHx8IHt9KVtrZXldLCB2YWx1ZSlcbiAgICApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtrZXldO1xuICAgIH1cbiAgfVxuICBpZiAoXy5pc0VtcHR5KHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyKSkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBjbGllbnRTdXBwb3J0c0RlbGV0ZSA9IENsaWVudFNESy5zdXBwb3J0c0ZvcndhcmREZWxldGUodGhpcy5jbGllbnRTREspO1xuICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgY29uc3QgZGF0YVZhbHVlID0gZGF0YVtmaWVsZE5hbWVdO1xuXG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsIGZpZWxkTmFtZSkpIHtcbiAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgfVxuXG4gICAgLy8gU3RyaXBzIG9wZXJhdGlvbnMgZnJvbSByZXNwb25zZXNcbiAgICBpZiAocmVzcG9uc2VbZmllbGROYW1lXSAmJiByZXNwb25zZVtmaWVsZE5hbWVdLl9fb3ApIHtcbiAgICAgIGRlbGV0ZSByZXNwb25zZVtmaWVsZE5hbWVdO1xuICAgICAgaWYgKGNsaWVudFN1cHBvcnRzRGVsZXRlICYmIGRhdGFWYWx1ZS5fX29wID09ICdEZWxldGUnKSB7XG4gICAgICAgIHJlc3BvbnNlW2ZpZWxkTmFtZV0gPSBkYXRhVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgUmVzdFdyaXRlO1xubW9kdWxlLmV4cG9ydHMgPSBSZXN0V3JpdGU7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWVBLElBQUFBLFVBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLE9BQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLGlCQUFBLEdBQUFILE9BQUE7QUFBaUUsU0FBQUQsdUJBQUFLLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFsQmpFO0FBQ0E7QUFDQTs7QUFFQSxJQUFJRyxnQkFBZ0IsR0FBR1AsT0FBTyxDQUFDLGdDQUFnQyxDQUFDO0FBQ2hFLElBQUlRLFFBQVEsR0FBR1IsT0FBTyxDQUFDLFVBQVUsQ0FBQztBQUVsQyxNQUFNUyxJQUFJLEdBQUdULE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDOUIsTUFBTVUsS0FBSyxHQUFH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QUksSUFDWkEsS0FBSyxDQUFDNEIsTUFBTSxJQUFJNUIsS0FBSyxDQUFDNEIsTUFBTSxLQUFLLFNBQVUsSUFDNUNqSSxJQUFJLENBQUNpVSxpQkFBaUIsQ0FBQzNULElBQUksQ0FBQ2dHLEdBQUcsQ0FBQyxFQUFFRCxLQUFLLENBQUMsSUFDeENyRyxJQUFJLENBQUNpVSxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQzFULFlBQVksSUFBSSxDQUFDLENBQUMsRUFBRStGLEdBQUcsQ0FBQyxFQUFFRCxLQUFLLENBQUMsRUFDN0Q7TUFDQSxPQUFPNUUsUUFBUSxDQUFDNkUsR0FBRyxDQUFDO0lBQ3RCO0VBQ0Y7RUFDQSxJQUFJSCxlQUFDLENBQUN1QyxPQUFPLENBQUMsSUFBSSxDQUFDNUgsT0FBTyxDQUFDb0Ysc0JBQXNCLENBQUMsRUFBRTtJQUNsRCxPQUFPekUsUUFBUTtFQUNqQjtFQUNBLE1BQU15UyxvQkFBb0IsR0FBR25VLFNBQVMsQ0FBQ29VLHFCQUFxQixDQUFDLElBQUksQ0FBQzNULFNBQVMsQ0FBQztFQUM1RSxJQUFJLENBQUNNLE9BQU8sQ0FBQ29GLHNCQUFzQixDQUFDbUMsT0FBTyxDQUFDYixTQUFTLElBQUk7SUFDdkQsTUFBTTRNLFNBQVMsR0FBRzlULElBQUksQ0FBQ2tILFNBQVMsQ0FBQztJQUVqQyxJQUFJLENBQUN2RyxNQUFNLENBQUNDLFNBQVMsQ0FBQ0MsY0FBYyxDQUFDQyxJQUFJLENBQUNLLFFBQVEsRUFBRStGLFNBQVMsQ0FBQyxFQUFFO01BQzlEL0YsUUFBUSxDQUFDK0YsU0FBUyxDQUFDLEdBQUc0TSxTQUFTO0lBQ2pDOztJQUVBO0lBQ0EsSUFBSTNTLFFBQVEsQ0FBQytGLFNBQVMsQ0FBQyxJQUFJL0YsUUFBUSxDQUFDK0YsU0FBUyxDQUFDLENBQUNHLElBQUksRUFBRTtNQUNuRCxPQUFPbEcsUUFBUSxDQUFDK0YsU0FBUyxDQUFDO01BQzFCLElBQUkwTSxvQkFBb0IsSUFBSUUsU0FBUyxDQUFDek0sSUFBSSxJQUFJLFFBQVEsRUFBRTtRQUN0RGxHLFFBQVEsQ0FBQytGLFNBQVMsQ0FBQyxHQUFHNE0sU0FBUztNQUNqQztJQUNGO0VBQ0YsQ0FBQyxDQUFDO0VBQ0YsT0FBTzNTLFFBQVE7QUFDakIsQ0FBQztBQUFDLElBQUE0UyxRQUFBLEdBQUFDLE9BQUEsQ0FBQWhWLE9BQUEsR0FFYVcsU0FBUztBQUN4QnNVLE1BQU0sQ0FBQ0QsT0FBTyxHQUFHclUsU0FBUyIsImlnbm9yZUxpc3QiOltdfQ==