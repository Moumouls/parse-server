"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UserController = void 0;
var _cryptoUtils = require("../cryptoUtils");
var _triggers = require("../triggers");
var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));
var _MailAdapter = _interopRequireDefault(require("../Adapters/Email/MailAdapter"));
var _rest = _interopRequireDefault(require("../rest"));
var _node = _interopRequireDefault(require("parse/node"));
var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));
var _Config = _interopRequireDefault(require("../Config"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var RestQuery = require('../RestQuery');
var Auth = require('../Auth');
class UserController extends _AdaptableController.default {
  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
  }
  get config() {
    return _Config.default.get(this.appId);
  }
  validateAdapter(adapter) {
    // Allow no adapter
    if (!adapter && !this.shouldVerifyEmails) {
      return;
    }
    super.validateAdapter(adapter);
  }
  expectedAdapterType() {
    return _MailAdapter.default;
  }
  get shouldVerifyEmails() {
    return (this.config || this.options).verifyUserEmails;
  }
  async setEmailVerifyToken(user, req, storage = {}) {
    const shouldSendEmail = this.shouldVerifyEmails === true || typeof this.shouldVerifyEmails === 'function' && (await Promise.resolve(this.shouldVerifyEmails(req))) === true;
    if (!shouldSendEmail) {
      return false;
    }
    storage.sendVerificationEmail = true;
    user._email_verify_token = (0, _cryptoUtils.randomString)(25);
    if (!storage.fieldsChangedByTrigger || !storage.fieldsChangedByTrigger.includes('emailVerified')) {
      user.emailVerified = false;
    }
    if (this.config.emailVerifyTokenValidityDuration) {
      user._email_verify_token_expires_at = _node.default._encode(this.config.generateEmailVerifyTokenExpiresAt());
    }
    return true;
  }
  async verifyEmail(username, token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }
    const query = {
      username: username,
      _email_verify_token: token
    };
    const updateFields = {
      emailVerified: true,
      _email_verify_token: {
        __op: 'Delete'
      }
    };

    // if the email verify token needs to be validated then
    // add additional query params and additional fields that need to be updated
    if (this.config.emailVerifyTokenValidityDuration) {
      query.emailVerified = false;
      query._email_verify_token_expires_at = {
        $gt: _node.default._encode(new Date())
      };
      updateFields._email_verify_token_expires_at = {
        __op: 'Delete'
      };
    }
    const maintenanceAuth = Auth.maintenance(this.config);
    var findUserForEmailVerification = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      auth: maintenanceAuth,
      className: '_User',
      restWhere: {
        username
      }
    });
    return findUserForEmailVerification.execute().then(result => {
      if (result.results.length && result.results[0].emailVerified) {
        return Promise.resolve(result.results.length[0]);
      } else if (result.results.length) {
        query.objectId = result.results[0].objectId;
      }
      return _rest.default.update(this.config, maintenanceAuth, '_User', query, updateFields);
    });
  }
  checkResetTokenValidity(username, token) {
    return this.config.database.find('_User', {
      username: username,
      _perishable_token: token
    }, {
      limit: 1
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw 'Failed to reset password: username / email / token is invalid';
      }
      if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate < new Date()) throw 'The password reset link has expired';
      }
      return results[0];
    });
  }
  async getUserIfNeeded(user) {
    var where = {};
    if (user.username) {
      where.username = user.username;
    }
    if (user.email) {
      where.email = user.email;
    }
    var query = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      runBeforeFind: false,
      auth: Auth.master(this.config),
      className: '_User',
      restWhere: where
    });
    const result = await query.execute();
    if (result.results.length != 1) {
      throw undefined;
    }
    return result.results[0];
  }
  async sendVerificationEmail(user, req) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    const token = encodeURIComponent(user._email_verify_token);
    // We may need to fetch the user in case of update email; only use the `fetchedUser`
    // from this point onwards; do not use the `user` as it may not contain all fields.
    const fetchedUser = await this.getUserIfNeeded(user);
    let shouldSendEmail = this.config.sendUserEmailVerification;
    if (typeof shouldSendEmail === 'function') {
      var _req$auth;
      const response = await Promise.resolve(this.config.sendUserEmailVerification({
        user: _node.default.Object.fromJSON(_objectSpread({
          className: '_User'
        }, fetchedUser)),
        master: (_req$auth = req.auth) === null || _req$auth === void 0 ? void 0 : _req$auth.isMaster
      }));
      shouldSendEmail = !!response;
    }
    if (!shouldSendEmail) {
      return;
    }
    const username = encodeURIComponent(fetchedUser.username);
    const link = buildEmailLink(this.config.verifyEmailURL, username, token, this.config);
    const options = {
      appName: this.config.appName,
      link: link,
      user: (0, _triggers.inflate)('_User', fetchedUser)
    };
    if (this.adapter.sendVerificationEmail) {
      this.adapter.sendVerificationEmail(options);
    } else {
      this.adapter.sendMail(this.defaultVerificationEmail(options));
    }
  }

  /**
   * Regenerates the given user's email verification token
   *
   * @param user
   * @returns {*}
   */
  async regenerateEmailVerifyToken(user, master, installationId, ip) {
    const {
      _email_verify_token
    } = user;
    let {
      _email_verify_token_expires_at
    } = user;
    if (_email_verify_token_expires_at && _email_verify_token_expires_at.__type === 'Date') {
      _email_verify_token_expires_at = _email_verify_token_expires_at.iso;
    }
    if (this.config.emailVerifyTokenReuseIfValid && this.config.emailVerifyTokenValidityDuration && _email_verify_token && new Date() < new Date(_email_verify_token_expires_at)) {
      return Promise.resolve(true);
    }
    const shouldSend = await this.setEmailVerifyToken(user, {
      object: _node.default.User.fromJSON(Object.assign({
        className: '_User'
      }, user)),
      master,
      installationId,
      ip,
      resendRequest: true
    });
    if (!shouldSend) {
      return;
    }
    return this.config.database.update('_User', {
      username: user.username
    }, user);
  }
  async resendVerificationEmail(username, req) {
    var _req$auth2, _req$auth3;
    const aUser = await this.getUserIfNeeded({
      username: username
    });
    if (!aUser || aUser.emailVerified) {
      throw undefined;
    }
    const generate = await this.regenerateEmailVerifyToken(aUser, (_req$auth2 = req.auth) === null || _req$auth2 === void 0 ? void 0 : _req$auth2.isMaster, (_req$auth3 = req.auth) === null || _req$auth3 === void 0 ? void 0 : _req$auth3.installationId, req.ip);
    if (generate) {
      this.sendVerificationEmail(aUser, req);
    }
  }
  setPasswordResetToken(email) {
    const token = {
      _perishable_token: (0, _cryptoUtils.randomString)(25)
    };
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
      token._perishable_token_expires_at = _node.default._encode(this.config.generatePasswordResetTokenExpiresAt());
    }
    return this.config.database.update('_User', {
      $or: [{
        email
      }, {
        username: email,
        email: {
          $exists: false
        }
      }]
    }, token, {}, true);
  }
  async sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw 'Trying to send a reset password but no adapter is set';
      //  TODO: No adapter?
    }
    let user;
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenReuseIfValid && this.config.passwordPolicy.resetTokenValidityDuration) {
      const results = await this.config.database.find('_User', {
        $or: [{
          email,
          _perishable_token: {
            $exists: true
          }
        }, {
          username: email,
          email: {
            $exists: false
          },
          _perishable_token: {
            $exists: true
          }
        }]
      }, {
        limit: 1
      }, Auth.maintenance(this.config));
      if (results.length == 1) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate > new Date()) {
          user = results[0];
        }
      }
    }
    if (!user || !user._perishable_token) {
      user = await this.setPasswordResetToken(email);
    }
    const token = encodeURIComponent(user._perishable_token);
    const username = encodeURIComponent(user.username);
    const link = buildEmailLink(this.config.requestResetPasswordURL, username, token, this.config);
    const options = {
      appName: this.config.appName,
      link: link,
      user: (0, _triggers.inflate)('_User', user)
    };
    if (this.adapter.sendPasswordResetEmail) {
      this.adapter.sendPasswordResetEmail(options);
    } else {
      this.adapter.sendMail(this.defaultResetPasswordEmail(options));
    }
    return Promise.resolve(user);
  }
  updatePassword(username, token, password) {
    return this.checkResetTokenValidity(username, token).then(user => updateUserPassword(user, password, this.config)).then(user => {
      const accountLockoutPolicy = new _AccountLockout.default(user, this.config);
      return accountLockoutPolicy.unlockAccount();
    }).catch(error => {
      if (error && error.message) {
        // in case of Parse.Error, fail with the error message only
        return Promise.reject(error.message);
      } else {
        return Promise.reject(error);
      }
    });
  }
  defaultVerificationEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You are being asked to confirm the e-mail address ' + user.get('email') + ' with ' + appName + '\n\n' + '' + 'Click here to confirm it:\n' + link;
    const to = user.get('email');
    const subject = 'Please verify your e-mail for ' + appName;
    return {
      text,
      to,
      subject
    };
  }
  defaultResetPasswordEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You requested to reset your password for ' + appName + (user.get('username') ? " (your username is '" + user.get('username') + "')" : '') + '.\n\n' + '' + 'Click here to reset it:\n' + link;
    const to = user.get('email') || user.get('username');
    const subject = 'Password Reset for ' + appName;
    return {
      text,
      to,
      subject
    };
  }
}

// Mark this private
exports.UserController = UserController;
function updateUserPassword(user, password, config) {
  return _rest.default.update(config, Auth.master(config), '_User', {
    objectId: user.objectId
  }, {
    password: password
  }).then(() => user);
}
function buildEmailLink(destination, username, token, config) {
  const usernameAndToken = `token=${token}&username=${username}`;
  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(config.publicServerURL, '');
    return `${config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${usernameAndToken}`;
  } else {
    return `${destination}?${usernameAndToken}`;
  }
}
var _default = exports.default = UserController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJlIiwiciIsInQiLCJPYmplY3QiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZGVmaW5lUHJvcGVydHkiLCJrZXkiLCJ2YWx1ZSIsIl90b1Byb3BlcnR5S2V5IiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJpIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJjYWxsIiwiVHlwZUVycm9yIiwiU3RyaW5nIiwiTnVtYmVyIiwiUmVzdFF1ZXJ5IiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJQcm9taXNlIiwicmVzb2x2ZSIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJyYW5kb21TdHJpbmciLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiaW5jbHVkZXMiLCJlbWFpbFZlcmlmaWVkIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJQYXJzZSIsIl9lbmNvZGUiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJ2ZXJpZnlFbWFpbCIsInVzZXJuYW1lIiwidG9rZW4iLCJ1bmRlZmluZWQiLCJxdWVyeSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCIkZ3QiLCJEYXRlIiwibWFpbnRlbmFuY2VBdXRoIiwibWFpbnRlbmFuY2UiLCJmaW5kVXNlckZvckVtYWlsVmVyaWZpY2F0aW9uIiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsImV4ZWN1dGUiLCJ0aGVuIiwicmVzdWx0IiwicmVzdWx0cyIsIm9iamVjdElkIiwicmVzdCIsInVwZGF0ZSIsImNoZWNrUmVzZXRUb2tlblZhbGlkaXR5IiwiZGF0YWJhc2UiLCJmaW5kIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJsaW1pdCIsInBhc3N3b3JkUG9saWN5IiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJleHBpcmVzRGF0ZSIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfX3R5cGUiLCJpc28iLCJnZXRVc2VySWZOZWVkZWQiLCJ3aGVyZSIsImVtYWlsIiwicnVuQmVmb3JlRmluZCIsIm1hc3RlciIsImVuY29kZVVSSUNvbXBvbmVudCIsImZldGNoZWRVc2VyIiwic2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbiIsIl9yZXEkYXV0aCIsInJlc3BvbnNlIiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJpcCIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJzaG91bGRTZW5kIiwib2JqZWN0IiwiVXNlciIsImFzc2lnbiIsInJlc2VuZFJlcXVlc3QiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9yZXEkYXV0aDIiLCJfcmVxJGF1dGgzIiwiYVVzZXIiLCJnZW5lcmF0ZSIsInNldFBhc3N3b3JkUmVzZXRUb2tlbiIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiJG9yIiwiJGV4aXN0cyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsIiwidXBkYXRlUGFzc3dvcmQiLCJwYXNzd29yZCIsInVwZGF0ZVVzZXJQYXNzd29yZCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJ1bmxvY2tBY2NvdW50IiwiY2F0Y2giLCJlcnJvciIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZXhwb3J0cyIsImRlc3RpbmF0aW9uIiwidXNlcm5hbWVBbmRUb2tlbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1VzZXJDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcblxudmFyIFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4uL1Jlc3RRdWVyeScpO1xudmFyIEF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgZ2V0IGNvbmZpZygpIHtcbiAgICByZXR1cm4gQ29uZmlnLmdldCh0aGlzLmFwcElkKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiAodGhpcy5jb25maWcgfHwgdGhpcy5vcHRpb25zKS52ZXJpZnlVc2VyRW1haWxzO1xuICB9XG5cbiAgYXN5bmMgc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEsIHN0b3JhZ2UgPSB7fSkge1xuICAgIGNvbnN0IHNob3VsZFNlbmRFbWFpbCA9XG4gICAgICB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gdHJ1ZSB8fFxuICAgICAgKHR5cGVvZiB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAoYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKHJlcSkpKSA9PT0gdHJ1ZSk7XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RvcmFnZS5zZW5kVmVyaWZpY2F0aW9uRW1haWwgPSB0cnVlO1xuICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgaWYgKFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmNsdWRlcygnZW1haWxWZXJpZmllZCcpXG4gICAgKSB7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgLy8gVHJ5aW5nIHRvIHZlcmlmeSBlbWFpbCB3aGVuIG5vdCBlbmFibGVkXG4gICAgICAvLyBUT0RPOiBCZXR0ZXIgZXJyb3IgaGVyZS5cbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYWludGVuYW5jZUF1dGggPSBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKTtcbiAgICB2YXIgZmluZFVzZXJGb3JFbWFpbFZlcmlmaWNhdGlvbiA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1haW50ZW5hbmNlQXV0aCxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcmV0dXJuIGZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24uZXhlY3V0ZSgpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggJiYgcmVzdWx0LnJlc3VsdHNbMF0uZW1haWxWZXJpZmllZCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdC5yZXN1bHRzLmxlbmd0aFswXSk7XG4gICAgICB9IGVsc2UgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBxdWVyeS5vYmplY3RJZCA9IHJlc3VsdC5yZXN1bHRzWzBdLm9iamVjdElkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3QudXBkYXRlKHRoaXMuY29uZmlnLCBtYWludGVuYW5jZUF1dGgsICdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICAgIH0pO1xuICB9XG5cbiAgY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICBfcGVyaXNoYWJsZV90b2tlbjogdG9rZW4sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgJiYgZXhwaXJlc0RhdGUuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgPCBuZXcgRGF0ZSgpKSB0aHJvdyAnVGhlIHBhc3N3b3JkIHJlc2V0IGxpbmsgaGFzIGV4cGlyZWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzWzBdO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRVc2VySWZOZWVkZWQodXNlcikge1xuICAgIHZhciB3aGVyZSA9IHt9O1xuICAgIGlmICh1c2VyLnVzZXJuYW1lKSB7XG4gICAgICB3aGVyZS51c2VybmFtZSA9IHVzZXIudXNlcm5hbWU7XG4gICAgfVxuICAgIGlmICh1c2VyLmVtYWlsKSB7XG4gICAgICB3aGVyZS5lbWFpbCA9IHVzZXIuZW1haWw7XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHdoZXJlLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5yZXN1bHRzWzBdO1xuICB9XG5cbiAgYXN5bmMgc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSkge1xuICAgIGlmICghdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuKTtcbiAgICAvLyBXZSBtYXkgbmVlZCB0byBmZXRjaCB0aGUgdXNlciBpbiBjYXNlIG9mIHVwZGF0ZSBlbWFpbDsgb25seSB1c2UgdGhlIGBmZXRjaGVkVXNlcmBcbiAgICAvLyBmcm9tIHRoaXMgcG9pbnQgb253YXJkczsgZG8gbm90IHVzZSB0aGUgYHVzZXJgIGFzIGl0IG1heSBub3QgY29udGFpbiBhbGwgZmllbGRzLlxuICAgIGNvbnN0IGZldGNoZWRVc2VyID0gYXdhaXQgdGhpcy5nZXRVc2VySWZOZWVkZWQodXNlcik7XG4gICAgbGV0IHNob3VsZFNlbmRFbWFpbCA9IHRoaXMuY29uZmlnLnNlbmRVc2VyRW1haWxWZXJpZmljYXRpb247XG4gICAgaWYgKHR5cGVvZiBzaG91bGRTZW5kRW1haWwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uKHtcbiAgICAgICAgICB1c2VyOiBQYXJzZS5PYmplY3QuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZldGNoZWRVc2VyIH0pLFxuICAgICAgICAgIG1hc3RlcjogcmVxLmF1dGg/LmlzTWFzdGVyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIHNob3VsZFNlbmRFbWFpbCA9ICEhcmVzcG9uc2U7XG4gICAgfVxuICAgIGlmICghc2hvdWxkU2VuZEVtYWlsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KGZldGNoZWRVc2VyLnVzZXJuYW1lKTtcblxuICAgIGNvbnN0IGxpbmsgPSBidWlsZEVtYWlsTGluayh0aGlzLmNvbmZpZy52ZXJpZnlFbWFpbFVSTCwgdXNlcm5hbWUsIHRva2VuLCB0aGlzLmNvbmZpZyk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICBsaW5rOiBsaW5rLFxuICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCBmZXRjaGVkVXNlciksXG4gICAgfTtcbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCkge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVnZW5lcmF0ZXMgdGhlIGdpdmVuIHVzZXIncyBlbWFpbCB2ZXJpZmljYXRpb24gdG9rZW5cbiAgICpcbiAgICogQHBhcmFtIHVzZXJcbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICBhc3luYyByZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCBtYXN0ZXIsIGluc3RhbGxhdGlvbklkLCBpcCkge1xuICAgIGNvbnN0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbiB9ID0gdXNlcjtcbiAgICBsZXQgeyBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgfSA9IHVzZXI7XG4gICAgaWYgKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCAmJiBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC5pc287XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgIHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICYmXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuICYmXG4gICAgICBuZXcgRGF0ZSgpIDwgbmV3IERhdGUoX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KVxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgY29uc3Qgc2hvdWxkU2VuZCA9IGF3YWl0IHRoaXMuc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCB7XG4gICAgICBvYmplY3Q6IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBtYXN0ZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIGlwLFxuICAgICAgcmVzZW5kUmVxdWVzdDogdHJ1ZVxuICAgIH0pO1xuICAgIGlmICghc2hvdWxkU2VuZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSwgdXNlcik7XG4gIH1cblxuICBhc3luYyByZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSwgcmVxKSB7XG4gICAgY29uc3QgYVVzZXIgPSBhd2FpdCB0aGlzLmdldFVzZXJJZk5lZWRlZCh7IHVzZXJuYW1lOiB1c2VybmFtZSB9KTtcbiAgICBpZiAoIWFVc2VyIHx8IGFVc2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhd2FpdCB0aGlzLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKGFVc2VyLCByZXEuYXV0aD8uaXNNYXN0ZXIsIHJlcS5hdXRoPy5pbnN0YWxsYXRpb25JZCwgcmVxLmlwKTtcbiAgICBpZiAoZ2VuZXJhdGUpIHtcbiAgICAgIHRoaXMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKGFVc2VyLCByZXEpO1xuICAgIH1cbiAgfVxuXG4gIHNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCkge1xuICAgIGNvbnN0IHRva2VuID0geyBfcGVyaXNoYWJsZV90b2tlbjogcmFuZG9tU3RyaW5nKDI1KSB9O1xuXG4gICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0b2tlbi5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgJG9yOiBbeyBlbWFpbCB9LCB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSB9XSB9LFxuICAgICAgdG9rZW4sXG4gICAgICB7fSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkge1xuICAgIGlmICghdGhpcy5hZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnVHJ5aW5nIHRvIHNlbmQgYSByZXNldCBwYXNzd29yZCBidXQgbm8gYWRhcHRlciBpcyBzZXQnO1xuICAgICAgLy8gIFRPRE86IE5vIGFkYXB0ZXI/XG4gICAgfVxuICAgIGxldCB1c2VyO1xuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICkge1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IFtcbiAgICAgICAgICAgIHsgZW1haWwsIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgICAgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0sIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSA+IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXVzZXIgfHwgIXVzZXIuX3BlcmlzaGFibGVfdG9rZW4pIHtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLnNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX3BlcmlzaGFibGVfdG9rZW4pO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLCB1c2VybmFtZSwgdG9rZW4sIHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgIGxpbms6IGxpbmssXG4gICAgICB1c2VyOiBpbmZsYXRlKCdfVXNlcicsIHVzZXIpLFxuICAgIH07XG5cbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZE1haWwodGhpcy5kZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICB9XG5cbiAgdXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbilcbiAgICAgIC50aGVuKHVzZXIgPT4gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCB0aGlzLmNvbmZpZykpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgdGhpcy5jb25maWcpO1xuICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kudW5sb2NrQWNjb3VudCgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgLy8gaW4gY2FzZSBvZiBQYXJzZS5FcnJvciwgZmFpbCB3aXRoIHRoZSBlcnJvciBtZXNzYWdlIG9ubHlcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgYXJlIGJlaW5nIGFza2VkIHRvIGNvbmZpcm0gdGhlIGUtbWFpbCBhZGRyZXNzICcgK1xuICAgICAgdXNlci5nZXQoJ2VtYWlsJykgK1xuICAgICAgJyB3aXRoICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAnXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byBjb25maXJtIGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGxlYXNlIHZlcmlmeSB5b3VyIGUtbWFpbCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxuXG4gIGRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgcmVxdWVzdGVkIHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQgZm9yICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAodXNlci5nZXQoJ3VzZXJuYW1lJykgPyBcIiAoeW91ciB1c2VybmFtZSBpcyAnXCIgKyB1c2VyLmdldCgndXNlcm5hbWUnKSArIFwiJylcIiA6ICcnKSArXG4gICAgICAnLlxcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gcmVzZXQgaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJykgfHwgdXNlci5nZXQoJ3VzZXJuYW1lJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQYXNzd29yZCBSZXNldCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxufVxuXG4vLyBNYXJrIHRoaXMgcHJpdmF0ZVxuZnVuY3Rpb24gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCBjb25maWcpIHtcbiAgcmV0dXJuIHJlc3RcbiAgICAudXBkYXRlKFxuICAgICAgY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICB7XG4gICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgIH1cbiAgICApXG4gICAgLnRoZW4oKCkgPT4gdXNlcik7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRW1haWxMaW5rKGRlc3RpbmF0aW9uLCB1c2VybmFtZSwgdG9rZW4sIGNvbmZpZykge1xuICBjb25zdCB1c2VybmFtZUFuZFRva2VuID0gYHRva2VuPSR7dG9rZW59JnVzZXJuYW1lPSR7dXNlcm5hbWV9YDtcblxuICBpZiAoY29uZmlnLnBhcnNlRnJhbWVVUkwpIHtcbiAgICBjb25zdCBkZXN0aW5hdGlvbldpdGhvdXRIb3N0ID0gZGVzdGluYXRpb24ucmVwbGFjZShjb25maWcucHVibGljU2VydmVyVVJMLCAnJyk7XG5cbiAgICByZXR1cm4gYCR7Y29uZmlnLnBhcnNlRnJhbWVVUkx9P2xpbms9JHtlbmNvZGVVUklDb21wb25lbnQoXG4gICAgICBkZXN0aW5hdGlvbldpdGhvdXRIb3N0XG4gICAgKX0mJHt1c2VybmFtZUFuZFRva2VufWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGAke2Rlc3RpbmF0aW9ufT8ke3VzZXJuYW1lQW5kVG9rZW59YDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2VyQ29udHJvbGxlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsWUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLFlBQUEsR0FBQUQsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFPLGVBQUEsR0FBQUosc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFRLE9BQUEsR0FBQUwsc0JBQUEsQ0FBQUgsT0FBQTtBQUErQixTQUFBRyx1QkFBQU0sR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQUFBLFNBQUFHLFFBQUFDLENBQUEsRUFBQUMsQ0FBQSxRQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsSUFBQSxDQUFBSixDQUFBLE9BQUFHLE1BQUEsQ0FBQUUscUJBQUEsUUFBQUMsQ0FBQSxHQUFBSCxNQUFBLENBQUFFLHFCQUFBLENBQUFMLENBQUEsR0FBQUMsQ0FBQSxLQUFBSyxDQUFBLEdBQUFBLENBQUEsQ0FBQUMsTUFBQSxXQUFBTixDQUFBLFdBQUFFLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVIs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