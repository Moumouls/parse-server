"use strict";

/*
  # Parse Server Keycloak Authentication

  ## Keycloak `authData`

  ```
    {
      "keycloak": {
        "access_token": "access token you got from keycloak JS client authentication",
        "id": "the id retrieved from client authentication in Keycloak",
        "roles": ["the roles retrieved from client authentication in Keycloak"],
        "groups": ["the groups retrieved from client authentication in Keycloak"]
      }
    }
  ```

  The authentication module will test if the authData is the same as the
  userinfo oauth call, comparing the attributes

  Copy the JSON config file generated on Keycloak (https://www.keycloak.org/docs/latest/securing_apps/index.html#_javascript_adapter)
  and paste it inside of a folder (Ex.: `auth/keycloak.json`) in your server.

  The options passed to Parse server:

  ```
    {
      auth: {
        keycloak: {
          config: require(`./auth/keycloak.json`)
        }
      }
    }
  ```
*/

const {
  Parse
} = require('parse/node');
const httpsRequest = require('./httpsRequest');
const arraysEqual = (_arr1, _arr2) => {
  if (!Array.isArray(_arr1) || !Array.isArray(_arr2) || _arr1.length !== _arr2.length) return false;
  var arr1 = _arr1.concat().sort();
  var arr2 = _arr2.concat().sort();
  for (var i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
};
const handleAuth = async ({
  access_token,
  id,
  roles,
  groups
} = {}, {
  config
} = {}) => {
  if (!(access_token && id)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing access token and/or User id');
  }
  if (!config || !(config['auth-server-url'] && config['realm'])) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Missing keycloak configuration');
  }
  try {
    const response = await httpsRequest.get({
      host: config['auth-server-url'],
      path: `/realms/${config['realm']}/protocol/openid-connect/userinfo`,
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    });
    if (response && response.data && response.data.sub == id && arraysEqual(response.data.roles, roles) && arraysEqual(response.data.groups, groups)) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid authentication');
  } catch (e) {
    if (e instanceof Parse.Error) {
      throw e;
    }
    const error = JSON.parse(e.text);
    if (error.error_description) {
      throw new Parse.Error(Parse.Error.HOSTING_ERROR, error.error_description);
    } else {
      throw new Parse.Error(Parse.Error.HOSTING_ERROR, 'Could not connect to the authentication server');
    }
  }
};

/*
  @param {Object} authData: the client provided authData
  @param {string} authData.access_token: the access_token retrieved from client authentication in Keycloak
  @param {string} authData.id: the id retrieved from client authentication in Keycloak
  @param {Array}  authData.roles: the roles retrieved from client authentication in Keycloak
  @param {Array}  authData.groups: the groups retrieved from client authentication in Keycloak
  @param {Object} options: additional options
  @param {Object} options.config: the config object passed during Parse Server instantiation
*/
function validateAuthData(authData, options = {}) {
  return handleAuth(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}
module.exports = {
  validateAppId,
  validateAuthData
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJodHRwc1JlcXVlc3QiLCJhcnJheXNFcXVhbCIsIl9hcnIxIiwiX2FycjIiLCJBcnJheSIsImlzQXJyYXkiLCJsZW5ndGgiLCJhcnIxIiwiY29uY2F0Iiwic29ydCIsImFycjIiLCJpIiwiaGFuZGxlQXV0aCIsImFjY2Vzc190b2tlbiIsImlkIiwicm9sZXMiLCJncm91cHMiLCJjb25maWciLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJyZXNwb25zZSIsImdldCIsImhvc3QiLCJwYXRoIiwiaGVhZGVycyIsIkF1dGhvcml6YXRpb24iLCJkYXRhIiwic3ViIiwiZSIsImVycm9yIiwiSlNPTiIsInBhcnNlIiwidGV4dCIsImVycm9yX2Rlc2NyaXB0aW9uIiwiSE9TVElOR19FUlJPUiIsInZhbGlkYXRlQXV0aERhdGEiLCJhdXRoRGF0YSIsIm9wdGlvbnMiLCJ2YWxpZGF0ZUFwcElkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgva2V5Y2xvYWsuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLypcbiAgIyBQYXJzZSBTZXJ2ZXIgS2V5Y2xvYWsgQXV0aGVudGljYXRpb25cblxuICAjIyBLZXljbG9hayBgYXV0aERhdGFgXG5cbiAgYGBgXG4gICAge1xuICAgICAgXCJrZXljbG9ha1wiOiB7XG4gICAgICAgIFwiYWNjZXNzX3Rva2VuXCI6IFwiYWNjZXNzIHRva2VuIHlvdSBnb3QgZnJvbSBrZXljbG9hayBKUyBjbGllbnQgYXV0aGVudGljYXRpb25cIixcbiAgICAgICAgXCJpZFwiOiBcInRoZSBpZCByZXRyaWV2ZWQgZnJvbSBjbGllbnQgYXV0aGVudGljYXRpb24gaW4gS2V5Y2xvYWtcIixcbiAgICAgICAgXCJyb2xlc1wiOiBbXCJ0aGUgcm9sZXMgcmV0cmlldmVkIGZyb20gY2xpZW50IGF1dGhlbnRpY2F0aW9uIGluIEtleWNsb2FrXCJdLFxuICAgICAgICBcImdyb3Vwc1wiOiBbXCJ0aGUgZ3JvdXBzIHJldHJpZXZlZCBmcm9tIGNsaWVudCBhdXRoZW50aWNhdGlvbiBpbiBLZXljbG9ha1wiXVxuICAgICAgfVxuICAgIH1cbiAgYGBgXG5cbiAgVGhlIGF1dGhlbnRpY2F0aW9uIG1vZHVsZSB3aWxsIHRlc3QgaWYgdGhlIGF1dGhEYXRhIGlzIHRoZSBzYW1lIGFzIHRoZVxuICB1c2VyaW5mbyBvYXV0aCBjYWxsLCBjb21wYXJpbmcgdGhlIGF0dHJpYnV0ZXNcblxuICBDb3B5IHRoZSBKU09OIGNvbmZpZyBmaWxlIGdlbmVyYXRlZCBvbiBLZXljbG9hayAoaHR0cHM6Ly93d3cua2V5Y2xvYWsub3JnL2RvY3MvbGF0ZXN0L3NlY3VyaW5nX2FwcHMvaW5kZXguaHRtbCNfamF2YXNjcmlwdF9hZGFwdGVyKVxuICBhbmQgcGFzdGUgaXQgaW5zaWRlIG9mIGEgZm9sZGVyIChFeC46IGBhdXRoL2tleWNsb2FrLmpzb25gKSBpbiB5b3VyIHNlcnZlci5cblxuICBUaGUgb3B0aW9ucyBwYXNzZWQgdG8gUGFyc2Ugc2VydmVyOlxuXG4gIGBgYFxuICAgIHtcbiAgICAgIGF1dGg6IHtcbiAgICAgICAga2V5Y2xvYWs6IHtcbiAgICAgICAgICBjb25maWc6IHJlcXVpcmUoYC4vYXV0aC9rZXljbG9hay5qc29uYClcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgYGBgXG4qL1xuXG5jb25zdCB7IFBhcnNlIH0gPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5jb25zdCBodHRwc1JlcXVlc3QgPSByZXF1aXJlKCcuL2h0dHBzUmVxdWVzdCcpO1xuXG5jb25zdCBhcnJheXNFcXVhbCA9IChfYXJyMSwgX2FycjIpID0+IHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KF9hcnIxKSB8fCAhQXJyYXkuaXNBcnJheShfYXJyMikgfHwgX2FycjEubGVuZ3RoICE9PSBfYXJyMi5sZW5ndGgpIHJldHVybiBmYWxzZTtcblxuICB2YXIgYXJyMSA9IF9hcnIxLmNvbmNhdCgpLnNvcnQoKTtcbiAgdmFyIGFycjIgPSBfYXJyMi5jb25jYXQoKS5zb3J0KCk7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIxLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGFycjFbaV0gIT09IGFycjJbaV0pIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuY29uc3QgaGFuZGxlQXV0aCA9IGFzeW5jICh7IGFjY2Vzc190b2tlbiwgaWQsIHJvbGVzLCBncm91cHMgfSA9IHt9LCB7IGNvbmZpZyB9ID0ge30pID0+IHtcbiAgaWYgKCEoYWNjZXNzX3Rva2VuICYmIGlkKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnTWlzc2luZyBhY2Nlc3MgdG9rZW4gYW5kL29yIFVzZXIgaWQnKTtcbiAgfVxuICBpZiAoIWNvbmZpZyB8fCAhKGNvbmZpZ1snYXV0aC1zZXJ2ZXItdXJsJ10gJiYgY29uZmlnWydyZWFsbSddKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnTWlzc2luZyBrZXljbG9hayBjb25maWd1cmF0aW9uJyk7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGh0dHBzUmVxdWVzdC5nZXQoe1xuICAgICAgaG9zdDogY29uZmlnWydhdXRoLXNlcnZlci11cmwnXSxcbiAgICAgIHBhdGg6IGAvcmVhbG1zLyR7Y29uZmlnWydyZWFsbSddfS9wcm90b2NvbC9vcGVuaWQtY29ubmVjdC91c2VyaW5mb2AsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246ICdCZWFyZXIgJyArIGFjY2Vzc190b2tlbixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgaWYgKFxuICAgICAgcmVzcG9uc2UgJiZcbiAgICAgIHJlc3BvbnNlLmRhdGEgJiZcbiAgICAgIHJlc3BvbnNlLmRhdGEuc3ViID09IGlkICYmXG4gICAgICBhcnJheXNFcXVhbChyZXNwb25zZS5kYXRhLnJvbGVzLCByb2xlcykgJiZcbiAgICAgIGFycmF5c0VxdWFsKHJlc3BvbnNlLmRhdGEuZ3JvdXBzLCBncm91cHMpXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCBhdXRoZW50aWNhdGlvbicpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGUgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgY29uc3QgZXJyb3IgPSBKU09OLnBhcnNlKGUudGV4dCk7XG4gICAgaWYgKGVycm9yLmVycm9yX2Rlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSE9TVElOR19FUlJPUiwgZXJyb3IuZXJyb3JfZGVzY3JpcHRpb24pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLkhPU1RJTkdfRVJST1IsXG4gICAgICAgICdDb3VsZCBub3QgY29ubmVjdCB0byB0aGUgYXV0aGVudGljYXRpb24gc2VydmVyJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qXG4gIEBwYXJhbSB7T2JqZWN0fSBhdXRoRGF0YTogdGhlIGNsaWVudCBwcm92aWRlZCBhdXRoRGF0YVxuICBAcGFyYW0ge3N0cmluZ30gYXV0aERhdGEuYWNjZXNzX3Rva2VuOiB0aGUgYWNjZXNzX3Rva2VuIHJldHJpZXZlZCBmcm9tIGNsaWVudCBhdXRoZW50aWNhdGlvbiBpbiBLZXljbG9ha1xuICBAcGFyYW0ge3N0cmluZ30gYXV0aERhdGEuaWQ6IHRoZSBpZCByZXRyaWV2ZWQgZnJvbSBjbGllbnQgYXV0aGVudGljYXRpb24gaW4gS2V5Y2xvYWtcbiAgQHBhcmFtIHtBcnJheX0gIGF1dGhEYXRhLnJvbGVzOiB0aGUgcm9sZXMgcmV0cmlldmVkIGZyb20gY2xpZW50IGF1dGhlbnRpY2F0aW9uIGluIEtleWNsb2FrXG4gIEBwYXJhbSB7QXJyYXl9ICBhdXRoRGF0YS5ncm91cHM6IHRoZSBncm91cHMgcmV0cmlldmVkIGZyb20gY2xpZW50IGF1dGhlbnRpY2F0aW9uIGluIEtleWNsb2FrXG4gIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zOiBhZGRpdGlvbmFsIG9wdGlvbnNcbiAgQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMuY29uZmlnOiB0aGUgY29uZmlnIG9iamVjdCBwYXNzZWQgZHVyaW5nIFBhcnNlIFNlcnZlciBpbnN0YW50aWF0aW9uXG4qL1xuZnVuY3Rpb24gdmFsaWRhdGVBdXRoRGF0YShhdXRoRGF0YSwgb3B0aW9ucyA9IHt9KSB7XG4gIHJldHVybiBoYW5kbGVBdXRoKGF1dGhEYXRhLCBvcHRpb25zKTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCBmdWxmaWxscyBpZiB0aGlzIGFwcCBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXBwSWQoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHZhbGlkYXRlQXBwSWQsXG4gIHZhbGlkYXRlQXV0aERhdGEsXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLE1BQU07RUFBRUE7QUFBTSxDQUFDLEdBQUdDLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDdkMsTUFBTUMsWUFBWSxHQUFHRCxPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFFOUMsTUFBTUUs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