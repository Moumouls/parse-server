"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _logger = require("./logger");
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _RestWrite = _interopRequireDefault(require("./RestWrite"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const Parse = require('parse/node');
// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isMaintenance = false,
  isReadOnly = false,
  user,
  installationId
}) {
  this.config = config;
  this.cacheController = cacheController || config && config.cacheController;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.isMaintenance = isMaintenance;
  this.user = user;
  this.isReadOnly = isReadOnly;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }
  if (this.isMaintenance) {
    return false;
  }
  if (this.user) {
    return false;
  }
  return true;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({
    config,
    isMaster: true
  });
}

// A helper to get a maintenance-level Auth object
function maintenance(config) {
  return new Auth({
    config,
    isMaintenance: true
  });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true
  });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({
    config,
    isMaster: false
  });
}

/**
 * Checks whether session should be updated based on last update time & session length.
 */
function shouldUpdateSessionExpiry(config, session) {
  const resetAfter = config.sessionLength / 2;
  const lastUpdated = new Date(session === null || session === void 0 ? void 0 : session.updatedAt);
  const skipRange = new Date();
  skipRange.setTime(skipRange.getTime() - resetAfter * 1000);
  return lastUpdated <= skipRange;
}
const throttle = {};
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!(config !== null && config !== void 0 && config.extendSessionOnUse)) {
    return;
  }
  clearTimeout(throttle[sessionToken]);
  throttle[sessionToken] = setTimeout(async () => {
    try {
      if (!session) {
        const query = await (0, _RestQuery.default)({
          method: _RestQuery.default.Method.get,
          config,
          auth: master(config),
          runBeforeFind: false,
          className: '_Session',
          restWhere: {
            sessionToken
          },
          restOptions: {
            limit: 1
          }
        });
        const {
          results
        } = await query.execute();
        session = results[0];
      }
      if (!shouldUpdateSessionExpiry(config, session) || !session) {
        return;
      }
      const expiresAt = config.generateSessionExpiresAt();
      await new _RestWrite.default(config, master(config), '_Session', {
        objectId: session.objectId
      }, {
        expiresAt: Parse._encode(expiresAt)
      }).execute();
    } catch (e) {
      if ((e === null || e === void 0 ? void 0 : e.code) !== Parse.Error.OBJECT_NOT_FOUND) {
        _logger.logger.error('Could not update session expiry: ', e);
      }
    }
  }, 500);
};

// Returns a promise that resolves to an Auth object
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId
}) {
  cacheController = cacheController || config && config.cacheController;
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      renewSessionIfNeeded({
        config,
        sessionToken
      });
      return Promise.resolve(new Auth({
        config,
        cacheController,
        isMaster: false,
        installationId,
        user: cachedUser
      }));
    }
  }
  let results;
  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user'
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.get,
      config,
      runBeforeFind: false,
      auth: master(config),
      className: '_Session',
      restWhere: {
        sessionToken
      },
      restOptions
    });
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query(Parse.Session).limit(1).include('user').equalTo('sessionToken', sessionToken).find({
      useMasterKey: true
    })).map(obj => obj.toJSON());
  }
  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const session = results[0];
  const now = new Date(),
    expiresAt = session.expiresAt ? new Date(session.expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = session.user;
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  renewSessionIfNeeded({
    config,
    session,
    sessionToken
  });
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject
  });
};
var getAuthForLegacySessionToken = async function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  };
  const RestQuery = require('./RestQuery');
  var query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_User',
    restWhere: {
      _session_token: sessionToken
    },
    restOptions
  });
  return query.execute().then(response => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({
      config,
      isMaster: false,
      installationId,
      user: userObject
    });
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || this.isMaintenance || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return this.rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};
Auth.prototype.getRolesForUser = async function () {
  //Stack all Parse.Role
  const results = [];
  if (this.config) {
    const restWhere = {
      users: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.user.id
      }
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      runBeforeFind: false,
      config: this.config,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role).equalTo('users', this.user).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  }
  return results;
};

// Iterates through the role tree and compiles a user's roles
Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  }

  // First get the role ids this user is directly a member of
  const results = await this.getRolesForUser();
  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;
    this.cacheRoles();
    return this.userRoles;
  }
  const rolesMap = results.reduce((m, r) => {
    m.names.push(r.name);
    m.ids.push(r.objectId);
    return m;
  }, {
    ids: [],
    names: []
  });

  // run the recursive finding
  const roleNames = await this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names);
  this.userRoles = roleNames.map(r => {
    return 'role:' + r;
  });
  this.fetchedRoles = true;
  this.rolePromise = null;
  this.cacheRoles();
  return this.userRoles;
};
Auth.prototype.cacheRoles = function () {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.put(this.user.id, Array(...this.userRoles));
  return true;
};
Auth.prototype.clearRoleCache = function (sessionToken) {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.del(this.user.id);
  this.cacheController.user.del(sessionToken);
  return true;
};
Auth.prototype.getRolesByIds = async function (ins) {
  const results = [];
  // Build an OR query across all parentRoles
  if (!this.config) {
    await new Parse.Query(Parse.Role).containedIn('roles', ins.map(id => {
      const role = new Parse.Object(Parse.Role);
      role.id = id;
      return role;
    })).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id
      };
    });
    const restWhere = {
      roles: {
        $in: roles
      }
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      config: this.config,
      runBeforeFind: false,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
  }
  return results;
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }
  return this.getRolesByIds(ins).then(results => {
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    }
    // Map the results with all Ids and names
    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {
      ids: [],
      names: []
    });
    // store the new found names
    names = names.concat(resultMap.names);
    // find the next ones, circular roles will be cut
    return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
  }).then(names => {
    return Promise.resolve([...new Set(names)]);
  });
};
const findUsersWithAuthData = (config, authData) => {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider] || authData && !authData[provider].id) {
      return memo;
    }
    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  return query.length > 0 ? config.database.find('_User', {
    $or: query
  }, {
    limit: 2
  }) : Promise.resolve([]);
};
const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) return {
    hasMutatedAuthData: true,
    mutatedAuthData: authData
  };
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') return;
    const providerData = authData[provider];
    const userProviderAuthData = userAuthData[provider];
    if (!(0, _util.isDeepStrictEqual)(providerData, userProviderAuthData)) {
      mutatedAuthData[provider] = providerData;
    }
  });
  const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
  return {
    hasMutatedAuthData,
    mutatedAuthData
  };
};
const checkIfUserHasProvidedConfiguredProvidersForLogin = (req = {}, authData = {}, userAuthData = {}, config) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter
  }));
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]);

  // Solo providers can be considered as safe, so we do not have to check if the user needs
  // to provide an additional provider to login. An auth adapter with "solo" (like webauthn) means
  // no "additional" auth needs to be provided to login (like OTP, MFA)
  if (hasProvidedASoloProvider) {
    return;
  }
  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    let policy = provider.adapter.policy;
    if (typeof policy === 'function') {
      const requestObject = {
        ip: req.config.ip,
        user: req.auth.user,
        master: req.auth.isMaster
      };
      policy = policy.call(provider.adapter, requestObject, userAuthData[provider.name]);
    }
    if (policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for error message
        additionProvidersNotFound.push(provider.name);
      }
    }
  });
  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) {
    return;
  }
  throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Missing additional authData ${additionProvidersNotFound.join(',')}`);
};

// Validate each authData step-by-step and return the provider responses
const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;
  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser));
    // Find user by session and current objectId; only pass user if it's the current user or master key is provided
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  }
  const {
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, user, req.config);
  // Perform validation as step-by-step pipeline for better error consistency
  // and also to avoid to trigger a provider (like OTP SMS) if another one fails
  const acc = {
    authData: {},
    authDataResponse: {}
  };
  const authKeys = Object.keys(authData).sort();
  for (const provider of authKeys) {
    let method = '';
    try {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        continue;
      }
      const {
        validator
      } = req.config.authDataManager.getValidatorForProvider(provider);
      const authProvider = (req.config.auth || {})[provider] || {};
      if (!validator || authProvider.enabled === false) {
        throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
      }
      let validationResult = await validator(authData[provider], req, user, requestObject);
      method = validationResult && validationResult.method;
      requestObject.triggerName = method;
      if (validationResult && validationResult.validator) {
        validationResult = await validationResult.validator();
      }
      if (!validationResult) {
        acc.authData[provider] = authData[provider];
        continue;
      }
      if (!Object.keys(validationResult).length) {
        acc.authData[provider] = authData[provider];
        continue;
      }
      if (validationResult.response) {
        acc.authDataResponse[provider] = validationResult.response;
      }
      // Some auth providers after initialization will avoid to replace authData already stored
      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } catch (err) {
      const e = (0, _triggers.resolveError)(err, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Auth failed. Unknown error.'
      });
      const userString = req.auth && req.auth.user ? req.auth.user.id : req.data.objectId || undefined;
      _logger.logger.error(`Failed running auth step ${method} for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
        authenticationStep: method,
        error: e,
        user: userString,
        provider
      });
      throw e;
    }
  }
  return acc;
};
module.exports = {
  Auth,
  master,
  maintenance,
  nobody,
  readOnly,
  shouldUpdateSessionExpiry,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlBhcnNlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsInVuZGVmaW5lZCIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwibWFpbnRlbmFuY2UiLCJyZWFkT25seSIsIm5vYm9keSIsInNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkiLCJzZXNzaW9uIiwicmVzZXRBZnRlciIsInNlc3Npb25MZW5ndGgiLCJsYXN0VXBkYXRlZCIsIkRhdGUiLCJ1cGRhdGVkQXQiLCJza2lwUmFuZ2UiLCJzZXRUaW1lIiwiZ2V0VGltZSIsInRocm90dGxlIiwicmVuZXdTZXNzaW9uSWZOZWVkZWQiLCJzZXNzaW9uVG9rZW4iLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwicXVlcnkiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJnZXQiLCJhdXRoIiwicnVuQmVmb3JlRmluZCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwibGltaXQiLCJyZXN1bHRzIiwiZXhlY3V0ZSIsImV4cGlyZXNBdCIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsIlJlc3RXcml0ZSIsIm9iamVjdElkIiwiX2VuY29kZSIsImNvZGUiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJsb2dnZXIiLCJlcnJvciIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImNhY2hlZFVzZXIiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwiaW5jbHVkZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwib2JqIiwidG9KU09OIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwibm93IiwiaXNvIiwicGFzc3dvcmQiLCJwdXQiLCJ1c2VyT2JqZWN0IiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsIl9zZXNzaW9uX3Rva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInVzZXJzIiwiX190eXBlIiwiaWQiLCJlYWNoIiwicmVzdWx0IiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJuYW1lcyIsIm5hbWUiLCJpZHMiLCJyb2xlTmFtZXMiLCJfZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMiLCJBcnJheSIsImNsZWFyUm9sZUNhY2hlIiwiZGVsIiwiZ2V0Um9sZXNCeUlkcyIsImlucyIsImNvbnRhaW5lZEluIiwicm9sZXMiLCIkaW4iLCJyb2xlSURzIiwicXVlcmllZFJvbGVzIiwicm9sZUlEIiwid2FzUXVlcmllZCIsIlNldCIsInJlc3VsdE1hcCIsIm1lbW8iLCJjb25jYXQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJhdXRoRGF0YSIsInByb3ZpZGVycyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsImlzRGVlcFN0cmljdEVxdWFsIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsInJlcSIsInNhdmVkVXNlclByb3ZpZGVycyIsImFkYXB0ZXIiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciIsInNvbWUiLCJwb2xpY3kiLCJhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kIiwiaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIiwicmVxdWVzdE9iamVjdCIsImlwIiwiT1RIRVJfQ0FVU0UiLCJqb2luIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiZm91bmRVc2VyIiwiVXNlciIsImdldFVzZXJJZCIsImZldGNoIiwidXBkYXRlZE9iamVjdCIsImJ1aWxkUGFyc2VPYmplY3RzIiwiZ2V0UmVxdWVzdE9iamVjdCIsImFjYyIsImF1dGhEYXRhUmVzcG9uc2UiLCJhdXRoS2V5cyIsInNvcnQiLCJ2YWxpZGF0b3IiLCJhdXRoUHJvdmlkZXIiLCJlbmFibGVkIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInZhbGlkYXRpb25SZXN1bHQiLCJ0cmlnZ2VyTmFtZSIsImRvTm90U2F2ZSIsInNhdmUiLCJlcnIiLCJyZXNvbHZlRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJTdHJpbmciLCJkYXRhIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvQXV0aC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBnZXRSZXF1ZXN0T2JqZWN0LCByZXNvbHZlRXJyb3IgfSBmcm9tICcuL3RyaWdnZXJzJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuL1Jlc3RXcml0ZSc7XG5cbi8vIEFuIEF1dGggb2JqZWN0IHRlbGxzIHlvdSB3aG8gaXMgcmVxdWVzdGluZyBzb21ldGhpbmcgYW5kIHdoZXRoZXJcbi8vIHRoZSBtYXN0ZXIga2V5IHdhcyB1c2VkLlxuLy8gdXNlck9iamVjdCBpcyBhIFBhcnNlLlVzZXIgYW5kIGNhbiBiZSBudWxsIGlmIHRoZXJlJ3Mgbm8gdXNlci5cbmZ1bmN0aW9uIEF1dGgoe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlciA9IHVuZGVmaW5lZCxcbiAgaXNNYXN0ZXIgPSBmYWxzZSxcbiAgaXNNYWludGVuYW5jZSA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMuaXNNYWludGVuYW5jZSA9IGlzTWFpbnRlbmFuY2U7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy5pc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFpbnRlbmFuY2UtbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1haW50ZW5hbmNlKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFpbnRlbmFuY2U6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBzZXNzaW9uIHNob3VsZCBiZSB1cGRhdGVkIGJhc2VkIG9uIGxhc3QgdXBkYXRlIHRpbWUgJiBzZXNzaW9uIGxlbmd0aC5cbiAqL1xuZnVuY3Rpb24gc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeShjb25maWcsIHNlc3Npb24pIHtcbiAgY29uc3QgcmVzZXRBZnRlciA9IGNvbmZpZy5zZXNzaW9uTGVuZ3RoIC8gMjtcbiAgY29uc3QgbGFzdFVwZGF0ZWQgPSBuZXcgRGF0ZShzZXNzaW9uPy51cGRhdGVkQXQpO1xuICBjb25zdCBza2lwUmFuZ2UgPSBuZXcgRGF0ZSgpO1xuICBza2lwUmFuZ2Uuc2V0VGltZShza2lwUmFuZ2UuZ2V0VGltZSgpIC0gcmVzZXRBZnRlciAqIDEwMDApO1xuICByZXR1cm4gbGFzdFVwZGF0ZWQgPD0gc2tpcFJhbmdlO1xufVxuXG5jb25zdCB0aHJvdHRsZSA9IHt9O1xuY29uc3QgcmVuZXdTZXNzaW9uSWZOZWVkZWQgPSBhc3luYyAoeyBjb25maWcsIHNlc3Npb24sIHNlc3Npb25Ub2tlbiB9KSA9PiB7XG4gIGlmICghY29uZmlnPy5leHRlbmRTZXNzaW9uT25Vc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY2xlYXJUaW1lb3V0KHRocm90dGxlW3Nlc3Npb25Ub2tlbl0pO1xuICB0aHJvdHRsZVtzZXNzaW9uVG9rZW5dID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgICAgIHJlc3RXaGVyZTogeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICByZXN0T3B0aW9uczogeyBsaW1pdDogMSB9LFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICAgIHNlc3Npb24gPSByZXN1bHRzWzBdO1xuICAgICAgfVxuICAgICAgaWYgKCFzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5KGNvbmZpZywgc2Vzc2lvbikgfHwgIXNlc3Npb24pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpO1xuICAgICAgYXdhaXQgbmV3IFJlc3RXcml0ZShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBtYXN0ZXIoY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBvYmplY3RJZDogc2Vzc2lvbi5vYmplY3RJZCB9LFxuICAgICAgICB7IGV4cGlyZXNBdDogUGFyc2UuX2VuY29kZShleHBpcmVzQXQpIH1cbiAgICAgICkuZXhlY3V0ZSgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlPy5jb2RlICE9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ291bGQgbm90IHVwZGF0ZSBzZXNzaW9uIGV4cGlyeTogJywgZSk7XG4gICAgICB9XG4gICAgfVxuICB9LCA1MDApO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4gfSk7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICBuZXcgQXV0aCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgdXNlcjogY2FjaGVkVXNlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgbGV0IHJlc3VsdHM7XG4gIGlmIChjb25maWcpIHtcbiAgICBjb25zdCByZXN0T3B0aW9ucyA9IHtcbiAgICAgIGxpbWl0OiAxLFxuICAgICAgaW5jbHVkZTogJ3VzZXInLFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBtYXN0ZXIoY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19TZXNzaW9uJyxcbiAgICAgIHJlc3RXaGVyZTogeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IHNlc3Npb24gPSByZXN1bHRzWzBdO1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLFxuICAgIGV4cGlyZXNBdCA9IHNlc3Npb24uZXhwaXJlc0F0ID8gbmV3IERhdGUoc2Vzc2lvbi5leHBpcmVzQXQuaXNvKSA6IHVuZGVmaW5lZDtcbiAgaWYgKGV4cGlyZXNBdCA8IG5vdykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIGlzIGV4cGlyZWQuJyk7XG4gIH1cbiAgY29uc3Qgb2JqID0gc2Vzc2lvbi51c2VyO1xuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb24sIHNlc3Npb25Ub2tlbiB9KTtcbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoeyBjb25maWcsIHNlc3Npb25Ub2tlbiwgaW5zdGFsbGF0aW9uSWQgfSkge1xuICB2YXIgcmVzdE9wdGlvbnMgPSB7XG4gICAgbGltaXQ6IDEsXG4gIH07XG4gIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gIHZhciBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICBjb25maWcsXG4gICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgIHJlc3RXaGVyZTogeyBfc2Vzc2lvbl90b2tlbjogc2Vzc2lvblRva2VuIH0sXG4gICAgcmVzdE9wdGlvbnMsXG4gIH0pO1xuICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHZhciByZXN1bHRzID0gcmVzcG9uc2UucmVzdWx0cztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdpbnZhbGlkIGxlZ2FjeSBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF07XG4gICAgb2JqLmNsYXNzTmFtZSA9ICdfVXNlcic7XG4gICAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICAgIHJldHVybiBuZXcgQXV0aCh7XG4gICAgICBjb25maWcsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiByb2xlIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5nZXRVc2VyUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8IHRoaXMuaXNNYWludGVuYW5jZSB8fCAhdGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cbiAgaWYgKHRoaXMuZmV0Y2hlZFJvbGVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnVzZXJSb2xlcyk7XG4gIH1cbiAgaWYgKHRoaXMucm9sZVByb21pc2UpIHtcbiAgICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbiAgfVxuICB0aGlzLnJvbGVQcm9taXNlID0gdGhpcy5fbG9hZFJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNGb3JVc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvL1N0YWNrIGFsbCBQYXJzZS5Sb2xlXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgaWYgKHRoaXMuY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdFdoZXJlID0ge1xuICAgICAgdXNlcnM6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMudXNlci5pZCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmNsZWFyUm9sZUNhY2hlID0gZnVuY3Rpb24gKHNlc3Npb25Ub2tlbikge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZGVsKHRoaXMudXNlci5pZCk7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb25Ub2tlbik7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uIChpbnMpIHtcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAvLyBCdWlsZCBhbiBPUiBxdWVyeSBhY3Jvc3MgYWxsIHBhcmVudFJvbGVzXG4gIGlmICghdGhpcy5jb25maWcpIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5jb250YWluZWRJbihcbiAgICAgICAgJ3JvbGVzJyxcbiAgICAgICAgaW5zLm1hcChpZCA9PiB7XG4gICAgICAgICAgY29uc3Qgcm9sZSA9IG5ldyBQYXJzZS5PYmplY3QoUGFyc2UuUm9sZSk7XG4gICAgICAgICAgcm9sZS5pZCA9IGlkO1xuICAgICAgICAgIHJldHVybiByb2xlO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByb2xlcyA9IGlucy5tYXAoaWQgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7IHJvbGVzOiB7ICRpbjogcm9sZXMgfSB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBtYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgcmVzdFdoZXJlLFxuICAgIH0pO1xuICAgIGF3YWl0IHF1ZXJ5LmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQpKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICByZXR1cm4gcXVlcnkubGVuZ3RoID4gMFxuICAgID8gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHsgbGltaXQ6IDIgfSlcbiAgICA6IFByb21pc2UucmVzb2x2ZShbXSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhOiB0cnVlLCBtdXRhdGVkQXV0aERhdGE6IGF1dGhEYXRhIH07XG4gIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgLy8gQW5vbnltb3VzIHByb3ZpZGVyIGlzIG5vdCBoYW5kbGVkIHRoaXMgd2F5XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJykgcmV0dXJuO1xuICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBjb25zdCB1c2VyUHJvdmlkZXJBdXRoRGF0YSA9IHVzZXJBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgaWYgKCFpc0RlZXBTdHJpY3RFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIHJlcSA9IHt9LFxuICBhdXRoRGF0YSA9IHt9LFxuICB1c2VyQXV0aERhdGEgPSB7fSxcbiAgY29uZmlnXG4pID0+IHtcbiAgY29uc3Qgc2F2ZWRVc2VyUHJvdmlkZXJzID0gT2JqZWN0LmtleXModXNlckF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4gKHtcbiAgICBuYW1lOiBwcm92aWRlcixcbiAgICBhZGFwdGVyOiBjb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKS5hZGFwdGVyLFxuICB9KSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdzb2xvJyAmJiBhdXRoRGF0YVtwcm92aWRlci5uYW1lXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmUsIHNvIHdlIGRvIG5vdCBoYXZlIHRvIGNoZWNrIGlmIHRoZSB1c2VyIG5lZWRzXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpbi4gQW4gYXV0aCBhZGFwdGVyIHdpdGggXCJzb2xvXCIgKGxpa2Ugd2ViYXV0aG4pIG1lYW5zXG4gIC8vIG5vIFwiYWRkaXRpb25hbFwiIGF1dGggbmVlZHMgdG8gYmUgcHJvdmlkZWQgdG8gbG9naW4gKGxpa2UgT1RQLCBNRkEpXG4gIGlmIChoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kID0gW107XG4gIGNvbnN0IGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICBsZXQgcG9saWN5ID0gcHJvdmlkZXIuYWRhcHRlci5wb2xpY3k7XG4gICAgaWYgKHR5cGVvZiBwb2xpY3kgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHJlcXVlc3RPYmplY3QgPSB7XG4gICAgICAgIGlwOiByZXEuY29uZmlnLmlwLFxuICAgICAgICB1c2VyOiByZXEuYXV0aC51c2VyLFxuICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoLmlzTWFzdGVyLFxuICAgICAgfTtcbiAgICAgIHBvbGljeSA9IHBvbGljeS5jYWxsKHByb3ZpZGVyLmFkYXB0ZXIsIHJlcXVlc3RPYmplY3QsIHVzZXJBdXRoRGF0YVtwcm92aWRlci5uYW1lXSk7XG4gICAgfVxuICAgIGlmIChwb2xpY3kgPT09ICdhZGRpdGlvbmFsJykge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUHVzaCBtaXNzaW5nIHByb3ZpZGVyIGZvciBlcnJvciBtZXNzYWdlXG4gICAgICAgIGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQucHVzaChwcm92aWRlci5uYW1lKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBpZiAoaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIHx8ICFhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICBgTWlzc2luZyBhZGRpdGlvbmFsIGF1dGhEYXRhICR7YWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5qb2luKCcsJyl9YFxuICApO1xufTtcblxuLy8gVmFsaWRhdGUgZWFjaCBhdXRoRGF0YSBzdGVwLWJ5LXN0ZXAgYW5kIHJldHVybiB0aGUgcHJvdmlkZXIgcmVzcG9uc2VzXG5jb25zdCBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBhc3luYyAoYXV0aERhdGEsIHJlcSwgZm91bmRVc2VyKSA9PiB7XG4gIGxldCB1c2VyO1xuICBpZiAoZm91bmRVc2VyKSB7XG4gICAgdXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZvdW5kVXNlciB9KTtcbiAgICAvLyBGaW5kIHVzZXIgYnkgc2Vzc2lvbiBhbmQgY3VycmVudCBvYmplY3RJZDsgb25seSBwYXNzIHVzZXIgaWYgaXQncyB0aGUgY3VycmVudCB1c2VyIG9yIG1hc3RlciBrZXkgaXMgcHJvdmlkZWRcbiAgfSBlbHNlIGlmIChcbiAgICAocmVxLmF1dGggJiZcbiAgICAgIHJlcS5hdXRoLnVzZXIgJiZcbiAgICAgIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmXG4gICAgICByZXEuZ2V0VXNlcklkKCkgPT09IHJlcS5hdXRoLnVzZXIuaWQpIHx8XG4gICAgKHJlcS5hdXRoICYmIHJlcS5hdXRoLmlzTWFzdGVyICYmIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmIHJlcS5nZXRVc2VySWQoKSlcbiAgKSB7XG4gICAgdXNlciA9IG5ldyBQYXJzZS5Vc2VyKCk7XG4gICAgdXNlci5pZCA9IHJlcS5hdXRoLmlzTWFzdGVyID8gcmVxLmdldFVzZXJJZCgpIDogcmVxLmF1dGgudXNlci5pZDtcbiAgICBhd2FpdCB1c2VyLmZldGNoKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG5cbiAgY29uc3QgeyB1cGRhdGVkT2JqZWN0IH0gPSByZXEuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgdXBkYXRlZE9iamVjdCwgdXNlciwgcmVxLmNvbmZpZyk7XG4gIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBhcyBzdGVwLWJ5LXN0ZXAgcGlwZWxpbmUgZm9yIGJldHRlciBlcnJvciBjb25zaXN0ZW5jeVxuICAvLyBhbmQgYWxzbyB0byBhdm9pZCB0byB0cmlnZ2VyIGEgcHJvdmlkZXIgKGxpa2UgT1RQIFNNUykgaWYgYW5vdGhlciBvbmUgZmFpbHNcbiAgY29uc3QgYWNjID0geyBhdXRoRGF0YToge30sIGF1dGhEYXRhUmVzcG9uc2U6IHt9IH07XG4gIGNvbnN0IGF1dGhLZXlzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKTtcbiAgZm9yIChjb25zdCBwcm92aWRlciBvZiBhdXRoS2V5cykge1xuICAgIGxldCBtZXRob2QgPSAnJztcbiAgICB0cnkge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgY29uc3QgYXV0aFByb3ZpZGVyID0gKHJlcS5jb25maWcuYXV0aCB8fCB7fSlbcHJvdmlkZXJdIHx8IHt9O1xuICAgICAgaWYgKCF2YWxpZGF0b3IgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCk7XG4gICAgICBtZXRob2QgPSB2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQubWV0aG9kO1xuICAgICAgcmVxdWVzdE9iamVjdC50cmlnZ2VyTmFtZSA9IG1ldGhvZDtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKSB7XG4gICAgICAgIHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcigpO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3Qua2V5cyh2YWxpZGF0aW9uUmVzdWx0KS5sZW5ndGgpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVJlc3BvbnNlW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2U7XG4gICAgICB9XG4gICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWQgdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5zYXZlIHx8IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdBdXRoIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB1c2VyU3RyaW5nID1cbiAgICAgICAgcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiByZXEuZGF0YS5vYmplY3RJZCB8fCB1bmRlZmluZWQ7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgJHttZXRob2R9IGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICB7XG4gICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiBtZXRob2QsXG4gICAgICAgICAgZXJyb3I6IGUsXG4gICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBtYWludGVuYW5jZSxcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgZmluZFVzZXJzV2l0aEF1dGhEYXRhLFxuICBoYXNNdXRhdGVkQXV0aERhdGEsXG4gIGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4sXG4gIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbixcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsT0FBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsVUFBQSxHQUFBQyxzQkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssVUFBQSxHQUFBRCxzQkFBQSxDQUFBSixPQUFBO0FBQW9DLFNBQUFJLHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBQUEsU0FBQUcsUUFBQUgsQ0FBQSxFQUFBSSxDQUFBLFFBQUFDLENBQUEsR0FBQUMsTUFBQSxDQUFBQyxJQUFBLENBQUFQLENBQUEsT0FBQU0sTUFBQSxDQUFBRSxxQkFBQSxRQUFBQyxDQUFBLEdBQUFILE1BQUEsQ0FBQUUscUJBQUEsQ0FBQVIsQ0FBQSxHQUFBSSxDQUFBLEtBQUFLLENBQUEsR0FBQUEsQ0FBQSxDQUFBQyxNQUFBLFdBQUFOLENBQUEsV0FBQUUsTUFBQSxDQUFBSyx3QkFBQSxDQUFBWCxDQUFBLEVBQUFJLENBQUEsRUFBQVEsVUFBQSxPQUFBUCxDQUFBLENBQUFRLElBQUEsQ0FBQUMsS0FBQSxDQUFBVCxDQUFBLEVBQUFJLENBQUEsWUFBQUosQ0FBQTtBQUFBLFNBQUFVLGNBQUFmLENBQUEsYUFBQUksQ0FBQSxNQUFBQSxDQUFBLEdBQUFZLFNBQUEsQ0FBQUMsTUFBQSxFQUFBYixDQUFBLFVBQUFDLENBQUEsV0FBQVcsU0FBQSxDQUFBWixDQUFBLElBQUFZLFNBQUEsQ0FBQVosQ0FBQSxRQUFBQSxDQUFBLE9BQUFELE9BQUEsQ0FBQUcsTUFBQSxDQUFBRCxDQUFBLE9BQUFhLE9BQUEsV0FBQWQsQ0FBQSxJQUFBZSxlQUFBLENBQUFuQixDQUFBLEVBQUFJLENBQUEsRUFBQUMsQ0FBQSxDQUFBRCxDQUFBLFNBQUFFLE1BQUEsQ0FBQWMseUJBQUEsR0FBQWQsTUFBQSxDQUFBZSxnQkFBQSxDQUFBckIsQ0FBQSxFQUFBTSxNQUFBLENBQUFjLHlCQUFBLENBQUFmLENBQUEsS0FBQUYsT0FBQSxDQUFBRyxNQUFBLENBQUFELENBQUEsR0FBQWEsT0FBQSxXQUFBZCxDQUFBLElBQUFFLE1BQUEsQ0FBQWdCLGNBQUEsQ0FBQXRCLENBQUEsRUFBQUksQ0FBQSxFQUFBRSxNQUFBLENBQUFLLHdCQUFBLENBQUFOLENBQUEsRUFBQUQsQ0FBQSxpQkFBQUosQ0FBQTtBQUFBLFNBQUFtQixnQkFBQW5CLENBQUEsRUFBQUksQ0FBQSxFQUFBQyxDQUFBLFlBQUFELENBQUEsR0FBQW1CLGNBQUEsQ0FBQW5CLENBQUEsTUFBQUosQ0FBQSxHQUFBTSxNQUFBLENBQUFnQixjQUFBLENBQUF0QixDQUFBLEVBQUFJLENBQUEsSUFBQW9CLEtBQUEsRUFBQW5CLENBQUEsRUFBQU8sVUFBQSxNQUFBYSxZQUFBLE1BQUFDLFFBQUEsVUFBQTFCLENBQUEsQ0FBQUksQ0FBQSxJQUFBQyxDQUFBLEVBQUFMLENBQUE7QUFBQSxTQUFBdUIsZUFBQWxCLENBQUEsUUFBQXNCLENBQUEsR0FBQUMsWUFBQSxDQUFBdkIsQ0FBQSx1Q0FBQXNCLENBQUEsR0FBQUEsQ0FBQSxHQUFBQSxDQUFBO0FBQUEsU0FBQUMsYUFBQXZCLENBQUEsRUFBQUQsQ0FBQSwyQkFBQUMsQ0FBQSxLQUFBQSxDQUFBLFNBQUFBLENBQUEsTUFBQUwsQ0FBQSxHQUFBSyxDQUFBLENBQUF3QixNQUFBLENBQUFDLFdBQUEsa0JBQUE5QixDQUFBLFFBQUEyQixDQUFBLEdBQUEzQixDQUFBLENBQUErQixJQUFBLENBQUExQixDQUFBLEVBQUFELENBQUEsdUNBQUF1QixDQUFBLFNBQUFBLENBQUEsWUFBQUssU0FBQSx5RUFBQTVCLENBQUEsR0FBQTZCLE1BQUEsR0FBQUMsTUFBQSxFQUFBN0IsQ0FBQTtBQUxwQyxNQUFNOEIsS0FBSyxHQUFHekMsT0FBTyxDQUFDLFlBQVksQ0FBQztBQU9uQztBQUNBO0FBQ0E7QUFDQSxTQUFTMEMsSUFBSUEsQ0FBQztFQUNaQyxNQUFNO0VBQ05DLGVBQWUsR0FBR0MsU0FBUztFQUMzQkMsUUFBUSxHQUFHLEtBQUs7RUFDaEJDLGFBQWEsR0FBRyxLQUFLO0VBQ3JCQyxVQUFVLEdBQUcsS0FBSztFQUNsQkMsSUFBSTtFQUNKQztBQUNGLENBQUMsRUFBRTtFQUNELElBQUksQ0FBQ1AsTUFBTSxHQUFHQSxNQUFNO0VBQ3BCLElBQUksQ0FBQ0MsZUFBZSxHQUFHQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFDQyxlQUFnQjtFQUM1RSxJQUFJLENBQUNNLGNBQWMsR0FBR0EsY0FBYztFQUNwQyxJQUFJLENBQUNKLFFBQVEsR0FBR0EsUUFBUTtFQUN4QixJQUFJLENBQUNDLGFBQWEsR0FBR0EsYUFBYTtFQUNsQyxJQUFJLENBQUNFLElBQUksR0FBR0EsSUFBSTtFQUNoQixJQUFJLENBQUNELFVBQVUsR0FBR0EsVUFBVTs7RUFFNUI7RUFDQTtFQUNBLElBQUksQ0FBQ0csU0FBUyxHQUFHLEVBQUU7RUFDbkIsSUFBSSxDQUFDQyxZQUFZLEdBQUcsS0FBSztFQUN6QixJQUFJLENBQUNDLFdBQVcsR0FBRyxJQUFJO0FBQ3pCOztBQUVBO0FBQ0E7QUFDQVgsSUFBSSxDQUFDWSxTQUFTLENBQUNDLGlCQUFpQixHQUFHLFlBQVk7RUFDN0MsSUFBSSxJQUFJLENBQUNULFFBQVEsRUFBRTtJQUNqQixPQUFPLEtBQUs7RUFDZDtFQUNBLElBQUksSUFBSSxDQUFDQyxhQUFhLEVBQUU7SUFDdEIsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxJQUFJLElBQUksQ0FBQ0UsSUFBSSxFQUFFO0lBQ2IsT0FBTyxLQUFLO0VBQ2Q7RUFDQSxPQUFPLElBQUk7QUFDYixDQUFDOztBQUVEO0FBQ0EsU0FBU08sTUFBTUEsQ0FBQ2IsTUFBTSxFQUFFO0VBQ3RCLE9BQU8sSUFBSUQsSUFBSSxDQUFDO0lBQUVDLE1BQU07SUFBRUcsUUFBUSxFQUFFO0VBQUssQ0FBQyxDQUFDO0FBQzdDOztBQUVBO0FBQ0EsU0FBU1csV0FBV0EsQ0FBQ2QsTUFBTSxFQUFFO0VBQzNCLE9BQU8sSUFBSUQsSUFBSSxDQUFDO0lBQUVDLE1BQU07SUFBRUksYUFBYSxFQUFFO0VBQUssQ0FBQyxDQUFDO0FBQ2xEOztBQUVBO0FBQ0EsU0FBU1csUUFBUUEsQ0FBQ2YsTUFBTSxFQUFFO0VBQ3hCLE9BQU8sSUFBSUQsSUFBSSxDQUFDO0lBQUVDLE1BQU07SUFBRUcsUUFBUSxFQUFFLElBQUk7SUFBRUUsVUFBVSxFQUFFO0VBQUssQ0FBQyxDQUFDO0FBQy9EOztBQUVBO0FBQ0EsU0FBU1csTUFBTUEsQ0FBQ2hCLE1BQU0sRUFBRTtFQUN0QixPQUFPLElBQUlELElBQUksQ0FBQztJQUFFQyxNQUFNO0lBQUVHLFFBQVEsRUFBRTtFQUFNLENBQUMsQ0FBQztBQUM5Qzs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxTQUFTYyx5QkFBeUJBLENBQUNqQixNQUFNLEVBQUVrQixPQUFPLEVBQUU7RUFDbEQsTUFBTUMsVUFBVSxHQUFHbkIsTUFBTSxDQUFDb0IsYUFBYSxHQUFHLENBQUM7RUFDM0MsTUFBTUMsV0FBVyxHQUFHLElBQUlDLElBQUksQ0FBQ0osT0FBTyxhQUFQQSxPQUFPLHVCQUFQQSxPQUFPLENBQUVLLFNBQVMsQ0FBQztFQUNoRCxNQUFNQyxTQUFTLEdBQUcsSUFBSUYsSUFBSSxDQUFDLENBQUM7RUFDNUJFLFNBQVMsQ0FBQ0MsT0FBTyxDQUFDRCxTQUFTLENBQUNFLE9BQU8sQ0FBQyxDQUFDLEdBQUdQLFVBQVUsR0FBRyxJQUFJLENBQUM7RUFDMUQsT0FBT0UsV0FBVyxJQUFJRyxTQUFTO0FBQ2pDO0FBRUEsTUFBTUcsUUFBUSxHQUFHLENBQUMsQ0FBQztBQUNuQixNQUFNQyxvQkFBb0IsR0FBRyxNQUFBQSxDQUFPO0VBQUU1QixNQUFNO0VBQUVrQixPQUFPO0VBQUVXO0FBQWEsQ0FBQyxLQUFLO0VBQ3hFLElBQUksRUFBQzdCLE1BQU0sYUFBTkEsTUFBTSxlQUFOQSxNQUFNLENBQUU4QixrQkFBa0IsR0FBRTtJQUMvQjtFQUNGO0VBQ0FDLFlBQVksQ0FBQ0osUUFBUSxDQUFDRSxZQUFZLENBQUMsQ0FBQztFQUNwQ0YsUUFBUSxDQUFDRSxZQUFZLENBQUMsR0FBR0csVUFBVSxDQUFDLFlBQVk7SUFDOUMsSUFBSTtNQUNGLElBQUksQ0FBQ2QsT0FBTyxFQUFFO1FBQ1osTUFBTWUsS0FBSyxHQUFHLE1BQU0sSUFBQUMsa0JBQVMsRUFBQztVQUM1QkMsTUFBTSxFQUFFRCxrQkFBUyxDQUFDRSxNQUFNLENBQUNDLEdBQUc7VUFDNUJyQyxNQUFNO1VBQ05zQyxJQUFJLEVBQUV6QixNQUFNLENBQUNiLE1BQU0sQ0FBQztVQUNwQnVDLGFBQWEsRUFBRSxLQUFLO1VBQ3BCQyxTQUFTLEVBQUUsVUFBVTtVQUNyQkMsU0FBUyxFQUFFO1lBQUVaO1VBQWEsQ0FBQztVQUMzQmEsV0FBVyxFQUFFO1lBQUVDLEtBQUssRUFBRTtVQUFFO1FBQzFCLENBQUMsQ0FBQztRQUNGLE1BQU07VUFBRUM7UUFBUSxDQUFDLEdBQUcsTUFBTVgsS0FBSyxDQUFDWSxPQUFPLENBQUMsQ0FBQztRQUN6QzNCLE9BQU8sR0FBRzBCLE9BQU8sQ0FBQyxDQUFDLENBQUM7TUFDdEI7TUFDQSxJQUFJLENBQUMzQix5QkFBeUIsQ0FBQ2pCLE1BQU0sRUFBRWtCLE9BQU8sQ0FBQyxJQUFJLENBQUNBLE9BQU8sRUFBRTtRQUMzRDtNQUNGO01BQ0EsTUFBTTRCLFNBQVMsR0FBRzlDLE1BQU0sQ0FBQytDLHdCQUF3QixDQUFDLENBQUM7TUFDbkQsTUFBTSxJQUFJQyxrQkFBUyxDQUNqQmhELE1BQU0sRUFDTmEsTUFBTSxDQUFDYixNQUFNLENBQUMsRUFDZCxVQUFVLEVBQ1Y7UUFBRWlELFFBQVEsRUFBRS9CLE9BQU8sQ0FBQytCO01BQVMsQ0FBQyxFQUM5QjtRQUFFSCxTQUFTLEVBQUVoRCxLQUFLLENBQUNvRCxPQUFPLENBQUNKLFNBQVM7TUFBRSxDQUN4QyxDQUFDLENBQUNELE9BQU8sQ0FBQyxDQUFDO0lBQ2IsQ0FBQyxDQUFDLE9BQU9sRixDQUFDLEVBQUU7TUFDVixJQUFJLENBQUFBLENBQUMsYUFBREEsQ0FBQyx1QkFBREEsQ0FBQyxDQUFFd0YsSUFBSSxNQUFLckQsS0FBSyxDQUFDc0QsS0FBSyxDQUFDQyxnQkFBZ0IsRUFBRTtRQUM1Q0MsY0FBTSxDQUFDQyxLQUFLLENBQUMsbUNBQW1DLEVBQUU1RixDQUFDLENBQUM7TUFDdEQ7SUFDRjtFQUNGLENBQUMsRUFBRSxHQUFHLENBQUM7QUFDVCxDQUFDOztBQUVEO0FBQ0EsTUFBTTZGLHNCQUFzQixHQUFHLGVBQUFBLENBQWdCO0VBQzdDeEQsTUFBTTtFQUNOQyxlQUFlO0VBQ2Y0QixZQUFZO0VBQ1p0QjtBQUNGLENBQUMsRUFBRTtFQUNETixlQUFlLEdBQUdBLGVBQWUsSUFBS0QsTUFBTSxJQUFJQSxNQUFNLENBQUNDLGVBQWdCO0VBQ3ZFLElBQUlBLGVBQWUsRUFBRTtJQUNuQixNQUFNd0QsUUFBUSxHQUFHLE1BQU14RCxlQUFlLENBQUNLLElBQUksQ0FBQytCLEdBQUcsQ0FBQ1IsWUFBWSxDQUFDO0lBQzdELElBQUk0QixRQUFRLEVBQUU7TUFDWixNQUFNQyxVQUFVLEdBQUc1RCxLQUFLLENBQUM3QixNQUFNLENBQUMwRixRQUFRLENBQUNGLFFBQVEsQ0FBQztNQUNsRDdCLG9CQUFvQixDQUFDO1FBQUU1QixNQUFNO1FBQUU2QjtNQUFhLENBQUMsQ0FBQztNQUM5QyxPQUFPK0IsT0FBTyxDQUFDQyxPQUFPLENBQ3BCLElBQUk5RCxJQUFJLENBQUM7UUFDUEMsTUFBTTtRQUNOQyxlQUFlO1FBQ2ZFLFFBQVEsRUFBRSxLQUFLO1FBQ2ZJLGNBQWM7UUFDZEQsSUFBSSxFQUFFb0Q7TUFDUixDQUFDLENBQ0gsQ0FBQztJQUNIO0VBQ0Y7RUFFQSxJQUFJZCxPQUFPO0VBQ1gsSUFBSTVDLE1BQU0sRUFBRTtJQUNWLE1BQU0wQyxXQUFXLEdBQUc7TUFDbEJDLEtBQUssRUFBRSxDQUFDO01BQ1JtQixPQUFPLEVBQUU7SUFDWCxDQUFDO0lBQ0QsTUFBTTVCLFNBQVMsR0FBRzdFLE9BQU8sQ0FBQyxhQUFhLENBQUM7SUFDeEMsTUFBTTRFLEtBQUssR0FBRyxNQUFNQyxTQUFTLENBQUM7TUFDNUJDLE1BQU0sRUFBRUQsU0FBUyxDQUFDRSxNQUFNLENBQUNDLEdBQUc7TUFDNUJyQyxNQUFNO01BQ051QyxhQUFhLEVBQUUsS0FBSztNQUNwQkQsSUFBSSxFQUFFekIsTUFBTSxDQUFDYixNQUFNLENBQUM7TUFDcEJ3QyxTQUFTLEVBQUUsVUFBVTtNQUNyQkMsU0FBUyxFQUFFO1FBQUVaO01BQWEsQ0FBQztNQUMzQmE7SUFDRixDQUFDLENBQUM7SUFDRkUsT0FBTyxHQUFHLENBQUMsTUFBTVgsS0FBSyxDQUFDWSxPQUFPLENBQUMsQ0FBQyxFQUFFRCxPQUFPO0VBQzNDLENBQUMsTUFBTTtJQUNMQSxPQUFPLEdBQUcsQ0FDUixNQUFNLElBQUk5QyxLQUFLLENBQUNpRSxLQUFLLENBQUNqRSxLQUFLLENBQUNrRSxPQUFPLENBQUMsQ0FDakNyQixLQUFLLENBQUMsQ0FBQyxDQUFDLENBQ1JtQixPQUFPLENBQUMsTUFBTSxDQUFDLENBQ2ZHLE9BQU8sQ0FBQyxjQUFjLEVBQUVwQyxZQUFZLENBQUMsQ0FDckNxQyxJQUFJLENBQUM7TUFBRUMsWUFBWSxFQUFFO0lBQUssQ0FBQyxDQUFDLEVBQy9CQyxHQUFHLENBQUNDLEdBQUcsSUFBSUEsR0FBRyxDQUFDQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0VBQzVCO0VBRUEsSUFBSTFCLE9BQU8sQ0FBQ2hFLE1BQU0sS0FBSyxDQUFDLElBQUksQ0FBQ2dFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRTtJQUMvQyxNQUFNLElBQUk5QyxLQUFLLENBQUNzRCxLQUFLLENBQUN0RCxLQUFLLENBQUNzRCxLQUFLLENBQUNtQixxQkFBcUIsRUFBRSx1QkFBdUIsQ0FBQztFQUNuRjtFQUNBLE1BQU1yRCxPQUFPLEdBQUcwQixPQUFPLENBQUMsQ0FBQyxDQUFDO0VBQzFCLE1BQU00QixHQUFHLEdBQUcsSUFBSWxELElBQUksQ0FBQyxDQUFDO0lBQ3BCd0IsU0FBUyxHQUFHNUIsT0FBTyxDQUFDNEIsU0FBUyxHQUFHLElBQUl4QixJQUFJLENBQUNKLE9BQU8sQ0FBQzRCLFNBQVMsQ0FBQzJCLEdBQUcsQ0FBQyxHQUFHdkUsU0FBUztFQUM3RSxJQUFJNEMsU0FBUyxHQUFHMEIsR0FBRyxFQUFFO0lBQ25CLE1BQU0sSUFBSTFFLEtBQUssQ0FBQ3NELEtBQUssQ0FBQ3RELEtBQUssQ0FBQ3NELEtBQUssQ0FBQ21CLHFCQUFxQixFQUFFLDJCQUEyQixDQUFDO0VBQ3ZGO0VBQ0EsTUFBTUYsR0FBRyxHQUFHbkQsT0FBTyxDQUFDWixJQUFJO0VBQ3hCLE9BQU8rRCxHQUFHLENBQUNLLFFBQVE7RUFDbkJMLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxPQUFPO0VBQzFCQSxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUd4QyxZQUFZO0VBQ2xDLElBQUk1QixlQUFlLEVBQUU7SUFDbkJBLGVBQWUsQ0FBQ0ssSUFBSSxDQUFDcUUsR0FBRyxDQUFDOUMsWUFBWSxFQUFFd0MsR0FBRyxDQUFDO0VBQzdDO0VBQ0F6QyxvQkFBb0IsQ0FBQztJQUFFNUIsTUFBTTtJQUFFa0IsT0FBTztJQUFFVztFQUFhLENBQUMsQ0FBQztFQUN2RCxNQUFNK0MsVUFBVSxHQUFHOUUsS0FBSyxDQUFDN0IsTUFBTSxDQUFDMEYsUUFBUSxDQUFDVSxHQUFHLENBQUM7RUFDN0MsT0FBTyxJQUFJdEUsSUFBSSxDQUFDO0lBQ2RDLE1BQU07SUFDTkMsZUFBZTtJQUNmRSxRQUFRLEVBQUUsS0FBSztJQUNmSSxjQUFjO0lBQ2RELElBQUksRUFBRXNFO0VBQ1IsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELElBQUlDLDRCQUE0QixHQUFHLGVBQUFBLENBQWdCO0VBQUU3RSxNQUFNO0VBQUU2QixZQUFZO0VBQUV0QjtBQUFlLENBQUMsRUFBRTtFQUMzRixJQUFJbUMsV0FBVyxHQUFHO0lBQ2hCQyxLQUFLLEVBQUU7RUFDVCxDQUFDO0VBQ0QsTUFBTVQsU0FBUyxHQUFHN0UsT0FBTyxDQUFDLGFBQWEsQ0FBQztFQUN4QyxJQUFJNEUsS0FBSyxHQUFHLE1BQU1DLFNBQVMsQ0FBQztJQUMxQkMsTUFBTSxFQUFFRCxTQUFTLENBQUNFLE1BQU0sQ0FBQ0MsR0FBRztJQUM1QnJDLE1BQU07SUFDTnVDLGFBQWEsRUFBRSxLQUFLO0lBQ3BCRCxJQUFJLEVBQUV6QixNQUFNLENBQUNiLE1BQU0sQ0FBQztJQUNwQndDLFNBQVMsRUFBRSxPQUFPO0lBQ2xCQyxTQUFTLEVBQUU7TUFBRXFDLGNBQWMsRUFBRWpEO0lBQWEsQ0FBQztJQUMzQ2E7RUFDRixDQUFDLENBQUM7RUFDRixPQUFPVCxLQUFLLENBQUNZLE9BQU8sQ0FBQyxDQUFDLENBQUNrQyxJQUFJLENBQUNDLFFBQVEsSUFBSTtJQUN0QyxJQUFJcEMsT0FBTyxHQUFHb0MsUUFBUSxDQUFDcEMsT0FBTztJQUM5QixJQUFJQSxPQUFPLENBQUNoRSxNQUFNLEtBQUssQ0FBQyxFQUFFO01BQ3hCLE1BQU0sSUFBSWtCLEtBQUssQ0FBQ3NELEtBQUssQ0FBQ3RELEtBQUssQ0FBQ3NELEtBQUssQ0FBQ21CLHFCQUFxQixFQUFFLDhCQUE4QixDQUFDO0lBQzFGO0lBQ0EsTUFBTUYsR0FBRyxHQUFHekIsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUN0QnlCLEdBQUcsQ0FBQzdCLFNBQVMsR0FBRyxPQUFPO0lBQ3ZCLE1BQU1vQyxVQUFVLEdBQUc5RSxLQUFLLENBQUM3QixNQUFNLENBQUMwRixRQUFRLENBQUNVLEdBQUcsQ0FBQztJQUM3QyxPQUFPLElBQUl0RSxJQUFJLENBQUM7TUFDZEMsTUFBTTtNQUNORyxRQUFRLEVBQUUsS0FBSztNQUNmSSxjQUFjO01BQ2RELElBQUksRUFBRXNFO0lBQ1IsQ0FBQyxDQUFDO0VBQ0osQ0FBQyxDQUFDO0FBQ0osQ0FBQzs7QUFFRDtBQUNBN0UsSUFBSSxDQUFDWSxTQUFTLENBQUNzRSxZQUFZLEdBQUcsWUFBWTtFQUN4QyxJQUFJLElBQUksQ0FBQzlFLFFBQVEsSUFBSSxJQUFJLENBQUNDLGFBQWEsSUFBSSxDQUFDLElBQUksQ0FBQ0UsSUFBSSxFQUFFO0lBQ3JELE9BQU9zRCxPQUFPLENBQUNDLE9BQU8sQ0FBQyxFQUFFLENBQUM7RUFDNUI7RUFDQSxJQUFJLElBQUksQ0FBQ3BELFlBQVksRUFBRTtJQUNyQixPQUFPbUQsT0FBTyxDQUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDckQsU0FBUyxDQUFDO0VBQ3hDO0VBQ0EsSUFBSSxJQUFJLENBQUNFLFdBQVcsRUFBRTtJQUNwQixPQUFPLElBQUksQ0FBQ0EsV0FBVztFQUN6QjtFQUNBLElBQUksQ0FBQ0EsV0FBVyxHQUFHLElBQUksQ0FBQ3dFLFVBQVUsQ0FBQyxDQUFDO0VBQ3BDLE9BQU8sSUFBSSxDQUFDeEUsV0FBVztBQUN6QixDQUFDO0FBRURYLElBQUksQ0FBQ1ksU0FBUyxDQUFDd0UsZUFBZSxHQUFHLGtCQUFrQjtFQUNqRDtFQUNBLE1BQU12QyxPQUFPLEdBQUcsRUFBRTtFQUNsQixJQUFJLElBQUksQ0FBQzVDLE1BQU0sRUFBRTtJQUNmLE1BQU15QyxTQUFTLEdBQUc7TUFDaEIyQyxLQUFLLEVBQUU7UUFDTEMsTUFBTSxFQUFFLFNBQVM7UUFDakI3QyxTQUFTLEVBQUUsT0FBTztRQUNsQlMsUUFBUSxFQUFFLElBQUksQ0FBQzNDLElBQUksQ0FBQ2dGO01BQ3RCO0lBQ0YsQ0FBQztJQUNELE1BQU1wRCxTQUFTLEdBQUc3RSxPQUFPLENBQUMsYUFBYSxDQUFDO0lBQ3hDLE1BQU00RSxLQUFLLEdBQUcsTUFBTUMsU0FBUyxDQUFDO01BQzVCQyxNQUFNLEVBQUVELFNBQVMsQ0FBQ0UsTUFBTSxDQUFDOEIsSUFBSTtNQUM3QjNCLGFBQWEsRUFBRSxLQUFLO01BQ3BCdkMsTUFBTSxFQUFFLElBQUksQ0FBQ0EsTUFBTTtNQUNuQnNDLElBQUksRUFBRXpCLE1BQU0sQ0FBQyxJQUFJLENBQUNiLE1BQU0sQ0FBQztNQUN6QndDLFNBQVMsRUFBRSxPQUFPO01BQ2xCQztJQUNGLENBQUMsQ0FBQztJQUNGLE1BQU1SLEtBQUssQ0FBQ3NELElBQUksQ0FBQ0MsTUFBTSxJQUFJNUMsT0FBTyxDQUFDcEUsSUFBSSxDQUFDZ0gsTUFBTSxDQUFDLENBQUM7RUFDbEQsQ0FBQyxNQUFNO0lBQ0wsTUFBTSxJQUFJMUYsS0FBSyxDQUFDaUUsS0FBSyxDQUFDakUsS0FBSyxDQUFDMkYsSUFBSSxDQUFDLENBQzlCeEIsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMzRCxJQUFJLENBQUMsQ0FDM0JpRixJQUFJLENBQUNDLE1BQU0sSUFBSTVDLE9BQU8sQ0FBQ3BFLElBQUksQ0FBQ2dILE1BQU0sQ0FBQ2xCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRTtNQUFFSCxZQUFZLEVBQUU7SUFBSyxDQUFDLENBQUM7RUFDMUU7RUFDQSxPQUFPdkIsT0FBTztBQUNoQixDQUFDOztBQUVEO0FBQ0E3QyxJQUFJLENBQUNZLFNBQVMsQ0FBQ3VFLFVBQVUsR0FBRyxrQkFBa0I7RUFDNUMsSUFBSSxJQUFJLENBQUNqRixlQUFlLEVBQUU7SUFDeEIsTUFBTXlGLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQ3pGLGVBQWUsQ0FBQzBGLElBQUksQ0FBQ3RELEdBQUcsQ0FBQyxJQUFJLENBQUMvQixJQUFJLENBQUNnRixFQUFFLENBQUM7SUFDckUsSUFBSUksV0FBVyxJQUFJLElBQUksRUFBRTtNQUN2QixJQUFJLENBQUNqRixZQUFZLEdBQUcsSUFBSTtNQUN4QixJQUFJLENBQUNELFNBQVMsR0FBR2tGLFdBQVc7TUFDNUIsT0FBT0EsV0FBVztJQUNwQjtFQUNGOztFQUVBO0VBQ0EsTUFBTTlDLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQ3VDLGVBQWUsQ0FBQyxDQUFDO0VBQzVDLElBQUksQ0FBQ3ZDLE9BQU8sQ0FBQ2hFLE1BQU0sRUFBRTtJQUNuQixJQUFJLENBQUM0QixTQUFTLEdBQUcsRUFBRTtJQUNuQixJQUFJLENBQUNDLFlBQVksR0FBRyxJQUFJO0lBQ3hCLElBQUksQ0FBQ0MsV0FBVyxHQUFHLElBQUk7SUFFdkIsSUFBSSxDQUFDa0YsVUFBVSxDQUFDLENBQUM7SUFDakIsT0FBTyxJQUFJLENBQUNwRixTQUFTO0VBQ3ZCO0VBRUEsTUFBTXFGLFFBQVEsR0FBR2pELE9BQU8sQ0FBQ2tELE1BQU0sQ0FDN0IsQ0FBQ0MsQ0FBQyxFQUFFaEksQ0FBQyxLQUFLO0lBQ1JnSSxDQUFDLENBQUNDLEtBQUssQ0FBQ3hILElBQUksQ0FBQ1QsQ0FBQyxDQUFDa0ksSUFBSSxDQUFDO0lBQ3BCRixDQUFDLENBQUNHLEdBQUcsQ0FBQzFILElBQUksQ0FBQ1QsQ0FBQyxDQUFDa0YsUUFBUSxDQUFDO0lBQ3RCLE9BQU84QyxDQUFDO0VBQ1YsQ0FBQyxFQUNEO0lBQUVHLEdBQUcsRUFBRSxFQUFFO0lBQUVGLEtBQUssRUFBRTtFQUFHLENBQ3ZCLENBQUM7O0VBRUQ7RUFDQSxNQUFNRyxTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUNDLDJCQUEyQixDQUFDUCxRQUFRLENBQUNLLEdBQUcsRUFBRUwsUUFBUSxDQUFDRyxLQUFLLENBQUM7RUFDdEYsSUFBSSxDQUFDeEYsU0FBUyxHQUFHMkYsU0FBUyxDQUFDL0IsR0FBRyxDQUFDckcsQ0FBQyxJQUFJO0lBQ2xDLE9BQU8sT0FBTyxHQUFHQSxDQUFDO0VBQ3BCLENBQUMsQ0FBQztFQUNGLElBQUksQ0FBQzBDLFlBQVksR0FBRyxJQUFJO0VBQ3hCLElBQUksQ0FBQ0MsV0FBVyxHQUFHLElBQUk7RUFDdkIsSUFBSSxDQUFDa0YsVUFBVSxDQUFDLENBQUM7RUFDakIsT0FBTyxJQUFJLENBQUNwRixTQUFTO0FBQ3ZCLENBQUM7QUFFRFQsSUFBSSxDQUFDWSxTQUFTLENBQUNpRixVQUFVLEdBQUcsWUFBWTtFQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFDM0YsZUFBZSxFQUFFO0lBQ3pCLE9BQU8sS0FBSztFQUNkO0VBQ0EsSUFBSSxDQUFDQSxlQUFlLENBQUMwRixJQUFJLENBQUNoQixHQUFHLENBQUMsSUFBSSxDQUFDckUsSUFBSSxDQUFDZ0YsRUFBRSxFQUFFZSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUM3RixTQUFTLENBQUMsQ0FBQztFQUNyRSxPQUFPLElBQUk7QUFDYixDQUFDO0FBRURULElBQUksQ0FBQ1ksU0FBUyxDQUFDMkYsY0FBYyxHQUFHLFVBQVV6RSxZQUFZLEVBQUU7RUFDdEQsSUFBSSxDQUFDLElBQUksQ0FBQzVCLGVBQWUsRUFBRTtJQUN6QixPQUFPLEtBQUs7RUFDZDtFQUNBLElBQUksQ0FBQ0EsZUFBZSxDQUFDMEYsSUFBSSxDQUFDWSxHQUFHLENBQUMsSUFBSSxDQUFDakcsSUFBSSxDQUFDZ0YsRUFBRSxDQUFDO0VBQzNDLElBQUksQ0FBQ3JGLGVBQWUsQ0FBQ0ssSUFBSSxDQUFDaUcsR0FBRyxDQUFDMUUsWUFBWSxDQUFDO0VBQzNDLE9BQU8sSUFBSTtBQUNiLENBQUM7QUFFRDlCLElBQUksQ0FBQ1ksU0FBUyxDQUFDNkYsYUFBYSxHQUFHLGdCQUFnQkMsR0FBRyxFQUFFO0VBQ2xELE1BQU03RCxPQUFPLEdBQUcsRUFBRTtFQUNsQjtFQUNBLElBQUksQ0FBQyxJQUFJLENBQUM1QyxNQUFNLEVBQUU7SUFDaEIsTUFBTSxJQUFJRixLQUFLLENBQUNpRSxLQUFLLENBQUNqRSxLQUFLLENBQUMyRixJQUFJLENBQUMsQ0FDOUJpQixXQUFXLENBQ1YsT0FBTyxFQUNQRCxHQUFHLENBQUNyQyxHQUFHLENBQUNrQixFQUFFLElBQUk7TUFDWixNQUFNSyxJQUFJLEdBQUcsSUFBSTdGLEtBQUssQ0FBQzdCLE1BQU0sQ0FBQzZCLEtBQUssQ0FBQzJGLElBQUksQ0FBQztNQUN6Q0UsSUFBSSxDQUFDTCxFQUFFLEdBQUdBLEVBQUU7TUFDWixPQUFPSyxJQUFJO0lBQ2IsQ0FBQyxDQUNILENBQUMsQ0FDQUosSUFBSSxDQUFDQyxNQUFNLElBQUk1QyxPQUFPLENBQUNwRSxJQUFJLENBQUNnSCxNQUFNLENBQUNsQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUU7TUFBRUgsWUFBWSxFQUFFO0lBQUssQ0FBQyxDQUFDO0VBQzFFLENBQUMsTUFBTTtJQUNMLE1BQU13QyxLQUFLLEdBQUdGLEdBQUcsQ0FBQ3JDLEdBQUcsQ0FBQ2tCLEVBQUUsSUFBSTtNQUMxQixPQUFPO1FBQ0xELE1BQU0sRUFBRSxTQUFTO1FBQ2pCN0MsU0FBUyxFQUFFLE9BQU87UUFDbEJTLFFBQVEsRUFBRXFDO01BQ1osQ0FBQztJQUNILENBQUMsQ0FBQztJQUNGLE1BQU03QyxTQUFTLEdBQUc7TUFBRWtFLEtBQUssRUFBRTtRQUFFQyxHQUFHLEVBQUVEO01BQU07SUFBRSxDQUFDO0lBQzNDLE1BQU16RSxTQUFTLEdBQUc3RSxPQUFPLENBQUMsYUFBYSxDQUFDO0lBQ3hDLE1BQU00RSxLQUFLLEdBQUcsTUFBTUMsU0FBUyxDQUFDO01BQzVCQyxNQUFNLEVBQUVELFNBQVMsQ0FBQ0UsTUFBTSxDQUFDOEIsSUFBSTtNQUM3QmxFLE1BQU0sRUFBRSxJQUFJLENBQUNBLE1BQU07TUFDbkJ1QyxhQUFhLEVBQUUsS0FBSztNQUNwQkQsSUFBSSxFQUFFekIsTUFBTSxDQUFDLElBQUksQ0FBQ2IsTUFBTSxDQUFDO01BQ3pCd0MsU0FBUyxFQUFFLE9BQU87TUFDbEJDO0lBQ0YsQ0FBQyxDQUFDO0lBQ0YsTUFBTVIsS0FBSyxDQUFDc0QsSUFBSSxDQUFDQyxNQUFNLElBQUk1QyxPQUFPLENBQUNwRSxJQUFJLENBQUNnSCxNQUFNLENBQUMsQ0FBQztFQUNsRDtFQUNBLE9BQU81QyxPQUFPO0FBQ2hCLENBQUM7O0FBRUQ7QUFDQTdDLElBQUksQ0FBQ1ksU0FBUyxDQUFDeUYsMkJBQTJCLEdBQUcsVUFBVVMsT0FBTyxFQUFFYixLQUFLLEdBQUcsRUFBRSxFQUFFYyxZQUFZLEdBQUcsQ0FBQyxDQUFDLEVBQUU7RUFDN0YsTUFBTUwsR0FBRyxHQUFHSSxPQUFPLENBQUN4SSxNQUFNLENBQUMwSSxNQUFNLElBQUk7SUFDbkMsTUFBTUMsVUFBVSxHQUFHRixZQUFZLENBQUNDLE1BQU0sQ0FBQyxLQUFLLElBQUk7SUFDaERELFlBQVksQ0FBQ0MsTUFBTSxDQUFDLEdBQUcsSUFBSTtJQUMzQixPQUFPQyxVQUFVO0VBQ25CLENBQUMsQ0FBQzs7RUFFRjtFQUNBLElBQUlQLEdBQUcsQ0FBQzdILE1BQU0sSUFBSSxDQUFDLEVBQUU7SUFDbkIsT0FBT2dGLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsR0FBRyxJQUFJb0QsR0FBRyxDQUFDakIsS0FBSyxDQUFDLENBQUMsQ0FBQztFQUM3QztFQUVBLE9BQU8sSUFBSSxDQUFDUSxhQUFhLENBQUNDLEdBQUcsQ0FBQyxDQUMzQjFCLElBQUksQ0FBQ25DLE9BQU8sSUFBSTtJQUNmO0lBQ0EsSUFBSSxDQUFDQSxPQUFPLENBQUNoRSxNQUFNLEVBQUU7TUFDbkIsT0FBT2dGLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDbUMsS0FBSyxDQUFDO0lBQy9CO0lBQ0E7SUFDQSxNQUFNa0IsU0FBUyxHQUFHdEUsT0FBTyxDQUFDa0QsTUFBTSxDQUM5QixDQUFDcUIsSUFBSSxFQUFFeEIsSUFBSSxLQUFLO01BQ2R3QixJQUFJLENBQUNuQixLQUFLLENBQUN4SCxJQUFJLENBQUNtSCxJQUFJLENBQUNNLElBQUksQ0FBQztNQUMxQmtCLElBQUksQ0FBQ2pCLEdBQUcsQ0FBQzFILElBQUksQ0FBQ21ILElBQUksQ0FBQzFDLFFBQVEsQ0FBQztNQUM1QixPQUFPa0UsSUFBSTtJQUNiLENBQUMsRUFDRDtNQUFFakIsR0FBRyxFQUFFLEVBQUU7TUFBRUYsS0FBSyxFQUFFO0lBQUcsQ0FDdkIsQ0FBQztJQUNEO0lBQ0FBLEtBQUssR0FBR0EsS0FBSyxDQUFDb0IsTUFBTSxDQUFDRixTQUFTLENBQUNsQixLQUFLLENBQUM7SUFDckM7SUFDQSxPQUFPLElBQUksQ0FBQ0ksMkJBQTJCLENBQUNjLFNBQVMsQ0FBQ2hCLEdBQUcsRUFBRUYsS0FBSyxFQUFFYyxZQUFZLENBQUM7RUFDN0UsQ0FBQyxDQUFDLENBQ0QvQixJQUFJLENBQUNpQixLQUFLLElBQUk7SUFDYixPQUFPcEMsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUlvRCxHQUFHLENBQUNqQixLQUFLLENBQUMsQ0FBQyxDQUFDO0VBQzdDLENBQUMsQ0FBQztBQUNOLENBQUM7QUFFRCxNQUFNcUIscUJBQXFCLEdBQUdBLENBQUNySCxNQUFNLEVBQUVzSCxRQUFRLEtBQUs7RUFDbEQsTUFBTUMsU0FBUyxHQUFHdEosTUFBTSxDQUFDQyxJQUFJLENBQUNvSixRQUFRLENBQUM7RUFDdkMsTUFBTXJGLEtBQUssR0FBR3NGLFNBQVMsQ0FDcEJ6QixNQUFNLENBQUMsQ0FBQ3FCLElBQUksRUFBRUssUUFBUSxLQUFLO0lBQzFCLElBQUksQ0FBQ0YsUUFBUSxDQUFDRSxRQUFRLENBQUMsSUFBS0YsUUFBUSxJQUFJLENBQUNBLFFBQVEsQ0FBQ0UsUUFBUSxDQUFDLENBQUNsQyxFQUFHLEVBQUU7TUFDL0QsT0FBTzZCLElBQUk7SUFDYjtJQUNBLE1BQU1NLFFBQVEsR0FBRyxZQUFZRCxRQUFRLEtBQUs7SUFDMUMsTUFBTXZGLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDaEJBLEtBQUssQ0FBQ3dGLFFBQVEsQ0FBQyxHQUFHSCxRQUFRLENBQUNFLFFBQVEsQ0FBQyxDQUFDbEMsRUFBRTtJQUN2QzZCLElBQUksQ0FBQzNJLElBQUksQ0FBQ3lELEtBQUssQ0FBQztJQUNoQixPQUFPa0YsSUFBSTtFQUNiLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FDTDlJLE1BQU0sQ0FBQ3FKLENBQUMsSUFBSTtJQUNYLE9BQU8sT0FBT0EsQ0FBQyxLQUFLLFdBQVc7RUFDakMsQ0FBQyxDQUFDO0VBRUosT0FBT3pGLEtBQUssQ0FBQ3JELE1BQU0sR0FBRyxDQUFDLEdBQ25Cb0IsTUFBTSxDQUFDMkgsUUFBUSxDQUFDekQsSUFBSSxDQUFDLE9BQU8sRUFBRTtJQUFFMEQsR0FBRyxFQUFFM0Y7RUFBTSxDQUFDLEVBQUU7SUFBRVUsS0FBSyxFQUFFO0VBQUUsQ0FBQyxDQUFDLEdBQzNEaUIsT0FBTyxDQUFDQyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQ3pCLENBQUM7QUFFRCxNQUFNZ0Usa0JBQWtCLEdBQUdBLENBQUNQLFFBQVEsRUFBRVEsWUFBWSxLQUFLO0VBQ3JELElBQUksQ0FBQ0EsWUFBWSxFQUFFLE9BQU87SUFBRUQsa0JBQWtCLEVBQUUsSUFBSTtJQUFFRSxlQUFlLEVBQUVUO0VBQVMsQ0FBQztFQUNqRixNQUFNUyxlQUFlLEdBQUcsQ0FBQyxDQUFDO0VBQzFCOUosTUFBTSxDQUFDQyxJQUFJLENBQUNvSixRQUFRLENBQUMsQ0FBQ3pJLE9BQU8sQ0FBQzJJLFFBQVEsSUFBSTtJQUN4QztJQUNBLElBQUlBLFFBQVEsS0FBSyxXQUFXLEVBQUU7SUFDOUIsTUFBTVEsWUFBWSxHQUFHVixRQUFRLENBQUNFLFFBQVEsQ0FBQztJQUN2QyxNQUFNUyxvQkFBb0IsR0FBR0gsWUFBWSxDQUFDTixRQUFRLENBQUM7SUFDbkQsSUFBSSxDQUFDLElBQUFVLHVCQUFpQixFQUFDRixZQUFZLEVBQUVDLG9CQUFvQixDQUFDLEVBQUU7TUFDMURGLGVBQWUsQ0FBQ1AsUUFBUSxDQUFDLEdBQUdRLFlBQVk7SUFDMUM7RUFDRixDQUFDLENBQUM7RUFDRixNQUFNSCxrQkFBa0IsR0FBRzVKLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDNkosZUFBZSxDQUFDLENBQUNuSixNQUFNLEtBQUssQ0FBQztFQUNwRSxPQUFPO0lBQUVpSixrQkFBa0I7SUFBRUU7RUFBZ0IsQ0FBQztBQUNoRCxDQUFDO0FBRUQsTUFBTUksaURBQWlELEdBQUdBLENBQ3hEQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQ1JkLFFBQVEsR0FBRyxDQUFDLENBQUMsRUFDYlEsWUFBWSxHQUFHLENBQUMsQ0FBQyxFQUNqQjlILE1BQU0sS0FDSDtFQUNILE1BQU1xSSxrQkFBa0IsR0FBR3BLLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDNEosWUFBWSxDQUFDLENBQUMxRCxHQUFHLENBQUNvRCxRQUFRLEtBQUs7SUFDcEV2QixJQUFJLEVBQUV1QixRQUFRO0lBQ2RjLE9BQU8sRUFBRXRJLE1BQU0sQ0FBQ3VJLGVBQWUsQ0FBQ0MsdUJBQXVCLENBQUNoQixRQUFRLENBQUMsQ0FBQ2M7RUFDcEUsQ0FBQyxDQUFDLENBQUM7RUFFSCxNQUFNRyx3QkFBd0IsR0FBR0osa0JBQWtCLENBQUNLLElBQUksQ0FDdERsQixRQUFRLElBQ05BLFFBQVEsSUFBSUEsUUFBUSxDQUFDYyxPQUFPLElBQUlkLFFBQVEsQ0FBQ2MsT0FBTyxDQUFDSyxNQUFNLEtBQUssTUFBTSxJQUFJckIsUUFBUSxDQUFDRSxRQUFRLENBQUN2QixJQUFJLENBQ2hHLENBQUM7O0VBRUQ7RUFDQTtFQUNBO0VBQ0EsSUFBSXdDLHdCQUF3QixFQUFFO0lBQzVCO0VBQ0Y7RUFFQSxNQUFNRyx5QkFBeUIsR0FBRyxFQUFFO0VBQ3BDLE1BQU1DLHVDQUF1QyxHQUFHUixrQkFBa0IsQ0FBQ0ssSUFBSSxDQUFDbEIsUUFBUSxJQUFJO0lBQ2xGLElBQUltQixNQUFNLEdBQUduQixRQUFRLENBQUNjLE9BQU8sQ0FBQ0ssTUFBTTtJQUNwQyxJQUFJLE9BQU9BLE1BQU0sS0FBSyxVQUFVLEVBQUU7TUFDaEMsTUFBTUcsYUFBYSxHQUFHO1FBQ3BCQyxFQUFFLEVBQUVYLEdBQUcsQ0FBQ3BJLE1BQU0sQ0FBQytJLEVBQUU7UUFDakJ6SSxJQUFJLEVBQUU4SCxHQUFHLENBQUM5RixJQUFJLENBQUNoQyxJQUFJO1FBQ25CTyxNQUFNLEVBQUV1SCxHQUFHLENBQUM5RixJQUFJLENBQUNuQztNQUNuQixDQUFDO01BQ0R3SSxNQUFNLEdBQUdBLE1BQU0sQ0FBQ2pKLElBQUksQ0FBQzhILFFBQVEsQ0FBQ2MsT0FBTyxFQUFFUSxhQUFhLEVBQUVoQixZQUFZLENBQUNOLFFBQVEsQ0FBQ3ZCLElBQUksQ0FBQyxDQUFDO0lBQ3BGO0lBQ0EsSUFBSTBDLE1BQU0sS0FBSyxZQUFZLEVBQUU7TUFDM0IsSUFBSXJCLFFBQVEsQ0FBQ0UsUUFBUSxDQUFDdkIsSUFBSSxDQUFDLEVBQUU7UUFDM0IsT0FBTyxJQUFJO01BQ2IsQ0FBQyxNQUFNO1FBQ0w7UUFDQTJDLHlCQUF5QixDQUFDcEssSUFBSSxDQUFDZ0osUUFBUSxDQUFDdkIsSUFBSSxDQUFDO01BQy9DO0lBQ0Y7RUFDRixDQUFDLENBQUM7RUFDRixJQUFJNEMsdUNBQXVDLElBQUksQ0FBQ0QseUJBQXlCLENBQUNoSyxNQUFNLEVBQUU7SUFDaEY7RUFDRjtFQUVBLE1BQU0sSUFBSWtCLEtBQUssQ0FBQ3NELEtBQUssQ0FDbkJ0RCxLQUFLLENBQUNzRCxLQUFLLENBQUM0RixXQUFXLEVBQ3ZCLCtCQUErQkoseUJBQXlCLENBQUNLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFDcEUsQ0FBQztBQUNILENBQUM7O0FBRUQ7QUFDQSxNQUFNQyx3QkFBd0IsR0FBRyxNQUFBQSxDQUFPNUIsUUFBUSxFQUFFYyxHQUFHLEVBQUVlLFNBQVMsS0FBSztFQUNuRSxJQUFJN0ksSUFBSTtFQUNSLElBQUk2SSxTQUFTLEVBQUU7SUFDYjdJLElBQUksR0FBR1IsS0FBSyxDQUFDc0osSUFBSSxDQUFDekYsUUFBUSxDQUFBakYsYUFBQTtNQUFHOEQsU0FBUyxFQUFFO0lBQU8sR0FBSzJHLFNBQVMsQ0FBRSxDQUFDO0lBQ2hFO0VBQ0YsQ0FBQyxNQUFNLElBQ0pmLEdBQUcsQ0FBQzlGLElBQUksSUFDUDhGLEdBQUcsQ0FBQzlGLElBQUksQ0FBQ2hDLElBQUksSUFDYixPQUFPOEgsR0FBRyxDQUFDaUIsU0FBUyxLQUFLLFVBQVUsSUFDbkNqQixHQUFHLENBQUNpQixTQUFTLENBQUMsQ0FBQyxLQUFLakIsR0FBRyxDQUFDOUYsSUFBSSxDQUFDaEMsSUFBSSxDQUFDZ0YsRUFBRSxJQUNyQzhDLEdBQUcsQ0FBQzlGLElBQUksSUFBSThGLEdBQUcsQ0FBQzlGLElBQUksQ0FBQ25DLFFBQVEsSUFBSSxPQUFPaUksR0FBRyxDQUFDaUIsU0FBUyxLQUFLLFVBQVUsSUFBSWpCLEdBQUcsQ0FBQ2lCLFNBQVMsQ0FBQyxDQUFFLEVBQ3pGO0lBQ0EvSSxJQUFJLEdBQUcsSUFBSVIsS0FBSyxDQUFDc0osSUFBSSxDQUFDLENBQUM7SUFDdkI5SSxJQUFJLENBQUNnRixFQUFFLEdBQUc4QyxHQUFHLENBQUM5RixJQUFJLENBQUNuQyxRQUFRLEdBQUdpSSxHQUFHLENBQUNpQixTQUFTLENBQUMsQ0FBQyxHQUFHakIsR0FBRyxDQUFDOUYsSUFBSSxDQUFDaEMsSUFBSSxDQUFDZ0YsRUFBRTtJQUNoRSxNQUFNaEYsSUFBSSxDQUFDZ0osS0FBSyxDQUFDO01BQUVuRixZQUFZLEVBQUU7SUFBSyxDQUFDLENBQUM7RUFDMUM7RUFFQSxNQUFNO0lBQUVvRjtFQUFjLENBQUMsR0FBR25CLEdBQUcsQ0FBQ29CLGlCQUFpQixDQUFDLENBQUM7RUFDakQsTUFBTVYsYUFBYSxHQUFHLElBQUFXLDBCQUFnQixFQUFDdkosU0FBUyxFQUFFa0ksR0FBRyxDQUFDOUYsSUFBSSxFQUFFaUgsYUFBYSxFQUFFakosSUFBSSxFQUFFOEgsR0FBRyxDQUFDcEksTUFBTSxDQUFDO0VBQzVGO0VBQ0E7RUFDQSxNQUFNMEosR0FBRyxHQUFHO0lBQUVwQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQUVxQyxnQkFBZ0IsRUFBRSxDQUFDO0VBQUUsQ0FBQztFQUNsRCxNQUFNQyxRQUFRLEdBQUczTCxNQUFNLENBQUNDLElBQUksQ0FBQ29KLFFBQVEsQ0FBQyxDQUFDdUMsSUFBSSxDQUFDLENBQUM7RUFDN0MsS0FBSyxNQUFNckMsUUFBUSxJQUFJb0MsUUFBUSxFQUFFO0lBQy9CLElBQUl6SCxNQUFNLEdBQUcsRUFBRTtJQUNmLElBQUk7TUFDRixJQUFJbUYsUUFBUSxDQUFDRSxRQUFRLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDL0JrQyxHQUFHLENBQUNwQyxRQUFRLENBQUNFLFFBQVEsQ0FBQyxHQUFHLElBQUk7UUFDN0I7TUFDRjtNQUNBLE1BQU07UUFBRXNDO01BQVUsQ0FBQyxHQUFHMUIsR0FBRyxDQUFDcEksTUFBTSxDQUFDdUksZUFBZSxDQUFDQyx1QkFBdUIsQ0FBQ2hCLFFBQVEsQ0FBQztNQUNsRixNQUFNdUMsWUFBWSxHQUFHLENBQUMzQixHQUFHLENBQUNwSSxNQUFNLENBQUNzQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUVrRixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7TUFDNUQsSUFBSSxDQUFDc0MsU0FBUyxJQUFJQyxZQUFZLENBQUNDLE9BQU8sS0FBSyxLQUFLLEVBQUU7UUFDaEQsTUFBTSxJQUFJbEssS0FBSyxDQUFDc0QsS0FBSyxDQUNuQnRELEtBQUssQ0FBQ3NELEtBQUssQ0FBQzZHLG1CQUFtQixFQUMvQiw0Q0FDRixDQUFDO01BQ0g7TUFDQSxJQUFJQyxnQkFBZ0IsR0FBRyxNQUFNSixTQUFTLENBQUN4QyxRQUFRLENBQUNFLFFBQVEsQ0FBQyxFQUFFWSxHQUFHLEVBQUU5SCxJQUFJLEVBQUV3SSxhQUFhLENBQUM7TUFDcEYzRyxNQUFNLEdBQUcrSCxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUMvSCxNQUFNO01BQ3BEMkcsYUFBYSxDQUFDcUIsV0FBVyxHQUFHaEksTUFBTTtNQUNsQyxJQUFJK0gsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDSixTQUFTLEVBQUU7UUFDbERJLGdCQUFnQixHQUFHLE1BQU1BLGdCQUFnQixDQUFDSixTQUFTLENBQUMsQ0FBQztNQUN2RDtNQUNBLElBQUksQ0FBQ0ksZ0JBQWdCLEVBQUU7UUFDckJSLEdBQUcsQ0FBQ3BDLFFBQVEsQ0FBQ0UsUUFBUSxDQUFDLEdBQUdGLFFBQVEsQ0FBQ0UsUUFBUSxDQUFDO1FBQzNDO01BQ0Y7TUFDQSxJQUFJLENBQUN2SixNQUFNLENBQUNDLElBQUksQ0FBQ2dNLGdCQUFnQixDQUFDLENBQUN0TCxNQUFNLEVBQUU7UUFDekM4SyxHQUFHLENBQUNwQyxRQUFRLENBQUNFLFFBQVEsQ0FBQyxHQUFHRixRQUFRLENBQUNFLFFBQVEsQ0FBQztRQUMzQztNQUNGO01BRUEsSUFBSTBDLGdCQUFnQixDQUFDbEYsUUFBUSxFQUFFO1FBQzdCMEUsR0FBRyxDQUFDQyxnQkFBZ0IsQ0FBQ25DLFFBQVEsQ0FBQyxHQUFHMEMsZ0JBQWdCLENBQUNsRixRQUFRO01BQzVEO01BQ0E7TUFDQSxJQUFJLENBQUNrRixnQkFBZ0IsQ0FBQ0UsU0FBUyxFQUFFO1FBQy9CVixHQUFHLENBQUNwQyxRQUFRLENBQUNFLFFBQVEsQ0FBQyxHQUFHMEMsZ0JBQWdCLENBQUNHLElBQUksSUFBSS9DLFFBQVEsQ0FBQ0UsUUFBUSxDQUFDO01BQ3RFO0lBQ0YsQ0FBQyxDQUFDLE9BQU84QyxHQUFHLEVBQUU7TUFDWixNQUFNM00sQ0FBQyxHQUFHLElBQUE0TSxzQkFBWSxFQUFDRCxHQUFHLEVBQUU7UUFDMUJuSCxJQUFJLEVBQUVyRCxLQUFLLENBQUNzRCxLQUFLLENBQUNvSCxhQUFhO1FBQy9CQyxPQUFPLEVBQUU7TUFDWCxDQUFDLENBQUM7TUFDRixNQUFNQyxVQUFVLEdBQ2R0QyxHQUFHLENBQUM5RixJQUFJLElBQUk4RixHQUFHLENBQUM5RixJQUFJLENBQUNoQyxJQUFJLEdBQUc4SCxHQUFHLENBQUM5RixJQUFJLENBQUNoQyxJQUFJLENBQUNnRixFQUFFLEdBQUc4QyxHQUFHLENBQUN1QyxJQUFJLENBQUMxSCxRQUFRLElBQUkvQyxTQUFTO01BQy9Fb0QsY0FBTSxDQUFDQyxLQUFLLENBQ1YsNEJBQTRCcEIsTUFBTSxRQUFRcUYsUUFBUSxhQUFha0QsVUFBVSxlQUFlLEdBQ3RGRSxJQUFJLENBQUNDLFNBQVMsQ0FBQ2xOLENBQUMsQ0FBQyxFQUNuQjtRQUNFbU4sa0JBQWtCLEVBQUUzSSxNQUFNO1FBQzFCb0IsS0FBSyxFQUFFNUYsQ0FBQztRQUNSMkMsSUFBSSxFQUFFb0ssVUFBVTtRQUNoQmxEO01BQ0YsQ0FDRixDQUFDO01BQ0QsTUFBTTdKLENBQUM7SUFDVDtFQUNGO0VBQ0EsT0FBTytMLEdBQUc7QUFDWixDQUFDO0FBRURxQixNQUFNLENBQUNDLE9BQU8sR0FBRztFQUNmakwsSUFBSTtFQUNKYyxNQUFNO0VBQ05DLFdBQVc7RUFDWEUsTUFBTTtFQUNORCxRQUFRO0VBQ1JFLHlCQUF5QjtFQUN6QnVDLHNCQUFzQjtFQUN0QnFCLDRCQUE0QjtFQUM1QndDLHFCQUFxQjtFQUNyQlEsa0JBQWtCO0VBQ2xCTSxpREFBaUQ7RUFDakRlO0FBQ0YsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==