"use strict";

// This file contains helpers for running operations in REST format.
// The goal is that handlers that explicitly handle an express route
// should just be shallow wrappers around things in this file, but
// these functions should not explicitly depend on the request
// object.
// This means that one of these handlers can support multiple
// routes. That's useful for the routes that do really similar
// things.

var Parse = require('parse/node').Parse;
var RestQuery = require('./RestQuery');
var RestWrite = require('./RestWrite');
var triggers = require('./triggers');
const {
  enforceRoleSecurity
} = require('./SharedRest');
function checkTriggers(className, config, types) {
  return types.some(triggerType => {
    return triggers.getTrigger(className, triggers.Types[triggerType], config.applicationId);
  });
}
function checkLiveQuery(className, config) {
  return config.liveQueryController && config.liveQueryController.hasLiveQuery(className);
}

// Returns a promise for an object with optional keys 'results' and 'count'.
const find = async (config, auth, className, restWhere, restOptions, clientSDK, context) => {
  const query = await RestQuery({
    method: RestQuery.Method.find,
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK,
    context
  });
  return query.execute();
};

// get is just like find but only queries an objectId.
const get = async (config, auth, className, objectId, restOptions, clientSDK, context) => {
  var restWhere = {
    objectId
  };
  const query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK,
    context
  });
  return query.execute();
};

// Returns a promise that doesn't resolve to any useful value.
function del(config, auth, className, objectId, context) {
  if (typeof objectId !== 'string') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad objectId');
  }
  if (className === '_User' && auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Insufficient auth to delete user');
  }
  enforceRoleSecurity('delete', className, auth);
  let inflatedObject;
  let schemaController;
  return Promise.resolve().then(async () => {
    const hasTriggers = checkTriggers(className, config, ['beforeDelete', 'afterDelete']);
    const hasLiveQuery = checkLiveQuery(className, config);
    if (hasTriggers || hasLiveQuery || className == '_Session') {
      const query = await RestQuery({
        method: RestQuery.Method.get,
        config,
        auth,
        className,
        restWhere: {
          objectId
        }
      });
      return query.execute({
        op: 'delete'
      }).then(response => {
        if (response && response.results && response.results.length) {
          const firstResult = response.results[0];
          firstResult.className = className;
          if (className === '_Session' && !auth.isMaster && !auth.isMaintenance) {
            if (!auth.user || firstResult.user.objectId !== auth.user.id) {
              throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
            }
          }
          var cacheAdapter = config.cacheController;
          cacheAdapter.user.del(firstResult.sessionToken);
          inflatedObject = Parse.Object.fromJSON(firstResult);
          return triggers.maybeRunTrigger(triggers.Types.beforeDelete, auth, inflatedObject, null, config, context);
        }
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for delete.');
      });
    }
    return Promise.resolve({});
  }).then(() => {
    if (!auth.isMaster && !auth.isMaintenance) {
      return auth.getUserRoles();
    } else {
      return;
    }
  }).then(() => config.database.loadSchema()).then(s => {
    schemaController = s;
    const options = {};
    if (!auth.isMaster && !auth.isMaintenance) {
      options.acl = ['*'];
      if (auth.user) {
        options.acl.push(auth.user.id);
        options.acl = options.acl.concat(auth.userRoles);
      }
    }
    return config.database.destroy(className, {
      objectId: objectId
    }, options, schemaController);
  }).then(() => {
    // Notify LiveQuery server if possible
    const perms = schemaController.getClassLevelPermissions(className);
    config.liveQueryController.onAfterDelete(className, inflatedObject, null, perms);
    return triggers.maybeRunTrigger(triggers.Types.afterDelete, auth, inflatedObject, null, config, context);
  }).catch(error => {
    handleSessionMissingError(error, className, auth);
  });
}

// Returns a promise for a {response, status, location} object.
function create(config, auth, className, restObject, clientSDK, context) {
  enforceRoleSecurity('create', className, auth);
  var write = new RestWrite(config, auth, className, null, restObject, null, clientSDK, context);
  return write.execute();
}

// Returns a promise that contains the fields of the update that the
// REST API is supposed to return.
// Usually, this is just updatedAt.
function update(config, auth, className, restWhere, restObject, clientSDK, context) {
  enforceRoleSecurity('update', className, auth);
  return Promise.resolve().then(async () => {
    const hasTriggers = checkTriggers(className, config, ['beforeSave', 'afterSave']);
    const hasLiveQuery = checkLiveQuery(className, config);
    if (hasTriggers || hasLiveQuery) {
      // Do not use find, as it runs the before finds
      const query = await RestQuery({
        method: RestQuery.Method.get,
        config,
        auth,
        className,
        restWhere,
        runAfterFind: false,
        runBeforeFind: false,
        context
      });
      return query.execute({
        op: 'update'
      });
    }
    return Promise.resolve({});
  }).then(({
    results
  }) => {
    var originalRestObject;
    if (results && results.length) {
      originalRestObject = results[0];
    }
    return new RestWrite(config, auth, className, restWhere, restObject, originalRestObject, clientSDK, context, 'update').execute();
  }).catch(error => {
    handleSessionMissingError(error, className, auth);
  });
}
function handleSessionMissingError(error, className, auth) {
  // If we're trying to update a user without / with bad session token
  if (className === '_User' && error.code === Parse.Error.OBJECT_NOT_FOUND && !auth.isMaster && !auth.isMaintenance) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Insufficient auth.');
  }
  throw error;
}
module.exports = {
  create,
  del,
  find,
  get,
  update
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJSZXN0UXVlcnkiLCJSZXN0V3JpdGUiLCJ0cmlnZ2VycyIsImVuZm9yY2VSb2xlU2VjdXJpdHkiLCJjaGVja1RyaWdnZXJzIiwiY2xhc3NOYW1lIiwiY29uZmlnIiwidHlwZXMiLCJzb21lIiwidHJpZ2dlclR5cGUiLCJnZXRUcmlnZ2VyIiwiVHlwZXMiLCJhcHBsaWNhdGlvbklkIiwiY2hlY2tMaXZlUXVlcnkiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiaGFzTGl2ZVF1ZXJ5IiwiZmluZCIsImF1dGgiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsImNvbnRleHQiLCJxdWVyeSIsIm1ldGhvZCIsIk1ldGhvZCIsImV4ZWN1dGUiLCJnZXQiLCJvYmplY3RJZCIsImRlbCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJpbmZsYXRlZE9iamVjdCIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJoYXNUcmlnZ2VycyIsIm9wIiwicmVzcG9uc2UiLCJyZXN1bHRzIiwibGVuZ3RoIiwiZmlyc3RSZXN1bHQiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJ1c2VyIiwiaWQiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJjYWNoZUFkYXB0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJzZXNzaW9uVG9rZW4iLCJPYmplY3QiLCJmcm9tSlNPTiIsIm1heWJlUnVuVHJpZ2dlciIsImJlZm9yZURlbGV0ZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJnZXRVc2VyUm9sZXMiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJzIiwib3B0aW9ucyIsImFjbCIsInB1c2giLCJjb25jYXQiLCJ1c2VyUm9sZXMiLCJkZXN0cm95IiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyRGVsZXRlIiwiYWZ0ZXJEZWxldGUiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlU2Vzc2lvbk1pc3NpbmdFcnJvciIsImNyZWF0ZSIsInJlc3RPYmplY3QiLCJ3cml0ZSIsInVwZGF0ZSIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJvcmlnaW5hbFJlc3RPYmplY3QiLCJjb2RlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9yZXN0LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoaXMgZmlsZSBjb250YWlucyBoZWxwZXJzIGZvciBydW5uaW5nIG9wZXJhdGlvbnMgaW4gUkVTVCBmb3JtYXQuXG4vLyBUaGUgZ29hbCBpcyB0aGF0IGhhbmRsZXJzIHRoYXQgZXhwbGljaXRseSBoYW5kbGUgYW4gZXhwcmVzcyByb3V0ZVxuLy8gc2hvdWxkIGp1c3QgYmUgc2hhbGxvdyB3cmFwcGVycyBhcm91bmQgdGhpbmdzIGluIHRoaXMgZmlsZSwgYnV0XG4vLyB0aGVzZSBmdW5jdGlvbnMgc2hvdWxkIG5vdCBleHBsaWNpdGx5IGRlcGVuZCBvbiB0aGUgcmVxdWVzdFxuLy8gb2JqZWN0LlxuLy8gVGhpcyBtZWFucyB0aGF0IG9uZSBvZiB0aGVzZSBoYW5kbGVycyBjYW4gc3VwcG9ydCBtdWx0aXBsZVxuLy8gcm91dGVzLiBUaGF0J3MgdXNlZnVsIGZvciB0aGUgcm91dGVzIHRoYXQgZG8gcmVhbGx5IHNpbWlsYXJcbi8vIHRoaW5ncy5cblxudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuXG52YXIgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbnZhciBSZXN0V3JpdGUgPSByZXF1aXJlKCcuL1Jlc3RXcml0ZScpO1xudmFyIHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xuY29uc3QgeyBlbmZvcmNlUm9sZVNlY3VyaXR5IH0gPSByZXF1aXJlKCcuL1NoYXJlZFJlc3QnKTtcblxuZnVuY3Rpb24gY2hlY2tUcmlnZ2VycyhjbGFzc05hbWUsIGNvbmZpZywgdHlwZXMpIHtcbiAgcmV0dXJuIHR5cGVzLnNvbWUodHJpZ2dlclR5cGUgPT4ge1xuICAgIHJldHVybiB0cmlnZ2Vycy5nZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXNbdHJpZ2dlclR5cGVdLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjaGVja0xpdmVRdWVyeShjbGFzc05hbWUsIGNvbmZpZykge1xuICByZXR1cm4gY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIgJiYgY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KGNsYXNzTmFtZSk7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzICdyZXN1bHRzJyBhbmQgJ2NvdW50Jy5cbmNvbnN0IGZpbmQgPSBhc3luYyAoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESywgY29udGV4dCkgPT4ge1xuICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZSxcbiAgICByZXN0T3B0aW9ucyxcbiAgICBjbGllbnRTREssXG4gICAgY29udGV4dCxcbiAgfSk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCk7XG59O1xuXG4vLyBnZXQgaXMganVzdCBsaWtlIGZpbmQgYnV0IG9ubHkgcXVlcmllcyBhbiBvYmplY3RJZC5cbmNvbnN0IGdldCA9IGFzeW5jIChjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgb2JqZWN0SWQsIHJlc3RPcHRpb25zLCBjbGllbnRTREssIGNvbnRleHQpID0+IHtcbiAgdmFyIHJlc3RXaGVyZSA9IHsgb2JqZWN0SWQgfTtcbiAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZSxcbiAgICByZXN0T3B0aW9ucyxcbiAgICBjbGllbnRTREssXG4gICAgY29udGV4dCxcbiAgfSk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IGRvZXNuJ3QgcmVzb2x2ZSB0byBhbnkgdXNlZnVsIHZhbHVlLlxuZnVuY3Rpb24gZGVsKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBvYmplY3RJZCwgY29udGV4dCkge1xuICBpZiAodHlwZW9mIG9iamVjdElkICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb2JqZWN0SWQnKTtcbiAgfVxuXG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNFU1NJT05fTUlTU0lORywgJ0luc3VmZmljaWVudCBhdXRoIHRvIGRlbGV0ZSB1c2VyJyk7XG4gIH1cblxuICBlbmZvcmNlUm9sZVNlY3VyaXR5KCdkZWxldGUnLCBjbGFzc05hbWUsIGF1dGgpO1xuXG4gIGxldCBpbmZsYXRlZE9iamVjdDtcbiAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaGFzVHJpZ2dlcnMgPSBjaGVja1RyaWdnZXJzKGNsYXNzTmFtZSwgY29uZmlnLCBbJ2JlZm9yZURlbGV0ZScsICdhZnRlckRlbGV0ZSddKTtcbiAgICAgIGNvbnN0IGhhc0xpdmVRdWVyeSA9IGNoZWNrTGl2ZVF1ZXJ5KGNsYXNzTmFtZSwgY29uZmlnKTtcbiAgICAgIGlmIChoYXNUcmlnZ2VycyB8fCBoYXNMaXZlUXVlcnkgfHwgY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIHJlc3RXaGVyZTogeyBvYmplY3RJZCB9LFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoeyBvcDogJ2RlbGV0ZScgfSkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLnJlc3VsdHMgJiYgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0UmVzdWx0ID0gcmVzcG9uc2UucmVzdWx0c1swXTtcbiAgICAgICAgICAgIGZpcnN0UmVzdWx0LmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgIWF1dGguaXNNYXN0ZXIgJiYgIWF1dGguaXNNYWludGVuYW5jZSkge1xuICAgICAgICAgICAgICBpZiAoIWF1dGgudXNlciB8fCBmaXJzdFJlc3VsdC51c2VyLm9iamVjdElkICE9PSBhdXRoLnVzZXIuaWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBjYWNoZUFkYXB0ZXIgPSBjb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgICAgICAgICAgY2FjaGVBZGFwdGVyLnVzZXIuZGVsKGZpcnN0UmVzdWx0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgICAgICBpbmZsYXRlZE9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihmaXJzdFJlc3VsdCk7XG4gICAgICAgICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZmxhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGNvbnRleHRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZCBmb3IgZGVsZXRlLicpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKCFhdXRoLmlzTWFzdGVyICYmICFhdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgICAgcmV0dXJuIGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiBjb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpKVxuICAgIC50aGVuKHMgPT4ge1xuICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgICBpZiAoIWF1dGguaXNNYXN0ZXIgJiYgIWF1dGguaXNNYWludGVuYW5jZSkge1xuICAgICAgICBvcHRpb25zLmFjbCA9IFsnKiddO1xuICAgICAgICBpZiAoYXV0aC51c2VyKSB7XG4gICAgICAgICAgb3B0aW9ucy5hY2wucHVzaChhdXRoLnVzZXIuaWQpO1xuICAgICAgICAgIG9wdGlvbnMuYWNsID0gb3B0aW9ucy5hY2wuY29uY2F0KGF1dGgudXNlclJvbGVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RJZCxcbiAgICAgICAgfSxcbiAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlclxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIE5vdGlmeSBMaXZlUXVlcnkgc2VydmVyIGlmIHBvc3NpYmxlXG4gICAgICBjb25zdCBwZXJtcyA9IHNjaGVtYUNvbnRyb2xsZXIuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgICBjb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyRGVsZXRlKGNsYXNzTmFtZSwgaW5mbGF0ZWRPYmplY3QsIG51bGwsIHBlcm1zKTtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZsYXRlZE9iamVjdCxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBjb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGhhbmRsZVNlc3Npb25NaXNzaW5nRXJyb3IoZXJyb3IsIGNsYXNzTmFtZSwgYXV0aCk7XG4gICAgfSk7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZSwgc3RhdHVzLCBsb2NhdGlvbn0gb2JqZWN0LlxuZnVuY3Rpb24gY3JlYXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCByZXN0T2JqZWN0LCBjbGllbnRTREssIGNvbnRleHQpIHtcbiAgZW5mb3JjZVJvbGVTZWN1cml0eSgnY3JlYXRlJywgY2xhc3NOYW1lLCBhdXRoKTtcbiAgdmFyIHdyaXRlID0gbmV3IFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgbnVsbCwgcmVzdE9iamVjdCwgbnVsbCwgY2xpZW50U0RLLCBjb250ZXh0KTtcbiAgcmV0dXJuIHdyaXRlLmV4ZWN1dGUoKTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCBjb250YWlucyB0aGUgZmllbGRzIG9mIHRoZSB1cGRhdGUgdGhhdCB0aGVcbi8vIFJFU1QgQVBJIGlzIHN1cHBvc2VkIHRvIHJldHVybi5cbi8vIFVzdWFsbHksIHRoaXMgaXMganVzdCB1cGRhdGVkQXQuXG5mdW5jdGlvbiB1cGRhdGUoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9iamVjdCwgY2xpZW50U0RLLCBjb250ZXh0KSB7XG4gIGVuZm9yY2VSb2xlU2VjdXJpdHkoJ3VwZGF0ZScsIGNsYXNzTmFtZSwgYXV0aCk7XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaGFzVHJpZ2dlcnMgPSBjaGVja1RyaWdnZXJzKGNsYXNzTmFtZSwgY29uZmlnLCBbJ2JlZm9yZVNhdmUnLCAnYWZ0ZXJTYXZlJ10pO1xuICAgICAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gY2hlY2tMaXZlUXVlcnkoY2xhc3NOYW1lLCBjb25maWcpO1xuICAgICAgaWYgKGhhc1RyaWdnZXJzIHx8IGhhc0xpdmVRdWVyeSkge1xuICAgICAgICAvLyBEbyBub3QgdXNlIGZpbmQsIGFzIGl0IHJ1bnMgdGhlIGJlZm9yZSBmaW5kc1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICAgIHJ1bkFmdGVyRmluZDogZmFsc2UsXG4gICAgICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHtcbiAgICAgICAgICBvcDogJ3VwZGF0ZScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgfSlcbiAgICAudGhlbigoeyByZXN1bHRzIH0pID0+IHtcbiAgICAgIHZhciBvcmlnaW5hbFJlc3RPYmplY3Q7XG4gICAgICBpZiAocmVzdWx0cyAmJiByZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBvcmlnaW5hbFJlc3RPYmplY3QgPSByZXN1bHRzWzBdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5ldyBSZXN0V3JpdGUoXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgIHJlc3RPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsUmVzdE9iamVjdCxcbiAgICAgICAgY2xpZW50U0RLLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICAndXBkYXRlJ1xuICAgICAgKS5leGVjdXRlKCk7XG4gICAgfSlcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaGFuZGxlU2Vzc2lvbk1pc3NpbmdFcnJvcihlcnJvciwgY2xhc3NOYW1lLCBhdXRoKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU2Vzc2lvbk1pc3NpbmdFcnJvcihlcnJvciwgY2xhc3NOYW1lLCBhdXRoKSB7XG4gIC8vIElmIHdlJ3JlIHRyeWluZyB0byB1cGRhdGUgYSB1c2VyIHdpdGhvdXQgLyB3aXRoIGJhZCBzZXNzaW9uIHRva2VuXG4gIGlmIChcbiAgICBjbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EICYmXG4gICAgIWF1dGguaXNNYXN0ZXIgJiZcbiAgICAhYXV0aC5pc01haW50ZW5hbmNlXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsICdJbnN1ZmZpY2llbnQgYXV0aC4nKTtcbiAgfVxuICB0aHJvdyBlcnJvcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNyZWF0ZSxcbiAgZGVsLFxuICBmaW5kLFxuICBnZXQsXG4gIHVwZGF0ZSxcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQ0QsS0FBSztBQUV2QyxJQUFJRSxTQUFTLEdBQUdELE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDdEMsSUFBSUUsU0FBUyxHQUFHRixPQUFPLENBQUMsYUFBYSxDQUFDO0FBQ3RDLElBQUlHLFFBQVEsR0FBR0gsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUNwQyxNQUFNO0VBQUVJO0FBQW9CLENBQUMsR0FBR0osT0FBTyxDQUFDLGNBQWMsQ0FBQztBQUV2RCxTQUFTSyxhQUFhQSxDQUFDQyxTQUFTLEVBQUVDLE1BQU0sRUFBRUMsS0FBSyxFQUFFO0VBQy9DLE9BQU9BLEtBQUssQ0FBQ0MsSUFBSSxDQUFDQyxXQUFXLElBQUk7SUFDL0IsT0FBT1AsUUFBUSxDQUFDUSxVQUFVLENBQUNMLFNBQVMsRUFBRUgsUUFBUSxDQUFDUyxLQUFLLENBQUNGLFdBQVcsQ0FBQyxFQUFFSCxNQUFNLENBQUNNLGFBQWEsQ0FBQztFQUMxRixDQUFDLENBQUM7QUFDSjtBQUVBLFNBQVNDLGNBQWNBLENBQUNSLFNBQVMsRUFBRUMsTUFBTSxFQUFFO0VBQ3pDLE9BQU9BLE1BQU0sQ0FBQ1EsbUJB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