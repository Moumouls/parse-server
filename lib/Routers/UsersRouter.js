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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// These methods handle the User-related routes.

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
      let payload = req.body || {};
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
      }, req.body || {}, user, req.info.clientSDK, req.info.context), user);
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
          {
            throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
          }
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    await req.config.filesController.expandFilesInObject(req.config, user);

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
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, {
      ...req.auth,
      user: afterLoginUser
    }, afterLoginUser, null, req.config, req.info.context);
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
    const userId = req.body?.userId || req.query.userId;
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
    let email = req.body?.email;
    const token = req.body?.token;
    if (!email && !token) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (token) {
      const results = await req.config.database.find('_User', {
        _perishable_token: token,
        _perishable_token_expires_at: {
          $lt: _node.default._encode(new Date())
        }
      });
      if (results && results[0] && results[0].email) {
        email = results[0].email;
      }
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
        if (req.config.passwordPolicy?.resetPasswordSuccessOnInvalidEmail ?? true) {
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
    } = req.body || {};
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
    } = req.body || {};

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
        parseUser = _node.default.User.fromJSON({
          className: '_User',
          ...results[0]
        });
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
      parseUser = user ? _node.default.User.fromJSON({
        className: '_User',
        ...user
      }) : undefined;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiVXNlcnNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsIm9iaiIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInRlc3QiLCJfc2FuaXRpemVBdXRoRGF0YSIsInVzZXIiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwia2V5cyIsImZvckVhY2giLCJwcm92aWRlciIsImxlbmd0aCIsIl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QiLCJyZXEiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsInBheWxvYWQiLCJib2R5IiwidXNlcm5hbWUiLCJxdWVyeSIsImVtYWlsIiwiaWdub3JlRW1haWxWZXJpZmljYXRpb24iLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwiQXV0aCIsIm1haW50ZW5hbmNlIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwicmVxdWVzdCIsIm1hc3RlciIsImlwIiwiaW5zdGFsbGF0aW9uSWQiLCJvYmplY3QiLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJpc01haW50ZW5hbmNlIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwibWF5YmVSdW5UcmlnZ2VyIiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImF1dGhEYXRhTWFuYWdlciIsInJ1bkFmdGVyRmluZCIsImhhbmRsZUxvZ0luQXMiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiSU5WQUxJRF9WQUxVRSIsInF1ZXJ5UmVzdWx0cyIsImhhbmRsZVZlcmlmeVBhc3N3b3JkIiwiaGFuZGxlTG9nT3V0Iiwic3VjY2VzcyIsInJlY29yZHMiLCJ1bmRlZmluZWQiLCJkZWwiLCJhZnRlckxvZ291dCIsIlNlc3Npb24iLCJfdGhyb3dPbkJhZEVtYWlsQ29uZmlnIiwiQ29uZmlnIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJlbWFpbEFkYXB0ZXIiLCJ1c2VyQ29udHJvbGxlciIsImFkYXB0ZXIiLCJhcHBOYW1lIiwicHVibGljU2VydmVyVVJMIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwidG9rZW4iLCJFTUFJTF9NSVNTSU5HIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiJGx0IiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwibWVzc2FnZSIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsIk9USEVSX0NBVVNFIiwic2VuZCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsInBhcnNlVXNlciIsImlkIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiZ2V0UmVxdWVzdE9iamVjdCIsImlzQ2hhbGxlbmdlIiwidmFsaWRhdG9yIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJ2YWxpZGF0b3JSZXNwb25zZSIsImxvZ2dlciIsImFjYyIsInNvcnQiLCJhdXRoQWRhcHRlciIsImNoYWxsZW5nZSIsInByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UiLCJyZXNvbHZlRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwidXNlclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiaGFuZGxlRmluZCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZUdldCIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSIsImV4cG9ydHMiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHtcbiAgbWF5YmVSdW5UcmlnZ2VyLFxuICBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMsXG4gIGdldFJlcXVlc3RPYmplY3QsXG4gIHJlc29sdmVFcnJvcixcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuLi9SZXN0V3JpdGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFmdGVyIHJldHJpZXZpbmcgYSB1c2VyIGRpcmVjdGx5IGZyb20gdGhlIGRhdGFiYXNlLCB3ZSBuZWVkIHRvIHJlbW92ZSB0aGVcbiAgICogcGFzc3dvcmQgZnJvbSB0aGUgb2JqZWN0IChmb3Igc2VjdXJpdHkpLCBhbmQgZml4IGFuIGlzc3VlIHNvbWUgU0RLcyBoYXZlXG4gICAqIHdpdGggbnVsbCB2YWx1ZXNcbiAgICovXG4gIF9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpIHtcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHkgfHwge307XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkLCBpZ25vcmVFbWFpbFZlcmlmaWNhdGlvbiB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSwge30sIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZykpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ3JlYXRlIHJlcXVlc3Qgb2JqZWN0IGZvciB2ZXJpZmljYXRpb24gZnVuY3Rpb25zXG4gICAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICAgICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIG9iamVjdDogUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gSWYgcmVxdWVzdCBkb2Vzbid0IHVzZSBtYXN0ZXIgb3IgbWFpbnRlbmFuY2Uga2V5IHdpdGggaWdub3JpbmcgZW1haWwgdmVyaWZpY2F0aW9uXG4gICAgICAgICAgaWYgKCEoKHJlcS5hdXRoLmlzTWFzdGVyIHx8IHJlcS5hdXRoLmlzTWFpbnRlbmFuY2UpICYmIGlnbm9yZUVtYWlsVmVyaWZpY2F0aW9uKSkge1xuXG4gICAgICAgICAgICAvLyBHZXQgdmVyaWZpY2F0aW9uIGNvbmRpdGlvbnMgd2hpY2ggY2FuIGJlIGJvb2xlYW5zIG9yIGZ1bmN0aW9uczsgdGhlIHB1cnBvc2Ugb2YgdGhpcyBhc3luYy9hd2FpdFxuICAgICAgICAgICAgLy8gc3RydWN0dXJlIGlzIHRvIGF2b2lkIHVubmVjZXNzYXJpbHkgZXhlY3V0aW5nIHN1YnNlcXVlbnQgZnVuY3Rpb25zIGlmIHByZXZpb3VzIG9uZXMgZmFpbCBpbiB0aGVcbiAgICAgICAgICAgIC8vIGNvbmRpdGlvbmFsIHN0YXRlbWVudCBiZWxvdywgYXMgYSBkZXZlbG9wZXIgbWF5IGRlY2lkZSB0byBleGVjdXRlIGV4cGVuc2l2ZSBvcGVyYXRpb25zIGluIHRoZW1cbiAgICAgICAgICAgIGNvbnN0IHZlcmlmeVVzZXJFbWFpbHMgPSBhc3luYyAoKSA9PiByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09IHRydWUgfHwgKHR5cGVvZiByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyhyZXF1ZXN0KSkgPT09IHRydWUpO1xuICAgICAgICAgICAgY29uc3QgcHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9IGFzeW5jICgpID0+IHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gdHJ1ZSB8fCAodHlwZW9mIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gJ2Z1bmN0aW9uJyAmJiBhd2FpdCBQcm9taXNlLnJlc29sdmUocmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKHJlcXVlc3QpKSA9PT0gdHJ1ZSk7XG4gICAgICAgICAgICBpZiAoYXdhaXQgdmVyaWZ5VXNlckVtYWlscygpICYmIGF3YWl0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwoKSAmJiAhdXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgdGhlaXIgcmVxdWlyZWQgYXV0aCBwcm92aWRlcnNcbiAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICByZXEsXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXIuYXV0aERhdGEsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGxldCBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIGxldCB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgbmV3IFJlc3RXcml0ZShcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICAgIHJlcS5ib2R5IHx8IHt9LFxuICAgICAgICAgIHVzZXIsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKSxcbiAgICAgICAgdXNlclxuICAgICAgKTtcbiAgICAgIGF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIHZhbGlkYXRlZEF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgIH1cblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgIHsgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgKTsgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgYXdhaXQgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YSB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZyxcbiAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuICAgIGF3YWl0IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLnJ1bkFmdGVyRmluZChyZXEsIHVzZXIuYXV0aERhdGEpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5Py51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgY29uc3QgcmVjb3JkcyA9IGF3YWl0IHJlc3QuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgcmVzdC5kZWwoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHJlY29yZHMucmVzdWx0c1swXSkpLFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgcmVxLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3VjY2VzcztcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgbGV0IGVtYWlsID0gcmVxLmJvZHk/LmVtYWlsO1xuICAgIGNvbnN0IHRva2VuID0gcmVxLmJvZHk/LnRva2VuO1xuXG4gICAgaWYgKCFlbWFpbCAmJiAhdG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodG9rZW4pIHtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywge1xuICAgICAgICBfcGVyaXNoYWJsZV90b2tlbjogdG9rZW4sXG4gICAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgJGx0OiBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXN1bHRzICYmIHJlc3VsdHNbMF0gJiYgcmVzdWx0c1swXS5lbWFpbCkge1xuICAgICAgICBlbWFpbCA9IHJlc3VsdHNbMF0uZW1haWw7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeT8ucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCA/PyB0cnVlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGVyci5tZXNzYWdlID0gYEEgdXNlciB3aXRoIHRoYXQgZW1haWwgZG9lcyBub3QgZXhpc3QuYDtcbiAgICAgIH1cbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cblxuICBhc3luYyBoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keSB8fCB7fTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IGVtYWlsOiBlbWFpbCB9LCB7fSwgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKSk7XG4gICAgaWYgKCFyZXN1bHRzLmxlbmd0aCB8fCByZXN1bHRzLmxlbmd0aCA8IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICB9XG4gICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG5cbiAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgaWYgKHVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgY29uc3Qgc2VuZCA9IGF3YWl0IHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIsIHJlcS5hdXRoLmlzTWFzdGVyLCByZXEuYXV0aC5pbnN0YWxsYXRpb25JZCwgcmVxLmlwKTtcbiAgICBpZiAoc2VuZCkge1xuICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSk7XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5IHx8IHt9O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gYXV0aGVudGljYXRlIHRoZSB1c2VyIGJ5IHVzZXJuYW1lXG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKHVzZXJuYW1lIHx8IGVtYWlsKSB7XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2VEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgIH1cblxuICAgIGxldCByZXF1ZXN0O1xuICAgIGxldCBwYXJzZVVzZXI7XG5cbiAgICAvLyBUcnkgdG8gZmluZCB1c2VyIGJ5IGF1dGhEYXRhXG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGF1dGhEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdhdXRoRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgICAgfVxuICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2Fubm90IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maWx0ZXIoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2Fubm90IHByb3ZpZGUgbW9yZSB0aGFuIG9uZSBhdXRoRGF0YSBwcm92aWRlciB3aXRoIGFuIGlkLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHJlcS5jb25maWcsIGF1dGhEYXRhKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFyZXN1bHRzWzBdIHx8IHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmluZCB0aGUgcHJvdmlkZXIgdXNlZCB0byBmaW5kIHRoZSB1c2VyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbmQoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpO1xuXG4gICAgICAgIHBhcnNlVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnJlc3VsdHNbMF0gfSk7XG4gICAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgICAgIC8vIFZhbGlkYXRlIGF1dGhEYXRhIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHVzZXIgdG8gYXZvaWQgYnJ1dGUtZm9yY2UgYXR0YWNrIG9uIGBpZGBcbiAgICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdG9yUmVzcG9uc2UgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHBhcnNlVXNlciwgcmVxdWVzdCk7XG4gICAgICAgIGlmICh2YWxpZGF0b3JSZXNwb25zZSAmJiB2YWxpZGF0b3JSZXNwb25zZS52YWxpZGF0b3IpIHtcbiAgICAgICAgICBhd2FpdCB2YWxpZGF0b3JSZXNwb25zZS52YWxpZGF0b3IoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBSZXdyaXRlIHRoZSBlcnJvciB0byBhdm9pZCBndWVzcyBpZCBhdHRhY2tcbiAgICAgICAgbG9nZ2VyLmVycm9yKGUpO1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghcGFyc2VVc2VyKSB7XG4gICAgICBwYXJzZVVzZXIgPSB1c2VyID8gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4udXNlciB9KSA6IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBhY2MgPSB7fTtcbiAgICAvLyBFeGVjdXRlIGNoYWxsZW5nZSBzdGVwLWJ5LXN0ZXAgd2l0aCBjb25zaXN0ZW50IG9yZGVyIGZvciBiZXR0ZXIgZXJyb3IgZmVlZGJhY2tcbiAgICAvLyBhbmQgdG8gYXZvaWQgdG8gdHJpZ2dlciBvdGhlcnMgY2hhbGxlbmdlcyBpZiBvbmUgb2YgdGhlbSBmYWlsc1xuICAgIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgT2JqZWN0LmtleXMoY2hhbGxlbmdlRGF0YSkuc29ydCgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhdXRoQWRhcHRlciA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgaWYgKCFhdXRoQWRhcHRlcikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBhZGFwdGVyOiB7IGNoYWxsZW5nZSB9LFxuICAgICAgICB9ID0gYXV0aEFkYXB0ZXI7XG4gICAgICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgY29uc3QgcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSA9IGF3YWl0IGNoYWxsZW5nZShcbiAgICAgICAgICAgIGNoYWxsZW5nZURhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgYXV0aERhdGEgJiYgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5hdXRoW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcXVlc3RcbiAgICAgICAgICApO1xuICAgICAgICAgIGFjY1twcm92aWRlcl0gPSBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIHx8IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ0NoYWxsZW5nZSBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPSByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbiAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgY2hhbGxlbmdlIGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiAnY2hhbGxlbmdlJyxcbiAgICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgY2hhbGxlbmdlRGF0YTogYWNjIH0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9jaGFsbGVuZ2UnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ2hhbGxlbmdlKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlcnNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUVBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGVBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLGNBQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLEtBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLFNBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLFNBQUEsR0FBQVAsT0FBQTtBQU1BLElBQUFRLFlBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLFVBQUEsR0FBQVYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFVLE9BQUEsR0FBQVYsT0FBQTtBQUFtQyxTQUFBRCx1QkFBQVksQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQWpCbkM7O0FBbUJPLE1BQU1HLFdBQVcs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