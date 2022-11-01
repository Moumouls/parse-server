"use strict";

var _util = require("util");

var _triggers = require("./triggers");

var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Parse = require('parse/node');

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isReadOnly = false,
  user,
  installationId
}) {
  this.config = config;
  this.cacheController = cacheController || config && config.cacheController;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;
  this.isReadOnly = isReadOnly; // Assuming a users roles won't change during a single request, we'll
  // only load them once.

  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
} // Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.


Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }

  if (this.user) {
    return false;
  }

  return true;
}; // A helper to get a master-level Auth object


function master(config) {
  return new Auth({
    config,
    isMaster: true
  });
} // A helper to get a master-level Auth object


function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true
  });
} // A helper to get a nobody-level Auth object


function nobody(config) {
  return new Auth({
    config,
    isMaster: false
  });
} // Returns a promise that resolves to an Auth object


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

    const query = new RestQuery(config, master(config), '_Session', {
      sessionToken
    }, restOptions);
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query(Parse.Session).limit(1).include('user').equalTo('sessionToken', sessionToken).find({
      useMasterKey: true
    })).map(obj => obj.toJSON());
  }

  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }

  const now = new Date(),
        expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;

  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }

  const obj = results[0]['user'];
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;

  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }

  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject
  });
};

var getAuthForLegacySessionToken = function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  };

  const RestQuery = require('./RestQuery');

  var query = new RestQuery(config, master(config), '_User', {
    sessionToken
  }, restOptions);
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
}; // Returns a promise that resolves to an array of role names


Auth.prototype.getUserRoles = function () {
  if (this.isMaster || !this.user) {
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

    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role).equalTo('users', this.user).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  }

  return results;
}; // Iterates through the role tree and compiles a user's roles


Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);

    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  } // First get the role ids this user is directly a member of


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
  }); // run the recursive finding

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
  const results = []; // Build an OR query across all parentRoles

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

    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result => results.push(result));
  }

  return results;
}; // Given a list of roleIds, find all the parent roles, returns a promise with all names


Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  }); // all roles are accounted for, return the names

  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }

  return this.getRolesByIds(ins).then(results => {
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    } // Map the results with all Ids and names


    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {
      ids: [],
      names: []
    }); // store the new found names

    names = names.concat(resultMap.names); // find the next ones, circular roles will be cut

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

const checkIfUserHasProvidedConfiguredProvidersForLogin = (authData = {}, userAuthData = {}, config) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter
  }));
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]); // Solo providers can be considered as safe, so we do not have to check if the user needs
  // to provide an additional provider to login. An auth adapter with "solo" (like webauthn) means
  // no "additional" auth needs to be provided to login (like OTP, MFA)

  if (hasProvidedASoloProvider) {
    return;
  }

  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    if (provider && provider.adapter && provider.adapter.policy === 'additional') {
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
}; // Validate each authData step-by-step and return the provider responses


const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;

  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser)); // Find user by session and current objectId; only pass user if it's the current user or master key is provided
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  }

  const {
    originalObject,
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, originalObject || user, req.config); // Perform validation as step-by-step pipeline for better error consistency
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

      if (authProvider.enabled == null) {
        _Deprecator.default.logRuntimeDeprecation({
          usage: `auth.${provider}`,
          solution: `auth.${provider}.enabled: true`
        });
      }

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
      } // Some auth providers after initialization will avoid to replace authData already stored


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
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsIkF1dGgiLCJjb25maWciLCJjYWNoZUNvbnRyb2xsZXIiLCJ1bmRlZmluZWQiLCJpc01hc3RlciIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwicmVhZE9ubHkiLCJub2JvZHkiLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwidXNlckpTT04iLCJnZXQiLCJjYWNoZWRVc2VyIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlc3VsdHMiLCJyZXN0T3B0aW9ucyIsImxpbWl0IiwiaW5jbHVkZSIsIlJlc3RRdWVyeSIsInF1ZXJ5IiwiZXhlY3V0ZSIsIlF1ZXJ5IiwiU2Vzc2lvbiIsImVxdWFsVG8iLCJmaW5kIiwidXNlTWFzdGVyS2V5IiwibWFwIiwib2JqIiwidG9KU09OIiwibGVuZ3RoIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJub3ciLCJEYXRlIiwiZXhwaXJlc0F0IiwiaXNvIiwicGFzc3dvcmQiLCJwdXQiLCJ1c2VyT2JqZWN0IiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsInRoZW4iLCJyZXNwb25zZSIsImNsYXNzTmFtZSIsImdldFVzZXJSb2xlcyIsIl9sb2FkUm9sZXMiLCJnZXRSb2xlc0ZvclVzZXIiLCJyZXN0V2hlcmUiLCJ1c2VycyIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJlYWNoIiwicmVzdWx0IiwicHVzaCIsIlJvbGUiLCJjYWNoZWRSb2xlcyIsInJvbGUiLCJjYWNoZVJvbGVzIiwicm9sZXNNYXAiLCJyZWR1Y2UiLCJtIiwiciIsIm5hbWVzIiwibmFtZSIsImlkcyIsInJvbGVOYW1lcyIsIl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyIsIkFycmF5IiwiY2xlYXJSb2xlQ2FjaGUiLCJkZWwiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwia2V5cyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZGF0YWJhc2UiLCIkb3IiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VyQXV0aERhdGEiLCJtdXRhdGVkQXV0aERhdGEiLCJmb3JFYWNoIiwicHJvdmlkZXJEYXRhIiwidXNlclByb3ZpZGVyQXV0aERhdGEiLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwic2F2ZWRVc2VyUHJvdmlkZXJzIiwiYWRhcHRlciIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyIiwic29tZSIsInBvbGljeSIsImFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQiLCJoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJyZXEiLCJmb3VuZFVzZXIiLCJVc2VyIiwiYXV0aCIsImdldFVzZXJJZCIsImZldGNoIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJyZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsIm1ldGhvZCIsInZhbGlkYXRvciIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJEZXByZWNhdG9yIiwibG9nUnVudGltZURlcHJlY2F0aW9uIiwidXNhZ2UiLCJzb2x1dGlvbiIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJ2YWxpZGF0aW9uUmVzdWx0IiwidHJpZ2dlck5hbWUiLCJkb05vdFNhdmUiLCJzYXZlIiwiZXJyIiwiZSIsImNvZGUiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJTdHJpbmciLCJkYXRhIiwibG9nZ2VyIiwiZXJyb3IiLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUpBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQUQsQ0FBckI7O0FBTUE7QUFDQTtBQUNBO0FBQ0EsU0FBU0MsSUFBVCxDQUFjO0FBQ1pDLEVBQUFBLE1BRFk7QUFFWkMsRUFBQUEsZUFBZSxHQUFHQyxTQUZOO0FBR1pDLEVBQUFBLFFBQVEsR0FBRyxLQUhDO0FBSVpDLEVBQUFBLFVBQVUsR0FBRyxLQUpEO0FBS1pDLEVBQUFBLElBTFk7QUFNWkMsRUFBQUE7QUFOWSxDQUFkLEVBT0c7QUFDRCxPQUFLTixNQUFMLEdBQWNBLE1BQWQ7QUFDQSxPQUFLQyxlQUFMLEdBQXVCQSxlQUFlLElBQUtELE1BQU0sSUFBSUEsTUFBTSxDQUFDQyxlQUE1RDtBQUNBLE9BQUtLLGNBQUwsR0FBc0JBLGNBQXRCO0FBQ0EsT0FBS0gsUUFBTCxHQUFnQkEsUUFBaEI7QUFDQSxPQUFLRSxJQUFMLEdBQVlBLElBQVo7QUFDQSxPQUFLRCxVQUFMLEdBQWtCQSxVQUFsQixDQU5DLENBUUQ7QUFDQTs7QUFDQSxPQUFLRyxTQUFMLEdBQWlCLEVBQWpCO0FBQ0EsT0FBS0MsWUFBTCxHQUFvQixLQUFwQjtBQUNBLE9BQUtDLFdBQUwsR0FBbUIsSUFBbkI7QUFDRCxDLENBRUQ7QUFDQTs7O0FBQ0FWLElBQUksQ0FBQ1csU0FBTCxDQUFlQyxpQkFBZixHQUFtQyxZQUFZ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QUFTeEgsSUFBVCxDQUFjdUQsRUFBMUMsR0FBK0M4RCxHQUFHLENBQUNpQyxJQUFKLENBQVNoRyxRQUFULElBQXFCekQsU0FEdEU7O0FBRUEwSixxQkFBT0MsS0FBUCxDQUNHLDRCQUEyQnJCLE1BQU8sUUFBT3RDLFFBQVMsYUFBWXdELFVBQVcsZUFBMUUsR0FDRUksSUFBSSxDQUFDQyxTQUFMLENBQWVULENBQWYsQ0FGSixFQUdFO0FBQ0VVLFFBQUFBLGtCQUFrQixFQUFFeEIsTUFEdEI7QUFFRXFCLFFBQUFBLEtBQUssRUFBRVAsQ0FGVDtBQUdFakosUUFBQUEsSUFBSSxFQUFFcUosVUFIUjtBQUlFeEQsUUFBQUE7QUFKRixPQUhGOztBQVVBLFlBQU1vRCxDQUFOO0FBQ0Q7QUFDRjs7QUFDRCxTQUFPbEIsR0FBUDtBQUNELENBN0ZEOztBQStGQTZCLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQjtBQUNmbkssRUFBQUEsSUFEZTtBQUVmYSxFQUFBQSxNQUZlO0FBR2ZFLEVBQUFBLE1BSGU7QUFJZkQsRUFBQUEsUUFKZTtBQUtmRSxFQUFBQSxzQkFMZTtBQU1ma0MsRUFBQUEsNEJBTmU7QUFPZjZDLEVBQUFBLHFCQVBlO0FBUWZTLEVBQUFBLGtCQVJlO0FBU2ZNLEVBQUFBLGlEQVRlO0FBVWZZLEVBQUFBO0FBVmUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBnZXRSZXF1ZXN0T2JqZWN0LCByZXNvbHZlRXJyb3IgfSBmcm9tICcuL3RyaWdnZXJzJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3Rlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBtYXN0ZXIoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gcmVhZE9ubHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IHRydWUsIGlzUmVhZE9ubHk6IHRydWUgfSk7XG59XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG5vYm9keS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbm9ib2R5KGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiBmYWxzZSB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBBdXRoIG9iamVjdFxuY29uc3QgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyLFxuICBzZXNzaW9uVG9rZW4sXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICBjYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNvbnN0IHVzZXJKU09OID0gYXdhaXQgY2FjaGVDb250cm9sbGVyLnVzZXIuZ2V0KHNlc3Npb25Ub2tlbik7XG4gICAgaWYgKHVzZXJKU09OKSB7XG4gICAgICBjb25zdCBjYWNoZWRVc2VyID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHVzZXJKU09OKTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSByZXN1bHRzWzBdLmV4cGlyZXNBdCA/IG5ldyBEYXRlKHJlc3VsdHNbMF0uZXhwaXJlc0F0LmlzbykgOiB1bmRlZmluZWQ7XG4gIGlmIChleHBpcmVzQXQgPCBub3cpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiBpcyBleHBpcmVkLicpO1xuICB9XG4gIGNvbnN0IG9iaiA9IHJlc3VsdHNbMF1bJ3VzZXInXTtcbiAgZGVsZXRlIG9iai5wYXNzd29yZDtcbiAgb2JqWydjbGFzc05hbWUnXSA9ICdfVXNlcic7XG4gIG9ialsnc2Vzc2lvblRva2VuJ10gPSBzZXNzaW9uVG9rZW47XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjYWNoZUNvbnRyb2xsZXIudXNlci5wdXQoc2Vzc2lvblRva2VuLCBvYmopO1xuICB9XG4gIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICBjb25maWcsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICBpbnN0YWxsYXRpb25JZCxcbiAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICB9KTtcbn07XG5cbnZhciBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuID0gZnVuY3Rpb24gKHsgY29uZmlnLCBzZXNzaW9uVG9rZW4sIGluc3RhbGxhdGlvbklkIH0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgbWFzdGVyKGNvbmZpZyksICdfVXNlcicsIHsgc2Vzc2lvblRva2VuIH0sIHJlc3RPcHRpb25zKTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnaW52YWxpZCBsZWdhY3kgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5pc01hc3RlciB8fCAhdGhpcy51c2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG4gIH1cbiAgaWYgKHRoaXMuZmV0Y2hlZFJvbGVzKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnVzZXJSb2xlcyk7XG4gIH1cbiAgaWYgKHRoaXMucm9sZVByb21pc2UpIHtcbiAgICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbiAgfVxuICB0aGlzLnJvbGVQcm9taXNlID0gdGhpcy5fbG9hZFJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNGb3JVc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvL1N0YWNrIGFsbCBQYXJzZS5Sb2xlXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgaWYgKHRoaXMuY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdFdoZXJlID0ge1xuICAgICAgdXNlcnM6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMudXNlci5pZCxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmNsZWFyUm9sZUNhY2hlID0gZnVuY3Rpb24gKHNlc3Npb25Ub2tlbikge1xuICBpZiAoIXRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZGVsKHRoaXMudXNlci5pZCk7XG4gIHRoaXMuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb25Ub2tlbik7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uIChpbnMpIHtcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAvLyBCdWlsZCBhbiBPUiBxdWVyeSBhY3Jvc3MgYWxsIHBhcmVudFJvbGVzXG4gIGlmICghdGhpcy5jb25maWcpIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5jb250YWluZWRJbihcbiAgICAgICAgJ3JvbGVzJyxcbiAgICAgICAgaW5zLm1hcChpZCA9PiB7XG4gICAgICAgICAgY29uc3Qgcm9sZSA9IG5ldyBQYXJzZS5PYmplY3QoUGFyc2UuUm9sZSk7XG4gICAgICAgICAgcm9sZS5pZCA9IGlkO1xuICAgICAgICAgIHJldHVybiByb2xlO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByb2xlcyA9IGlucy5tYXAoaWQgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Sb2xlJyxcbiAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgfTtcbiAgICB9KTtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7IHJvbGVzOiB7ICRpbjogcm9sZXMgfSB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFzdGVyKHRoaXMuY29uZmlnKSwgJ19Sb2xlJywgcmVzdFdoZXJlLCB7fSkuZWFjaChyZXN1bHQgPT5cbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICByZXR1cm4gcXVlcnkubGVuZ3RoID4gMFxuICAgID8gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHsgbGltaXQ6IDIgfSlcbiAgICA6IFByb21pc2UucmVzb2x2ZShbXSk7XG59O1xuXG5jb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSAoYXV0aERhdGEsIHVzZXJBdXRoRGF0YSkgPT4ge1xuICBpZiAoIXVzZXJBdXRoRGF0YSkgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhOiB0cnVlLCBtdXRhdGVkQXV0aERhdGE6IGF1dGhEYXRhIH07XG4gIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgLy8gQW5vbnltb3VzIHByb3ZpZGVyIGlzIG5vdCBoYW5kbGVkIHRoaXMgd2F5XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJykgcmV0dXJuO1xuICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBjb25zdCB1c2VyUHJvdmlkZXJBdXRoRGF0YSA9IHVzZXJBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgaWYgKCFpc0RlZXBTdHJpY3RFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGlmIChwcm92aWRlciAmJiBwcm92aWRlci5hZGFwdGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIucG9saWN5ID09PSAnYWRkaXRpb25hbCcpIHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlci5uYW1lXSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFB1c2ggbWlzc2luZyBwcm92aWRlciBmb3IgZXJyb3IgbWVzc2FnZVxuICAgICAgICBhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLnB1c2gocHJvdmlkZXIubmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGhhc1Byb3ZpZGVkQXRMZWFzdE9uZUFkZGl0aW9uYWxQcm92aWRlciB8fCAhYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgYE1pc3NpbmcgYWRkaXRpb25hbCBhdXRoRGF0YSAke2FkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQuam9pbignLCcpfWBcbiAgKTtcbn07XG5cbi8vIFZhbGlkYXRlIGVhY2ggYXV0aERhdGEgc3RlcC1ieS1zdGVwIGFuZCByZXR1cm4gdGhlIHByb3ZpZGVyIHJlc3BvbnNlc1xuY29uc3QgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uID0gYXN5bmMgKGF1dGhEYXRhLCByZXEsIGZvdW5kVXNlcikgPT4ge1xuICBsZXQgdXNlcjtcbiAgaWYgKGZvdW5kVXNlcikge1xuICAgIHVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mb3VuZFVzZXIgfSk7XG4gICAgLy8gRmluZCB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0SWQ7IG9ubHkgcGFzcyB1c2VyIGlmIGl0J3MgdGhlIGN1cnJlbnQgdXNlciBvciBtYXN0ZXIga2V5IGlzIHByb3ZpZGVkXG4gIH0gZWxzZSBpZiAoXG4gICAgKHJlcS5hdXRoICYmXG4gICAgICByZXEuYXV0aC51c2VyICYmXG4gICAgICB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgcmVxLmdldFVzZXJJZCgpID09PSByZXEuYXV0aC51c2VyLmlkKSB8fFxuICAgIChyZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlciAmJiB0eXBlb2YgcmVxLmdldFVzZXJJZCA9PT0gJ2Z1bmN0aW9uJyAmJiByZXEuZ2V0VXNlcklkKCkpXG4gICkge1xuICAgIHVzZXIgPSBuZXcgUGFyc2UuVXNlcigpO1xuICAgIHVzZXIuaWQgPSByZXEuYXV0aC5pc01hc3RlciA/IHJlcS5nZXRVc2VySWQoKSA6IHJlcS5hdXRoLnVzZXIuaWQ7XG4gICAgYXdhaXQgdXNlci5mZXRjaCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICB1bmRlZmluZWQsXG4gICAgcmVxLmF1dGgsXG4gICAgdXBkYXRlZE9iamVjdCxcbiAgICBvcmlnaW5hbE9iamVjdCB8fCB1c2VyLFxuICAgIHJlcS5jb25maWdcbiAgKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICBjb25zdCBhY2MgPSB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfTtcbiAgY29uc3QgYXV0aEtleXMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpO1xuICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhLZXlzKSB7XG4gICAgbGV0IG1ldGhvZCA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT0gbnVsbCkge1xuICAgICAgICBEZXByZWNhdG9yLmxvZ1J1bnRpbWVEZXByZWNhdGlvbih7XG4gICAgICAgICAgdXNhZ2U6IGBhdXRoLiR7cHJvdmlkZXJ9YCxcbiAgICAgICAgICBzb2x1dGlvbjogYGF1dGguJHtwcm92aWRlcn0uZW5hYmxlZDogdHJ1ZWAsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0b3IgfHwgYXV0aFByb3ZpZGVyLmVuYWJsZWQgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRvcihhdXRoRGF0YVtwcm92aWRlcl0sIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCk7XG4gICAgICBtZXRob2QgPSB2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQubWV0aG9kO1xuICAgICAgcmVxdWVzdE9iamVjdC50cmlnZ2VyTmFtZSA9IG1ldGhvZDtcbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0ICYmIHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKSB7XG4gICAgICAgIHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0aW9uUmVzdWx0LnZhbGlkYXRvcigpO1xuICAgICAgfVxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0KSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKCFPYmplY3Qua2V5cyh2YWxpZGF0aW9uUmVzdWx0KS5sZW5ndGgpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnJlc3BvbnNlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVJlc3BvbnNlW3Byb3ZpZGVyXSA9IHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2U7XG4gICAgICB9XG4gICAgICAvLyBTb21lIGF1dGggcHJvdmlkZXJzIGFmdGVyIGluaXRpYWxpemF0aW9uIHdpbGwgYXZvaWQgdG8gcmVwbGFjZSBhdXRoRGF0YSBhbHJlYWR5IHN0b3JlZFxuICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5zYXZlIHx8IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdBdXRoIGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB1c2VyU3RyaW5nID1cbiAgICAgICAgcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiByZXEuZGF0YS5vYmplY3RJZCB8fCB1bmRlZmluZWQ7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgJHttZXRob2R9IGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICB7XG4gICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiBtZXRob2QsXG4gICAgICAgICAgZXJyb3I6IGUsXG4gICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgQXV0aCxcbiAgbWFzdGVyLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdfQ==