"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _logger = require("./logger");
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
const throttle = {};
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!config?.extendSessionOnUse) {
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
      if (e?.code !== Parse.Error.OBJECT_NOT_FOUND) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJtYWludGVuYW5jZSIsInJlYWRPbmx5Iiwibm9ib2R5Iiwic2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeSIsInNlc3Npb24iLCJyZXNldEFmdGVyIiwic2Vzc2lvbkxlbmd0aCIsImxhc3RVcGRhdGVkIiwiRGF0ZSIsInVwZGF0ZWRBdCIsInNraXBSYW5nZSIsInNldFRpbWUiLCJnZXRUaW1lIiwidGhyb3R0bGUiLCJyZW5ld1Nlc3Npb25JZk5lZWRlZCIsInNlc3Npb25Ub2tlbiIsImV4dGVuZFNlc3Npb25PblVzZSIsImNsZWFyVGltZW91dCIsInNldFRpbWVvdXQiLCJxdWVyeSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsIk1ldGhvZCIsImdldCIsImF1dGgiLCJydW5CZWZvcmVGaW5kIiwiY2xhc3NOYW1lIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJsaW1pdCIsInJlc3VsdHMiLCJleGVjdXRlIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJfZW5jb2RlIiwiY29kZSIsIkVycm9yIiwiT0JKRUNUX05PVF9GT1VORCIsImxvZ2dlciIsImVycm9yIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInVzZXJKU09OIiwiY2FjaGVkVXNlciIsIk9iamVjdCIsImZyb21KU09OIiwiUHJvbWlzZSIsInJlc29sdmUiLCJpbmNsdWRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJvYmoiLCJ0b0pTT04iLCJsZW5ndGgiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJub3ciLCJpc28iLCJzdGFydHNXaXRoIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwicGFzc3dvcmQiLCJwdXQiLCJ1c2VyT2JqZWN0IiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsIl9zZXNzaW9uX3Rva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInVzZXJzIiwiX190eXBlIiwiaWQiLCJlYWNoIiwicmVzdWx0IiwicHVzaCIsIlJvbGUiLCJjYWNoZWRSb2xlcyIsInJvbGUiLCJjYWNoZVJvbGVzIiwicm9sZXNNYXAiLCJyZWR1Y2UiLCJtIiwiciIsIm5hbWVzIiwibmFtZSIsImlkcyIsInJvbGVOYW1lcyIsIl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyIsIkFycmF5IiwiY2xlYXJSb2xlQ2FjaGUiLCJkZWwiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwia2V5cyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJyZXEiLCJzYXZlZFVzZXJQcm92aWRlcnMiLCJhZGFwdGVyIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIiLCJzb21lIiwicG9saWN5IiwiYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCIsImhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciIsInJlcXVlc3RPYmplY3QiLCJpcCIsImNhbGwiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsInZhbGlkYXRvciIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsInRyaWdnZXJOYW1lIiwiZG9Ob3RTYXZlIiwic2F2ZSIsImVyciIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlclN0cmluZyIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGdldFJlcXVlc3RPYmplY3QsIHJlc29sdmVFcnJvciB9IGZyb20gJy4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4vUmVzdFdyaXRlJztcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc01haW50ZW5hbmNlID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy5pc01haW50ZW5hbmNlID0gaXNNYWludGVuYW5jZTtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYWludGVuYW5jZS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFpbnRlbmFuY2UoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYWludGVuYW5jZTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIHNlc3Npb24gc2hvdWxkIGJlIHVwZGF0ZWQgYmFzZWQgb24gbGFzdCB1cGRhdGUgdGltZSAmIHNlc3Npb24gbGVuZ3RoLlxuICovXG5mdW5jdGlvbiBzaG91bGRVcGRhdGVTZXNzaW9uRXhwaXJ5KGNvbmZpZywgc2Vzc2lvbikge1xuICBjb25zdCByZXNldEFmdGVyID0gY29uZmlnLnNlc3Npb25MZW5ndGggLyAyO1xuICBjb25zdCBsYXN0VXBkYXRlZCA9IG5ldyBEYXRlKHNlc3Npb24/LnVwZGF0ZWRBdCk7XG4gIGNvbnN0IHNraXBSYW5nZSA9IG5ldyBEYXRlKCk7XG4gIHNraXBSYW5nZS5zZXRUaW1lKHNraXBSYW5nZS5nZXRUaW1lKCkgLSByZXNldEFmdGVyICogMTAwMCk7XG4gIHJldHVybiBsYXN0VXBkYXRlZCA8PSBza2lwUmFuZ2U7XG59XG5cbmNvbnN0IHRocm90dGxlID0ge307XG5jb25zdCByZW5ld1Nlc3Npb25JZk5lZWRlZCA9IGFzeW5jICh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pID0+IHtcbiAgaWYgKCFjb25maWc/LmV4dGVuZFNlc3Npb25PblVzZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjbGVhclRpbWVvdXQodGhyb3R0bGVbc2Vzc2lvblRva2VuXSk7XG4gIHRocm90dGxlW3Nlc3Npb25Ub2tlbl0gPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoOiBtYXN0ZXIoY29uZmlnKSxcbiAgICAgICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICAgICAgcmVzdFdoZXJlOiB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHJlc3RPcHRpb25zOiB7IGxpbWl0OiAxIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICAgICAgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gICAgICB9XG4gICAgICBpZiAoIXNob3VsZFVwZGF0ZVNlc3Npb25FeHBpcnkoY29uZmlnLCBzZXNzaW9uKSB8fCAhc2Vzc2lvbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gICAgICBhd2FpdCBuZXcgUmVzdFdyaXRlKFxuICAgICAgICBjb25maWcsXG4gICAgICAgIG1hc3Rlcihjb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IG9iamVjdElkOiBzZXNzaW9uLm9iamVjdElkIH0sXG4gICAgICAgIHsgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCkgfVxuICAgICAgKS5leGVjdXRlKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGU/LmNvZGUgIT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb3VsZCBub3QgdXBkYXRlIHNlc3Npb24gZXhwaXJ5OiAnLCBlKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sIDUwMCk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb25Ub2tlbiB9KTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgcmVzdFdoZXJlOiB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gc2Vzc2lvbi5leHBpcmVzQXQgPyBuZXcgRGF0ZShzZXNzaW9uLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSBzZXNzaW9uLnVzZXI7XG5cbiAgaWYgKHR5cGVvZiBvYmpbJ29iamVjdElkJ10gPT09ICdzdHJpbmcnICYmIG9ialsnb2JqZWN0SWQnXS5zdGFydHNXaXRoKCdyb2xlOicpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0ludmFsaWQgb2JqZWN0IElELicpO1xuICB9XG5cbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIHJlbmV3U2Vzc2lvbklmTmVlZGVkKHsgY29uZmlnLCBzZXNzaW9uLCBzZXNzaW9uVG9rZW4gfSk7XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgY29uZmlnLFxuICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICByZXN0V2hlcmU6IHsgX3Nlc3Npb25fdG9rZW46IHNlc3Npb25Ub2tlbiB9LFxuICAgIHJlc3RPcHRpb25zLFxuICB9KTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCB0aGlzLmlzTWFpbnRlbmFuY2UgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgfSk7XG4gICAgYXdhaXQgcXVlcnkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IGNhY2hlZFJvbGVzID0gYXdhaXQgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5nZXQodGhpcy51c2VyLmlkKTtcbiAgICBpZiAoY2FjaGVkUm9sZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgICAgdGhpcy51c2VyUm9sZXMgPSBjYWNoZWRSb2xlcztcbiAgICAgIHJldHVybiBjYWNoZWRSb2xlcztcbiAgICB9XG4gIH1cblxuICAvLyBGaXJzdCBnZXQgdGhlIHJvbGUgaWRzIHRoaXMgdXNlciBpcyBkaXJlY3RseSBhIG1lbWJlciBvZlxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRSb2xlc0ZvclVzZXIoKTtcbiAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgIHRoaXMudXNlclJvbGVzID0gW107XG4gICAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICAgIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuXG4gICAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gICAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xuICB9XG5cbiAgY29uc3Qgcm9sZXNNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAobSwgcikgPT4ge1xuICAgICAgbS5uYW1lcy5wdXNoKHIubmFtZSk7XG4gICAgICBtLmlkcy5wdXNoKHIub2JqZWN0SWQpO1xuICAgICAgcmV0dXJuIG07XG4gICAgfSxcbiAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICk7XG5cbiAgLy8gcnVuIHRoZSByZWN1cnNpdmUgZmluZGluZ1xuICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyb2xlc01hcC5pZHMsIHJvbGVzTWFwLm5hbWVzKTtcbiAgdGhpcy51c2VyUm9sZXMgPSByb2xlTmFtZXMubWFwKHIgPT4ge1xuICAgIHJldHVybiAncm9sZTonICsgcjtcbiAgfSk7XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG4gIHRoaXMuY2FjaGVSb2xlcygpO1xuICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jYWNoZVJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUucHV0KHRoaXMudXNlci5pZCwgQXJyYXkoLi4udGhpcy51c2VyUm9sZXMpKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5jbGVhclJvbGVDYWNoZSA9IGZ1bmN0aW9uIChzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmRlbCh0aGlzLnVzZXIuaWQpO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uVG9rZW4pO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICB9KTtcbiAgICBhd2FpdCBxdWVyeS5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0KSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBHaXZlbiBhIGxpc3Qgb2Ygcm9sZUlkcywgZmluZCBhbGwgdGhlIHBhcmVudCByb2xlcywgcmV0dXJucyBhIHByb21pc2Ugd2l0aCBhbGwgbmFtZXNcbkF1dGgucHJvdG90eXBlLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyA9IGZ1bmN0aW9uIChyb2xlSURzLCBuYW1lcyA9IFtdLCBxdWVyaWVkUm9sZXMgPSB7fSkge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhyZXN1bHRNYXAuaWRzLCBuYW1lcywgcXVlcmllZFJvbGVzKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBmaW5kVXNlcnNXaXRoQXV0aERhdGEgPSAoY29uZmlnLCBhdXRoRGF0YSkgPT4ge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdIHx8IChhdXRoRGF0YSAmJiAhYXV0aERhdGFbcHJvdmlkZXJdLmlkKSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgcmV0dXJuIHF1ZXJ5Lmxlbmd0aCA+IDBcbiAgICA/IGNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgJG9yOiBxdWVyeSB9LCB7IGxpbWl0OiAyIH0pXG4gICAgOiBQcm9taXNlLnJlc29sdmUoW10pO1xufTtcblxuY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gKGF1dGhEYXRhLCB1c2VyQXV0aERhdGEpID0+IHtcbiAgaWYgKCF1c2VyQXV0aERhdGEpIHsgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhOiB0cnVlLCBtdXRhdGVkQXV0aERhdGE6IGF1dGhEYXRhIH07IH1cbiAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAvLyBBbm9ueW1vdXMgcHJvdmlkZXIgaXMgbm90IGhhbmRsZWQgdGhpcyB3YXlcbiAgICBpZiAocHJvdmlkZXIgPT09ICdhbm9ueW1vdXMnKSB7IHJldHVybjsgfVxuICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBjb25zdCB1c2VyUHJvdmlkZXJBdXRoRGF0YSA9IHVzZXJBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgaWYgKCFpc0RlZXBTdHJpY3RFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIHJlcSA9IHt9LFxuICBhdXRoRGF0YSA9IHt9LFxuICB1c2VyQXV0aERhdGEgPSB7fSxcbiAgY29uZmlnXG4pID0+IHtcbiAgY29uc3Qgc2F2ZWRVc2VyUHJvdmlkZXJzID0gT2JqZWN0LmtleXModXNlckF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4gKHtcbiAgICBuYW1lOiBwcm92aWRlcixcbiAgICBhZGFwdGVyOiBjb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKS5hZGFwdGVyLFxuICB9KSk7XG5cbiAgY29uc3QgaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUoXG4gICAgcHJvdmlkZXIgPT5cbiAgICAgIHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdzb2xvJyAmJiBhdXRoRGF0YVtwcm92aWRlci5uYW1lXVxuICApO1xuXG4gIC8vIFNvbG8gcHJvdmlkZXJzIGNhbiBiZSBjb25zaWRlcmVkIGFzIHNhZmUsIHNvIHdlIGRvIG5vdCBoYXZlIHRvIGNoZWNrIGlmIHRoZSB1c2VyIG5lZWRzXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpbi4gQW4gYXV0aCBhZGFwdGVyIHdpdGggXCJzb2xvXCIgKGxpa2Ugd2ViYXV0aG4pIG1lYW5zXG4gIC8vIG5vIFwiYWRkaXRpb25hbFwiIGF1dGggbmVlZHMgdG8gYmUgcHJvdmlkZWQgdG8gbG9naW4gKGxpa2UgT1RQLCBNRkEpXG4gIGlmIChoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kID0gW107XG4gIGNvbnN0IGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciA9IHNhdmVkVXNlclByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHtcbiAgICBsZXQgcG9saWN5ID0gcHJvdmlkZXIuYWRhcHRlci5wb2xpY3k7XG4gICAgaWYgKHR5cGVvZiBwb2xpY3kgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHJlcXVlc3RPYmplY3QgPSB7XG4gICAgICAgIGlwOiByZXEuY29uZmlnLmlwLFxuICAgICAgICB1c2VyOiByZXEuYXV0aC51c2VyLFxuICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoLmlzTWFzdGVyLFxuICAgICAgfTtcbiAgICAgIHBvbGljeSA9IHBvbGljeS5jYWxsKHByb3ZpZGVyLmFkYXB0ZXIsIHJlcXVlc3RPYmplY3QsIHVzZXJBdXRoRGF0YVtwcm92aWRlci5uYW1lXSk7XG4gICAgfVxuICAgIGlmIChwb2xpY3kgPT09ICdhZGRpdGlvbmFsJykge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUHVzaCBtaXNzaW5nIHByb3ZpZGVyIGZvciBlcnJvciBtZXNzYWdlXG4gICAgICAgIGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQucHVzaChwcm92aWRlci5uYW1lKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBpZiAoaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIHx8ICFhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICBgTWlzc2luZyBhZGRpdGlvbmFsIGF1dGhEYXRhICR7YWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5qb2luKCcsJyl9YFxuICApO1xufTtcblxuLy8gVmFsaWRhdGUgZWFjaCBhdXRoRGF0YSBzdGVwLWJ5LXN0ZXAgYW5kIHJldHVybiB0aGUgcHJvdmlkZXIgcmVzcG9uc2VzXG5jb25zdCBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBhc3luYyAoYXV0aERhdGEsIHJlcSwgZm91bmRVc2VyKSA9PiB7XG4gIGxldCB1c2VyO1xuICBpZiAoZm91bmRVc2VyKSB7XG4gICAgdXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZvdW5kVXNlciB9KTtcbiAgICAvLyBGaW5kIHVzZXIgYnkgc2Vzc2lvbiBhbmQgY3VycmVudCBvYmplY3RJZDsgb25seSBwYXNzIHVzZXIgaWYgaXQncyB0aGUgY3VycmVudCB1c2VyIG9yIG1hc3RlciBrZXkgaXMgcHJvdmlkZWRcbiAgfSBlbHNlIGlmIChcbiAgICAocmVxLmF1dGggJiZcbiAgICAgIHJlcS5hdXRoLnVzZXIgJiZcbiAgICAgIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmXG4gICAgICByZXEuZ2V0VXNlcklkKCkgPT09IHJlcS5hdXRoLnVzZXIuaWQpIHx8XG4gICAgKHJlcS5hdXRoICYmIHJlcS5hdXRoLmlzTWFzdGVyICYmIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmIHJlcS5nZXRVc2VySWQoKSlcbiAgKSB7XG4gICAgdXNlciA9IG5ldyBQYXJzZS5Vc2VyKCk7XG4gICAgdXNlci5pZCA9IHJlcS5hdXRoLmlzTWFzdGVyID8gcmVxLmdldFVzZXJJZCgpIDogcmVxLmF1dGgudXNlci5pZDtcbiAgICBhd2FpdCB1c2VyLmZldGNoKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG5cbiAgY29uc3QgeyB1cGRhdGVkT2JqZWN0IH0gPSByZXEuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgdXBkYXRlZE9iamVjdCwgdXNlciwgcmVxLmNvbmZpZyk7XG4gIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBhcyBzdGVwLWJ5LXN0ZXAgcGlwZWxpbmUgZm9yIGJldHRlciBlcnJvciBjb25zaXN0ZW5jeVxuICAvLyBhbmQgYWxzbyB0byBhdm9pZCB0byB0cmlnZ2VyIGEgcHJvdmlkZXIgKGxpa2UgT1RQIFNNUykgaWYgYW5vdGhlciBvbmUgZmFpbHNcbiAgY29uc3QgYWNjID0geyBhdXRoRGF0YToge30sIGF1dGhEYXRhUmVzcG9uc2U6IHt9IH07XG4gIGNvbnN0IGF1dGhLZXlzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLnNvcnQoKTtcbiAgZm9yIChjb25zdCBwcm92aWRlciBvZiBhdXRoS2V5cykge1xuICAgIGxldCBtZXRob2QgPSAnJztcbiAgICB0cnkge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gbnVsbDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgY29uc3QgYXV0aFByb3ZpZGVyID0gKHJlcS5jb25maWcuYXV0aCB8fCB7fSlbcHJvdmlkZXJdIHx8IHt9O1xuICAgICAgaWYgKCF2YWxpZGF0b3IgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCk7XG4gICAgICBtZXRob2QgPSB2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQubWV0aG9kO1xuICAgICAgcmVxdWVzdE9iamVjdC50cmlnZ2VyTmFtZSA9IG1ldGhvZDtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKSB7XG4gICAgICAgIHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcigpO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3Qua2V5cyh2YWxpZGF0aW9uUmVzdWx0KS5sZW5ndGgpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVJlc3BvbnNlW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2U7XG4gICAgICB9XG4gICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWQgdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5zYXZlIHx8IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdBdXRoIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB1c2VyU3RyaW5nID1cbiAgICAgICAgcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiByZXEuZGF0YS5vYmplY3RJZCB8fCB1bmRlZmluZWQ7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgJHttZXRob2R9IGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICB7XG4gICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiBtZXRob2QsXG4gICAgICAgICAgZXJyb3I6IGUsXG4gICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBtYWludGVuYW5jZSxcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgc2hvdWxkVXBkYXRlU2Vzc2lvbkV4cGlyeSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgZmluZFVzZXJzV2l0aEF1dGhEYXRhLFxuICBoYXNNdXRhdGVkQXV0aERhdGEsXG4gIGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4sXG4gIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbixcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsT0FBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsVUFBQSxHQUFBQyxzQkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssVUFBQSxHQUFBRCxzQkFBQSxDQUFBSixPQUFBO0FBQW9DLFNBQUFJLHVCQUFBRSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBTHBDLE1BQU1HLEtBQUssR0FBR1QsT0FBTyxDQUFDLFlBQVksQ0FBQztBQU9uQztBQUNBO0FBQ0E7QUFDQSxTQUFTVSxJQUFJQSxDQUFDO0VBQ1pDLE1BQU07RUFDTkMsZUFBZSxHQUFHQyxTQUFTO0VBQzNCQyxRQUFRLEdBQUcsS0FBSztFQUNoQkMsYUFBYSxHQUFHLEtBQUs7RUFDckJDLFVBQVUsR0FBRyxLQUFLO0VBQ2xCQyxJQUFJO0VBQ0pDO0FBQ0YsQ0FBQyxF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