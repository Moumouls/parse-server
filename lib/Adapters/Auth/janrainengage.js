"use strict";

// Helper functions for accessing the Janrain Engage API.
var httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;
var querystring = require('querystring');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  return apiRequest(options.api_key, authData.auth_token).then(data => {
    //successful response will have a "stat" (status) of 'ok' and a profile node with an identifier
    //see: http://developers.janrain.com/overview/social-login/identity-providers/user-profile-data/#normalized-user-profile-data
    if (data && data.stat == 'ok' && data.profile.identifier == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Janrain engage auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  //no-op
  return Promise.resolve();
}

// A promisey wrapper for api requests
function apiRequest(api_key, auth_token) {
  var post_data = querystring.stringify({
    token: auth_token,
    apiKey: api_key,
    format: 'json'
  });
  var post_options = {
    host: 'rpxnow.com',
    path: '/api/v2/auth_info',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': post_data.length
    }
  };
  return httpsRequest.request(post_options, post_data);
}
module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJodHRwc1JlcXVlc3QiLCJyZXF1aXJlIiwiUGFyc2UiLCJxdWVyeXN0cmluZyIsInZhbGlkYXRlQXV0aERhdGEiLCJhdXRoRGF0YSIsIm9wdGlvbnMiLCJhcGlSZXF1ZXN0IiwiYXBpX2tleSIsImF1dGhfdG9rZW4iLCJ0aGVuIiwiZGF0YSIsInN0YXQiLCJwcm9maWxlIiwiaWRlbnRpZmllciIsImlkIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidmFsaWRhdGVBcHBJZCIsIlByb21pc2UiLCJyZXNvbHZlIiwicG9zdF9kYXRhIiwic3RyaW5naWZ5IiwidG9rZW4iLCJhcGlLZXkiLCJmb3JtYXQiLCJwb3N0X29wdGlvbnMiLCJob3N0IiwicGF0aCIsIm1ldGhvZCIsImhlYWRlcnMiLCJsZW5ndGgiLCJyZXF1ZXN0IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2phbnJhaW5lbmdhZ2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gSGVscGVyIGZ1bmN0aW9ucyBmb3IgYWNjZXNzaW5nIHRoZSBKYW5yYWluIEVuZ2FnZSBBUEkuXG52YXIgaHR0cHNSZXF1ZXN0ID0gcmVxdWlyZSgnLi9odHRwc1JlcXVlc3QnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoJ3F1ZXJ5c3RyaW5nJyk7XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWZmIHRoaXMgdXNlciBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGEsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIGFwaVJlcXVlc3Qob3B0aW9ucy5hcGlfa2V5LCBhdXRoRGF0YS5hdXRoX3Rva2VuKS50aGVuKGRhdGEgPT4ge1xuICAgIC8vc3VjY2Vzc2Z1bCByZXNwb25zZSB3aWxsIGhhdmUgYSBcInN0YXRcIiAoc3RhdHVzKSBvZiAnb2snIGFuZCBhIHByb2ZpbGUgbm9kZSB3aXRoIGFuIGlkZW50aWZpZXJcbiAgICAvL3NlZTogaHR0cDovL2RldmVsb3BlcnMuamFucmFpbi5jb20vb3ZlcnZpZXcvc29jaWFsLWxvZ2luL2lkZW50aXR5LXByb3ZpZGVycy91c2VyLXByb2ZpbGUtZGF0YS8jbm9ybWFsaXplZC11c2VyLXByb2ZpbGUtZGF0YVxuICAgIGlmIChkYXRhICYmIGRhdGEuc3RhdCA9PSAnb2snICYmIGRhdGEucHJvZmlsZS5pZGVudGlmaWVyID09IGF1dGhEYXRhLmlkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAnSmFucmFpbiBlbmdhZ2UgYXV0aCBpcyBpbnZhbGlkIGZvciB0aGlzIHVzZXIuJ1xuICAgICk7XG4gIH0pO1xufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIGlmZiB0aGlzIGFwcCBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXBwSWQoKSB7XG4gIC8vbm8tb3BcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG4vLyBBIHByb21pc2V5IHdyYXBwZXIgZm9yIGFwaSByZXF1ZXN0c1xuZnVuY3Rpb24gYXBpUmVxdWVzdChhcGlfa2V5LCBhdXRoX3Rva2VuKSB7XG4gIHZhciBwb3N0X2RhdGEgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkoe1xuICAgIHRva2VuOiBhdXRoX3Rva2VuLFxuICAgIGFwaUtleTogYXBpX2tleSxcbiAgICBmb3JtYXQ6ICdqc29uJyxcbiAgfSk7XG5cbiAgdmFyIHBvc3Rfb3B0aW9ucyA9IHtcbiAgICBob3N0OiAncnB4bm93LmNvbScsXG4gICAgcGF0aDogJy9hcGkvdjIvYXV0aF9pbmZvJyxcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gICAgICAnQ29udGVudC1MZW5ndGgnOiBwb3N0X2RhdGEubGVuZ3RoLFxuICAgIH0sXG4gIH07XG5cbiAgcmV0dXJuIGh0dHBzUmVxdWVzdC5yZXF1ZXN0KHBvc3Rfb3B0aW9ucywgcG9zdF9kYXRhKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHZhbGlkYXRlQXBwSWQ6IHZhbGlkYXRlQXBwSWQsXG4gIHZhbGlkYXRlQXV0aERhdGE6IHZhbGlkYXRlQXV0aERhdGEsXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0EsSUFBSUEsWUFBWSxHQUFHQyxPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFDNUMsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsSUFBSUMsV0FBVyxHQUFHRixPQUFPLENBQUMsYUFBYSxDQUFDOztBQUV4QztBQUNBLFNBQVNHLGdCQUFnQkEsQ0FBQ0MsUUFBUSxFQUFFQyxPQUFPLEVBQUU7RUFDM0MsT0FBT0MsVUFBVSxDQUFDRCxPQUFPLENBQUNFLE9BQU8sRUFBRUgsUUFBUSxDQUFDSSxVQUFVLENBQUMsQ0FBQ0MsSUFBSSxDQUFDQyxJQUFJLElBQUk7SUFDbkU7SUFDQTtJQUNBLElBQUlBLElBQUksSUFBSUEsSUFBSSxDQUFDQyxJQUFJLElBQUksSUFBSSxJQUFJRCxJQUFJLENBQUNFLE9BQU8sQ0FBQ0MsVUFBVSxJQUFJVCxRQUFRLENBQUNVLEVBQUUsRUFBRTtNQUN2RTtJQUNGO0lBQ0EsTUFBTSxJQUFJYixLQUFLLENBQUNjLEtBQUssQ0FDbkJkLEtBQUssQ0FBQ2MsS0FBSyxDQUFDQyxnQkFBZ0IsRUFDNUIsK0NBQ0YsQ0FBQztFQUNILENBQUMsQ0FBQztBQUNKOztBQUVBO0FBQ0EsU0FBU0MsYUFBYUEsQ0FBQSxFQUFHO0VBQ3ZCO0VBQ0EsT0FBT0MsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQztBQUMxQjs7QUFFQTtBQUNBLFNBQVNiLFVBQVVBLENBQUNDLE9BQU8sRUFBRUMsVUFBVSxFQUFFO0VBQ3ZDLElBQUlZLFNBQVMsR0FBR2xCLFdBQVcsQ0FBQ21CLFNBQVMsQ0FBQztJQUNwQ0MsS0FBSyxFQUFFZCxVQUFVO0lBQ2pCZSxNQUFNLEVBQUVoQixPQUFPO0lBQ2ZpQixNQUFNLEVBQUU7RUFDVixDQUFDLENBQUM7RUFFRixJQUFJQyxZQUFZLEdBQUc7SUFDakJDLElBQUksRUFBRSxZQUFZO0lBQ2xCQyxJQUFJLEVBQUUsbUJBQW1CO0lBQ3pCQyxNQUFNLEVBQUUsTUFBTTtJQUNkQyxPQUFPLEVBQUU7TUFDUCxjQUFjLEVBQUUsbUNBQW1DO01BQ25ELGdCQUFnQixFQUFFVCxTQUFTLENBQUNVO0lBQzlCO0VBQ0YsQ0FBQztFQUVELE9BQU8vQixZQUFZLENBQUNnQyxPQUFPLENBQUNOLFlBQVksRUFBRUwsU0FBUyxDQUFDO0FBQ3REO0FBRUFZLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHO0VBQ2ZoQixhQUFhLEVBQUVBLGFBQWE7RUFDNUJkLGdCQUFnQixFQUFFQTtBQUNwQixDQUFDIiwiaWdub3JlTGlzdCI6W119