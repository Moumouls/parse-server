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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
    delete user.password; // Sometimes the authData still has null on that keys
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
        password
      } = payload; // TODO: use the right error codes / descriptions.

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

      return req.config.database.find('_User', query).then(results => {
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
      }).then(() => {
        if (!isValidPassword) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        } // Ensure the user isn't locked out
        // A locked out user won't be able to login
        // To lock a user out, just set the ACL to `masterKey` only  ({}).
        // Empty ACL is OK


        if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
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
        const user = response.results[0].user; // Send token back on the login, because SDKs expect that.

        user.sessionToken = sessionToken; // Remove hidden properties.

        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }

  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);
    const authData = req.body && req.body.authData; // Check if user has provided their required auth providers

    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);

    let authDataResponse;
    let validatedAuthData;

    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, new _RestWrite.default(req.config, req.auth, '_User', {
        objectId: user.objectId
      }, req.body, user, req.info.clientSDK, req.info.context), user);
      authDataResponse = res.authDataResponse;
      validatedAuthData = res.authData;
    } // handle password expiry policy


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
        } // Calculate the expiry time.


        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date()) // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    } // Remove hidden properties.


    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user); // Before login trigger; throws if failure

    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config); // If we have some new validated authData update directly

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

    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);

    if (authDataResponse) {
      user.authDataResponse = authDataResponse;
    }

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

  handleLogOut(req) {
    const success = {
      response: {}
    };

    if (req.info && req.info.sessionToken) {
      return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context).then(records => {
        if (records.results && records.results.length) {
          return _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context).then(() => {
            this._runAfterLogoutTrigger(req, records.results[0]);

            return Promise.resolve(success);
          });
        }

        return Promise.resolve(success);
      });
    }

    return Promise.resolve(success);
  }

  _runAfterLogoutTrigger(req, session) {
    // After logout trigger
    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
      className: '_Session'
    }, session)), null, req.config);
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

  handleResetRequest(req) {
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
    return userController.sendPasswordResetEmail(email).then(() => {
      return Promise.resolve({
        response: {}
      });
    }, err => {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        // Return success so that this endpoint can't
        // be used to enumerate valid emails
        return Promise.resolve({
          response: {}
        });
      } else {
        throw err;
      }
    });
  }

  handleVerificationEmailRequest(req) {
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

    return req.config.database.find('_User', {
      email: email
    }).then(results => {
      if (!results.length || results.length < 1) {
        throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }

      const user = results[0]; // remove password field, messes with saving on postgres

      delete user.password;

      if (user.emailVerified) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return {
          response: {}
        };
      });
    });
  }

  async handleChallenge(req) {
    const {
      username,
      email,
      password,
      authData,
      challengeData
    } = req.body; // if username or email provided with password try to authenticate the user by username

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
    let parseUser; // Try to find user by authData

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
        } // Find the provider used to find the user


        const provider = Object.keys(authData).find(key => authData[key].id);
        parseUser = _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0]));
        request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
        request.isChallenge = true; // Validate authData used to identify the user to avoid brute-force attack on `id`

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

    const acc = {}; // Execute challenge step-by-step with consistent order for better error feedback
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
    this.route('POST', '/challenge', req => {
      return this.handleChallenge(req);
    });
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsImtleXMiLCJmb3JFYWNoIiwicHJvdmlkZXIiLCJsZW5ndGgiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpc1ZhbGlkUGFzc3dvcmQiLCIkb3IiLCJjb25maWciLCJkYXRhYmFzZSIsImZpbmQiLCJ0aGVuIiwicmVzdWx0cyIsImxvZ2dlckNvbnRyb2xsZXIiLCJ3YXJuIiwiZmlsdGVyIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiY29ycmVjdCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJhdXRoIiwiaXNNYXN0ZXIiLCJBQ0wiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJFTUFJTF9OT1RfRk9VTkQiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIkF1dGgiLCJtYXN0ZXIiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsInJlcXVlc3QiLCJwYXJzZVVzZXIiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImlzQ2hhbGxlbmdlIiwidmFsaWRhdG9yIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJ2YWxpZGF0b3JSZXNwb25zZSIsImxvZ2dlciIsImFjYyIsInNvcnQiLCJhdXRoQWRhcHRlciIsImNoYWxsZW5nZSIsInByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFNQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztBQUM3Q0MsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsV0FBTyxPQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7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LElBQUk7QUFDMUMsYUFBTyxLQUFLeUYsb0JBQUwsQ0FBMEJ6RixHQUExQixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUtpSixLQUFMLENBQVcsTUFBWCxFQUFtQixZQUFuQixFQUFpQ2pKLEdBQUcsSUFBSTtBQUN0QyxhQUFPLEtBQUt5SCxlQUFMLENBQXFCekgsR0FBckIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUFub0I0Qzs7O2VBc29CaENwQixXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQge1xuICBtYXliZVJ1blRyaWdnZXIsXG4gIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyxcbiAgZ2V0UmVxdWVzdE9iamVjdCxcbiAgcmVzb2x2ZUVycm9yLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnkpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgdGhlaXIgcmVxdWlyZWQgYXV0aCBwcm92aWRlcnNcbiAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oYXV0aERhdGEsIHVzZXIuYXV0aERhdGEsIHJlcS5jb25maWcpO1xuXG4gICAgbGV0IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgbGV0IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICAgIGF1dGhEYXRhLFxuICAgICAgICBuZXcgUmVzdFdyaXRlKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgICAgcmVxLmJvZHksXG4gICAgICAgICAgdXNlcixcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApLFxuICAgICAgICB1c2VyXG4gICAgICApO1xuICAgICAgYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgdmFsaWRhdGVkQXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgfVxuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzb21lIG5ldyB2YWxpZGF0ZWQgYXV0aERhdGEgdXBkYXRlIGRpcmVjdGx5XG4gICAgaWYgKHZhbGlkYXRlZEF1dGhEYXRhICYmIE9iamVjdC5rZXlzKHZhbGlkYXRlZEF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgIHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5LnVzZXJJZCB8fCByZXEucXVlcnkudXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsXG4gICAgICAgICd1c2VySWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwsIG9yIHVuZGVmaW5lZCdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnlSZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHVzZXJJZCB9KTtcbiAgICBjb25zdCB1c2VyID0gcXVlcnlSZXN1bHRzWzBdO1xuICAgIGlmICghdXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICd1c2VyIG5vdCBmb3VuZCcpO1xuICAgIH1cblxuICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ21hc3RlcmtleScsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gcmVzdFxuICAgICAgICAuZmluZChcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlY29yZHMgPT4ge1xuICAgICAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgICAgICAgLmRlbChcbiAgICAgICAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkLFxuICAgICAgICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgcmVjb3Jkcy5yZXN1bHRzWzBdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gIH1cblxuICBfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgc2Vzc2lvbikge1xuICAgIC8vIEFmdGVyIGxvZ291dCB0cmlnZ2VyXG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5TZXNzaW9uLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfU2Vzc2lvbicgfSwgc2Vzc2lvbikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuICB9XG5cbiAgX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpIHtcbiAgICB0cnkge1xuICAgICAgQ29uZmlnLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyOiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWU6IHJlcS5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiByZXEuY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAvLyBSZXR1cm4gc3VjY2VzcyBzbyB0aGF0IHRoaXMgZW5kcG9pbnQgY2FuJ3RcbiAgICAgICAgICAvLyBiZSB1c2VkIHRvIGVudW1lcmF0ZSB2YWxpZCBlbWFpbHNcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVDaGFsbGVuZ2UocmVxKSB7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkLCBhdXRoRGF0YSwgY2hhbGxlbmdlRGF0YSB9ID0gcmVxLmJvZHk7XG5cbiAgICAvLyBpZiB1c2VybmFtZSBvciBlbWFpbCBwcm92aWRlZCB3aXRoIHBhc3N3b3JkIHRyeSB0byBhdXRoZW50aWNhdGUgdGhlIHVzZXIgYnkgdXNlcm5hbWVcbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgcHJvdmlkZWQgdXNlcm5hbWUgb3IgZW1haWwsIHlvdSBuZWVkIHRvIGFsc28gcHJvdmlkZSBwYXNzd29yZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgfVxuXG4gICAgaWYgKCFjaGFsbGVuZ2VEYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdOb3RoaW5nIHRvIGNoYWxsZW5nZS4nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdjaGFsbGVuZ2VEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgfVxuXG4gICAgbGV0IHJlcXVlc3Q7XG4gICAgbGV0IHBhcnNlVXNlcjtcblxuICAgIC8vIFRyeSB0byBmaW5kIHVzZXIgYnkgYXV0aERhdGFcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGlmICh0eXBlb2YgYXV0aERhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICB9XG4gICAgICBpZiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcHJvdmlkZSB1c2VybmFtZS9lbWFpbCBhbmQgYXV0aERhdGEsIG9ubHkgdXNlIG9uZSBpZGVudGlmaWNhdGlvbiBtZXRob2QuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbHRlcihrZXkgPT4gYXV0aERhdGFba2V5XS5pZCkubGVuZ3RoID4gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcHJvdmlkZSBtb3JlIHRoYW4gb25lIGF1dGhEYXRhIHByb3ZpZGVyIHdpdGggYW4gaWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEocmVxLmNvbmZpZywgYXV0aERhdGEpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIXJlc3VsdHNbMF0gfHwgcmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGaW5kIHRoZSBwcm92aWRlciB1c2VkIHRvIGZpbmQgdGhlIHVzZXJcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmluZChrZXkgPT4gYXV0aERhdGFba2V5XS5pZCk7XG5cbiAgICAgICAgcGFyc2VVc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4ucmVzdWx0c1swXSB9KTtcbiAgICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICAgICAgLy8gVmFsaWRhdGUgYXV0aERhdGEgdXNlZCB0byBpZGVudGlmeSB0aGUgdXNlciB0byBhdm9pZCBicnV0ZS1mb3JjZSBhdHRhY2sgb24gYGlkYFxuICAgICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBjb25zdCB2YWxpZGF0b3JSZXNwb25zZSA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgcGFyc2VVc2VyLCByZXF1ZXN0KTtcbiAgICAgICAgaWYgKHZhbGlkYXRvclJlc3BvbnNlICYmIHZhbGlkYXRvclJlc3BvbnNlLnZhbGlkYXRvcikge1xuICAgICAgICAgIGF3YWl0IHZhbGlkYXRvclJlc3BvbnNlLnZhbGlkYXRvcigpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIFJld3JpdGUgdGhlIGVycm9yIHRvIGF2b2lkIGd1ZXNzIGlkIGF0dGFja1xuICAgICAgICBsb2dnZXIuZXJyb3IoZSk7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFwYXJzZVVzZXIpIHtcbiAgICAgIHBhcnNlVXNlciA9IHVzZXIgPyBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi51c2VyIH0pIDogdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGlmICghcmVxdWVzdCkge1xuICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgfVxuICAgIGNvbnN0IGFjYyA9IHt9O1xuICAgIC8vIEV4ZWN1dGUgY2hhbGxlbmdlIHN0ZXAtYnktc3RlcCB3aXRoIGNvbnNpc3RlbnQgb3JkZXIgZm9yIGJldHRlciBlcnJvciBmZWVkYmFja1xuICAgIC8vIGFuZCB0byBhdm9pZCB0byB0cmlnZ2VyIG90aGVycyBjaGFsbGVuZ2VzIGlmIG9uZSBvZiB0aGVtIGZhaWxzXG4gICAgZm9yIChjb25zdCBwcm92aWRlciBvZiBPYmplY3Qua2V5cyhjaGFsbGVuZ2VEYXRhKS5zb3J0KCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGF1dGhBZGFwdGVyID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBpZiAoIWF1dGhBZGFwdGVyKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIGFkYXB0ZXI6IHsgY2hhbGxlbmdlIH0sXG4gICAgICAgIH0gPSBhdXRoQWRhcHRlcjtcbiAgICAgICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBjb25zdCBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlID0gYXdhaXQgY2hhbGxlbmdlKFxuICAgICAgICAgICAgY2hhbGxlbmdlRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICBhdXRoRGF0YSAmJiBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXEuY29uZmlnLmF1dGhbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxdWVzdFxuICAgICAgICAgICk7XG4gICAgICAgICAgYWNjW3Byb3ZpZGVyXSA9IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgfHwgdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnQ2hhbGxlbmdlIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgdXNlclN0cmluZyA9IHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xuICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCBjaGFsbGVuZ2UgZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiAnY2hhbGxlbmdlJyxcbiAgICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgY2hhbGxlbmdlRGF0YTogYWNjIH0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19