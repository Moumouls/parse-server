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

var _WinstonLogger = require("../../lib/Adapters/Logger/WinstonLogger");

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
    const authData = req.body && req.body.authData; // Check if user has provided his required auth providers

    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);

    let authDataResponse;
    let validatedAuthData;

    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, req, user);
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
    }, user)), null, req.config); // If we have some new validated authData
    // update directly

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
    } = req.body; // if username or email provided with password try to find the user with default
    // system

    let user;

    if (username || email) {
      if (!password) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      user = await this._authenticateUserFromRequest(req);
    }

    if (!challengeData) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    if (typeof challengeData !== 'object') throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.'); // Try to find user by authData

    if (authData) {
      if (typeof authData !== 'object') throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authData should be an object.'); // To avoid security issue we should only support one identifying method

      if (user) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide username/email and authData, only use one identification method.');

      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide more than one authData provider with an id.');
      }

      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);

      try {
        if (!results[0] || results.length > 1) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.'); // Find the provider used to find the user

        const provider = Object.keys(authData).find(key => authData[key].id); // Validate authData used to identify the user
        // to avoid guess id attack

        const {
          validator
        } = req.config.authDataManager.getValidatorForProvider(provider);
        await validator(authData[provider], {
          config: req.config,
          auth: req.auth,
          isChallenge: true
        }, _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0])));
        user = results[0];
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        _WinstonLogger.logger.error(e);

        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.');
      }
    } // Execute challenge step by step
    // with consistent order


    const challenge = await _Auth.default.reducePromise(Object.keys(challengeData).sort(), async (acc, provider) => {
      const challengeHandler = req.config.authDataManager.getValidatorForProvider(provider).adapter.challenge;

      if (typeof challengeHandler === 'function') {
        acc[provider] = (await challengeHandler(challengeData[provider], authData && authData[provider], req.config.auth[provider], req, user ? _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, user)) : undefined)) || true;
        return acc;
      }
    }, {});
    return {
      response: Object.keys(challenge).length ? {
        challengeData: challenge
      } : undefined
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsImtleXMiLCJmb3JFYWNoIiwicHJvdmlkZXIiLCJsZW5ndGgiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpc1ZhbGlkUGFzc3dvcmQiLCIkb3IiLCJjb25maWciLCJkYXRhYmFzZSIsImZpbmQiLCJ0aGVuIiwicmVzdWx0cyIsImxvZ2dlckNvbnRyb2xsZXIiLCJ3YXJuIiwiZmlsdGVyIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiY29ycmVjdCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJhdXRoIiwiaXNNYXN0ZXIiLCJBQ0wiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJFTUFJTF9OT1RfRk9VTkQiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIkF1dGgiLCJtYXN0ZXIiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwib2JqZWN0SWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJSZXN0V3JpdGUiLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsImlkIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwidmFsaWRhdG9yIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJpc0NoYWxsZW5nZSIsImxvZ2dlciIsImNoYWxsZW5nZSIsInJlZHVjZVByb21pc2UiLCJzb3J0IiwiYWNjIiwiY2hhbGxlbmdlSGFuZGxlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7QUFDN0NDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sT0FBUDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7OztBQUMrQixTQUF0QkMsc0JBQXNCLENBQUNDLEdBQUQsRUFBTTtBQUNqQyxTQUFLLElBQUlDLEdBQVQsSUFBZ0JELEdBQWhCLEVBQXFCO0FBQ25CLFVBQUlFLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkMsY0FBakIsQ0FB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cUYsYUFBTCxDQUFtQnJGLEdBQW5CLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBS3dJLEtBQUwsQ0FBVyxNQUFYLEVBQW1CLFNBQW5CLEVBQThCeEksR0FBRyxJQUFJO0FBQ25DLGFBQU8sS0FBSzBGLFlBQUwsQ0FBa0IxRixHQUFsQixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUt3SSxLQUFMLENBQVcsTUFBWCxFQUFtQix1QkFBbkIsRUFBNEN4SSxHQUFHLElBQUk7QUFDakQsYUFBTyxLQUFLK0csa0JBQUwsQ0FBd0IvRyxHQUF4QixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUt3SSxLQUFMLENBQVcsTUFBWCxFQUFtQiwyQkFBbkIsRUFBZ0R4SSxHQUFHLElBQUk7QUFDckQsYUFBTyxLQUFLcUgsOEJBQUwsQ0FBb0NySCxHQUFwQyxDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUt3SSxLQUFMLENBQVcsS0FBWCxFQUFrQixpQkFBbEIsRUFBcUN4SSxHQUFHLElBQUk7QUFDMUMsYUFBTyxLQUFLeUYsb0JBQUwsQ0FBMEJ6RixHQUExQixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUt3SSxLQUFMLENBQVcsTUFBWCxFQUFtQixZQUFuQixFQUFpQ3hJLEdBQUcsSUFBSTtBQUN0QyxhQUFPLEtBQUt5SCxlQUFMLENBQXFCekgsR0FBckIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUF0bEI0Qzs7O2VBeWxCaENwQixXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQgeyBtYXliZVJ1blRyaWdnZXIsIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi4vUmVzdFdyaXRlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uLy4uL2xpYi9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlcic7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZnRlciByZXRyaWV2aW5nIGEgdXNlciBkaXJlY3RseSBmcm9tIHRoZSBkYXRhYmFzZSwgd2UgbmVlZCB0byByZW1vdmUgdGhlXG4gICAqIHBhc3N3b3JkIGZyb20gdGhlIG9iamVjdCAoZm9yIHNlY3VyaXR5KSwgYW5kIGZpeCBhbiBpc3N1ZSBzb21lIFNES3MgaGF2ZVxuICAgKiB3aXRoIG51bGwgdmFsdWVzXG4gICAqL1xuICBfc2FuaXRpemVBdXRoRGF0YSh1c2VyKSB7XG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgY29uc3QgYXV0aERhdGEgPSByZXEuYm9keSAmJiByZXEuYm9keS5hdXRoRGF0YTtcbiAgICAvLyBDaGVjayBpZiB1c2VyIGhhcyBwcm92aWRlZCBoaXMgcmVxdWlyZWQgYXV0aCBwcm92aWRlcnNcbiAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oYXV0aERhdGEsIHVzZXIuYXV0aERhdGEsIHJlcS5jb25maWcpO1xuXG4gICAgbGV0IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgbGV0IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEsIHJlcSwgdXNlcik7XG4gICAgICBhdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB2YWxpZGF0ZWRBdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YVxuICAgIC8vIHVwZGF0ZSBkaXJlY3RseVxuICAgIGlmICh2YWxpZGF0ZWRBdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh2YWxpZGF0ZWRBdXRoRGF0YSkubGVuZ3RoKSB7XG4gICAgICBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICB1c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBhbGxvd3MgbWFzdGVyLWtleSBjbGllbnRzIHRvIGNyZWF0ZSB1c2VyIHNlc3Npb25zIHdpdGhvdXQgYWNjZXNzIHRvXG4gICAqIHVzZXIgY3JlZGVudGlhbHMuIFRoaXMgZW5hYmxlcyBzeXN0ZW1zIHRoYXQgY2FuIGF1dGhlbnRpY2F0ZSBhY2Nlc3MgYW5vdGhlclxuICAgKiB3YXkgKEFQSSBrZXksIGFwcCBhZG1pbmlzdHJhdG9ycykgdG8gYWN0IG9uIGEgdXNlcidzIGJlaGFsZi5cbiAgICpcbiAgICogV2UgY3JlYXRlIGEgbmV3IHNlc3Npb24gcmF0aGVyIHRoYW4gbG9va2luZyBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbjsgd2VcbiAgICogd2FudCB0aGlzIHRvIHdvcmsgaW4gc2l0dWF0aW9ucyB3aGVyZSB0aGUgdXNlciBpcyBsb2dnZWQgb3V0IG9uIGFsbFxuICAgKiBkZXZpY2VzLCBzaW5jZSB0aGlzIGNhbiBiZSB1c2VkIGJ5IGF1dG9tYXRlZCBzeXN0ZW1zIGFjdGluZyBvbiB0aGUgdXNlcidzXG4gICAqIGJlaGFsZi5cbiAgICpcbiAgICogRm9yIHRoZSBtb21lbnQsIHdlJ3JlIG9taXR0aW5nIGV2ZW50IGhvb2tzIGFuZCBsb2Nrb3V0IGNoZWNrcywgc2luY2VcbiAgICogaW1tZWRpYXRlIHVzZSBjYXNlcyBzdWdnZXN0IC9sb2dpbkFzIGNvdWxkIGJlIHVzZWQgZm9yIHNlbWFudGljYWxseVxuICAgKiBkaWZmZXJlbnQgcmVhc29ucyBmcm9tIC9sb2dpblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlTG9nSW5BcyhyZXEpIHtcbiAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgJ21hc3RlciBrZXkgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSByZXEuYm9keS51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gZmluZCB0aGUgdXNlciB3aXRoIGRlZmF1bHRcbiAgICAvLyBzeXN0ZW1cbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICAvLyBUbyBhdm9pZCBzZWN1cml0eSBpc3N1ZSB3ZSBzaG91bGQgb25seSBzdXBwb3J0IG9uZSBpZGVudGlmeWluZyBtZXRob2RcbiAgICAgIGlmICh1c2VyKVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW50IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maWx0ZXIoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2FudCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnVXNlciBub3QgZm91bmQuJyk7XG5cbiAgICAgICAgLy8gRmluZCB0aGUgcHJvdmlkZXIgdXNlZCB0byBmaW5kIHRoZSB1c2VyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbmQoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGF1dGhEYXRhIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHVzZXJcbiAgICAgICAgLy8gdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGF3YWl0IHZhbGlkYXRvcihcbiAgICAgICAgICBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgeyBjb25maWc6IHJlcS5jb25maWcsIGF1dGg6IHJlcS5hdXRoLCBpc0NoYWxsZW5nZTogdHJ1ZSB9LFxuICAgICAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnJlc3VsdHNbMF0gfSlcbiAgICAgICAgKTtcbiAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIFJld3JpdGUgdGhlIGVycm9yIHRvIGF2b2lkIGd1ZXNzIGlkIGF0dGFja1xuICAgICAgICBsb2dnZXIuZXJyb3IoZSk7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV4ZWN1dGUgY2hhbGxlbmdlIHN0ZXAgYnkgc3RlcFxuICAgIC8vIHdpdGggY29uc2lzdGVudCBvcmRlclxuICAgIGNvbnN0IGNoYWxsZW5nZSA9IGF3YWl0IEF1dGgucmVkdWNlUHJvbWlzZShcbiAgICAgIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSxcbiAgICAgIGFzeW5jIChhY2MsIHByb3ZpZGVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGNoYWxsZW5nZUhhbmRsZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcilcbiAgICAgICAgICAuYWRhcHRlci5jaGFsbGVuZ2U7XG4gICAgICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlSGFuZGxlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGFjY1twcm92aWRlcl0gPVxuICAgICAgICAgICAgKGF3YWl0IGNoYWxsZW5nZUhhbmRsZXIoXG4gICAgICAgICAgICAgIGNoYWxsZW5nZURhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgICBhdXRoRGF0YSAmJiBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl0sXG4gICAgICAgICAgICAgIHJlcSxcbiAgICAgICAgICAgICAgdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWRcbiAgICAgICAgICAgICkpIHx8IHRydWU7XG4gICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHt9XG4gICAgKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiBPYmplY3Qua2V5cyhjaGFsbGVuZ2UpLmxlbmd0aCA/IHsgY2hhbGxlbmdlRGF0YTogY2hhbGxlbmdlIH0gOiB1bmRlZmluZWQgfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19