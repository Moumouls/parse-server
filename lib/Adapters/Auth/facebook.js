"use strict";

// Helper functions for accessing the Facebook Graph API.
const Parse = require('parse/node').Parse;
const crypto = require('crypto');
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');
const httpsRequest = require('./httpsRequest');
const authUtils = require('./utils');
const TOKEN_ISSUER = 'https://facebook.com';
function getAppSecretPath(authData, options = {}) {
  const appSecret = options.appSecret;
  if (!appSecret) {
    return '';
  }
  const appsecret_proof = crypto.createHmac('sha256', appSecret).update(authData.access_token).digest('hex');
  return `&appsecret_proof=${appsecret_proof}`;
}
function validateGraphToken(authData, options) {
  return graphRequest('me?fields=id&access_token=' + authData.access_token + getAppSecretPath(authData, options)).then(data => {
    if (data && data.id == authData.id || process.env.TESTING && authData.id === 'test') {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
  });
}
async function validateGraphAppId(appIds, authData, options) {
  var access_token = authData.access_token;
  if (process.env.TESTING && access_token === 'test') {
    return;
  }
  if (!Array.isArray(appIds)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'appIds must be an array.');
  }
  if (!appIds.length) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is not configured.');
  }
  const data = await graphRequest(`app?access_token=${access_token}${getAppSecretPath(authData, options)}`);
  if (!data || !appIds.includes(data.id)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
  }
}
const getFacebookKeyByKeyId = async (keyId, cacheMaxEntries, cacheMaxAge) => {
  const client = jwksClient({
    jwksUri: `${TOKEN_ISSUER}/.well-known/oauth/openid/jwks/`,
    cache: true,
    cacheMaxEntries,
    cacheMaxAge
  });
  let key;
  try {
    key = await authUtils.getSigningKey(client, keyId);
  } catch (error) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Unable to find matching key for Key ID: ${keyId}`);
  }
  return key;
};
const verifyIdToken = async ({
  token,
  id
}, {
  clientId,
  cacheMaxEntries,
  cacheMaxAge
}) => {
  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'id token is invalid for this user.');
  }
  const {
    kid: keyId,
    alg: algorithm
  } = authUtils.getHeaderFromToken(token);
  const ONE_HOUR_IN_MS = 3600000;
  let jwtClaims;
  cacheMaxAge = cacheMaxAge || ONE_HOUR_IN_MS;
  cacheMaxEntries = cacheMaxEntries || 5;
  const facebookKey = await getFacebookKeyByKeyId(keyId, cacheMaxEntries, cacheMaxAge);
  const signingKey = facebookKey.publicKey || facebookKey.rsaPublicKey;
  try {
    jwtClaims = jwt.verify(token, signingKey, {
      algorithms: algorithm,
      // the audience can be checked against a string, a regular expression or a list of strings and/or regular expressions.
      audience: clientId
    });
  } catch (exception) {
    const message = exception.message;
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
  }
  if (jwtClaims.iss !== TOKEN_ISSUER) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token not issued by correct OpenID provider - expected: ${TOKEN_ISSUER} | from: ${jwtClaims.iss}`);
  }
  if (jwtClaims.sub !== id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'auth data is invalid for this user.');
  }
  return jwtClaims;
};

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  if (authData.token) {
    return verifyIdToken(authData, options);
  } else {
    return validateGraphToken(authData, options);
  }
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId(appIds, authData, options) {
  if (authData.token) {
    return Promise.resolve();
  } else {
    return validateGraphAppId(appIds, authData, options);
  }
}

// A promisey wrapper for FB graph requests.
function graphRequest(path) {
  return httpsRequest.get('https://graph.facebook.com/' + path);
}
module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJjcnlwdG8iLCJqd2tzQ2xpZW50Iiwiand0IiwiaHR0cHNSZXF1ZXN0IiwiYXV0aFV0aWxzIiwiVE9LRU5fSVNTVUVSIiwiZ2V0QXBwU2VjcmV0UGF0aCIsImF1dGhEYXRhIiwib3B0aW9ucyIsImFwcFNlY3JldCIsImFwcHNlY3JldF9wcm9vZiIsImNyZWF0ZUhtYWMiLCJ1cGRhdGUiLCJhY2Nlc3NfdG9rZW4iLCJkaWdlc3QiLCJ2YWxpZGF0ZUdyYXBoVG9rZW4iLCJncmFwaFJlcXVlc3QiLCJ0aGVuIiwiZGF0YSIsImlkIiwicHJvY2VzcyIsImVudiIsIlRFU1RJTkciLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ2YWxpZGF0ZUdyYXBoQXBwSWQiLCJhcHBJZHMiLCJBcnJheSIsImlzQXJyYXkiLCJsZW5ndGgiLCJpbmNsdWRlcyIsImdldEZhY2Vib29rS2V5QnlLZXlJZCIsImtleUlkIiwiY2FjaGVNYXhFbnRyaWVzIiwiY2FjaGVNYXhBZ2UiLCJjbGllbnQiLCJqd2tzVXJpIiwiY2FjaGUiLCJrZXkiLCJnZXRTaWduaW5nS2V5IiwiZXJyb3IiLCJ2ZXJpZnlJZFRva2VuIiwidG9rZW4iLCJjbGllbnRJZCIsImtpZCIsImFsZyIsImFsZ29yaXRobSIsImdldEhlYWRlckZyb21Ub2tlbiIsIk9ORV9IT1VSX0lOX01TIiwiand0Q2xhaW1zIiwiZmFjZWJvb2tLZXkiLCJzaWduaW5nS2V5IiwicHVibGljS2V5IiwicnNhUHVibGljS2V5IiwidmVyaWZ5IiwiYWxnb3JpdGhtcyIsImF1ZGllbmNlIiwiZXhjZXB0aW9uIiwibWVzc2FnZSIsImlzcyIsInN1YiIsInZhbGlkYXRlQXV0aERhdGEiLCJ2YWxpZGF0ZUFwcElkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJwYXRoIiwiZ2V0IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2ZhY2Vib29rLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEhlbHBlciBmdW5jdGlvbnMgZm9yIGFjY2Vzc2luZyB0aGUgRmFjZWJvb2sgR3JhcGggQVBJLlxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCBjcnlwdG8gPSByZXF1aXJlKCdjcnlwdG8nKTtcbmNvbnN0IGp3a3NDbGllbnQgPSByZXF1aXJlKCdqd2tzLXJzYScpO1xuY29uc3Qgand0ID0gcmVxdWlyZSgnanNvbndlYnRva2VuJyk7XG5jb25zdCBodHRwc1JlcXVlc3QgPSByZXF1aXJlKCcuL2h0dHBzUmVxdWVzdCcpO1xuY29uc3QgYXV0aFV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG5jb25zdCBUT0tFTl9JU1NVRVIgPSAnaHR0cHM6Ly9mYWNlYm9vay5jb20nO1xuXG5mdW5jdGlvbiBnZXRBcHBTZWNyZXRQYXRoKGF1dGhEYXRhLCBvcHRpb25zID0ge30pIHtcbiAgY29uc3QgYXBwU2VjcmV0ID0gb3B0aW9ucy5hcHBTZWNyZXQ7XG4gIGlmICghYXBwU2VjcmV0KSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG4gIGNvbnN0IGFwcHNlY3JldF9wcm9vZiA9IGNyeXB0b1xuICAgIC5jcmVhdGVIbWFjKCdzaGEyNTYnLCBhcHBTZWNyZXQpXG4gICAgLnVwZGF0ZShhdXRoRGF0YS5hY2Nlc3NfdG9rZW4pXG4gICAgLmRpZ2VzdCgnaGV4Jyk7XG5cbiAgcmV0dXJuIGAmYXBwc2VjcmV0X3Byb29mPSR7YXBwc2VjcmV0X3Byb29mfWA7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlR3JhcGhUb2tlbihhdXRoRGF0YSwgb3B0aW9ucykge1xuICByZXR1cm4gZ3JhcGhSZXF1ZXN0KFxuICAgICdtZT9maWVsZHM9aWQmYWNjZXNzX3Rva2VuPScgKyBhdXRoRGF0YS5hY2Nlc3NfdG9rZW4gKyBnZXRBcHBTZWNyZXRQYXRoKGF1dGhEYXRhLCBvcHRpb25zKVxuICApLnRoZW4oZGF0YSA9PiB7XG4gICAgaWYgKChkYXRhICYmIGRhdGEuaWQgPT0gYXV0aERhdGEuaWQpIHx8IChwcm9jZXNzLmVudi5URVNUSU5HICYmIGF1dGhEYXRhLmlkID09PSAndGVzdCcpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnRmFjZWJvb2sgYXV0aCBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJyk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZUdyYXBoQXBwSWQoYXBwSWRzLCBhdXRoRGF0YSwgb3B0aW9ucykge1xuICB2YXIgYWNjZXNzX3Rva2VuID0gYXV0aERhdGEuYWNjZXNzX3Rva2VuO1xuICBpZiAocHJvY2Vzcy5lbnYuVEVTVElORyAmJiBhY2Nlc3NfdG9rZW4gPT09ICd0ZXN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIUFycmF5LmlzQXJyYXkoYXBwSWRzKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnYXBwSWRzIG11c3QgYmUgYW4gYXJyYXkuJyk7XG4gIH1cbiAgaWYgKCFhcHBJZHMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdGYWNlYm9vayBhdXRoIGlzIG5vdCBjb25maWd1cmVkLicpO1xuICB9XG4gIGNvbnN0IGRhdGEgPSBhd2FpdCBncmFwaFJlcXVlc3QoXG4gICAgYGFwcD9hY2Nlc3NfdG9rZW49JHthY2Nlc3NfdG9rZW59JHtnZXRBcHBTZWNyZXRQYXRoKGF1dGhEYXRhLCBvcHRpb25zKX1gXG4gICk7XG4gIGlmICghZGF0YSB8fCAhYXBwSWRzLmluY2x1ZGVzKGRhdGEuaWQpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdGYWNlYm9vayBhdXRoIGlzIGludmFsaWQgZm9yIHRoaXMgdXNlci4nKTtcbiAgfVxufVxuXG5jb25zdCBnZXRGYWNlYm9va0tleUJ5S2V5SWQgPSBhc3luYyAoa2V5SWQsIGNhY2hlTWF4RW50cmllcywgY2FjaGVNYXhBZ2UpID0+IHtcbiAgY29uc3QgY2xpZW50ID0gandrc0NsaWVudCh7XG4gICAgandrc1VyaTogYCR7VE9LRU5fSVNTVUVSfS8ud2VsbC1rbm93bi9vYXV0aC9vcGVuaWQvandrcy9gLFxuICAgIGNhY2hlOiB0cnVlLFxuICAgIGNhY2hlTWF4RW50cmllcyxcbiAgICBjYWNoZU1heEFnZSxcbiAgfSk7XG5cbiAgbGV0IGtleTtcbiAgdHJ5IHtcbiAgICBrZXkgPSBhd2FpdCBhdXRoVXRpbHMuZ2V0U2lnbmluZ0tleShjbGllbnQsIGtleUlkKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgYFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIGtleSBmb3IgS2V5IElEOiAke2tleUlkfWBcbiAgICApO1xuICB9XG4gIHJldHVybiBrZXk7XG59O1xuXG5jb25zdCB2ZXJpZnlJZFRva2VuID0gYXN5bmMgKHsgdG9rZW4sIGlkIH0sIHsgY2xpZW50SWQsIGNhY2hlTWF4RW50cmllcywgY2FjaGVNYXhBZ2UgfSkgPT4ge1xuICBpZiAoIXRva2VuKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdpZCB0b2tlbiBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJyk7XG4gIH1cblxuICBjb25zdCB7IGtpZDoga2V5SWQsIGFsZzogYWxnb3JpdGhtIH0gPSBhdXRoVXRpbHMuZ2V0SGVhZGVyRnJvbVRva2VuKHRva2VuKTtcbiAgY29uc3QgT05FX0hPVVJfSU5fTVMgPSAzNjAwMDAwO1xuICBsZXQgand0Q2xhaW1zO1xuXG4gIGNhY2hlTWF4QWdlID0gY2FjaGVNYXhBZ2UgfHwgT05FX0hPVVJfSU5fTVM7XG4gIGNhY2hlTWF4RW50cmllcyA9IGNhY2hlTWF4RW50cmllcyB8fCA1O1xuXG4gIGNvbnN0IGZhY2Vib29rS2V5ID0gYXdhaXQgZ2V0RmFjZWJvb2tLZXlCeUtleUlkKGtleUlkLCBjYWNoZU1heEVudHJpZXMsIGNhY2hlTWF4QWdlKTtcbiAgY29uc3Qgc2lnbmluZ0tleSA9IGZhY2Vib29rS2V5LnB1YmxpY0tleSB8fCBmYWNlYm9va0tleS5yc2FQdWJsaWNLZXk7XG5cbiAgdHJ5IHtcbiAgICBqd3RDbGFpbXMgPSBqd3QudmVyaWZ5KHRva2VuLCBzaWduaW5nS2V5LCB7XG4gICAgICBhbGdvcml0aG1zOiBhbGdvcml0aG0sXG4gICAgICAvLyB0aGUgYXVkaWVuY2UgY2FuIGJlIGNoZWNrZWQgYWdhaW5zdCBhIHN0cmluZywgYSByZWd1bGFyIGV4cHJlc3Npb24gb3IgYSBsaXN0IG9mIHN0cmluZ3MgYW5kL29yIHJlZ3VsYXIgZXhwcmVzc2lvbnMuXG4gICAgICBhdWRpZW5jZTogY2xpZW50SWQsXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBleGNlcHRpb24ubWVzc2FnZTtcblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCBgJHttZXNzYWdlfWApO1xuICB9XG5cbiAgaWYgKGp3dENsYWltcy5pc3MgIT09IFRPS0VOX0lTU1VFUikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICBgaWQgdG9rZW4gbm90IGlzc3VlZCBieSBjb3JyZWN0IE9wZW5JRCBwcm92aWRlciAtIGV4cGVjdGVkOiAke1RPS0VOX0lTU1VFUn0gfCBmcm9tOiAke2p3dENsYWltcy5pc3N9YFxuICAgICk7XG4gIH1cblxuICBpZiAoand0Q2xhaW1zLnN1YiAhPT0gaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ2F1dGggZGF0YSBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJyk7XG4gIH1cbiAgcmV0dXJuIGp3dENsYWltcztcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWZmIHRoaXMgdXNlciBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGEsIG9wdGlvbnMpIHtcbiAgaWYgKGF1dGhEYXRhLnRva2VuKSB7XG4gICAgcmV0dXJuIHZlcmlmeUlkVG9rZW4oYXV0aERhdGEsIG9wdGlvbnMpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB2YWxpZGF0ZUdyYXBoVG9rZW4oYXV0aERhdGEsIG9wdGlvbnMpO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWZmIHRoaXMgYXBwIGlkIGlzIHZhbGlkLlxuZnVuY3Rpb24gdmFsaWRhdGVBcHBJZChhcHBJZHMsIGF1dGhEYXRhLCBvcHRpb25zKSB7XG4gIGlmIChhdXRoRGF0YS50b2tlbikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gdmFsaWRhdGVHcmFwaEFwcElkKGFwcElkcywgYXV0aERhdGEsIG9wdGlvbnMpO1xuICB9XG59XG5cbi8vIEEgcHJvbWlzZXkgd3JhcHBlciBmb3IgRkIgZ3JhcGggcmVxdWVzdHMuXG5mdW5jdGlvbiBncmFwaFJlcXVlc3QocGF0aCkge1xuICByZXR1cm4gaHR0cHNSZXF1ZXN0LmdldCgnaHR0cHM6Ly9ncmFwaC5mYWNlYm9vay5jb20vJyArIHBhdGgpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdmFsaWRhdGVBcHBJZDogdmFsaWRhdGVBcHBJZCxcbiAgdmFsaWRhdGVBdXRoRGF0YTogdmFsaWRhdGVBdXRoRGF0YSxcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQSxNQUFNQSxLQUFLLEdBQUdD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