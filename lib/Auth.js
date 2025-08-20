"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _logger = require("./logger");
var _lruCache = require("lru-cache");
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _RestWrite = _interopRequireDefault(require("./RestWrite"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
const throttle = new _lruCache.LRUCache({
  max: 10000,
  ttl: 500
});
/**
 * Checks whether session should be updated based on last update time & session length.
 */
function shouldUpdateSessionExpiry(config, session) {
  const resetAfter = config.sessionLength / 2;
  const lastUpdated = new Date(session?.updatedAt);
  const skipRange = new Date();
  skipRange.setTime(skipRange.getTime() - resetAfter * 1000);
  return lastUpdated <= skipRange;
}
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!config?.extendSessionOnUse) {
    return;
  }
  if (throttle.get(sessionToken)) {
    return;
  }
  throttle.set(sessionToken, true);
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
    if (e?.code !== Parse.Error.OBJECT_NOT_FOUND) {
      _logger.logger.error('Could not update session expiry: ', e);
    }
  }
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
  if (typeof obj['objectId'] === 'string' && obj['objectId'].startsWith('role:')) {
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Invalid object ID.');
  }
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
const findUsersWithAuthData = async (config, authData, beforeFind) => {
  const providers = Object.keys(authData);
  const queries = await Promise.all(providers.map(async provider => {
    const providerAuthData = authData[provider];
    const adapter = config.authDataManager.getValidatorForProvider(provider)?.adapter;
    if (beforeFind && typeof adapter?.beforeFind === 'function') {
      await adapter.beforeFind(providerAuthData);
    }
    if (!providerAuthData?.id) {
      return null;
    }
    return {
      [`authData.${provider}.id`]: providerAuthData.id
    };
  }));

  // Filter out null queries
  const validQueries = queries.filter(query => query !== null);
  if (!validQueries.length) {
    return [];
  }

  // Perform database query
  return config.database.find('_User', {
    $or: validQueries
  }, {
    limit: 2
  });
};
const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) {
    return {
      hasMutatedAuthData: true,
      mutatedAuthData: authData
    };
  }
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') {
      return;
    }
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
    user = Parse.User.fromJSON({
      className: '_User',
      ...foundUser
    });
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
      } = req.config.authDataManager.getValidatorForProvider(provider) || {};
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX2xydUNhY2hlIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5IiwidGhyb3R0bGUiLCJMUlUiLCJtYXgiLCJ0dGwiLCJzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5Iiwic2Vzc2lvbiIsInJlc2V0QWZ0ZXIiLCJzZXNzaW9uTGVuZ3RoIiwibGFzdFVwZGF0ZWQiLCJEYXRlIiwidXBkYXRlZEF0Iiwic2tpcFJhbmdlIiwic2V0VGltZSIsImdldFRpbWUiLCJyZW5ld1Nlc3Npb25JZk5lZWRlZCIsInNlc3Npb25Ub2tlbiIsImV4dGVuZFNlc3Npb25PblVzZSIsImdldCIsInNldCIsInF1ZXJ5IiwiUmVzdFF1ZXJ5IiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsInJ1bkJlZm9yZUZpbmQiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImxpbWl0IiwicmVzdWx0cyIsImV4ZWN1dGUiLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJSZXN0V3JpdGUiLCJvYmplY3RJZCIsIl9lbmNvZGUiLCJjb2RlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibG9nZ2VyIiwiZXJyb3IiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJQcm9taXNlIiwicmVzb2x2ZSIsImluY2x1ZGUiLCJRdWVyeSIsIlNlc3Npb24iLCJlcXVhbFRvIiwiZmluZCIsInVzZU1hc3RlcktleSIsIm1hcCIsIm9iaiIsInRvSlNPTiIsImxlbmd0aCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsImlzbyIsInN0YXJ0c1dpdGgiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwiX3Nlc3Npb25fdG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwidXNlcnMiLCJfX3R5cGUiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJjbGVhclJvbGVDYWNoZSIsImRlbCIsImdldFJvbGVzQnlJZHMiLCJpbnMiLCJjb250YWluZWRJbiIsInJvbGVzIiwiJGluIiwicm9sZUlEcyIsInF1ZXJpZWRSb2xlcyIsImZpbHRlciIsInJvbGVJRCIsIndhc1F1ZXJpZWQiLCJTZXQiLCJyZXN1bHRNYXAiLCJtZW1vIiwiY29uY2F0IiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwiYXV0aERhdGEiLCJiZWZvcmVGaW5kIiwicHJvdmlkZXJzIiwia2V5cyIsInF1ZXJpZXMiLCJhbGwiLCJwcm92aWRlciIsInByb3ZpZGVyQXV0aERhdGEiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJ2YWxpZFF1ZXJpZXMiLCJkYXRhYmFzZSIsIiRvciIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImZvckVhY2giLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsImlzRGVlcFN0cmljdEVxdWFsIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsInJlcSIsInNhdmVkVXNlclByb3ZpZGVycyIsImhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciIsInNvbWUiLCJwb2xpY3kiLCJhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kIiwiaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIiwicmVxdWVzdE9iamVjdCIsImlwIiwiY2FsbCIsIk9USEVSX0NBVVNFIiwiam9pbiIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsImZvdW5kVXNlciIsIlVzZXIiLCJnZXRVc2VySWQiLCJmZXRjaCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsImdldFJlcXVlc3RPYmplY3QiLCJhY2MiLCJhdXRoRGF0YVJlc3BvbnNlIiwiYXV0aEtleXMiLCJzb3J0IiwidmFsaWRhdG9yIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwidHJpZ2dlck5hbWUiLCJkb05vdFNhdmUiLCJzYXZlIiwiZXJyIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VyU3RyaW5nIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJhdXRoZW50aWNhdGlvblN0ZXAiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL0F1dGguanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZ2V0UmVxdWVzdE9iamVjdCwgcmVzb2x2ZUVycm9yIH0gZnJvbSAnLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBMUlVDYWNoZSBhcyBMUlUgfSBmcm9tICdscnUtY2FjaGUnO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4vUmVzdFdyaXRlJztcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc01haW50ZW5hbmNlID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy5pc01haW50ZW5hbmNlID0gaXNNYWludGVuYW5jZTtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYWludGVuYW5jZS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFpbnRlbmFuY2UoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYWludGVuYW5jZTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG5jb25zdCB0aHJvdHRsZSA9IG5ldyBMUlUoe1xuICBtYXg6IDEwMDAwLFxuICB0dGw6IDUwMCxcbn0pO1xuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBzZXNzaW9uIHNob3VsZCBiZSB1cGRhdGVkIGJhc2VkIG9uIGxhc3QgdXBkYXRlIHRpbWUgJiBzZXNzaW9uIGxlbmd0aC5cbiAqL1xuZnVuY3Rpb24gc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeShjb25maWcsIHNlc3Npb24pIHtcbiAgY29uc3QgcmVzZXRBZnRlciA9IGNvbmZpZy5zZXNzaW9uTGVuZ3RoIC8gMjtcbiAgY29uc3QgbGFzdFVwZGF0ZWQgPSBuZXcgRGF0ZShzZXNzaW9uPy51cGRhdGVkQXQpO1xuICBjb25zdCBza2lwUmFuZ2UgPSBuZXcgRGF0ZSgpO1xuICBza2lwUmFuZ2Uuc2V0VGltZShza2lwUmFuZ2UuZ2V0VGltZSgpIC0gcmVzZXRBZnRlciAqIDEwMDApO1xuICByZXR1cm4gbGFzdFVwZGF0ZWQgPD0gc2tpcFJhbmdlO1xufVxuXG5jb25zdCByZW5ld1Nlc3Npb25JZk5lZWRlZCA9IGFzeW5jICh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pID0+IHtcbiAgaWYgKCFjb25maWc/LmV4dGVuZFNlc3Npb25PblVzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhyb3R0bGUuZ2V0KHNlc3Npb25Ub2tlbikpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhyb3R0bGUuc2V0KHNlc3Npb25Ub2tlbiwgdHJ1ZSk7XG4gIHRyeSB7XG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICAgIHJlc3RXaGVyZTogeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgcmVzdE9wdGlvbnM6IHsgbGltaXQ6IDEgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICBzZXNzaW9uID0gcmVzdWx0c1swXTtcbiAgICB9XG5cbiAgICBpZiAoIXNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkoY29uZmlnLCBzZXNzaW9uKSB8fCAhc2Vzc2lvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gICAgYXdhaXQgbmV3IFJlc3RXcml0ZShcbiAgICAgIGNvbmZpZyxcbiAgICAgIG1hc3Rlcihjb25maWcpLFxuICAgICAgJ19TZXNzaW9uJyxcbiAgICAgIHsgb2JqZWN0SWQ6IHNlc3Npb24ub2JqZWN0SWQgfSxcbiAgICAgIHsgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCkgfVxuICAgICkuZXhlY3V0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGU/LmNvZGUgIT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignQ291bGQgbm90IHVwZGF0ZSBzZXNzaW9uIGV4cGlyeTogJywgZSk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb25Ub2tlbiB9KTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgcmVzdFdoZXJlOiB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gc2Vzc2lvbi5leHBpcmVzQXQgPyBuZXcgRGF0ZShzZXNzaW9uLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSBzZXNzaW9uLnVzZXI7XG5cbiAgaWYgKHR5cGVvZiBvYmpbJ29iamVjdElkJ10gPT09ICdzdHJpbmcnICYmIG9ialsnb2JqZWN0SWQnXS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0ludmFsaWQgb2JqZWN0IElELicpO1xuICB9XG5cbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSk7XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgY29uZmlnLFxuICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICByZXN0V2hlcmU6IHsgX3Nlc3Npb25fdG9rZW46IHNlc3Npb25Ub2tlbiB9LFxuICAgIHJlc3RPcHRpb25zLFxuICB9KTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCB0aGlzLmlzTWFpbnRlbmFuY2UgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgfSk7XG4gICAgYXdhaXQgcXVlcnkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSBhc3luYyAoY29uZmlnLCBhdXRoRGF0YSwgYmVmb3JlRmluZCkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG5cbiAgY29uc3QgcXVlcmllcyA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIHByb3ZpZGVycy5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcblxuICAgICAgY29uc3QgYWRhcHRlciA9IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpPy5hZGFwdGVyO1xuICAgICAgaWYgKGJlZm9yZUZpbmQgJiYgdHlwZW9mIGFkYXB0ZXI/LmJlZm9yZUZpbmQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgYXdhaXQgYWRhcHRlci5iZWZvcmVGaW5kKHByb3ZpZGVyQXV0aERhdGEpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXByb3ZpZGVyQXV0aERhdGE/LmlkKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBbYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYF06IHByb3ZpZGVyQXV0aERhdGEuaWQgfTtcbiAgICB9KVxuICApO1xuXG4gIC8vIEZpbHRlciBvdXQgbnVsbCBxdWVyaWVzXG4gIGNvbnN0IHZhbGlkUXVlcmllcyA9IHF1ZXJpZXMuZmlsdGVyKHF1ZXJ5ID0+IHF1ZXJ5ICE9PSBudWxsKTtcblxuICBpZiAoIXZhbGlkUXVlcmllcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICAvLyBQZXJmb3JtIGRhdGFiYXNlIHF1ZXJ5XG4gIHJldHVybiBjb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7ICRvcjogdmFsaWRRdWVyaWVzIH0sIHsgbGltaXQ6IDIgfSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgeyByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGE6IHRydWUsIG11dGF0ZWRBdXRoRGF0YTogYXV0aERhdGEgfTsgfVxuICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgIC8vIEFub255bW91cyBwcm92aWRlciBpcyBub3QgaGFuZGxlZCB0aGlzIHdheVxuICAgIGlmIChwcm92aWRlciA9PT0gJ2Fub255bW91cycpIHsgcmV0dXJuOyB9XG4gICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGNvbnN0IHVzZXJQcm92aWRlckF1dGhEYXRhID0gdXNlckF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBpZiAoIWlzRGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyRGF0YSwgdXNlclByb3ZpZGVyQXV0aERhdGEpKSB7XG4gICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9O1xufTtcblxuY29uc3QgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiA9IChcbiAgcmVxID0ge30sXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGxldCBwb2xpY3kgPSBwcm92aWRlci5hZGFwdGVyLnBvbGljeTtcbiAgICBpZiAodHlwZW9mIHBvbGljeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVxdWVzdE9iamVjdCA9IHtcbiAgICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICAgIHVzZXI6IHJlcS5hdXRoLnVzZXIsXG4gICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICB9O1xuICAgICAgcG9saWN5ID0gcG9saWN5LmNhbGwocHJvdmlkZXIuYWRhcHRlciwgcmVxdWVzdE9iamVjdCwgdXNlckF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKTtcbiAgICB9XG4gICAgaWYgKHBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCB1cGRhdGVkT2JqZWN0LCB1c2VyLCByZXEuY29uZmlnKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICBjb25zdCBhY2MgPSB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfTtcbiAgY29uc3QgYXV0aEtleXMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpO1xuICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhLZXlzKSB7XG4gICAgbGV0IG1ldGhvZCA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcikgfHwge307XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoIXZhbGlkYXRvciB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCB1c2VyLCByZXF1ZXN0T2JqZWN0KTtcbiAgICAgIG1ldGhvZCA9IHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC5tZXRob2Q7XG4gICAgICByZXF1ZXN0T2JqZWN0LnRyaWdnZXJOYW1lID0gbWV0aG9kO1xuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IpIHtcbiAgICAgICAgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKCk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZCB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ0F1dGggZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPVxuICAgICAgICByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHJlcS5kYXRhLm9iamVjdElkIHx8IHVuZGVmaW5lZDtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCAke21ldGhvZH0gZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6IG1ldGhvZCxcbiAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG1haW50ZW5hbmNlLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxTQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxVQUFBLEdBQUFDLHNCQUFBLENB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QyxDQUFDdkcsTUFBTSxFQUFFO1FBQ3pDK0YsR0FBRyxDQUFDMUMsUUFBUSxDQUFDTSxRQUFRLENBQUMsR0FBR04sUUFBUSxDQUFDTSxRQUFRLENBQUM7UUFDM0M7TUFDRjtNQUVBLElBQUk0QyxnQkFBZ0IsQ0FBQzNGLFFBQVEsRUFBRTtRQUM3Qm1GLEdBQUcsQ0FBQ0MsZ0JBQWdCLENBQUNyQyxRQUFRLENBQUMsR0FBRzRDLGdCQUFnQixDQUFDM0YsUUFBUTtNQUM1RDtNQUNBO01BQ0EsSUFBSSxDQUFDMkYsZ0JBQWdCLENBQUNFLFNBQVMsRUFBRTtRQUMvQlYsR0FBRyxDQUFDMUMsUUFBUSxDQUFDTSxRQUFRLENBQUMsR0FBRzRDLGdCQUFnQixDQUFDRyxJQUFJLElBQUlyRCxRQUFRLENBQUNNLFFBQVEsQ0FBQztNQUN0RTtJQUNGLENBQUMsQ0FBQyxPQUFPZ0QsR0FBRyxFQUFFO01BQ1osTUFBTTFMLENBQUMsR0FBRyxJQUFBMkwsc0JBQVksRUFBQ0QsR0FBRyxFQUFFO1FBQzFCaEksSUFBSSxFQUFFdkQsS0FBSyxDQUFDd0QsS0FBSyxDQUFDaUksYUFBYTtRQUMvQkMsT0FBTyxFQUFFO01BQ1gsQ0FBQyxDQUFDO01BQ0YsTUFBTUMsVUFBVSxHQUNkcEMsR0FBRyxDQUFDN0csSUFBSSxJQUFJNkcsR0FBRyxDQUFDN0csSUFBSSxDQUFDbEMsSUFBSSxHQUFHK0ksR0FBRyxDQUFDN0csSUFBSSxDQUFDbEMsSUFBSSxDQUFDc0YsRUFBRSxHQUFHeUQsR0FBRyxDQUFDcUMsSUFBSSxDQUFDdkksUUFBUSxJQUFJakQsU0FBUztNQUMvRXNELGNBQU0sQ0FBQ0MsS0FBSyxDQUNWLDRCQUE0Qm5CLE1BQU0sUUFBUStGLFFBQVEsYUFBYW9ELFVBQVUsZUFBZSxHQUN0RkUsSUFBSSxDQUFDQyxTQUFTLENBQUNqTSxDQUFDLENBQUMsRUFDbkI7UUFDRWtNLGtCQUFrQixFQUFFdkosTUFBTTtRQUMxQm1CLEtBQUssRUFBRTlELENBQUM7UUFDUlcsSUFBSSxFQUFFbUwsVUFBVTtRQUNoQnBEO01BQ0YsQ0FDRixDQUFDO01BQ0QsTUFBTTFJLENBQUM7SUFDVDtFQUNGO0VBQ0EsT0FBTzhLLEdBQUc7QUFDWixDQUFDO0FBRURxQixNQUFNLENBQUNDLE9BQU8sR0FBRztFQUNmaE0sSUFBSTtFQUNKYyxNQUFNO0VBQ05DLFdBQVc7RUFDWEUsTUFBTTtFQUNORCxRQUFRO0VBQ1JNLHlCQUF5QjtFQUN6QnFDLHNCQUFzQjtFQUN0QnlCLDRCQUE0QjtFQUM1QjJDLHFCQUFxQjtFQUNyQmUsa0JBQWtCO0VBQ2xCTyxpREFBaUQ7RUFDakRhO0FBQ0YsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==