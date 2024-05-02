"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UsersRouter = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _Config = _interopRequireDefault(require("../Config"));
var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));
var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));
var _rest = _interopRequireDefault(require("../rest"));
var _Auth = _interopRequireDefault(require("../Auth"));
var _password = _interopRequireDefault(require("../password"));
var _triggers = require("../triggers");
var _middlewares = require("../middlewares");
var _RestWrite = _interopRequireDefault(require("../RestWrite"));
var _logger = require("../logger");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // These methods handle the User-related routes.
class UsersRouter extends _ClassesRouter.default {
  className() {
    return '_User';
  }

  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */
  static removeHiddenProperties(obj) {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Regexp comes from Parse.Object.prototype.validate
        if (key !== '__type' && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
          delete obj[key];
        }
      }
    }
  }

  /**
   * After retrieving a user directly from the database, we need to remove the
   * password from the object (for security), and fix an issue some SDKs have
   * with null values
   */
  _sanitizeAuthData(user) {
    delete user.password;

    // Sometimes the authData still has null on that keys
    // https://github.com/parse-community/parse-server/issues/935
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

  /**
   * Validates a password request in login and verifyPassword
   * @param {Object} req The request
   * @returns {Object} User object
   * @private
   */
  _authenticateUserFromRequest(req) {
    return new Promise((resolve, reject) => {
      // Use query parameters instead if provided in url
      let payload = req.body;
      if (!payload.username && req.query && req.query.username || !payload.email && req.query && req.query.email) {
        payload = req.query;
      }
      const {
        username,
        email,
        password,
        ignoreEmailVerification
      } = payload;

      // TODO: use the right error codes / descriptions.
      if (!username && !email) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'username/email is required.');
      }
      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'password is required.');
      }
      if (typeof password !== 'string' || email && typeof email !== 'string' || username && typeof username !== 'string') {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }
      let user;
      let isValidPassword = false;
      let query;
      if (email && username) {
        query = {
          email,
          username
        };
      } else if (email) {
        query = {
          email
        };
      } else {
        query = {
          $or: [{
            username
          }, {
            email: username
          }]
        };
      }
      return req.config.database.find('_User', query, {}, _Auth.default.maintenance(req.config)).then(results => {
        if (!results.length) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        if (results.length > 1) {
          // corner case where user1 has username == user2 email
          req.config.loggerController.warn("There is a user which email is the same as another user's username, logging in based on username");
          user = results.filter(user => user.username === username)[0];
        } else {
          user = results[0];
        }
        return _password.default.compare(password, user.password);
      }).then(correct => {
        isValidPassword = correct;
        const accountLockoutPolicy = new _AccountLockout.default(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      }).then(async () => {
        if (!isValidPassword) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        // Ensure the user isn't locked out
        // A locked out user won't be able to login
        // To lock a user out, just set the ACL to `masterKey` only  ({}).
        // Empty ACL is OK
        if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        // Create request object for verification functions
        const request = {
          master: req.auth.isMaster,
          ip: req.config.ip,
          installationId: req.auth.installationId,
          object: _node.default.User.fromJSON(Object.assign({
            className: '_User'
          }, user))
        };

        // If request doesn't use master or maintenance key with ignoring email verification
        if (!((req.auth.isMaster || req.auth.isMaintenance) && ignoreEmailVerification)) {
          // Get verification conditions which can be booleans or functions; the purpose of this async/await
          // structure is to avoid unnecessarily executing subsequent functions if previous ones fail in the
          // conditional statement below, as a developer may decide to execute expensive operations in them
          const verifyUserEmails = async () => req.config.verifyUserEmails === true || typeof req.config.verifyUserEmails === 'function' && (await Promise.resolve(req.config.verifyUserEmails(request))) === true;
          const preventLoginWithUnverifiedEmail = async () => req.config.preventLoginWithUnverifiedEmail === true || typeof req.config.preventLoginWithUnverifiedEmail === 'function' && (await Promise.resolve(req.config.preventLoginWithUnverifiedEmail(request))) === true;
          if ((await verifyUserEmails()) && (await preventLoginWithUnverifiedEmail()) && !user.emailVerified) {
            throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
          }
        }
        this._sanitizeAuthData(user);
        return resolve(user);
      }).catch(error => {
        return reject(error);
      });
    });
  }
  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }
    const sessionToken = req.info.sessionToken;
    return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
      sessionToken
    }, {
      include: 'user'
    }, req.info.clientSDK, req.info.context).then(response => {
      if (!response.results || response.results.length == 0 || !response.results[0].user) {
        throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      } else {
        const user = response.results[0].user;
        // Send token back on the login, because SDKs expect that.
        user.sessionToken = sessionToken;

        // Remove hidden properties.
        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }
  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);
    const authData = req.body && req.body.authData;
    // Check if user has provided their required auth providers
    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(req, authData, user.authData, req.config);
    let authDataResponse;
    let validatedAuthData;
    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, new _RestWrite.default(req.config, req.auth, '_User', {
        objectId: user.objectId
      }, req.body, user, req.info.clientSDK, req.info.context), user);
      authDataResponse = res.authDataResponse;
      validatedAuthData = res.authData;
    }

    // handle password expiry policy
    if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
      let changedAt = user._password_changed_at;
      if (!changedAt) {
        // password was created before expiry policy was enabled.
        // simply update _User object so that it will start enforcing from now
        changedAt = new Date();
        req.config.database.update('_User', {
          username: user.username
        }, {
          _password_changed_at: _node.default._encode(changedAt)
        });
      } else {
        // check whether the password has expired
        if (changedAt.__type == 'Date') {
          changedAt = new Date(changedAt.iso);
        }
        // Calculate the expiry time.
        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date())
          // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user);

    // Before login trigger; throws if failure
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config, req.info.context);

    // If we have some new validated authData update directly
    if (validatedAuthData && Object.keys(validatedAuthData).length) {
      await req.config.database.update('_User', {
        objectId: user.objectId
      }, {
        authData: validatedAuthData
      }, {});
    }
    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId: user.objectId,
      createdWith: {
        action: 'login',
        authProvider: 'password'
      },
      installationId: req.info.installationId
    });
    user.sessionToken = sessionData.sessionToken;
    await createSession();
    const afterLoginUser = _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user));
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config, req.info.context);
    if (authDataResponse) {
      user.authDataResponse = authDataResponse;
    }
    await req.config.authDataManager.runAfterFind(req, user.authData);
    return {
      response: user
    };
  }

  /**
   * This allows master-key clients to create user sessions without access to
   * user credentials. This enables systems that can authenticate access another
   * way (API key, app administrators) to act on a user's behalf.
   *
   * We create a new session rather than looking for an existing session; we
   * want this to work in situations where the user is logged out on all
   * devices, since this can be used by automated systems acting on the user's
   * behalf.
   *
   * For the moment, we're omitting event hooks and lockout checks, since
   * immediate use cases suggest /loginAs could be used for semantically
   * different reasons from /login
   */
  async handleLogInAs(req) {
    if (!req.auth.isMaster) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'master key is required');
    }
    const userId = req.body.userId || req.query.userId;
    if (!userId) {
      throw new _node.default.Error(_node.default.Error.INVALID_VALUE, 'userId must not be empty, null, or undefined');
    }
    const queryResults = await req.config.database.find('_User', {
      objectId: userId
    });
    const user = queryResults[0];
    if (!user) {
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'user not found');
    }
    this._sanitizeAuthData(user);
    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId,
      createdWith: {
        action: 'login',
        authProvider: 'masterkey'
      },
      installationId: req.info.installationId
    });
    user.sessionToken = sessionData.sessionToken;
    await createSession();
    return {
      response: user
    };
  }
  handleVerifyPassword(req) {
    return this._authenticateUserFromRequest(req).then(user => {
      // Remove hidden properties.
      UsersRouter.removeHiddenProperties(user);
      return {
        response: user
      };
    }).catch(error => {
      throw error;
    });
  }
  async handleLogOut(req) {
    const success = {
      response: {}
    };
    if (req.info && req.info.sessionToken) {
      const records = await _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context);
      if (records.results && records.results.length) {
        await _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context);
        await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
          className: '_Session'
        }, records.results[0])), null, req.config);
      }
    }
    return success;
  }
  _throwOnBadEmailConfig(req) {
    try {
      _Config.default.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid: req.config.emailVerifyTokenReuseIfValid
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
      } else {
        throw e;
      }
    }
  }
  async handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);
    const {
      email
    } = req.body;
    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    const userController = req.config.userController;
    try {
      await userController.sendPasswordResetEmail(email);
      return {
        response: {}
      };
    } catch (err) {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        var _req$config$passwordP;
        if (((_req$config$passwordP = req.config.passwordPolicy) === null || _req$config$passwordP === void 0 ? void 0 : _req$config$passwordP.resetPasswordSuccessOnInvalidEmail) ?? true) {
          return {
            response: {}
          };
        }
        err.message = `A user with that email does not exist.`;
      }
      throw err;
    }
  }
  async handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);
    const {
      email
    } = req.body;
    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    const results = await req.config.database.find('_User', {
      email: email
    }, {}, _Auth.default.maintenance(req.config));
    if (!results.length || results.length < 1) {
      throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
    }
    const user = results[0];

    // remove password field, messes with saving on postgres
    delete user.password;
    if (user.emailVerified) {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
    }
    const userController = req.config.userController;
    const send = await userController.regenerateEmailVerifyToken(user, req.auth.isMaster, req.auth.installationId, req.ip);
    if (send) {
      userController.sendVerificationEmail(user, req);
    }
    return {
      response: {}
    };
  }
  async handleChallenge(req) {
    const {
      username,
      email,
      password,
      authData,
      challengeData
    } = req.body;

    // if username or email provided with password try to authenticate the user by username
    let user;
    if (username || email) {
      if (!password) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      }
      user = await this._authenticateUserFromRequest(req);
    }
    if (!challengeData) {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    }
    if (typeof challengeData !== 'object') {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.');
    }
    let request;
    let parseUser;

    // Try to find user by authData
    if (authData) {
      if (typeof authData !== 'object') {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authData should be an object.');
      }
      if (user) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cannot provide username/email and authData, only use one identification method.');
      }
      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cannot provide more than one authData provider with an id.');
      }
      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);
      try {
        if (!results[0] || results.length > 1) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'User not found.');
        }
        // Find the provider used to find the user
        const provider = Object.keys(authData).find(key => authData[key].id);
        parseUser = _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0]));
        request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
        request.isChallenge = true;
        // Validate authData used to identify the user to avoid brute-force attack on `id`
        const {
          validator
        } = req.config.authDataManager.getValidatorForProvider(provider);
        const validatorResponse = await validator(authData[provider], req, parseUser, request);
        if (validatorResponse && validatorResponse.validator) {
          await validatorResponse.validator();
        }
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        _logger.logger.error(e);
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'User not found.');
      }
    }
    if (!parseUser) {
      parseUser = user ? _node.default.User.fromJSON(_objectSpread({
        className: '_User'
      }, user)) : undefined;
    }
    if (!request) {
      request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
      request.isChallenge = true;
    }
    const acc = {};
    // Execute challenge step-by-step with consistent order for better error feedback
    // and to avoid to trigger others challenges if one of them fails
    for (const provider of Object.keys(challengeData).sort()) {
      try {
        const authAdapter = req.config.authDataManager.getValidatorForProvider(provider);
        if (!authAdapter) {
          continue;
        }
        const {
          adapter: {
            challenge
          }
        } = authAdapter;
        if (typeof challenge === 'function') {
          const providerChallengeResponse = await challenge(challengeData[provider], authData && authData[provider], req.config.auth[provider], request);
          acc[provider] = providerChallengeResponse || true;
        }
      } catch (err) {
        const e = (0, _triggers.resolveError)(err, {
          code: _node.default.Error.SCRIPT_FAILED,
          message: 'Challenge failed. Unknown error.'
        });
        const userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
        _logger.logger.error(`Failed running auth step challenge for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
          authenticationStep: 'challenge',
          error: e,
          user: userString,
          provider
        });
        throw e;
      }
    }
    return {
      response: {
        challengeData: acc
      }
    };
  }
  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/users/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('GET', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/loginAs', req => {
      return this.handleLogInAs(req);
    });
    this.route('POST', '/logout', req => {
      return this.handleLogOut(req);
    });
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
    this.route('POST', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
    this.route('POST', '/challenge', req => {
      return this.handleChallenge(req);
    });
  }
}
exports.UsersRouter = UsersRouter;
var _default = exports.default = UsersRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInRlc3QiLCJfc2FuaXRpemVBdXRoRGF0YSIsInVzZXIiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsImlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIiwiUGFyc2UiLCJFcnJvciIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiT0JKRUNUX05PVF9GT1VORCIsImlzVmFsaWRQYXNzd29yZCIsIiRvciIsImNvbmZpZyIsImRhdGFiYXNlIiwiZmluZCIsIkF1dGgiLCJtYWludGVuYW5jZSIsInRoZW4iLCJyZXN1bHRzIiwibG9nZ2VyQ29udHJvbGxlciIsIndhcm4iLCJwYXNzd29yZENyeXB0byIsImNvbXBhcmUiLCJjb3JyZWN0IiwiYWNjb3VudExvY2tvdXRQb2xpY3kiLCJBY2NvdW50TG9ja291dCIsImhhbmRsZUxvZ2luQXR0ZW1wdCIsImF1dGgiLCJpc01hc3RlciIsIkFDTCIsInJlcXVlc3QiLCJtYXN0ZXIiLCJpcCIsImluc3RhbGxhdGlvbklkIiwib2JqZWN0IiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwiaXNNYWludGVuYW5jZSIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImNhdGNoIiwiZXJyb3IiLCJoYW5kbGVNZSIsImluZm8iLCJzZXNzaW9uVG9rZW4iLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJyZXN0IiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInJlcyIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsIlJlc3RXcml0ZSIsIm9iamVjdElkIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJhZnRlckxvZ2luVXNlciIsImFmdGVyTG9naW4iLCJhdXRoRGF0YU1hbmFnZXIiLCJydW5BZnRlckZpbmQiLCJoYW5kbGVMb2dJbkFzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIklOVkFMSURfVkFMVUUiLCJxdWVyeVJlc3VsdHMiLCJoYW5kbGVWZXJpZnlQYXNzd29yZCIsImhhbmRsZUxvZ091dCIsInN1Y2Nlc3MiLCJyZWNvcmRzIiwidW5kZWZpbmVkIiwiZGVsIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImhhbmRsZVJlc2V0UmVxdWVzdCIsIkVNQUlMX01JU1NJTkciLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwiZXJyIiwiY29kZSIsIl9yZXEkY29uZmlnJHBhc3N3b3JkUCIsInJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJtZXNzYWdlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJzZW5kIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJoYW5kbGVDaGFsbGVuZ2UiLCJjaGFsbGVuZ2VEYXRhIiwicGFyc2VVc2VyIiwiaWQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiaXNDaGFsbGVuZ2UiLCJ2YWxpZGF0b3IiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsInZhbGlkYXRvclJlc3BvbnNlIiwibG9nZ2VyIiwiYWNjIiwic29ydCIsImF1dGhBZGFwdGVyIiwiY2hhbGxlbmdlIiwicHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJ1c2VyU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvVXNlcnNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQge1xuICBtYXliZVJ1blRyaWdnZXIsXG4gIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyxcbiAgZ2V0UmVxdWVzdE9iamVjdCxcbiAgcmVzb2x2ZUVycm9yLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5LCB7fSwgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDcmVhdGUgcmVxdWVzdCBvYmplY3QgZm9yIHZlcmlmaWNhdGlvbiBmdW5jdGlvbnNcbiAgICAgICAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgICAgICAgbWFzdGVyOiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgICAgICAgIGlwOiByZXEuY29uZmlnLmlwLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgb2JqZWN0OiBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICAvLyBJZiByZXF1ZXN0IGRvZXNuJ3QgdXNlIG1hc3RlciBvciBtYWludGVuYW5jZSBrZXkgd2l0aCBpZ25vcmluZyBlbWFpbCB2ZXJpZmljYXRpb25cbiAgICAgICAgICBpZiAoISgocmVxLmF1dGguaXNNYXN0ZXIgfHwgcmVxLmF1dGguaXNNYWludGVuYW5jZSkgJiYgaWdub3JlRW1haWxWZXJpZmljYXRpb24pKSB7XG5cbiAgICAgICAgICAgIC8vIEdldCB2ZXJpZmljYXRpb24gY29uZGl0aW9ucyB3aGljaCBjYW4gYmUgYm9vbGVhbnMgb3IgZnVuY3Rpb25zOyB0aGUgcHVycG9zZSBvZiB0aGlzIGFzeW5jL2F3YWl0XG4gICAgICAgICAgICAvLyBzdHJ1Y3R1cmUgaXMgdG8gYXZvaWQgdW5uZWNlc3NhcmlseSBleGVjdXRpbmcgc3Vic2VxdWVudCBmdW5jdGlvbnMgaWYgcHJldmlvdXMgb25lcyBmYWlsIGluIHRoZVxuICAgICAgICAgICAgLy8gY29uZGl0aW9uYWwgc3RhdGVtZW50IGJlbG93LCBhcyBhIGRldmVsb3BlciBtYXkgZGVjaWRlIHRvIGV4ZWN1dGUgZXhwZW5zaXZlIG9wZXJhdGlvbnMgaW4gdGhlbVxuICAgICAgICAgICAgY29uc3QgdmVyaWZ5VXNlckVtYWlscyA9IGFzeW5jICgpID0+IHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gdHJ1ZSB8fCAodHlwZW9mIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJiBhd2FpdCBQcm9taXNlLnJlc29sdmUocmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgICAgICAgICBjb25zdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID0gYXN5bmMgKCkgPT4gcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSB0cnVlIHx8ICh0eXBlb2YgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZShyZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICAgICAgICAgIGlmIChhd2FpdCB2ZXJpZnlVc2VyRW1haWxzKCkgJiYgYXdhaXQgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCgpICYmICF1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgY29uc3QgYXV0aERhdGEgPSByZXEuYm9keSAmJiByZXEuYm9keS5hdXRoRGF0YTtcbiAgICAvLyBDaGVjayBpZiB1c2VyIGhhcyBwcm92aWRlZCB0aGVpciByZXF1aXJlZCBhdXRoIHByb3ZpZGVyc1xuICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihcbiAgICAgIHJlcSxcbiAgICAgIGF1dGhEYXRhLFxuICAgICAgdXNlci5hdXRoRGF0YSxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgbGV0IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgbGV0IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICAgIGF1dGhEYXRhLFxuICAgICAgICBuZXcgUmVzdFdyaXRlKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgICAgcmVxLmJvZHksXG4gICAgICAgICAgdXNlcixcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApLFxuICAgICAgICB1c2VyXG4gICAgICApO1xuICAgICAgYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgdmFsaWRhdGVkQXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgfVxuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcblxuICAgIC8vIElmIHdlIGhhdmUgc29tZSBuZXcgdmFsaWRhdGVkIGF1dGhEYXRhIHVwZGF0ZSBkaXJlY3RseVxuICAgIGlmICh2YWxpZGF0ZWRBdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh2YWxpZGF0ZWRBdXRoRGF0YSkubGVuZ3RoKSB7XG4gICAgICBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG5cbiAgICBpZiAoYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgdXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICB9XG4gICAgYXdhaXQgcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKHJlcSwgdXNlci5hdXRoRGF0YSk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgYWxsb3dzIG1hc3Rlci1rZXkgY2xpZW50cyB0byBjcmVhdGUgdXNlciBzZXNzaW9ucyB3aXRob3V0IGFjY2VzcyB0b1xuICAgKiB1c2VyIGNyZWRlbnRpYWxzLiBUaGlzIGVuYWJsZXMgc3lzdGVtcyB0aGF0IGNhbiBhdXRoZW50aWNhdGUgYWNjZXNzIGFub3RoZXJcbiAgICogd2F5IChBUEkga2V5LCBhcHAgYWRtaW5pc3RyYXRvcnMpIHRvIGFjdCBvbiBhIHVzZXIncyBiZWhhbGYuXG4gICAqXG4gICAqIFdlIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHJhdGhlciB0aGFuIGxvb2tpbmcgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IHdlXG4gICAqIHdhbnQgdGhpcyB0byB3b3JrIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHVzZXIgaXMgbG9nZ2VkIG91dCBvbiBhbGxcbiAgICogZGV2aWNlcywgc2luY2UgdGhpcyBjYW4gYmUgdXNlZCBieSBhdXRvbWF0ZWQgc3lzdGVtcyBhY3Rpbmcgb24gdGhlIHVzZXInc1xuICAgKiBiZWhhbGYuXG4gICAqXG4gICAqIEZvciB0aGUgbW9tZW50LCB3ZSdyZSBvbWl0dGluZyBldmVudCBob29rcyBhbmQgbG9ja291dCBjaGVja3MsIHNpbmNlXG4gICAqIGltbWVkaWF0ZSB1c2UgY2FzZXMgc3VnZ2VzdCAvbG9naW5BcyBjb3VsZCBiZSB1c2VkIGZvciBzZW1hbnRpY2FsbHlcbiAgICogZGlmZmVyZW50IHJlYXNvbnMgZnJvbSAvbG9naW5cbiAgICovXG4gIGFzeW5jIGhhbmRsZUxvZ0luQXMocmVxKSB7XG4gICAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlcklkID0gcmVxLmJvZHkudXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIGNvbnN0IHJlY29yZHMgPSBhd2FpdCByZXN0LmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApO1xuICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHJlc3QuZGVsKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApO1xuICAgICAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCByZWNvcmRzLnJlc3VsdHNbMF0pKSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIHJlcS5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3k/LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgPz8gdHJ1ZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBlcnIubWVzc2FnZSA9IGBBIHVzZXIgd2l0aCB0aGF0IGVtYWlsIGRvZXMgbm90IGV4aXN0LmA7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSwge30sIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZykpO1xuICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIGNvbnN0IHNlbmQgPSBhd2FpdCB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEuYXV0aC5pc01hc3RlciwgcmVxLmF1dGguaW5zdGFsbGF0aW9uSWQsIHJlcS5pcCk7XG4gICAgaWYgKHNlbmQpIHtcbiAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpO1xuICAgIH1cbiAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNoYWxsZW5nZShyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGF1dGhEYXRhLCBjaGFsbGVuZ2VEYXRhIH0gPSByZXEuYm9keTtcblxuICAgIC8vIGlmIHVzZXJuYW1lIG9yIGVtYWlsIHByb3ZpZGVkIHdpdGggcGFzc3dvcmQgdHJ5IHRvIGF1dGhlbnRpY2F0ZSB0aGUgdXNlciBieSB1c2VybmFtZVxuICAgIGxldCB1c2VyO1xuICAgIGlmICh1c2VybmFtZSB8fCBlbWFpbCkge1xuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdDtcbiAgICBsZXQgcGFyc2VVc2VyO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnYXV0aERhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpbmQgdGhlIHByb3ZpZGVyIHVzZWQgdG8gZmluZCB0aGUgdXNlclxuICAgICAgICBjb25zdCBwcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maW5kKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKTtcblxuICAgICAgICBwYXJzZVVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5yZXN1bHRzWzBdIH0pO1xuICAgICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgICAgICAvLyBWYWxpZGF0ZSBhdXRoRGF0YSB1c2VkIHRvIGlkZW50aWZ5IHRoZSB1c2VyIHRvIGF2b2lkIGJydXRlLWZvcmNlIGF0dGFjayBvbiBgaWRgXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvclJlc3BvbnNlID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCBwYXJzZVVzZXIsIHJlcXVlc3QpO1xuICAgICAgICBpZiAodmFsaWRhdG9yUmVzcG9uc2UgJiYgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gUmV3cml0ZSB0aGUgZXJyb3IgdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGxvZ2dlci5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlVXNlcikge1xuICAgICAgcGFyc2VVc2VyID0gdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgYWNjID0ge307XG4gICAgLy8gRXhlY3V0ZSBjaGFsbGVuZ2Ugc3RlcC1ieS1zdGVwIHdpdGggY29uc2lzdGVudCBvcmRlciBmb3IgYmV0dGVyIGVycm9yIGZlZWRiYWNrXG4gICAgLy8gYW5kIHRvIGF2b2lkIHRvIHRyaWdnZXIgb3RoZXJzIGNoYWxsZW5nZXMgaWYgb25lIG9mIHRoZW0gZmFpbHNcbiAgICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgYWRhcHRlcjogeyBjaGFsbGVuZ2UgfSxcbiAgICAgICAgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgPSBhd2FpdCBjaGFsbGVuZ2UoXG4gICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXF1ZXN0XG4gICAgICAgICAgKTtcbiAgICAgICAgICBhY2NbcHJvdmlkZXJdID0gcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSB8fCB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdDaGFsbGVuZ2UgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB1c2VyU3RyaW5nID0gcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG4gICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwIGNoYWxsZW5nZSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogJ2NoYWxsZW5nZScsXG4gICAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IGNoYWxsZW5nZURhdGE6IGFjYyB9IH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luQXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW5BcyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxlQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxLQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxTQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxTQUFBLEdBQUFQLE9BQUE7QUFNQSxJQUFBUSxZQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxVQUFBLEdBQUFWLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBVSxPQUFBLEdBQUFWLE9BQUE7QUFBbUMsU0FBQUQsdUJBQUFZLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxDQUFBLEVBQUFDLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQUosQ0FBQSxPQUFBRyxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgs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QUssQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFekosR0FBRyxJQUFJO01BQ2xDLE9BQU8sSUFBSSxDQUFDMkQsV0FBVyxDQUFDM0QsR0FBRyxDQUFDO0lBQzlCLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFekosR0FBRyxJQUFJO01BQ3BDLE9BQU8sSUFBSSxDQUFDNkYsYUFBYSxDQUFDN0YsR0FBRyxDQUFDO0lBQ2hDLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFekosR0FBRyxJQUFJO01BQ25DLE9BQU8sSUFBSSxDQUFDa0csWUFBWSxDQUFDbEcsR0FBRyxDQUFDO0lBQy9CLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsdUJBQXVCLEVBQUV6SixHQUFHLElBQUk7TUFDakQsT0FBTyxJQUFJLENBQUNvSCxrQkFBa0IsQ0FBQ3BILEdBQUcsQ0FBQztJQUNyQyxDQUFDLENBQUM7SUFDRixJQUFJLENBQUN5SixLQUFLLENBQUMsTUFBTSxFQUFFLDJCQUEyQixFQUFFekosR0FBRyxJQUFJO01BQ3JELE9BQU8sSUFBSSxDQUFDNkgsOEJBQThCLENBQUM3SCxHQUFHLENBQUM7SUFDakQsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDeUosS0FBSyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsRUFBRXpKLEdBQUcsSUFBSTtNQUMxQyxPQUFPLElBQUksQ0FBQ2lHLG9CQUFvQixDQUFDakcsR0FBRyxDQUFDO0lBQ3ZDLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQ3lKLEtBQUssQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLEVBQUV6SixHQUFHLElBQUk7TUFDM0MsT0FBTyxJQUFJLENBQUNpRyxvQkFBb0IsQ0FBQ2pHLEdBQUcsQ0FBQztJQUN2QyxDQUFDLENBQUM7SUFDRixJQUFJLENBQUN5SixLQUFLLENBQUMsTUFBTSxFQUFFLFlBQVksRUFBRXpKLEdBQUcsSUFBSTtNQUN0QyxPQUFPLElBQUksQ0FBQ2tJLGVBQWUsQ0FBQ2xJLEdBQUcsQ0FBQztJQUNsQyxDQUFDLENBQUM7RUFDSjtBQUNGO0FBQUNnSyxPQUFBLENBQUE3SyxXQUFBLEdBQUFBLFdBQUE7QUFBQSxJQUFBOEssUUFBQSxHQUFBRCxPQUFBLENBQUFoTixPQUFBLEdBRWNtQyxXQUFXIiwiaWdub3JlTGlzdCI6W119