"use strict";

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Parse = require('parse/node');

const reducePromise = async (arr, fn, acc, index = 0) => {
  if (arr[index]) {
    const newAcc = await Promise.resolve(fn(acc, arr[index]));
    return reducePromise(arr, fn, newAcc, index + 1);
  }

  return acc;
}; // An Auth object tells you who is requesting something and whether
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
    }; // For cyclic dep

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
  }; // For cyclic dep

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
    }; // For cyclic dep

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
    }; // For cyclic dep

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
  let findPromise = Promise.resolve([]);

  if (query.length > 0) {
    findPromise = config.database.find('_User', {
      $or: query
    }, {});
  }

  return findPromise;
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

    if (!_lodash.default.isEqual(providerData, userProviderAuthData)) {
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
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]); // Solo providers can be considered as safe
  // so we do not have to check if the user need
  // to provide an additional provider to login

  if (hasProvidedASoloProvider) return;
  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    if (provider && provider.adapter && provider.adapter.policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for plausible error return
        additionProvidersNotFound.push(provider.name);
      }
    }
  });
  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) return;
  throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Missing additional authData ${additionProvidersNotFound.join(',')}`);
}; // Validate each authData step by step and return the provider responses


const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;

  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser)); // Find the user by session and current object id
    // Only pass user if it's the current one or master key with provided user
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  } // Perform validation as step by step pipeline
  // for better error consistency and also to avoid to trigger a provider (like OTP SMS)
  // if another one fail


  return reducePromise( // apply sort to run the pipeline each time in the same order
  Object.keys(authData).sort(), async (acc, provider) => {
    if (authData[provider] === null) {
      acc.authData[provider] = null;
      return acc;
    }

    const {
      validator
    } = req.config.authDataManager.getValidatorForProvider(provider);

    if (!validator) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }

    const validationResult = await validator(authData[provider], {
      config: req.config,
      auth: req.auth
    }, user);

    if (validationResult) {
      if (!Object.keys(validationResult).length) acc.authData[provider] = authData[provider];
      if (validationResult.response) acc.authDataResponse[provider] = validationResult.response; // Some auth providers after initialization will avoid
      // to replace authData already stored

      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } else {
      // Support current authData behavior
      // no result store the new AuthData
      acc.authData[provider] = authData[provider];
    }

    return acc;
  }, {
    authData: {},
    authDataResponse: {}
  });
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
  reducePromise,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsInJlZHVjZVByb21pc2UiLCJhcnIiLCJmbiIsImFjYyIsImluZGV4IiwibmV3QWNjIiwiUHJvbWlzZSIsInJlc29sdmUiLCJBdXRoIiwiY29uZmlnIiwiY2FjaGVDb250cm9sbGVyIiwidW5kZWZpbmVkIiwiaXNNYXN0ZXIiLCJpc1JlYWRPbmx5IiwidXNlciIsImluc3RhbGxhdGlvbklkIiwidXNlclJvbGVzIiwiZmV0Y2hlZFJvbGVzIiwicm9sZVByb21pc2UiLCJwcm90b3R5cGUiLCJpc1VuYXV0aGVudGljYXRlZCIsIm1hc3RlciIsInJlYWRPbmx5Iiwibm9ib2R5IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInNlc3Npb25Ub2tlbiIsInVzZXJKU09OIiwiZ2V0IiwiY2FjaGVkVXNlciIsIk9iamVjdCIsImZyb21KU09OIiwicmVzdWx0cyIsInJlc3RPcHRpb25zIiwibGltaXQiLCJpbmNsdWRlIiwiUmVzdFF1ZXJ5IiwicXVlcnkiLCJleGVjdXRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJvYmoiLCJ0b0pTT04iLCJsZW5ndGgiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsIkRhdGUiLCJleHBpcmVzQXQiLCJpc28iLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiY2xhc3NOYW1lIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInJlc3RXaGVyZSIsInVzZXJzIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwia2V5cyIsInByb3ZpZGVyIiwicXVlcnlLZXkiLCJxIiwiZmluZFByb21pc2UiLCJkYXRhYmFzZSIsIiRvciIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsImZvckVhY2giLCJwcm92aWRlckRhdGEiLCJ1c2VyUHJvdmlkZXJBdXRoRGF0YSIsIl8iLCJpc0VxdWFsIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsInNhdmVkVXNlclByb3ZpZGVycyIsImFkYXB0ZXIiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlciIsInNvbWUiLCJwb2xpY3kiLCJhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kIiwiaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIiwiT1RIRVJfQ0FVU0UiLCJqb2luIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwicmVxIiwiZm91bmRVc2VyIiwiVXNlciIsImF1dGgiLCJnZXRVc2VySWQiLCJmZXRjaCIsInNvcnQiLCJ2YWxpZGF0b3IiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsImF1dGhEYXRhUmVzcG9uc2UiLCJkb05vdFNhdmUiLCJzYXZlIiwibW9kdWxlIiwi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QUFBQSw0QkFOZTtBQU9mMkMsRUFBQUEscUJBUGU7QUFRZlUsRUFBQUEsa0JBUmU7QUFTZlEsRUFBQUEsaURBVGU7QUFVZnJILEVBQUFBLGFBVmU7QUFXZmlJLEVBQUFBO0FBWGUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5cbmNvbnN0IHJlZHVjZVByb21pc2UgPSBhc3luYyAoYXJyLCBmbiwgYWNjLCBpbmRleCA9IDApID0+IHtcbiAgaWYgKGFycltpbmRleF0pIHtcbiAgICBjb25zdCBuZXdBY2MgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoZm4oYWNjLCBhcnJbaW5kZXhdKSk7XG4gICAgcmV0dXJuIHJlZHVjZVByb21pc2UoYXJyLCBmbiwgbmV3QWNjLCBpbmRleCArIDEpO1xuICB9XG4gIHJldHVybiBhY2M7XG59O1xuXG4vLyBBbiBBdXRoIG9iamVjdCB0ZWxscyB5b3Ugd2hvIGlzIHJlcXVlc3Rpbmcgc29tZXRoaW5nIGFuZCB3aGV0aGVyXG4vLyB0aGUgbWFzdGVyIGtleSB3YXMgdXNlZC5cbi8vIHVzZXJPYmplY3QgaXMgYSBQYXJzZS5Vc2VyIGFuZCBjYW4gYmUgbnVsbCBpZiB0aGVyZSdzIG5vIHVzZXIuXG5mdW5jdGlvbiBBdXRoKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIgPSB1bmRlZmluZWQsXG4gIGlzTWFzdGVyID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgbmV3IEF1dGgoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgIHVzZXI6IGNhY2hlZFVzZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGxldCByZXN1bHRzO1xuICBpZiAoY29uZmlnKSB7XG4gICAgY29uc3QgcmVzdE9wdGlvbnMgPSB7XG4gICAgICBsaW1pdDogMSxcbiAgICAgIGluY2x1ZGU6ICd1c2VyJyxcbiAgICB9O1xuICAgIC8vIEZvciBjeWNsaWMgZGVwXG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBtYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgeyBzZXNzaW9uVG9rZW4gfSwgcmVzdE9wdGlvbnMpO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoXG4gICAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuU2Vzc2lvbilcbiAgICAgICAgLmxpbWl0KDEpXG4gICAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgICAgLmVxdWFsVG8oJ3Nlc3Npb25Ub2tlbicsIHNlc3Npb25Ub2tlbilcbiAgICAgICAgLmZpbmQoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSlcbiAgICApLm1hcChvYmogPT4gb2JqLnRvSlNPTigpKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSB8fCAhcmVzdWx0c1swXVsndXNlciddKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICB9XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gcmVzdWx0c1swXS5leHBpcmVzQXQgPyBuZXcgRGF0ZShyZXN1bHRzWzBdLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSByZXN1bHRzWzBdWyd1c2VyJ107XG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShjb25maWcsIG1hc3Rlcihjb25maWcpLCAnX1VzZXInLCB7IHNlc3Npb25Ub2tlbiB9LCByZXN0T3B0aW9ucyk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgIXRoaXMudXNlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG4gIGlmICh0aGlzLmZldGNoZWRSb2xlcykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy51c2VyUm9sZXMpO1xuICB9XG4gIGlmICh0aGlzLnJvbGVQcm9taXNlKSB7XG4gICAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG4gIH1cbiAgdGhpcy5yb2xlUHJvbWlzZSA9IHRoaXMuX2xvYWRSb2xlcygpO1xuICByZXR1cm4gdGhpcy5yb2xlUHJvbWlzZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzRm9yVXNlciA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgLy8gRm9yIGN5Y2xpYyBkZXBcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGF3YWl0IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIG1hc3Rlcih0aGlzLmNvbmZpZyksICdfUm9sZScsIHJlc3RXaGVyZSwge30pLmVhY2gocmVzdWx0ID0+XG4gICAgICByZXN1bHRzLnB1c2gocmVzdWx0KVxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuZXF1YWxUbygndXNlcnMnLCB0aGlzLnVzZXIpXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gSXRlcmF0ZXMgdGhyb3VnaCB0aGUgcm9sZSB0cmVlIGFuZCBjb21waWxlcyBhIHVzZXIncyByb2xlc1xuQXV0aC5wcm90b3R5cGUuX2xvYWRSb2xlcyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJvbGVzTWFwLmlkcywgcm9sZXNNYXAubmFtZXMpO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5wdXQodGhpcy51c2VyLmlkLCBBcnJheSguLi50aGlzLnVzZXJSb2xlcykpO1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkF1dGgucHJvdG90eXBlLmdldFJvbGVzQnlJZHMgPSBhc3luYyBmdW5jdGlvbiAoaW5zKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcbiAgLy8gQnVpbGQgYW4gT1IgcXVlcnkgYWNyb3NzIGFsbCBwYXJlbnRSb2xlc1xuICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlJvbGUpXG4gICAgICAuY29udGFpbmVkSW4oXG4gICAgICAgICdyb2xlcycsXG4gICAgICAgIGlucy5tYXAoaWQgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgUGFyc2UuT2JqZWN0KFBhcnNlLlJvbGUpO1xuICAgICAgICAgIHJvbGUuaWQgPSBpZDtcbiAgICAgICAgICByZXR1cm4gcm9sZTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgcm9sZXMgPSBpbnMubWFwKGlkID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgY29uc3QgcmVzdFdoZXJlID0geyByb2xlczogeyAkaW46IHJvbGVzIH0gfTtcbiAgICAvLyBGb3IgY3ljbGljIGRlcFxuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFzdGVyKHRoaXMuY29uZmlnKSwgJ19Sb2xlJywgcmVzdFdoZXJlLCB7fSkuZWFjaChyZXN1bHQgPT5cbiAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEdpdmVuIGEgbGlzdCBvZiByb2xlSWRzLCBmaW5kIGFsbCB0aGUgcGFyZW50IHJvbGVzLCByZXR1cm5zIGEgcHJvbWlzZSB3aXRoIGFsbCBuYW1lc1xuQXV0aC5wcm90b3R5cGUuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzID0gZnVuY3Rpb24gKHJvbGVJRHMsIG5hbWVzID0gW10sIHF1ZXJpZWRSb2xlcyA9IHt9KSB7XG4gIGNvbnN0IGlucyA9IHJvbGVJRHMuZmlsdGVyKHJvbGVJRCA9PiB7XG4gICAgY29uc3Qgd2FzUXVlcmllZCA9IHF1ZXJpZWRSb2xlc1tyb2xlSURdICE9PSB0cnVlO1xuICAgIHF1ZXJpZWRSb2xlc1tyb2xlSURdID0gdHJ1ZTtcbiAgICByZXR1cm4gd2FzUXVlcmllZDtcbiAgfSk7XG5cbiAgLy8gYWxsIHJvbGVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZXR1cm4gdGhlIG5hbWVzXG4gIGlmIChpbnMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZ2V0Um9sZXNCeUlkcyhpbnMpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBOb3RoaW5nIGZvdW5kXG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmFtZXMpO1xuICAgICAgfVxuICAgICAgLy8gTWFwIHRoZSByZXN1bHRzIHdpdGggYWxsIElkcyBhbmQgbmFtZXNcbiAgICAgIGNvbnN0IHJlc3VsdE1hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgICAgICAobWVtbywgcm9sZSkgPT4ge1xuICAgICAgICAgIG1lbW8ubmFtZXMucHVzaChyb2xlLm5hbWUpO1xuICAgICAgICAgIG1lbW8uaWRzLnB1c2gocm9sZS5vYmplY3RJZCk7XG4gICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgIH0sXG4gICAgICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgICAgICk7XG4gICAgICAvLyBzdG9yZSB0aGUgbmV3IGZvdW5kIG5hbWVzXG4gICAgICBuYW1lcyA9IG5hbWVzLmNvbmNhdChyZXN1bHRNYXAubmFtZXMpO1xuICAgICAgLy8gZmluZCB0aGUgbmV4dCBvbmVzLCBjaXJjdWxhciByb2xlcyB3aWxsIGJlIGN1dFxuICAgICAgcmV0dXJuIHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKHJlc3VsdE1hcC5pZHMsIG5hbWVzLCBxdWVyaWVkUm9sZXMpO1xuICAgIH0pXG4gICAgLnRoZW4obmFtZXMgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IChjb25maWcsIGF1dGhEYXRhKSA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0gfHwgKGF1dGhEYXRhICYmICFhdXRoRGF0YVtwcm92aWRlcl0uaWQpKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICBsZXQgZmluZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoW10pO1xuICBpZiAocXVlcnkubGVuZ3RoID4gMCkge1xuICAgIGZpbmRQcm9taXNlID0gY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyAkb3I6IHF1ZXJ5IH0sIHt9KTtcbiAgfVxuXG4gIHJldHVybiBmaW5kUHJvbWlzZTtcbn07XG5cbmNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IChhdXRoRGF0YSwgdXNlckF1dGhEYXRhKSA9PiB7XG4gIGlmICghdXNlckF1dGhEYXRhKSByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGE6IHRydWUsIG11dGF0ZWRBdXRoRGF0YTogYXV0aERhdGEgfTtcbiAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAvLyBBbm9ueW1vdXMgcHJvdmlkZXIgaXMgbm90IGhhbmRsZWQgdGhpcyB3YXlcbiAgICBpZiAocHJvdmlkZXIgPT09ICdhbm9ueW1vdXMnKSByZXR1cm47XG4gICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGNvbnN0IHVzZXJQcm92aWRlckF1dGhEYXRhID0gdXNlckF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBpZiAoIV8uaXNFcXVhbChwcm92aWRlckRhdGEsIHVzZXJQcm92aWRlckF1dGhEYXRhKSkge1xuICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgcmV0dXJuIHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfTtcbn07XG5cbmNvbnN0IGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4gPSAoXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZVxuICAvLyBzbyB3ZSBkbyBub3QgaGF2ZSB0byBjaGVjayBpZiB0aGUgdXNlciBuZWVkXG4gIC8vIHRvIHByb3ZpZGUgYW4gYWRkaXRpb25hbCBwcm92aWRlciB0byBsb2dpblxuICBpZiAoaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyKSByZXR1cm47XG5cbiAgY29uc3QgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZCA9IFtdO1xuICBjb25zdCBoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgaWYgKHByb3ZpZGVyICYmIHByb3ZpZGVyLmFkYXB0ZXIgJiYgcHJvdmlkZXIuYWRhcHRlci5wb2xpY3kgPT09ICdhZGRpdGlvbmFsJykge1xuICAgICAgaWYgKGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUHVzaCBtaXNzaW5nIHByb3ZpZGVyIGZvciBwbGF1c2libGUgZXJyb3IgcmV0dXJuXG4gICAgICAgIGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQucHVzaChwcm92aWRlci5uYW1lKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBpZiAoaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyIHx8ICFhZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmxlbmd0aCkgcmV0dXJuO1xuXG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICBgTWlzc2luZyBhZGRpdGlvbmFsIGF1dGhEYXRhICR7YWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5qb2luKCcsJyl9YFxuICApO1xufTtcblxuLy8gVmFsaWRhdGUgZWFjaCBhdXRoRGF0YSBzdGVwIGJ5IHN0ZXAgYW5kIHJldHVybiB0aGUgcHJvdmlkZXIgcmVzcG9uc2VzXG5jb25zdCBoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBhc3luYyAoYXV0aERhdGEsIHJlcSwgZm91bmRVc2VyKSA9PiB7XG4gIGxldCB1c2VyO1xuICBpZiAoZm91bmRVc2VyKSB7XG4gICAgdXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZvdW5kVXNlciB9KTtcbiAgICAvLyBGaW5kIHRoZSB1c2VyIGJ5IHNlc3Npb24gYW5kIGN1cnJlbnQgb2JqZWN0IGlkXG4gICAgLy8gT25seSBwYXNzIHVzZXIgaWYgaXQncyB0aGUgY3VycmVudCBvbmUgb3IgbWFzdGVyIGtleSB3aXRoIHByb3ZpZGVkIHVzZXJcbiAgfSBlbHNlIGlmIChcbiAgICAocmVxLmF1dGggJiZcbiAgICAgIHJlcS5hdXRoLnVzZXIgJiZcbiAgICAgIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmXG4gICAgICByZXEuZ2V0VXNlcklkKCkgPT09IHJlcS5hdXRoLnVzZXIuaWQpIHx8XG4gICAgKHJlcS5hdXRoICYmIHJlcS5hdXRoLmlzTWFzdGVyICYmIHR5cGVvZiByZXEuZ2V0VXNlcklkID09PSAnZnVuY3Rpb24nICYmIHJlcS5nZXRVc2VySWQoKSlcbiAgKSB7XG4gICAgdXNlciA9IG5ldyBQYXJzZS5Vc2VyKCk7XG4gICAgdXNlci5pZCA9IHJlcS5hdXRoLmlzTWFzdGVyID8gcmVxLmdldFVzZXJJZCgpIDogcmVxLmF1dGgudXNlci5pZDtcbiAgICBhd2FpdCB1c2VyLmZldGNoKHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG5cbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAgYnkgc3RlcCBwaXBlbGluZVxuICAvLyBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5IGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKVxuICAvLyBpZiBhbm90aGVyIG9uZSBmYWlsXG4gIHJldHVybiByZWR1Y2VQcm9taXNlKFxuICAgIC8vIGFwcGx5IHNvcnQgdG8gcnVuIHRoZSBwaXBlbGluZSBlYWNoIHRpbWUgaW4gdGhlIHNhbWUgb3JkZXJcblxuICAgIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5zb3J0KCksXG4gICAgYXN5bmMgKGFjYywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG51bGw7XG4gICAgICAgIHJldHVybiBhY2M7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgaWYgKCF2YWxpZGF0b3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHZhbGlkYXRpb25SZXN1bHQgPSBhd2FpdCB2YWxpZGF0b3IoXG4gICAgICAgIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgeyBjb25maWc6IHJlcS5jb25maWcsIGF1dGg6IHJlcS5hdXRoIH0sXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBpZiAodmFsaWRhdGlvblJlc3VsdCkge1xuICAgICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcblxuICAgICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZSkgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgICAgLy8gU29tZSBhdXRoIHByb3ZpZGVycyBhZnRlciBpbml0aWFsaXphdGlvbiB3aWxsIGF2b2lkXG4gICAgICAgIC8vIHRvIHJlcGxhY2UgYXV0aERhdGEgYWxyZWFkeSBzdG9yZWRcbiAgICAgICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LmRvTm90U2F2ZSkge1xuICAgICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBTdXBwb3J0IGN1cnJlbnQgYXV0aERhdGEgYmVoYXZpb3JcbiAgICAgICAgLy8gbm8gcmVzdWx0IHN0b3JlIHRoZSBuZXcgQXV0aERhdGFcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSxcbiAgICB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfVxuICApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgZmluZFVzZXJzV2l0aEF1dGhEYXRhLFxuICBoYXNNdXRhdGVkQXV0aERhdGEsXG4gIGNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4sXG4gIHJlZHVjZVByb21pc2UsXG4gIGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbixcbn07XG4iXX0=