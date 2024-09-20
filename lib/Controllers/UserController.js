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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiciIsInQiLCJPYmplY3QiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZGVmaW5lUHJvcGVydHkiLCJfdG9Qcm9wZXJ0eUtleSIsInZhbHVlIiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJpIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJjYWxsIiwiVHlwZUVycm9yIiwiU3RyaW5nIiwiTnVtYmVyIiwiUmVzdFF1ZXJ5IiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJQcm9taXNlIiwicmVzb2x2ZSIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJyYW5kb21TdHJpbmciLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiaW5jbHVkZXMiLCJlbWFpbFZlcmlmaWVkIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJQYXJzZSIsIl9lbmNvZGUiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJ2ZXJpZnlFbWFpbCIsInVzZXJuYW1lIiwidG9rZW4iLCJ1bmRlZmluZWQiLCJxdWVyeSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCIkZ3QiLCJEYXRlIiwibWFpbnRlbmFuY2VBdXRoIiwibWFpbnRlbmFuY2UiLCJmaW5kVXNlckZvckVtYWlsVmVyaWZpY2F0aW9uIiwibWV0aG9kIiwiTWV0aG9kIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsImV4ZWN1dGUiLCJ0aGVuIiwicmVzdWx0IiwicmVzdWx0cyIsIm9iamVjdElkIiwicmVzdCIsInVwZGF0ZSIsImNoZWNrUmVzZXRUb2tlblZhbGlkaXR5IiwiZGF0YWJhc2UiLCJmaW5kIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJsaW1pdCIsInBhc3N3b3JkUG9saWN5IiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJleHBpcmVzRGF0ZSIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfX3R5cGUiLCJpc28iLCJnZXRVc2VySWZOZWVkZWQiLCJ3aGVyZSIsImVtYWlsIiwicnVuQmVmb3JlRmluZCIsIm1hc3RlciIsImVuY29kZVVSSUNvbXBvbmVudCIsImZldGNoZWRVc2VyIiwic2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbiIsIl9yZXEkYXV0aCIsInJlc3BvbnNlIiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJpcCIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJzaG91bGRTZW5kIiwib2JqZWN0IiwiVXNlciIsImFzc2lnbiIsInJlc2VuZFJlcXVlc3QiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9yZXEkYXV0aDIiLCJfcmVxJGF1dGgzIiwiYVVzZXIiLCJnZW5lcmF0ZSIsInNldFBhc3N3b3JkUmVzZXRUb2tlbiIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiJG9yIiwiJGV4aXN0cyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsIiwidXBkYXRlUGFzc3dvcmQiLCJwYXNzd29yZCIsInVwZGF0ZVVzZXJQYXNzd29yZCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJ1bmxvY2tBY2NvdW50IiwiY2F0Y2giLCJlcnJvciIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZXhwb3J0cyIsImRlc3RpbmF0aW9uIiwidXNlcm5hbWVBbmRUb2tlbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1VzZXJDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcblxudmFyIFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4uL1Jlc3RRdWVyeScpO1xudmFyIEF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgZ2V0IGNvbmZpZygpIHtcbiAgICByZXR1cm4gQ29uZmlnLmdldCh0aGlzLmFwcElkKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiAodGhpcy5jb25maWcgfHwgdGhpcy5vcHRpb25zKS52ZXJpZnlVc2VyRW1haWxzO1xuICB9XG5cbiAgYXN5bmMgc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEsIHN0b3JhZ2UgPSB7fSkge1xuICAgIGNvbnN0IHNob3VsZFNlbmRFbWFpbCA9XG4gICAgICB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gdHJ1ZSB8fFxuICAgICAgKHR5cGVvZiB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAoYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKHJlcSkpKSA9PT0gdHJ1ZSk7XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RvcmFnZS5zZW5kVmVyaWZpY2F0aW9uRW1haWwgPSB0cnVlO1xuICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgaWYgKFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmNsdWRlcygnZW1haWxWZXJpZmllZCcpXG4gICAgKSB7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgLy8gVHJ5aW5nIHRvIHZlcmlmeSBlbWFpbCB3aGVuIG5vdCBlbmFibGVkXG4gICAgICAvLyBUT0RPOiBCZXR0ZXIgZXJyb3IgaGVyZS5cbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYWludGVuYW5jZUF1dGggPSBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKTtcbiAgICB2YXIgZmluZFVzZXJGb3JFbWFpbFZlcmlmaWNhdGlvbiA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1haW50ZW5hbmNlQXV0aCxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcmV0dXJuIGZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24uZXhlY3V0ZSgpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggJiYgcmVzdWx0LnJlc3VsdHNbMF0uZW1haWxWZXJpZmllZCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdC5yZXN1bHRzLmxlbmd0aFswXSk7XG4gICAgICB9IGVsc2UgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBxdWVyeS5vYmplY3RJZCA9IHJlc3VsdC5yZXN1bHRzWzBdLm9iamVjdElkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3QudXBkYXRlKHRoaXMuY29uZmlnLCBtYWludGVuYW5jZUF1dGgsICdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICAgIH0pO1xuICB9XG5cbiAgY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICBfcGVyaXNoYWJsZV90b2tlbjogdG9rZW4sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgJiYgZXhwaXJlc0RhdGUuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgPCBuZXcgRGF0ZSgpKSB0aHJvdyAnVGhlIHBhc3N3b3JkIHJlc2V0IGxpbmsgaGFzIGV4cGlyZWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzWzBdO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRVc2VySWZOZWVkZWQodXNlcikge1xuICAgIHZhciB3aGVyZSA9IHt9O1xuICAgIGlmICh1c2VyLnVzZXJuYW1lKSB7XG4gICAgICB3aGVyZS51c2VybmFtZSA9IHVzZXIudXNlcm5hbWU7XG4gICAgfVxuICAgIGlmICh1c2VyLmVtYWlsKSB7XG4gICAgICB3aGVyZS5lbWFpbCA9IHVzZXIuZW1haWw7XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHdoZXJlLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5yZXN1bHRzWzBdO1xuICB9XG5cbiAgYXN5bmMgc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSkge1xuICAgIGlmICghdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuKTtcbiAgICAvLyBXZSBtYXkgbmVlZCB0byBmZXRjaCB0aGUgdXNlciBpbiBjYXNlIG9mIHVwZGF0ZSBlbWFpbDsgb25seSB1c2UgdGhlIGBmZXRjaGVkVXNlcmBcbiAgICAvLyBmcm9tIHRoaXMgcG9pbnQgb253YXJkczsgZG8gbm90IHVzZSB0aGUgYHVzZXJgIGFzIGl0IG1heSBub3QgY29udGFpbiBhbGwgZmllbGRzLlxuICAgIGNvbnN0IGZldGNoZWRVc2VyID0gYXdhaXQgdGhpcy5nZXRVc2VySWZOZWVkZWQodXNlcik7XG4gICAgbGV0IHNob3VsZFNlbmRFbWFpbCA9IHRoaXMuY29uZmlnLnNlbmRVc2VyRW1haWxWZXJpZmljYXRpb247XG4gICAgaWYgKHR5cGVvZiBzaG91bGRTZW5kRW1haWwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uKHtcbiAgICAgICAgICB1c2VyOiBQYXJzZS5PYmplY3QuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZldGNoZWRVc2VyIH0pLFxuICAgICAgICAgIG1hc3RlcjogcmVxLmF1dGg/LmlzTWFzdGVyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIHNob3VsZFNlbmRFbWFpbCA9ICEhcmVzcG9uc2U7XG4gICAgfVxuICAgIGlmICghc2hvdWxkU2VuZEVtYWlsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KGZldGNoZWRVc2VyLnVzZXJuYW1lKTtcblxuICAgIGNvbnN0IGxpbmsgPSBidWlsZEVtYWlsTGluayh0aGlzLmNvbmZpZy52ZXJpZnlFbWFpbFVSTCwgdXNlcm5hbWUsIHRva2VuLCB0aGlzLmNvbmZpZyk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICBsaW5rOiBsaW5rLFxuICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCBmZXRjaGVkVXNlciksXG4gICAgfTtcbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCkge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVnZW5lcmF0ZXMgdGhlIGdpdmVuIHVzZXIncyBlbWFpbCB2ZXJpZmljYXRpb24gdG9rZW5cbiAgICpcbiAgICogQHBhcmFtIHVzZXJcbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICBhc3luYyByZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCBtYXN0ZXIsIGluc3RhbGxhdGlvbklkLCBpcCkge1xuICAgIGNvbnN0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbiB9ID0gdXNlcjtcbiAgICBsZXQgeyBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgfSA9IHVzZXI7XG4gICAgaWYgKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCAmJiBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC5pc287XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgIHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICYmXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuICYmXG4gICAgICBuZXcgRGF0ZSgpIDwgbmV3IERhdGUoX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KVxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgY29uc3Qgc2hvdWxkU2VuZCA9IGF3YWl0IHRoaXMuc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCB7XG4gICAgICBvYmplY3Q6IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBtYXN0ZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIGlwLFxuICAgICAgcmVzZW5kUmVxdWVzdDogdHJ1ZVxuICAgIH0pO1xuICAgIGlmICghc2hvdWxkU2VuZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSwgdXNlcik7XG4gIH1cblxuICBhc3luYyByZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSwgcmVxKSB7XG4gICAgY29uc3QgYVVzZXIgPSBhd2FpdCB0aGlzLmdldFVzZXJJZk5lZWRlZCh7IHVzZXJuYW1lOiB1c2VybmFtZSB9KTtcbiAgICBpZiAoIWFVc2VyIHx8IGFVc2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhd2FpdCB0aGlzLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKGFVc2VyLCByZXEuYXV0aD8uaXNNYXN0ZXIsIHJlcS5hdXRoPy5pbnN0YWxsYXRpb25JZCwgcmVxLmlwKTtcbiAgICBpZiAoZ2VuZXJhdGUpIHtcbiAgICAgIHRoaXMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKGFVc2VyLCByZXEpO1xuICAgIH1cbiAgfVxuXG4gIHNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCkge1xuICAgIGNvbnN0IHRva2VuID0geyBfcGVyaXNoYWJsZV90b2tlbjogcmFuZG9tU3RyaW5nKDI1KSB9O1xuXG4gICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0b2tlbi5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgJG9yOiBbeyBlbWFpbCB9LCB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSB9XSB9LFxuICAgICAgdG9rZW4sXG4gICAgICB7fSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkge1xuICAgIGlmICghdGhpcy5hZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnVHJ5aW5nIHRvIHNlbmQgYSByZXNldCBwYXNzd29yZCBidXQgbm8gYWRhcHRlciBpcyBzZXQnO1xuICAgICAgLy8gIFRPRE86IE5vIGFkYXB0ZXI/XG4gICAgfVxuICAgIGxldCB1c2VyO1xuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICkge1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IFtcbiAgICAgICAgICAgIHsgZW1haWwsIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgICAgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0sIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSA+IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXVzZXIgfHwgIXVzZXIuX3BlcmlzaGFibGVfdG9rZW4pIHtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLnNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX3BlcmlzaGFibGVfdG9rZW4pO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLCB1c2VybmFtZSwgdG9rZW4sIHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgIGxpbms6IGxpbmssXG4gICAgICB1c2VyOiBpbmZsYXRlKCdfVXNlcicsIHVzZXIpLFxuICAgIH07XG5cbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZE1haWwodGhpcy5kZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICB9XG5cbiAgdXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbilcbiAgICAgIC50aGVuKHVzZXIgPT4gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCB0aGlzLmNvbmZpZykpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgdGhpcy5jb25maWcpO1xuICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kudW5sb2NrQWNjb3VudCgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgLy8gaW4gY2FzZSBvZiBQYXJzZS5FcnJvciwgZmFpbCB3aXRoIHRoZSBlcnJvciBtZXNzYWdlIG9ubHlcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgYXJlIGJlaW5nIGFza2VkIHRvIGNvbmZpcm0gdGhlIGUtbWFpbCBhZGRyZXNzICcgK1xuICAgICAgdXNlci5nZXQoJ2VtYWlsJykgK1xuICAgICAgJyB3aXRoICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAnXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byBjb25maXJtIGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGxlYXNlIHZlcmlmeSB5b3VyIGUtbWFpbCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxuXG4gIGRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgcmVxdWVzdGVkIHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQgZm9yICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAodXNlci5nZXQoJ3VzZXJuYW1lJykgPyBcIiAoeW91ciB1c2VybmFtZSBpcyAnXCIgKyB1c2VyLmdldCgndXNlcm5hbWUnKSArIFwiJylcIiA6ICcnKSArXG4gICAgICAnLlxcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gcmVzZXQgaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJykgfHwgdXNlci5nZXQoJ3VzZXJuYW1lJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQYXNzd29yZCBSZXNldCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxufVxuXG4vLyBNYXJrIHRoaXMgcHJpdmF0ZVxuZnVuY3Rpb24gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCBjb25maWcpIHtcbiAgcmV0dXJuIHJlc3RcbiAgICAudXBkYXRlKFxuICAgICAgY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICB7XG4gICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgIH1cbiAgICApXG4gICAgLnRoZW4oKCkgPT4gdXNlcik7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRW1haWxMaW5rKGRlc3RpbmF0aW9uLCB1c2VybmFtZSwgdG9rZW4sIGNvbmZpZykge1xuICBjb25zdCB1c2VybmFtZUFuZFRva2VuID0gYHRva2VuPSR7dG9rZW59JnVzZXJuYW1lPSR7dXNlcm5hbWV9YDtcblxuICBpZiAoY29uZmlnLnBhcnNlRnJhbWVVUkwpIHtcbiAgICBjb25zdCBkZXN0aW5hdGlvbldpdGhvdXRIb3N0ID0gZGVzdGluYXRpb24ucmVwbGFjZShjb25maWcucHVibGljU2VydmVyVVJMLCAnJyk7XG5cbiAgICByZXR1cm4gYCR7Y29uZmlnLnBhcnNlRnJhbWVVUkx9P2xpbms9JHtlbmNvZGVVUklDb21wb25lbnQoXG4gICAgICBkZXN0aW5hdGlvbldpdGhvdXRIb3N0XG4gICAgKX0mJHt1c2VybmFtZUFuZFRva2VufWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGAke2Rlc3RpbmF0aW9ufT8ke3VzZXJuYW1lQW5kVG9rZW59YDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2VyQ29udHJvbGxlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsWUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLFlBQUEsR0FBQUQsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFPLGVBQUEsR0FBQUosc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFRLE9BQUEsR0FBQUwsc0JBQUEsQ0FBQUgsT0FBQTtBQUErQixTQUFBRyx1QkFBQU0sQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUFBLFNBQUFHLFFBQUFILENBQUEsRUFBQUksQ0FBQSxRQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsSUFBQSxDQUFBUCxDQUFBLE9BQUFNLE1BQUEsQ0FBQUUscUJBQUEsUUFBQUMsQ0FBQSxHQUFBSCxNQUFBLENBQUFFLHFCQUFBLENBQUFSLENBQUEsR0FBQUksQ0FBQSxLQUFBSyxDQUFBLEdBQUFBLENBQUEsQ0FBQUMsTUFBQSxXQUFBTixDQUFBLFdBQUFFLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVgsQ0FBQSxFQUFBSSxD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