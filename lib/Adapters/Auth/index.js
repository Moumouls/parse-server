"use strict";

var _AdapterLoader = _interopRequireDefault(require("../AdapterLoader"));
var _node = _interopRequireDefault(require("parse/node"));
var _AuthAdapter = _interopRequireDefault(require("./AuthAdapter"));
var _mfa = _interopRequireDefault(require("./mfa"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const apple = require('./apple');
const gcenter = require('./gcenter');
const gpgames = require('./gpgames');
const facebook = require('./facebook');
const instagram = require('./instagram');
const linkedin = require('./linkedin');
const meetup = require('./meetup');
const google = require('./google');
const github = require('./github');
const twitter = require('./twitter');
const spotify = require('./spotify');
const digits = require('./twitter'); // digits tokens are validated by twitter
const janrainengage = require('./janrainengage');
const janraincapture = require('./janraincapture');
const line = require('./line');
const vkontakte = require('./vkontakte');
const qq = require('./qq');
const wechat = require('./wechat');
const weibo = require('./weibo');
const oauth2 = require('./oauth2');
const phantauth = require('./phantauth');
const microsoft = require('./microsoft');
const keycloak = require('./keycloak');
const ldap = require('./ldap');
const webauthn = require('./webauthn');
const anonymous = {
  validateAuthData: () => {
    return Promise.resolve();
  },
  validateAppId: () => {
    return Promise.resolve();
  }
};
const providers = {
  apple,
  gcenter,
  gpgames,
  facebook,
  instagram,
  linkedin,
  meetup,
  mfa: _mfa.default,
  google,
  github,
  twitter,
  spotify,
  anonymous,
  digits,
  janrainengage,
  janraincapture,
  line,
  vkontakte,
  qq,
  wechat,
  weibo,
  phantauth,
  microsoft,
  keycloak,
  ldap,
  webauthn
};

// Indexed auth policies
const authAdapterPolicies = {
  default: true,
  solo: true,
  additional: true
};
function authDataValidator(provider, adapter, appIds, options) {
  return async function (authData, req, user, requestObject) {
    if (appIds && typeof adapter.validateAppId === 'function') {
      await Promise.resolve(adapter.validateAppId(appIds, authData, options, requestObject));
    }
    if (adapter.policy && !authAdapterPolicies[adapter.policy] && typeof adapter.policy !== 'function') {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'AuthAdapter policy is not configured correctly. The value must be either "solo", "additional", "default" or undefined (will be handled as "default")');
    }
    if (typeof adapter.validateAuthData === 'function') {
      return adapter.validateAuthData(authData, options, requestObject);
    }
    if (typeof adapter.validateSetUp !== 'function' || typeof adapter.validateLogin !== 'function' || typeof adapter.validateUpdate !== 'function') {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Adapter is not configured. Implement either validateAuthData or all of the following: validateSetUp, validateLogin and validateUpdate');
    }
    // When masterKey is detected, we should trigger a logged in user
    const isLoggedIn = req.auth.user && user && req.auth.user.id === user.id || user && req.auth.isMaster;
    let hasAuthDataConfigured = false;
    if (user && user.get('authData') && user.get('authData')[provider]) {
      hasAuthDataConfigured = true;
    }
    if (isLoggedIn) {
      // User is updating their authData
      if (hasAuthDataConfigured) {
        return {
          method: 'validateUpdate',
          validator: () => adapter.validateUpdate(authData, options, requestObject)
        };
      }
      // Set up if the user does not have the provider configured
      return {
        method: 'validateSetUp',
        validator: () => adapter.validateSetUp(authData, options, requestObject)
      };
    }

    // Not logged in and authData is configured on the user
    if (hasAuthDataConfigured) {
      return {
        method: 'validateLogin',
        validator: () => adapter.validateLogin(authData, options, requestObject)
      };
    }

    // User not logged in and the provider is not set up, for example when a new user
    // signs up or an existing user uses a new auth provider
    return {
      method: 'validateSetUp',
      validator: () => adapter.validateSetUp(authData, options, requestObject)
    };
  };
}
function loadAuthAdapter(provider, authOptions) {
  // providers are auth providers implemented by default
  let defaultAdapter = providers[provider];
  // authOptions can contain complete custom auth adapters or
  // a default auth adapter like Facebook
  const providerOptions = authOptions[provider];
  if (providerOptions && Object.prototype.hasOwnProperty.call(providerOptions, 'oauth2') && providerOptions['oauth2'] === true) {
    defaultAdapter = oauth2;
  }

  // Default provider not found and a custom auth provider was not provided
  if (!defaultAdapter && !providerOptions) {
    return;
  }
  const adapter = defaultAdapter instanceof _AuthAdapter.default ? defaultAdapter : Object.assign({}, defaultAdapter);
  const keys = ['validateAuthData', 'validateAppId', 'validateSetUp', 'validateLogin', 'validateUpdate', 'challenge', 'validateOptions', 'policy', 'afterFind'];
  const defaultAuthAdapter = new _AuthAdapter.default();
  keys.forEach(key => {
    const existing = adapter?.[key];
    if (existing && typeof existing === 'function' && existing.toString() === defaultAuthAdapter[key].toString()) {
      adapter[key] = null;
    }
  });
  const appIds = providerOptions ? providerOptions.appIds : undefined;

  // Try the configuration methods
  if (providerOptions) {
    const optionalAdapter = (0, _AdapterLoader.default)(providerOptions, undefined, providerOptions);
    if (optionalAdapter) {
      keys.forEach(key => {
        if (optionalAdapter[key]) {
          adapter[key] = optionalAdapter[key];
        }
      });
    }
  }
  if (adapter.validateOptions) {
    adapter.validateOptions(providerOptions);
  }
  return {
    adapter,
    appIds,
    providerOptions
  };
}
module.exports = function (authOptions = {}, enableAnonymousUsers = true) {
  let _enableAnonymousUsers = enableAnonymousUsers;
  const setEnableAnonymousUsers = function (enable) {
    _enableAnonymousUsers = enable;
  };
  // To handle the test cases on configuration
  const getValidatorForProvider = function (provider) {
    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return {
        validator: undefined
      };
    }
    const authAdapter = loadAuthAdapter(provider, authOptions);
    if (!authAdapter) {
      return;
    }
    const {
      adapter,
      appIds,
      providerOptions
    } = authAdapter;
    return {
      validator: authDataValidator(provider, adapter, appIds, providerOptions),
      adapter
    };
  };
  const runAfterFind = async (req, authData) => {
    if (!authData) {
      return;
    }
    const adapters = Object.keys(authData);
    await Promise.all(adapters.map(async provider => {
      const authAdapter = getValidatorForProvider(provider);
      if (!authAdapter) {
        return;
      }
      const {
        adapter,
        providerOptions
      } = authAdapter;
      const afterFind = adapter.afterFind;
      if (afterFind && typeof afterFind === 'function') {
        const requestObject = {
          ip: req.config.ip,
          user: req.auth.user,
          master: req.auth.isMaster
        };
        const result = afterFind.call(adapter, requestObject, authData[provider], providerOptions);
        if (result) {
          authData[provider] = result;
        }
      }
    }));
  };
  return Object.freeze({
    getValidatorForProvider,
    setEnableAnonymousUsers,
    runAfterFind
  });
};
module.exports.loadAuthAdapter = loadAuthAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQWRhcHRlckxvYWRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX25vZGUiLCJfQXV0aEFkYXB0ZXIiLCJfbWZhIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiYXBwbGUiLCJnY2VudGVyIiwiZ3BnYW1lcyIsImZhY2Vib29rIiwiaW5zdGFncmFtIiwibGlua2VkaW4iLCJtZWV0dXAiLCJnb29nbGUiLCJnaXRodWIiLCJ0d2l0dGVyIiwic3BvdGlmeSIsImRpZ2l0cyIsImphbnJhaW5lbmdhZ2UiLCJqYW5yYWluY2FwdHVyZSIsImxpbmUiLCJ2a29udGFrdGUiLCJxcSIsIndlY2hhdCIsIndlaWJvIiwib2F1dGgyIiwicGhhbnRhdXRoIiwibWljcm9zb2Z0Iiwia2V5Y2xvYWsiLCJsZGFwIiwid2ViYXV0aG4iLCJhbm9ueW1vdXMiLCJ2YWxpZGF0ZUF1dGhEYXRhIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ2YWxpZGF0ZUFwcElkIiwicHJvdmlkZXJzIiwibWZhIiwiYXV0aEFkYXB0ZXJQb2xpY2llcyIsInNvbG8iLCJhZGRpdGlvbmFsIiwiYXV0aERhdGFWYWxpZGF0b3IiLCJwcm92aWRlciIsImFkYXB0ZXIiLCJhcHBJZHMiLCJvcHRpb25zIiwiYXV0aERhdGEiLCJyZXEiLCJ1c2VyIiwicmVxdWVzdE9iamVjdCIsInBvbGljeSIsIlBhcnNlIiwiRXJyb3IiLCJPVEhFUl9DQVVTRSIsInZhbGlkYXRlU2V0VXAiLCJ2YWxpZGF0ZUxvZ2luIiwidmFsaWRhdGVVcGRhdGUiLCJpc0xvZ2dlZEluIiwiYXV0aCIsImlkIiwiaXNNYXN0ZXIiLCJoYXNBdXRoRGF0YUNvbmZpZ3VyZWQiLCJnZXQiLCJtZXRob2QiLCJ2YWxpZGF0b3IiLCJsb2FkQXV0aEFkYXB0ZXIiLCJhdXRoT3B0aW9ucyIsImRlZmF1bHRBZGFwdGVyIiwicHJvdmlkZXJPcHRpb25zIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiQXV0aEFkYXB0ZXIiLCJhc3NpZ24iLCJrZXlzIiwiZGVmYXVsdEF1dGhBZGFwdGVyIiwiZm9yRWFjaCIsImtleSIsImV4aXN0aW5nIiwidG9TdHJpbmciLCJ1bmRlZmluZWQiLCJvcHRpb25hbEFkYXB0ZXIiLCJsb2FkQWRhcHRlciIsInZhbGlkYXRlT3B0aW9ucyIsIm1vZHVsZSIsImV4cG9ydHMiLCJlbmFibGVBbm9ueW1vdXNVc2VycyIsIl9lbmFibGVBbm9ueW1vdXNVc2VycyIsInNldEVuYWJsZUFub255bW91c1VzZXJzIiwiZW5hYmxlIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJhdXRoQWRhcHRlciIsInJ1bkFmdGVyRmluZCIsImFkYXB0ZXJzIiwiYWxsIiwibWFwIiwiYWZ0ZXJGaW5kIiwiaXAiLCJjb25maWciLCJtYXN0ZXIiLCJyZXN1bHQiLCJmcmVlemUiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvQXV0aC9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9hZEFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlckxvYWRlcic7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQXV0aEFkYXB0ZXIgZnJvbSAnLi9BdXRoQWRhcHRlcic7XG5cbmNvbnN0IGFwcGxlID0gcmVxdWlyZSgnLi9hcHBsZScpO1xuY29uc3QgZ2NlbnRlciA9IHJlcXVpcmUoJy4vZ2NlbnRlcicpO1xuY29uc3QgZ3BnYW1lcyA9IHJlcXVpcmUoJy4vZ3BnYW1lcycpO1xuY29uc3QgZmFjZWJvb2sgPSByZXF1aXJlKCcuL2ZhY2Vib29rJyk7XG5jb25zdCBpbnN0YWdyYW0gPSByZXF1aXJlKCcuL2luc3RhZ3JhbScpO1xuY29uc3QgbGlua2VkaW4gPSByZXF1aXJlKCcuL2xpbmtlZGluJyk7XG5jb25zdCBtZWV0dXAgPSByZXF1aXJlKCcuL21lZXR1cCcpO1xuaW1wb3J0IG1mYSBmcm9tICcuL21mYSc7XG5jb25zdCBnb29nbGUgPSByZXF1aXJlKCcuL2dvb2dsZScpO1xuY29uc3QgZ2l0aHViID0gcmVxdWlyZSgnLi9naXRodWInKTtcbmNvbnN0IHR3aXR0ZXIgPSByZXF1aXJlKCcuL3R3aXR0ZXInKTtcbmNvbnN0IHNwb3RpZnkgPSByZXF1aXJlKCcuL3Nwb3RpZnknKTtcbmNvbnN0IGRpZ2l0cyA9IHJlcXVpcmUoJy4vdHdpdHRlcicpOyAvLyBkaWdpdHMgdG9rZW5zIGFyZSB2YWxpZGF0ZWQgYnkgdHdpdHRlclxuY29uc3QgamFucmFpbmVuZ2FnZSA9IHJlcXVpcmUoJy4vamFucmFpbmVuZ2FnZScpO1xuY29uc3QgamFucmFpbmNhcHR1cmUgPSByZXF1aXJlKCcuL2phbnJhaW5jYXB0dXJlJyk7XG5jb25zdCBsaW5lID0gcmVxdWlyZSgnLi9saW5lJyk7XG5jb25zdCB2a29udGFrdGUgPSByZXF1aXJlKCcuL3Zrb250YWt0ZScpO1xuY29uc3QgcXEgPSByZXF1aXJlKCcuL3FxJyk7XG5jb25zdCB3ZWNoYXQgPSByZXF1aXJlKCcuL3dlY2hhdCcpO1xuY29uc3Qgd2VpYm8gPSByZXF1aXJlKCcuL3dlaWJvJyk7XG5jb25zdCBvYXV0aDIgPSByZXF1aXJlKCcuL29hdXRoMicpO1xuY29uc3QgcGhhbnRhdXRoID0gcmVxdWlyZSgnLi9waGFudGF1dGgnKTtcbmNvbnN0IG1pY3Jvc29mdCA9IHJlcXVpcmUoJy4vbWljcm9zb2Z0Jyk7XG5jb25zdCBrZXljbG9hayA9IHJlcXVpcmUoJy4va2V5Y2xvYWsnKTtcbmNvbnN0IGxkYXAgPSByZXF1aXJlKCcuL2xkYXAnKTtcbmNvbnN0IHdlYmF1dGhuID0gcmVxdWlyZSgnLi93ZWJhdXRobicpO1xuXG5jb25zdCBhbm9ueW1vdXMgPSB7XG4gIHZhbGlkYXRlQXV0aERhdGE6ICgpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH0sXG4gIHZhbGlkYXRlQXBwSWQ6ICgpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH0sXG59O1xuXG5jb25zdCBwcm92aWRlcnMgPSB7XG4gIGFwcGxlLFxuICBnY2VudGVyLFxuICBncGdhbWVzLFxuICBmYWNlYm9vayxcbiAgaW5zdGFncmFtLFxuICBsaW5rZWRpbixcbiAgbWVldHVwLFxuICBtZmEsXG4gIGdvb2dsZSxcbiAgZ2l0aHViLFxuICB0d2l0dGVyLFxuICBzcG90aWZ5LFxuICBhbm9ueW1vdXMsXG4gIGRpZ2l0cyxcbiAgamFucmFpbmVuZ2FnZSxcbiAgamFucmFpbmNhcHR1cmUsXG4gIGxpbmUsXG4gIHZrb250YWt0ZSxcbiAgcXEsXG4gIHdlY2hhdCxcbiAgd2VpYm8sXG4gIHBoYW50YXV0aCxcbiAgbWljcm9zb2Z0LFxuICBrZXljbG9hayxcbiAgbGRhcCxcbiAgd2ViYXV0aG4sXG59O1xuXG4vLyBJbmRleGVkIGF1dGggcG9saWNpZXNcbmNvbnN0IGF1dGhBZGFwdGVyUG9saWNpZXMgPSB7XG4gIGRlZmF1bHQ6IHRydWUsXG4gIHNvbG86IHRydWUsXG4gIGFkZGl0aW9uYWw6IHRydWUsXG59O1xuXG5mdW5jdGlvbiBhdXRoRGF0YVZhbGlkYXRvcihwcm92aWRlciwgYWRhcHRlciwgYXBwSWRzLCBvcHRpb25zKSB7XG4gIHJldHVybiBhc3luYyBmdW5jdGlvbiAoYXV0aERhdGEsIHJlcSwgdXNlciwgcmVxdWVzdE9iamVjdCkge1xuICAgIGlmIChhcHBJZHMgJiYgdHlwZW9mIGFkYXB0ZXIudmFsaWRhdGVBcHBJZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIudmFsaWRhdGVBcHBJZChhcHBJZHMsIGF1dGhEYXRhLCBvcHRpb25zLCByZXF1ZXN0T2JqZWN0KSk7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIGFkYXB0ZXIucG9saWN5ICYmXG4gICAgICAhYXV0aEFkYXB0ZXJQb2xpY2llc1thZGFwdGVyLnBvbGljeV0gJiZcbiAgICAgIHR5cGVvZiBhZGFwdGVyLnBvbGljeSAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgJ0F1dGhBZGFwdGVyIHBvbGljeSBpcyBub3QgY29uZmlndXJlZCBjb3JyZWN0bHkuIFRoZSB2YWx1ZSBtdXN0IGJlIGVpdGhlciBcInNvbG9cIiwgXCJhZGRpdGlvbmFsXCIsIFwiZGVmYXVsdFwiIG9yIHVuZGVmaW5lZCAod2lsbCBiZSBoYW5kbGVkIGFzIFwiZGVmYXVsdFwiKSdcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYWRhcHRlci52YWxpZGF0ZUF1dGhEYXRhID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gYWRhcHRlci52YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhLCBvcHRpb25zLCByZXF1ZXN0T2JqZWN0KTtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIGFkYXB0ZXIudmFsaWRhdGVTZXRVcCAhPT0gJ2Z1bmN0aW9uJyB8fFxuICAgICAgdHlwZW9mIGFkYXB0ZXIudmFsaWRhdGVMb2dpbiAhPT0gJ2Z1bmN0aW9uJyB8fFxuICAgICAgdHlwZW9mIGFkYXB0ZXIudmFsaWRhdGVVcGRhdGUgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICdBZGFwdGVyIGlzIG5vdCBjb25maWd1cmVkLiBJbXBsZW1lbnQgZWl0aGVyIHZhbGlkYXRlQXV0aERhdGEgb3IgYWxsIG9mIHRoZSBmb2xsb3dpbmc6IHZhbGlkYXRlU2V0VXAsIHZhbGlkYXRlTG9naW4gYW5kIHZhbGlkYXRlVXBkYXRlJ1xuICAgICAgKTtcbiAgICB9XG4gICAgLy8gV2hlbiBtYXN0ZXJLZXkgaXMgZGV0ZWN0ZWQsIHdlIHNob3VsZCB0cmlnZ2VyIGEgbG9nZ2VkIGluIHVzZXJcbiAgICBjb25zdCBpc0xvZ2dlZEluID1cbiAgICAgIChyZXEuYXV0aC51c2VyICYmIHVzZXIgJiYgcmVxLmF1dGgudXNlci5pZCA9PT0gdXNlci5pZCkgfHwgKHVzZXIgJiYgcmVxLmF1dGguaXNNYXN0ZXIpO1xuICAgIGxldCBoYXNBdXRoRGF0YUNvbmZpZ3VyZWQgPSBmYWxzZTtcblxuICAgIGlmICh1c2VyICYmIHVzZXIuZ2V0KCdhdXRoRGF0YScpICYmIHVzZXIuZ2V0KCdhdXRoRGF0YScpW3Byb3ZpZGVyXSkge1xuICAgICAgaGFzQXV0aERhdGFDb25maWd1cmVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoaXNMb2dnZWRJbikge1xuICAgICAgLy8gVXNlciBpcyB1cGRhdGluZyB0aGVpciBhdXRoRGF0YVxuICAgICAgaWYgKGhhc0F1dGhEYXRhQ29uZmlndXJlZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIG1ldGhvZDogJ3ZhbGlkYXRlVXBkYXRlJyxcbiAgICAgICAgICB2YWxpZGF0b3I6ICgpID0+IGFkYXB0ZXIudmFsaWRhdGVVcGRhdGUoYXV0aERhdGEsIG9wdGlvbnMsIHJlcXVlc3RPYmplY3QpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgLy8gU2V0IHVwIGlmIHRoZSB1c2VyIGRvZXMgbm90IGhhdmUgdGhlIHByb3ZpZGVyIGNvbmZpZ3VyZWRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1ldGhvZDogJ3ZhbGlkYXRlU2V0VXAnLFxuICAgICAgICB2YWxpZGF0b3I6ICgpID0+IGFkYXB0ZXIudmFsaWRhdGVTZXRVcChhdXRoRGF0YSwgb3B0aW9ucywgcmVxdWVzdE9iamVjdCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIE5vdCBsb2dnZWQgaW4gYW5kIGF1dGhEYXRhIGlzIGNvbmZpZ3VyZWQgb24gdGhlIHVzZXJcbiAgICBpZiAoaGFzQXV0aERhdGFDb25maWd1cmVkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXRob2Q6ICd2YWxpZGF0ZUxvZ2luJyxcbiAgICAgICAgdmFsaWRhdG9yOiAoKSA9PiBhZGFwdGVyLnZhbGlkYXRlTG9naW4oYXV0aERhdGEsIG9wdGlvbnMsIHJlcXVlc3RPYmplY3QpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBVc2VyIG5vdCBsb2dnZWQgaW4gYW5kIHRoZSBwcm92aWRlciBpcyBub3Qgc2V0IHVwLCBmb3IgZXhhbXBsZSB3aGVuIGEgbmV3IHVzZXJcbiAgICAvLyBzaWducyB1cCBvciBhbiBleGlzdGluZyB1c2VyIHVzZXMgYSBuZXcgYXV0aCBwcm92aWRlclxuICAgIHJldHVybiB7XG4gICAgICBtZXRob2Q6ICd2YWxpZGF0ZVNldFVwJyxcbiAgICAgIHZhbGlkYXRvcjogKCkgPT4gYWRhcHRlci52YWxpZGF0ZVNldFVwKGF1dGhEYXRhLCBvcHRpb25zLCByZXF1ZXN0T2JqZWN0KSxcbiAgICB9O1xuICB9O1xufVxuXG5mdW5jdGlvbiBsb2FkQXV0aEFkYXB0ZXIocHJvdmlkZXIsIGF1dGhPcHRpb25zKSB7XG4gIC8vIHByb3ZpZGVycyBhcmUgYXV0aCBwcm92aWRlcnMgaW1wbGVtZW50ZWQgYnkgZGVmYXVsdFxuICBsZXQgZGVmYXVsdEFkYXB0ZXIgPSBwcm92aWRlcnNbcHJvdmlkZXJdO1xuICAvLyBhdXRoT3B0aW9ucyBjYW4gY29udGFpbiBjb21wbGV0ZSBjdXN0b20gYXV0aCBhZGFwdGVycyBvclxuICAvLyBhIGRlZmF1bHQgYXV0aCBhZGFwdGVyIGxpa2UgRmFjZWJvb2tcbiAgY29uc3QgcHJvdmlkZXJPcHRpb25zID0gYXV0aE9wdGlvbnNbcHJvdmlkZXJdO1xuICBpZiAoXG4gICAgcHJvdmlkZXJPcHRpb25zICYmXG4gICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHByb3ZpZGVyT3B0aW9ucywgJ29hdXRoMicpICYmXG4gICAgcHJvdmlkZXJPcHRpb25zWydvYXV0aDInXSA9PT0gdHJ1ZVxuICApIHtcbiAgICBkZWZhdWx0QWRhcHRlciA9IG9hdXRoMjtcbiAgfVxuXG4gIC8vIERlZmF1bHQgcHJvdmlkZXIgbm90IGZvdW5kIGFuZCBhIGN1c3RvbSBhdXRoIHByb3ZpZGVyIHdhcyBub3QgcHJvdmlkZWRcbiAgaWYgKCFkZWZhdWx0QWRhcHRlciAmJiAhcHJvdmlkZXJPcHRpb25zKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYWRhcHRlciA9XG4gICAgZGVmYXVsdEFkYXB0ZXIgaW5zdGFuY2VvZiBBdXRoQWRhcHRlciA/IGRlZmF1bHRBZGFwdGVyIDogT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdEFkYXB0ZXIpO1xuICBjb25zdCBrZXlzID0gW1xuICAgICd2YWxpZGF0ZUF1dGhEYXRhJyxcbiAgICAndmFsaWRhdGVBcHBJZCcsXG4gICAgJ3ZhbGlkYXRlU2V0VXAnLFxuICAgICd2YWxpZGF0ZUxvZ2luJyxcbiAgICAndmFsaWRhdGVVcGRhdGUnLFxuICAgICdjaGFsbGVuZ2UnLFxuICAgICd2YWxpZGF0ZU9wdGlvbnMnLFxuICAgICdwb2xpY3knLFxuICAgICdhZnRlckZpbmQnLFxuICBdO1xuICBjb25zdCBkZWZhdWx0QXV0aEFkYXB0ZXIgPSBuZXcgQXV0aEFkYXB0ZXIoKTtcbiAga2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSBhZGFwdGVyPy5ba2V5XTtcbiAgICBpZiAoXG4gICAgICBleGlzdGluZyAmJlxuICAgICAgdHlwZW9mIGV4aXN0aW5nID09PSAnZnVuY3Rpb24nICYmXG4gICAgICBleGlzdGluZy50b1N0cmluZygpID09PSBkZWZhdWx0QXV0aEFkYXB0ZXJba2V5XS50b1N0cmluZygpXG4gICAgKSB7XG4gICAgICBhZGFwdGVyW2tleV0gPSBudWxsO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGFwcElkcyA9IHByb3ZpZGVyT3B0aW9ucyA/IHByb3ZpZGVyT3B0aW9ucy5hcHBJZHMgOiB1bmRlZmluZWQ7XG5cbiAgLy8gVHJ5IHRoZSBjb25maWd1cmF0aW9uIG1ldGhvZHNcbiAgaWYgKHByb3ZpZGVyT3B0aW9ucykge1xuICAgIGNvbnN0IG9wdGlvbmFsQWRhcHRlciA9IGxvYWRBZGFwdGVyKHByb3ZpZGVyT3B0aW9ucywgdW5kZWZpbmVkLCBwcm92aWRlck9wdGlvbnMpO1xuICAgIGlmIChvcHRpb25hbEFkYXB0ZXIpIHtcbiAgICAgIGtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICBpZiAob3B0aW9uYWxBZGFwdGVyW2tleV0pIHtcbiAgICAgICAgICBhZGFwdGVyW2tleV0gPSBvcHRpb25hbEFkYXB0ZXJba2V5XTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIGlmIChhZGFwdGVyLnZhbGlkYXRlT3B0aW9ucykge1xuICAgIGFkYXB0ZXIudmFsaWRhdGVPcHRpb25zKHByb3ZpZGVyT3B0aW9ucyk7XG4gIH1cblxuICByZXR1cm4geyBhZGFwdGVyLCBhcHBJZHMsIHByb3ZpZGVyT3B0aW9ucyB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChhdXRoT3B0aW9ucyA9IHt9LCBlbmFibGVBbm9ueW1vdXNVc2VycyA9IHRydWUpIHtcbiAgbGV0IF9lbmFibGVBbm9ueW1vdXNVc2VycyA9IGVuYWJsZUFub255bW91c1VzZXJzO1xuICBjb25zdCBzZXRFbmFibGVBbm9ueW1vdXNVc2VycyA9IGZ1bmN0aW9uIChlbmFibGUpIHtcbiAgICBfZW5hYmxlQW5vbnltb3VzVXNlcnMgPSBlbmFibGU7XG4gIH07XG4gIC8vIFRvIGhhbmRsZSB0aGUgdGVzdCBjYXNlcyBvbiBjb25maWd1cmF0aW9uXG4gIGNvbnN0IGdldFZhbGlkYXRvckZvclByb3ZpZGVyID0gZnVuY3Rpb24gKHByb3ZpZGVyKSB7XG4gICAgaWYgKHByb3ZpZGVyID09PSAnYW5vbnltb3VzJyAmJiAhX2VuYWJsZUFub255bW91c1VzZXJzKSB7XG4gICAgICByZXR1cm4geyB2YWxpZGF0b3I6IHVuZGVmaW5lZCB9O1xuICAgIH1cbiAgICBjb25zdCBhdXRoQWRhcHRlciA9IGxvYWRBdXRoQWRhcHRlcihwcm92aWRlciwgYXV0aE9wdGlvbnMpO1xuICAgIGlmICghYXV0aEFkYXB0ZXIpIHsgcmV0dXJuOyB9XG4gICAgY29uc3QgeyBhZGFwdGVyLCBhcHBJZHMsIHByb3ZpZGVyT3B0aW9ucyB9ID0gYXV0aEFkYXB0ZXI7XG4gICAgcmV0dXJuIHsgdmFsaWRhdG9yOiBhdXRoRGF0YVZhbGlkYXRvcihwcm92aWRlciwgYWRhcHRlciwgYXBwSWRzLCBwcm92aWRlck9wdGlvbnMpLCBhZGFwdGVyIH07XG4gIH07XG5cbiAgY29uc3QgcnVuQWZ0ZXJGaW5kID0gYXN5bmMgKHJlcSwgYXV0aERhdGEpID0+IHtcbiAgICBpZiAoIWF1dGhEYXRhKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGFkYXB0ZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgYWRhcHRlcnMubWFwKGFzeW5jIHByb3ZpZGVyID0+IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSBnZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgeyBhZGFwdGVyLCBwcm92aWRlck9wdGlvbnMgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBjb25zdCBhZnRlckZpbmQgPSBhZGFwdGVyLmFmdGVyRmluZDtcbiAgICAgICAgaWYgKGFmdGVyRmluZCAmJiB0eXBlb2YgYWZ0ZXJGaW5kID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgY29uc3QgcmVxdWVzdE9iamVjdCA9IHtcbiAgICAgICAgICAgIGlwOiByZXEuY29uZmlnLmlwLFxuICAgICAgICAgICAgdXNlcjogcmVxLmF1dGgudXNlcixcbiAgICAgICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhZnRlckZpbmQuY2FsbChcbiAgICAgICAgICAgIGFkYXB0ZXIsXG4gICAgICAgICAgICByZXF1ZXN0T2JqZWN0LFxuICAgICAgICAgICAgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcHJvdmlkZXJPcHRpb25zXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICBhdXRoRGF0YVtwcm92aWRlcl0gPSByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gIH07XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIGdldFZhbGlkYXRvckZvclByb3ZpZGVyLFxuICAgIHNldEVuYWJsZUFub255bW91c1VzZXJzLFxuICAgIHJ1bkFmdGVyRmluZCxcbiAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5sb2FkQXV0aEFkYXB0ZXIgPSBsb2FkQXV0aEFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsY0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsS0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsWUFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBU0EsSUFBQUcsSUFBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQXdCLFNBQUFELHVCQUFBSyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBUHhCLE1BQU1HLEtBQUssR0FBR1AsT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUNoQyxNQUFNUSxPQUFPLEdBQUdSLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDcEMsTUFBTVMsT0FBTyxHQUFHVCxPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ3BDLE1BQU1VLFFBQVEsR0FBR1YsT0FBTyxDQUFDLFlBQVksQ0FBQztBQUN0QyxNQUFNVyxTQUFTLEdBQUdYLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDeEMsTUFBTVksUUFBUSxHQUFHWixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU1hLE1BQU0sR0FBR2IsT0FBTyxDQUFDLFVBQVUsQ0FBQztBQUVsQyxNQUFNYyxNQUFNLEdBQUdkLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFDbEMsTUFBTWUsTUFBTSxHQUFHZixPQUFPLENBQUMsVUFBVSxDQUFDO0FBQ2xDLE1BQU1nQixPQUFPLEdBQUdoQixPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ3BDLE1BQU1pQixPQUFPLEdBQUdqQixPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ3BDLE1BQU1rQixNQUFNLEdBQUdsQixPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztBQUNyQyxNQUFNbUIsYUFBYSxHQUFHbkIsT0FBTyxDQUFDLGlCQUFpQixDQUFDO0FBQ2hELE1BQU1vQixjQUFjLEdBQUdwQixPQUFPLENBQUMsa0JBQWtCLENBQUM7QUFDbEQsTUFBTXFCLElBQUksR0FBR3JCLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDOUIsTUFBTXNCLFNBQVMsR0FBR3RCLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDeEMsTUFBTXVCLEVBQUUsR0FBR3ZCLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDMUIsTUFBTXdCLE1BQU0sR0FBR3hCLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFDbEMsTUFBTXlCLEtBQUssR0FBR3pCLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDaEMsTUFBTTBCLE1BQU0sR0FBRzFCLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFDbEMsTUFBTTJCLFNBQVMsR0FBRzNCLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDeEMsTUFBTTRCLFNBQVMsR0FBRzVCLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDeEMsTUFBTTZCLFFBQVEsR0FBRzdCLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDdEMsTUFBTThCLElBQUksR0FBRzlCLE9BQU8sQ0FBQyxRQUFRLENBQUM7QUFDOUIsTUFBTStCLFFBQVEsR0FBRy9CLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFFdEMsTUFBTWdDLFNBQVMsR0FBRztFQUNoQkMsZ0JBQWdCLEVBQUVBLENBQUEsS0FBTTtJQUN0QixPQUFPQyxPQUFPLENBQUNDLE9BQU8sQ0FBQyxDQUFDO0VBQzFCLENBQUM7RUFDREMsYUFBYSxFQUFFQSxDQUFBLEtBQU07SUFDbkIsT0FBT0YsT0FBTyxDQUFDQyxPQUFPLENBQUMsQ0FBQztFQUMxQjtBQUNGLENBQUM7QUFFRCxNQUFNRSxTQUFTLEdBQUc7RUFDaEI5QixLQUFLO0VBQ0xDLE9BQU87RUFDUEMsT0FBTztFQUNQQyxRQUFRO0VBQ1JDLFNBQVM7RUFDVEMsUUFBUTtFQUNSQyxNQUFNO0VBQ055QixHQUFHLEVBQUhBLFlBQUc7RUFDSHhCLE1BQU07RUFDTkMsTUFBTTtFQUNOQyxPQUFPO0VBQ1BDLE9BQU87RUFDUGUsU0FBUztFQUNUZCxNQUFNO0VBQ05DLGFBQWE7RUFDYkMsY0FBYztFQUNkQyxJQUFJO0VBQ0pDLFNBQVM7RUFDVEMsRUFBRTtFQUNGQyxNQUFNO0VBQ05DLEtBQUs7RUFDTEUsU0FBUztFQUNUQyxTQUFTO0VBQ1RDLFFBQVE7RUFDUkMsSUFBSTtFQUNKQztBQUNGLENBQUM7O0FBRUQ7QUFDQSxNQUFNUSxtQkFBbUIsR0FBRztFQUMxQmpDLE9BQU8sRUFBRSxJQUFJO0VBQ2JrQyxJQUFJLEVBQUUsSUFBSTtFQUNWQyxVQUFVLEVBQUU7QUFDZCxDQUFDO0FBRUQsU0FBU0MsaUJBQWlCQSxDQUFDQyxRQUFRLEVBQUVDLE9BQU8sRUFBRUMsTUFBTSxFQUFFQyxPQUFPLEVBQUU7RUFDN0QsT0FBTyxnQkFBZ0JDLFFBQVEsRUFBRUMsR0FBRyxFQUFFQyxJQUFJLEVBQUVDLGFBQWEsRUFBRTtJQUN6RCxJQUFJTCxNQUFNLElBQUksT0FBT0QsT0FBTyxDQUFDUixhQUFhLEtBQUssVUFBVSxFQUFFO01BQ3pELE1BQU1GLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDUyxPQUFPLENBQUNSLGFBQWEsQ0FBQ1MsTUFBTSxFQUFFRSxRQUFRLEVBQUVELE9BQU8sRUFBRUksYUFBYSxDQUFDLENBQUM7SUFDeEY7SUFDQSxJQUNFTixPQUFPLENBQUNPLE1BQU0sSUFDZCxDQUFDWixtQkFBbUIsQ0FBQ0ssT0FBTyxDQUFDTyxNQUFNLENBQUMsSUFDcEMsT0FBT1AsT0FBTyxDQUFDTyxNQUFNLEtBQUssVUFBVSxFQUNwQztNQUNBLE1BQU0sSUFBSUMsYUFBSyxDQUFDQyxLQUFLLENBQ25CRCxhQUFLLENBQUNDLEtBQUssQ0FBQ0MsV0FBVyxFQUN2QixzSkFDRixDQUFDO0lBQ0g7SUFDQSxJQUFJLE9BQU9WLE9BQU8sQ0FBQ1gsZ0JBQWdCLEtBQUssVUFBVSxFQUFFO01BQ2xELE9BQU9XLE9BQU8sQ0FBQ1gsZ0JBQWdCLENBQUNjLFFBQVEsRUFBRUQsT0FBTyxFQUFFSSxhQUFhLENBQUM7SUFDbkU7SUFDQSxJQUNFLE9BQU9OLE9BQU8sQ0FBQ1csYUFBYSxLQUFLLFVBQVUsSUFDM0MsT0FBT1gsT0FBTyxDQUFDWSxhQUFhLEtBQUssVUFBVSxJQUMzQyxPQUFPWixPQUFPLENBQUNhLGNBQWMsS0FBSyxVQUFVLEVBQzVDO01BQ0EsTUFBTSxJQUFJTCxhQUFLLENBQUNDLEtBQUssQ0FDbkJELGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxXQUFXLEVBQ3ZCLHVJQUNGLENBQUM7SUFDSDtJQUNBO0lBQ0EsTUFBTUksVUFBVSxHQUNiVixHQUFHLENBQUNXLElBQUksQ0FBQ1YsSUFBSSxJQUFJQSxJQUFJLElBQUlELEdBQUcsQ0FBQ1csSUFBSSxDQUFDVixJQUFJLENBQUNXLEVBQUUsS0FBS1gsSUFBSSxDQUFDVyxFQUFFLElBQU1YLElBQUksSUFBSUQsR0FBRyxDQUFDVyxJQUFJLENBQUNFLFFBQVM7SUFDeEYsSUFBSUMscUJBQXFCLEdBQUcsS0FBSztJQUVqQyxJQUFJYixJQUFJLElBQUlBLElBQUksQ0FBQ2MsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJZCxJQUFJLENBQUNjLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQ3BCLFFBQVEsQ0FBQyxFQUFFO01BQ2xFbUIscUJBQXFCLEdBQUcsSUFBSTtJQUM5QjtJQUVBLElBQUlKLFVBQVUsRUFBRTtNQUNkO01BQ0EsSUFBSUkscUJBQXFCLEVBQUU7UUFDekIsT0FBTztVQUNMRSxNQUFNLEVBQUUsZ0JBQWdCO1VBQ3hCQyxTQUFTLEVBQUVBLENBQUEsS0FBTXJCLE9BQU8sQ0FBQ2EsY0FBYyxDQUFDVixRQUFRLEVBQUVELE9BQU8sRUFBRUksYUFBYTtRQUMxRSxDQUFDO01BQ0g7TUFDQTtNQUNBLE9BQU87UUFDTGMsTUFBTSxFQUFFLGVBQWU7UUFDdkJDLFNBQVMsRUFBRUEsQ0FBQSxLQUFNckIsT0FBTyxDQUFDVyxhQUFhLENBQUNSLFFBQVEsRUFBRUQsT0FBTyxFQUFFSSxhQUFhO01BQ3pFLENBQUM7SUFDSDs7SUFFQTtJQUNBLElBQUlZLHFCQUFxQixFQUFFO01BQ3pCLE9BQU87UUFDTEUsTUFBTSxFQUFFLGVBQWU7UUFDdkJDLFNBQVMsRUFBRUEsQ0FBQSxLQUFNckIsT0FBTyxDQUFDWSxhQUFhLENBQUNULFFBQVEsRUFBRUQsT0FBTyxFQUFFSSxhQUFhO01BQ3pFLENBQUM7SUFDSDs7SUFFQTtJQUNBO0lBQ0EsT0FBTztNQUNMYyxNQUFNLEVBQUUsZUFBZTtNQUN2QkMsU0FBUyxFQUFFQSxDQUFBLEtBQU1yQixPQUFPLENBQUNXLGFBQWEsQ0FBQ1IsUUFBUSxFQUFFRCxPQUFPLEVBQUVJLGFBQWE7SUFDekUsQ0FBQztFQUNILENBQUM7QUFDSDtBQUVBLFNBQVNnQixlQUFlQSxDQUFDdkIsUUFBUSxFQUFFd0IsV0FBVyxFQUFFO0VBQzlDO0VBQ0EsSUFBSUMsY0FBYyxHQUFHL0IsU0FBUyxDQUFDTSxRQUFRLENBQUM7RUFDeEM7RUFDQTtFQUNBLE1BQU0wQixlQUFlLEdBQUdGLFdBQVcsQ0FBQ3hCLFFBQVEsQ0FBQztFQUM3QyxJQUNFMEIsZUFBZSxJQUNmQyxNQUFNLENBQUNDLFNBQVMsQ0FBQ0MsY0FBYyxDQUFDQyxJQUFJLENBQUNKLGVBQWUsRUFBRSxRQUFRLENBQUMsSUFDL0RBLGVBQWUsQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLEVBQ2xDO0lBQ0FELGNBQWMsR0FBRzFDLE1BQU07RUFDekI7O0VBRUE7RUFDQSxJQUFJLENBQUMwQyxjQUFjLElBQUksQ0FBQ0MsZUFBZSxFQUFFO0lBQ3ZDO0VBQ0Y7RUFFQSxNQUFNekIsT0FBTyxHQUNYd0IsY0FBYyxZQUFZTSxvQkFBVyxHQUFHTixjQUFjLEdBQUdFLE1BQU0sQ0FBQ0ssTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFUCxjQUFjLENBQUM7RUFDNUYsTUFBTVEsSUFBSSxHQUFHLENBQ1gsa0JBQWtCLEVBQ2xCLGVBQWUsRUFDZixlQUFlLEVBQ2YsZUFBZSxFQUNmLGdCQUFnQixFQUNoQixXQUFXLEVBQ1gsaUJBQWlCLEVBQ2pCLFFBQVEsRUFDUixXQUFXLENBQ1o7RUFDRCxNQUFNQyxrQkFBa0IsR0FBRyxJQUFJSCxvQkFBVyxDQUFDLENBQUM7RUFDNUNFLElBQUksQ0FBQ0UsT0FBTyxDQUFDQyxHQUFHLElBQUk7SUFDbEIsTUFBTUMsUUFBUSxHQUFHcEMsT0FBTyxHQUFHbUMsR0FBRyxDQUFDO0lBQy9CLElBQ0VDLFFBQVEsSUFDUixPQUFPQSxRQUFRLEtBQUssVUFBVSxJQUM5QkEsUUFBUSxDQUFDQyxRQUFRLENBQUMsQ0FBQyxLQUFLSixrQkFBa0IsQ0FBQ0UsR0FBRyxDQUFDLENBQUNFLFFBQVEsQ0FBQyxDQUFDLEVBQzFEO01BQ0FyQyxPQUFPLENBQUNtQyxHQUFHLENBQUMsR0FBRyxJQUFJO0lBQ3JCO0VBQ0YsQ0FBQyxDQUFDO0VBQ0YsTUFBTWxDLE1BQU0sR0FBR3dCLGVBQWUsR0FBR0EsZUFBZSxDQUFDeEIsTUFBTSxHQUFHcUMsU0FBUzs7RUFFbkU7RUFDQSxJQUFJYixlQUFlLEVBQUU7SUFDbkIsTUFBTWMsZUFBZSxHQUFHLElBQUFDLHNCQUFXLEVBQUNmLGVBQWUsRUFBRWEsU0FBUyxFQUFFYixlQUFlLENBQUM7SUFDaEYsSUFBSWMsZUFBZSxFQUFFO01BQ25CUCxJQUFJLENBQUNFLE9BQU8sQ0FBQ0MsR0FBRyxJQUFJO1FBQ2xCLElBQUlJLGVBQWUsQ0FBQ0osR0FBRyxDQUFDLEVBQUU7VUFDeEJuQyxPQUFPLENBQUNtQyxHQUFHLENBQUMsR0FBR0ksZUFBZSxDQUFDSixHQUFHLENBQUM7UUFDckM7TUFDRixDQUFDLENBQUM7SUFDSjtFQUNGO0VBQ0EsSUFBSW5DLE9BQU8sQ0FBQ3lDLGVBQWUsRUFBRTtJQUMzQnpDLE9BQU8sQ0FBQ3lDLGVBQWUsQ0FBQ2hCLGVBQWUsQ0FBQztFQUMxQztFQUVBLE9BQU87SUFBRXpCLE9BQU87SUFBRUMsTUFBTTtJQUFFd0I7RUFBZ0IsQ0FBQztBQUM3QztBQUVBaUIsTUFBTSxDQUFDQyxPQUFPLEdBQUcsVUFBVXBCLFdBQVcsR0FBRyxDQUFDLENBQUMsRUFBRXFCLG9CQUFvQixHQUFHLElBQUksRUFBRTtFQUN4RSxJQUFJQyxxQkFBcUIsR0FBR0Qsb0JBQW9CO0VBQ2hELE1BQU1FLHVCQUF1QixHQUFHLFNBQUFBLENBQVVDLE1BQU0sRUFBRTtJQUNoREYscUJBQXFCLEdBQUdFLE1BQU07RUFDaEMsQ0FBQztFQUNEO0VBQ0EsTUFBTUMsdUJBQXVCLEdBQUcsU0FBQUEsQ0FBVWpELFFBQVEsRUFBRTtJQUNsRCxJQUFJQSxRQUFRLEtBQUssV0FBVyxJQUFJLENBQUM4QyxxQkFBcUIsRUFBRTtNQUN0RCxPQUFPO1FBQUV4QixTQUFTLEVBQUVpQjtNQUFVLENBQUM7SUFDakM7SUFDQSxNQUFNVyxXQUFXLEdBQUczQixlQUFlLENBQUN2QixRQUFRLEVBQUV3QixXQUFXLENBQUM7SUFDMUQsSUFBSSxDQUFDMEIsV0FBVyxFQUFFO01BQUU7SUFBUTtJQUM1QixNQUFNO01BQUVqRCxPQUFPO01BQUVDLE1BQU07TUFBRXdCO0lBQWdCLENBQUMsR0FBR3dCLFdBQVc7SUFDeEQsT0FBTztNQUFFNUIsU0FBUyxFQUFFdkIsaUJBQWlCLENBQUNDLFFBQVEsRUFBRUMsT0FBTyxFQUFFQyxNQUFNLEVBQUV3QixlQUFlLENBQUM7TUFBRXpCO0lBQVEsQ0FBQztFQUM5RixDQUFDO0VBRUQsTUFBTWtELFlBQVksR0FBRyxNQUFBQSxDQUFPOUMsR0FBRyxFQUFFRCxRQUFRLEtBQUs7SUFDNUMsSUFBSSxDQUFDQSxRQUFRLEVBQUU7TUFDYjtJQUNGO0lBQ0EsTUFBTWdELFFBQVEsR0FBR3pCLE1BQU0sQ0FBQ00sSUFBSSxDQUFDN0IsUUFBUSxDQUFDO0lBQ3RDLE1BQU1iLE9BQU8sQ0FBQzhELEdBQUcsQ0FDZkQsUUFBUSxDQUFDRSxHQUFHLENBQUMsTUFBTXRELFFBQVEsSUFBSTtNQUM3QixNQUFNa0QsV0FBVyxHQUFHRCx1QkFBdUIsQ0FBQ2pELFFBQVEsQ0FBQztNQUNyRCxJQUFJLENBQUNrRCxXQUFXLEVBQUU7UUFDaEI7TUFDRjtNQUNBLE1BQU07UUFBRWpELE9BQU87UUFBRXlCO01BQWdCLENBQUMsR0FBR3dCLFdBQVc7TUFDaEQsTUFBTUssU0FBUyxHQUFHdEQsT0FBTyxDQUFDc0QsU0FBUztNQUNuQyxJQUFJQSxTQUFTLElBQUksT0FBT0EsU0FBUyxLQUFLLFVBQVUsRUFBRTtRQUNoRCxNQUFNaEQsYUFBYSxHQUFHO1VBQ3BCaUQsRUFBRSxFQUFFbkQsR0FBRyxDQUFDb0QsTUFBTSxDQUFDRCxFQUFFO1VBQ2pCbEQsSUFBSSxFQUFFRCxHQUFHLENBQUNXLElBQUksQ0FBQ1YsSUFBSTtVQUNuQm9ELE1BQU0sRUFBRXJELEdBQUcsQ0FBQ1csSUFBSSxDQUFDRTtRQUNuQixDQUFDO1FBQ0QsTUFBTXlDLE1BQU0sR0FBR0osU0FBUyxDQUFDekIsSUFBSSxDQUMzQjdCLE9BQU8sRUFDUE0sYUFBYSxFQUNiSCxRQUFRLENBQUNKLFFBQVEsQ0FBQyxFQUNsQjBCLGVBQ0YsQ0FBQztRQUNELElBQUlpQyxNQUFNLEVBQUU7VUFDVnZELFFBQVEsQ0FBQ0osUUFBUSxDQUFDLEdBQUcyRCxNQUFNO1FBQzdCO01BQ0Y7SUFDRixDQUFDLENBQ0gsQ0FBQztFQUNILENBQUM7RUFFRCxPQUFPaEMsTUFBTSxDQUFDaUMsTUFBTSxDQUFDO0lBQ25CWCx1QkFBdUI7SUFDdkJGLHVCQUF1QjtJQUN2Qkk7RUFDRixDQUFDLENBQUM7QUFDSixDQUFDO0FBRURSLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDckIsZUFBZSxHQUFHQSxlQUFlIiwiaWdub3JlTGlzdCI6W119