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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiVXNlcnNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwicmVtb3ZlSGlkZGVuUHJvcGVydGllcyIsIm9iaiIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInRlc3QiLCJfc2FuaXRpemVBdXRoRGF0YSIsInVzZXIiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwia2V5cyIsImZvckVhY2giLCJwcm92aWRlciIsImxlbmd0aCIsIl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QiLCJyZXEiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsInBheWxvYWQiLCJib2R5IiwidXNlcm5hbWUiLCJxdWVyeSIsImVtYWlsIiwiaWdub3JlRW1haWxWZXJpZmljYXRpb24iLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwiQXV0aCIsIm1haW50ZW5hbmNlIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwicmVxdWVzdCIsIm1hc3RlciIsImlwIiwiaW5zdGFsbGF0aW9uSWQiLCJvYmplY3QiLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJpc01haW50ZW5hbmNlIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwibWF5YmVSdW5UcmlnZ2VyIiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImF1dGhEYXRhTWFuYWdlciIsInJ1bkFmdGVyRmluZCIsImhhbmRsZUxvZ0luQXMiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiSU5WQUxJRF9WQUxVRSIsInF1ZXJ5UmVzdWx0cyIsImhhbmRsZVZlcmlmeVBhc3N3b3JkIiwiaGFuZGxlTG9nT3V0Iiwic3VjY2VzcyIsInJlY29yZHMiLCJ1bmRlZmluZWQiLCJkZWwiLCJhZnRlckxvZ291dCIsIlNlc3Npb24iLCJfdGhyb3dPbkJhZEVtYWlsQ29uZmlnIiwiQ29uZmlnIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJlbWFpbEFkYXB0ZXIiLCJ1c2VyQ29udHJvbGxlciIsImFkYXB0ZXIiLCJhcHBOYW1lIiwicHVibGljU2VydmVyVVJMIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwicmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsIm1lc3NhZ2UiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInNlbmQiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJwYXJzZVVzZXIiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImdldFJlcXVlc3RPYmplY3QiLCJpc0NoYWxsZW5nZSIsInZhbGlkYXRvciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwidmFsaWRhdG9yUmVzcG9uc2UiLCJsb2dnZXIiLCJhY2MiLCJzb3J0IiwiYXV0aEFkYXB0ZXIiLCJjaGFsbGVuZ2UiLCJwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsInVzZXJTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Vc2Vyc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7XG4gIG1heWJlUnVuVHJpZ2dlcixcbiAgVHlwZXMgYXMgVHJpZ2dlclR5cGVzLFxuICBnZXRSZXF1ZXN0T2JqZWN0LFxuICByZXNvbHZlRXJyb3IsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi4vUmVzdFdyaXRlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZnRlciByZXRyaWV2aW5nIGEgdXNlciBkaXJlY3RseSBmcm9tIHRoZSBkYXRhYmFzZSwgd2UgbmVlZCB0byByZW1vdmUgdGhlXG4gICAqIHBhc3N3b3JkIGZyb20gdGhlIG9iamVjdCAoZm9yIHNlY3VyaXR5KSwgYW5kIGZpeCBhbiBpc3N1ZSBzb21lIFNES3MgaGF2ZVxuICAgKiB3aXRoIG51bGwgdmFsdWVzXG4gICAqL1xuICBfc2FuaXRpemVBdXRoRGF0YSh1c2VyKSB7XG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgaWdub3JlRW1haWxWZXJpZmljYXRpb24gfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnksIHt9LCBBdXRoLm1haW50ZW5hbmNlKHJlcS5jb25maWcpKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENyZWF0ZSByZXF1ZXN0IG9iamVjdCBmb3IgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uc1xuICAgICAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoLmlzTWFzdGVyLFxuICAgICAgICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICBvYmplY3Q6IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIElmIHJlcXVlc3QgZG9lc24ndCB1c2UgbWFzdGVyIG9yIG1haW50ZW5hbmNlIGtleSB3aXRoIGlnbm9yaW5nIGVtYWlsIHZlcmlmaWNhdGlvblxuICAgICAgICAgIGlmICghKChyZXEuYXV0aC5pc01hc3RlciB8fCByZXEuYXV0aC5pc01haW50ZW5hbmNlKSAmJiBpZ25vcmVFbWFpbFZlcmlmaWNhdGlvbikpIHtcblxuICAgICAgICAgICAgLy8gR2V0IHZlcmlmaWNhdGlvbiBjb25kaXRpb25zIHdoaWNoIGNhbiBiZSBib29sZWFucyBvciBmdW5jdGlvbnM7IHRoZSBwdXJwb3NlIG9mIHRoaXMgYXN5bmMvYXdhaXRcbiAgICAgICAgICAgIC8vIHN0cnVjdHVyZSBpcyB0byBhdm9pZCB1bm5lY2Vzc2FyaWx5IGV4ZWN1dGluZyBzdWJzZXF1ZW50IGZ1bmN0aW9ucyBpZiBwcmV2aW91cyBvbmVzIGZhaWwgaW4gdGhlXG4gICAgICAgICAgICAvLyBjb25kaXRpb25hbCBzdGF0ZW1lbnQgYmVsb3csIGFzIGEgZGV2ZWxvcGVyIG1heSBkZWNpZGUgdG8gZXhlY3V0ZSBleHBlbnNpdmUgb3BlcmF0aW9ucyBpbiB0aGVtXG4gICAgICAgICAgICBjb25zdCB2ZXJpZnlVc2VyRW1haWxzID0gYXN5bmMgKCkgPT4gcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSB0cnVlIHx8ICh0eXBlb2YgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzID09PSAnZnVuY3Rpb24nICYmIGF3YWl0IFByb21pc2UucmVzb2x2ZShyZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPSBhc3luYyAoKSA9PiByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09IHRydWUgfHwgKHR5cGVvZiByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbChyZXF1ZXN0KSkgPT09IHRydWUpO1xuICAgICAgICAgICAgaWYgKGF3YWl0IHZlcmlmeVVzZXJFbWFpbHMoKSAmJiBhd2FpdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsKCkgJiYgIXVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgeyBpbmNsdWRlOiAndXNlcicgfSxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0cyB8fCByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8ICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICBjb25zdCBhdXRoRGF0YSA9IHJlcS5ib2R5ICYmIHJlcS5ib2R5LmF1dGhEYXRhO1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaGFzIHByb3ZpZGVkIHRoZWlyIHJlcXVpcmVkIGF1dGggcHJvdmlkZXJzXG4gICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKFxuICAgICAgcmVxLFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyLmF1dGhEYXRhLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBsZXQgYXV0aERhdGFSZXNwb25zZTtcbiAgICBsZXQgdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgYXV0aERhdGEsXG4gICAgICAgIG5ldyBSZXN0V3JpdGUoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgICByZXEuYm9keSxcbiAgICAgICAgICB1c2VyLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICksXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBhdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB2YWxpZGF0ZWRBdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICB7IHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICk7IH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIGF3YWl0IHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZyxcbiAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICApO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzb21lIG5ldyB2YWxpZGF0ZWQgYXV0aERhdGEgdXBkYXRlIGRpcmVjdGx5XG4gICAgaWYgKHZhbGlkYXRlZEF1dGhEYXRhICYmIE9iamVjdC5rZXlzKHZhbGlkYXRlZEF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgIHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcblxuICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICB1c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIH1cbiAgICBhd2FpdCByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5ydW5BZnRlckZpbmQocmVxLCB1c2VyLmF1dGhEYXRhKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBhbGxvd3MgbWFzdGVyLWtleSBjbGllbnRzIHRvIGNyZWF0ZSB1c2VyIHNlc3Npb25zIHdpdGhvdXQgYWNjZXNzIHRvXG4gICAqIHVzZXIgY3JlZGVudGlhbHMuIFRoaXMgZW5hYmxlcyBzeXN0ZW1zIHRoYXQgY2FuIGF1dGhlbnRpY2F0ZSBhY2Nlc3MgYW5vdGhlclxuICAgKiB3YXkgKEFQSSBrZXksIGFwcCBhZG1pbmlzdHJhdG9ycykgdG8gYWN0IG9uIGEgdXNlcidzIGJlaGFsZi5cbiAgICpcbiAgICogV2UgY3JlYXRlIGEgbmV3IHNlc3Npb24gcmF0aGVyIHRoYW4gbG9va2luZyBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbjsgd2VcbiAgICogd2FudCB0aGlzIHRvIHdvcmsgaW4gc2l0dWF0aW9ucyB3aGVyZSB0aGUgdXNlciBpcyBsb2dnZWQgb3V0IG9uIGFsbFxuICAgKiBkZXZpY2VzLCBzaW5jZSB0aGlzIGNhbiBiZSB1c2VkIGJ5IGF1dG9tYXRlZCBzeXN0ZW1zIGFjdGluZyBvbiB0aGUgdXNlcidzXG4gICAqIGJlaGFsZi5cbiAgICpcbiAgICogRm9yIHRoZSBtb21lbnQsIHdlJ3JlIG9taXR0aW5nIGV2ZW50IGhvb2tzIGFuZCBsb2Nrb3V0IGNoZWNrcywgc2luY2VcbiAgICogaW1tZWRpYXRlIHVzZSBjYXNlcyBzdWdnZXN0IC9sb2dpbkFzIGNvdWxkIGJlIHVzZWQgZm9yIHNlbWFudGljYWxseVxuICAgKiBkaWZmZXJlbnQgcmVhc29ucyBmcm9tIC9sb2dpblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlTG9nSW5BcyhyZXEpIHtcbiAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgJ21hc3RlciBrZXkgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSByZXEuYm9keS51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgY29uc3QgcmVjb3JkcyA9IGF3YWl0IHJlc3QuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICk7XG4gICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgcmVzdC5kZWwoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHJlY29yZHMucmVzdWx0c1swXSkpLFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgcmVxLmNvbmZpZ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3VjY2VzcztcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeT8ucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCA/PyB0cnVlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGVyci5tZXNzYWdlID0gYEEgdXNlciB3aXRoIHRoYXQgZW1haWwgZG9lcyBub3QgZXhpc3QuYDtcbiAgICAgIH1cbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cblxuICBhc3luYyBoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IGVtYWlsOiBlbWFpbCB9LCB7fSwgQXV0aC5tYWludGVuYW5jZShyZXEuY29uZmlnKSk7XG4gICAgaWYgKCFyZXN1bHRzLmxlbmd0aCB8fCByZXN1bHRzLmxlbmd0aCA8IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICB9XG4gICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG5cbiAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgaWYgKHVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgY29uc3Qgc2VuZCA9IGF3YWl0IHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIsIHJlcS5hdXRoLmlzTWFzdGVyLCByZXEuYXV0aC5pbnN0YWxsYXRpb25JZCwgcmVxLmlwKTtcbiAgICBpZiAoc2VuZCkge1xuICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSk7XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gYXV0aGVudGljYXRlIHRoZSB1c2VyIGJ5IHVzZXJuYW1lXG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKHVzZXJuYW1lIHx8IGVtYWlsKSB7XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2VEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgIH1cblxuICAgIGxldCByZXF1ZXN0O1xuICAgIGxldCBwYXJzZVVzZXI7XG5cbiAgICAvLyBUcnkgdG8gZmluZCB1c2VyIGJ5IGF1dGhEYXRhXG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGF1dGhEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdhdXRoRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgICAgfVxuICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2Fubm90IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maWx0ZXIoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2Fubm90IHByb3ZpZGUgbW9yZSB0aGFuIG9uZSBhdXRoRGF0YSBwcm92aWRlciB3aXRoIGFuIGlkLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHJlcS5jb25maWcsIGF1dGhEYXRhKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFyZXN1bHRzWzBdIHx8IHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmluZCB0aGUgcHJvdmlkZXIgdXNlZCB0byBmaW5kIHRoZSB1c2VyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbmQoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpO1xuXG4gICAgICAgIHBhcnNlVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnJlc3VsdHNbMF0gfSk7XG4gICAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgICAgIC8vIFZhbGlkYXRlIGF1dGhEYXRhIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHVzZXIgdG8gYXZvaWQgYnJ1dGUtZm9yY2UgYXR0YWNrIG9uIGBpZGBcbiAgICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdG9yUmVzcG9uc2UgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHBhcnNlVXNlciwgcmVxdWVzdCk7XG4gICAgICAgIGlmICh2YWxpZGF0b3JSZXNwb25zZSAmJiB2YWxpZGF0b3JSZXNwb25zZS52YWxpZGF0b3IpIHtcbiAgICAgICAgICBhd2FpdCB2YWxpZGF0b3JSZXNwb25zZS52YWxpZGF0b3IoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBSZXdyaXRlIHRoZSBlcnJvciB0byBhdm9pZCBndWVzcyBpZCBhdHRhY2tcbiAgICAgICAgbG9nZ2VyLmVycm9yKGUpO1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghcGFyc2VVc2VyKSB7XG4gICAgICBwYXJzZVVzZXIgPSB1c2VyID8gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4udXNlciB9KSA6IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBhY2MgPSB7fTtcbiAgICAvLyBFeGVjdXRlIGNoYWxsZW5nZSBzdGVwLWJ5LXN0ZXAgd2l0aCBjb25zaXN0ZW50IG9yZGVyIGZvciBiZXR0ZXIgZXJyb3IgZmVlZGJhY2tcbiAgICAvLyBhbmQgdG8gYXZvaWQgdG8gdHJpZ2dlciBvdGhlcnMgY2hhbGxlbmdlcyBpZiBvbmUgb2YgdGhlbSBmYWlsc1xuICAgIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgT2JqZWN0LmtleXMoY2hhbGxlbmdlRGF0YSkuc29ydCgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhdXRoQWRhcHRlciA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgaWYgKCFhdXRoQWRhcHRlcikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBhZGFwdGVyOiB7IGNoYWxsZW5nZSB9LFxuICAgICAgICB9ID0gYXV0aEFkYXB0ZXI7XG4gICAgICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgY29uc3QgcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSA9IGF3YWl0IGNoYWxsZW5nZShcbiAgICAgICAgICAgIGNoYWxsZW5nZURhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgYXV0aERhdGEgJiYgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5hdXRoW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcXVlc3RcbiAgICAgICAgICApO1xuICAgICAgICAgIGFjY1twcm92aWRlcl0gPSBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIHx8IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ0NoYWxsZW5nZSBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPSByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbiAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgY2hhbGxlbmdlIGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiAnY2hhbGxlbmdlJyxcbiAgICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgY2hhbGxlbmdlRGF0YTogYWNjIH0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9jaGFsbGVuZ2UnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ2hhbGxlbmdlKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlcnNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUVBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FB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