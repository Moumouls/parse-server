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
  async verifyEmail(token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }
    const query = {
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
    const restQuery = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      auth: maintenanceAuth,
      className: '_User',
      restWhere: query
    });
    const result = await restQuery.execute();
    if (result.results.length) {
      query.objectId = result.results[0].objectId;
    }
    return await _rest.default.update(this.config, maintenanceAuth, '_User', query, updateFields);
  }
  async checkResetTokenValidity(token) {
    const results = await this.config.database.find('_User', {
      _perishable_token: token
    }, {
      limit: 1
    }, Auth.maintenance(this.config));
    if (results.length !== 1) {
      throw 'Failed to reset password: username / email / token is invalid';
    }
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
      let expiresDate = results[0]._perishable_token_expires_at;
      if (expiresDate && expiresDate.__type == 'Date') {
        expiresDate = new Date(expiresDate.iso);
      }
      if (expiresDate < new Date()) {
        throw 'The password reset link has expired';
      }
    }
    return results[0];
  }
  async getUserIfNeeded(user) {
    var where = {};
    if (user.username) {
      where.username = user.username;
    }
    if (user.email) {
      where.email = user.email;
    }
    if (user._email_verify_token) {
      where._email_verify_token = user._email_verify_token;
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
      const response = await Promise.resolve(this.config.sendUserEmailVerification({
        user: _node.default.Object.fromJSON({
          className: '_User',
          ...fetchedUser
        }),
        master: req.auth?.isMaster
      }));
      shouldSendEmail = !!response;
    }
    if (!shouldSendEmail) {
      return;
    }
    const link = buildEmailLink(this.config.verifyEmailURL, token, this.config);
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
  async resendVerificationEmail(username, req, token) {
    const aUser = await this.getUserIfNeeded({
      username,
      _email_verify_token: token
    });
    if (!aUser || aUser.emailVerified) {
      throw undefined;
    }
    const generate = await this.regenerateEmailVerifyToken(aUser, req.auth?.isMaster, req.auth?.installationId, req.ip);
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
    const link = buildEmailLink(this.config.requestResetPasswordURL, token, this.config);
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
  async updatePassword(token, password) {
    try {
      const rawUser = await this.checkResetTokenValidity(token);
      const user = await updateUserPassword(rawUser, password, this.config);
      const accountLockoutPolicy = new _AccountLockout.default(user, this.config);
      return await accountLockoutPolicy.unlockAccount();
    } catch (error) {
      if (error && error.message) {
        // in case of Parse.Error, fail with the error message only
        return Promise.reject(error.message);
      }
      return Promise.reject(error);
    }
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
function buildEmailLink(destination, token, config) {
  token = `token=${token}`;
  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(config.publicServerURL, '');
    return `${config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${token}`;
  } else {
    return `${destination}?${token}`;
  }
}
var _default = exports.default = UserController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJSZXN0UXVlcnkiLCJBdXRoIiwiVXNlckNvbnRyb2xsZXIiLCJBZGFwdGFibGVDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiYXBwSWQiLCJvcHRpb25zIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwidmFsaWRhdGVBZGFwdGVyIiwic2hvdWxkVmVyaWZ5RW1haWxzIiwiZXhwZWN0ZWRBZGFwdGVyVHlwZSIsIk1haWxBZGFwdGVyIiwidmVyaWZ5VXNlckVtYWlscyIsInNldEVtYWlsVmVyaWZ5VG9rZW4iLCJ1c2VyIiwicmVxIiwic3RvcmFnZSIsInNob3VsZFNlbmRFbWFpbCIsIlByb21pc2UiLCJyZXNvbHZlIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsInJhbmRvbVN0cmluZyIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJpbmNsdWRlcyIsImVtYWlsVmVyaWZpZWQiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcmlmeUVtYWlsIiwidG9rZW4iLCJ1bmRlZmluZWQiLCJxdWVyeSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCIkZ3QiLCJEYXRlIiwibWFpbnRlbmFuY2VBdXRoIiwibWFpbnRlbmFuY2UiLCJyZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJhdXRoIiwiY2xhc3NOYW1lIiwicmVzdFdoZXJlIiwicmVzdWx0IiwiZXhlY3V0ZSIsInJlc3VsdHMiLCJsZW5ndGgiLCJvYmplY3RJZCIsInJlc3QiLCJ1cGRhdGUiLCJjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSIsImRhdGFiYXNlIiwiZmluZCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwibGltaXQiLCJwYXNzd29yZFBvbGljeSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZXhwaXJlc0RhdGUiLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX190eXBlIiwiaXNvIiwiZ2V0VXNlcklmTmVlZGVkIiwid2hlcmUiLCJ1c2VybmFtZSIsImVtYWlsIiwicnVuQmVmb3JlRmluZCIsIm1hc3RlciIsImVuY29kZVVSSUNvbXBvbmVudCIsImZldGNoZWRVc2VyIiwic2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbiIsInJlc3BvbnNlIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJpcCIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJzaG91bGRTZW5kIiwib2JqZWN0IiwiVXNlciIsImFzc2lnbiIsInJlc2VuZFJlcXVlc3QiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImFVc2VyIiwiZ2VuZXJhdGUiLCJzZXRQYXNzd29yZFJlc2V0VG9rZW4iLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsIiRvciIsIiRleGlzdHMiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwiZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCIsInVwZGF0ZVBhc3N3b3JkIiwicGFzc3dvcmQiLCJyYXdVc2VyIiwidXBkYXRlVXNlclBhc3N3b3JkIiwiYWNjb3VudExvY2tvdXRQb2xpY3kiLCJBY2NvdW50TG9ja291dCIsInVubG9ja0FjY291bnQiLCJlcnJvciIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZXhwb3J0cyIsInRoZW4iLCJkZXN0aW5hdGlvbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1VzZXJDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcblxudmFyIFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4uL1Jlc3RRdWVyeScpO1xudmFyIEF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgZ2V0IGNvbmZpZygpIHtcbiAgICByZXR1cm4gQ29uZmlnLmdldCh0aGlzLmFwcElkKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiAodGhpcy5jb25maWcgfHwgdGhpcy5vcHRpb25zKS52ZXJpZnlVc2VyRW1haWxzO1xuICB9XG5cbiAgYXN5bmMgc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEsIHN0b3JhZ2UgPSB7fSkge1xuICAgIGNvbnN0IHNob3VsZFNlbmRFbWFpbCA9XG4gICAgICB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gdHJ1ZSB8fFxuICAgICAgKHR5cGVvZiB0aGlzLnNob3VsZFZlcmlmeUVtYWlscyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAoYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKHJlcSkpKSA9PT0gdHJ1ZSk7XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RvcmFnZS5zZW5kVmVyaWZpY2F0aW9uRW1haWwgPSB0cnVlO1xuICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgaWYgKFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmNsdWRlcygnZW1haWxWZXJpZmllZCcpXG4gICAgKSB7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5RW1haWwodG9rZW4pIHtcbiAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICAvLyBUcnlpbmcgdG8gdmVyaWZ5IGVtYWlsIHdoZW4gbm90IGVuYWJsZWRcbiAgICAgIC8vIFRPRE86IEJldHRlciBlcnJvciBoZXJlLlxuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5ID0geyBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYWludGVuYW5jZUF1dGggPSBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCByZXN0UXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBtYWludGVuYW5jZUF1dGgsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHF1ZXJ5LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdFF1ZXJ5LmV4ZWN1dGUoKTtcbiAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHJlc3VsdC5yZXN1bHRzWzBdLm9iamVjdElkO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgcmVzdC51cGRhdGUodGhpcy5jb25maWcsIG1haW50ZW5hbmNlQXV0aCwgJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gIH1cblxuICBhc3luYyBjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh0b2tlbikge1xuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHtcbiAgICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHRva2VuLFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgKTtcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgIGV4cGlyZXNEYXRlID0gbmV3IERhdGUoZXhwaXJlc0RhdGUuaXNvKTtcbiAgICAgIH1cbiAgICAgIGlmIChleHBpcmVzRGF0ZSA8IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgdGhyb3cgJ1RoZSBwYXNzd29yZCByZXNldCBsaW5rIGhhcyBleHBpcmVkJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgfVxuXG4gIGFzeW5jIGdldFVzZXJJZk5lZWRlZCh1c2VyKSB7XG4gICAgdmFyIHdoZXJlID0ge307XG4gICAgaWYgKHVzZXIudXNlcm5hbWUpIHtcbiAgICAgIHdoZXJlLnVzZXJuYW1lID0gdXNlci51c2VybmFtZTtcbiAgICB9XG4gICAgaWYgKHVzZXIuZW1haWwpIHtcbiAgICAgIHdoZXJlLmVtYWlsID0gdXNlci5lbWFpbDtcbiAgICB9XG4gICAgaWYgKHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbikge1xuICAgICAgd2hlcmUuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbjtcbiAgICB9XG5cbiAgICB2YXIgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIHJlc3RXaGVyZTogd2hlcmUsXG4gICAgfSk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LnJlc3VsdHNbMF07XG4gIH1cblxuICBhc3luYyBzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlciwgcmVxKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0b2tlbiA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW4pO1xuICAgIC8vIFdlIG1heSBuZWVkIHRvIGZldGNoIHRoZSB1c2VyIGluIGNhc2Ugb2YgdXBkYXRlIGVtYWlsOyBvbmx5IHVzZSB0aGUgYGZldGNoZWRVc2VyYFxuICAgIC8vIGZyb20gdGhpcyBwb2ludCBvbndhcmRzOyBkbyBub3QgdXNlIHRoZSBgdXNlcmAgYXMgaXQgbWF5IG5vdCBjb250YWluIGFsbCBmaWVsZHMuXG4gICAgY29uc3QgZmV0Y2hlZFVzZXIgPSBhd2FpdCB0aGlzLmdldFVzZXJJZk5lZWRlZCh1c2VyKTtcbiAgICBsZXQgc2hvdWxkU2VuZEVtYWlsID0gdGhpcy5jb25maWcuc2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbjtcbiAgICBpZiAodHlwZW9mIHNob3VsZFNlbmRFbWFpbCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIHRoaXMuY29uZmlnLnNlbmRVc2VyRW1haWxWZXJpZmljYXRpb24oe1xuICAgICAgICAgIHVzZXI6IFBhcnNlLk9iamVjdC5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZmV0Y2hlZFVzZXIgfSksXG4gICAgICAgICAgbWFzdGVyOiByZXEuYXV0aD8uaXNNYXN0ZXIsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgc2hvdWxkU2VuZEVtYWlsID0gISFyZXNwb25zZTtcbiAgICB9XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnZlcmlmeUVtYWlsVVJMLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgbGluazogbGluayxcbiAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgZmV0Y2hlZFVzZXIpLFxuICAgIH07XG4gICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwob3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2VuZXJhdGVzIHRoZSBnaXZlbiB1c2VyJ3MgZW1haWwgdmVyaWZpY2F0aW9uIHRva2VuXG4gICAqXG4gICAqIEBwYXJhbSB1c2VyXG4gICAqIEByZXR1cm5zIHsqfVxuICAgKi9cbiAgYXN5bmMgcmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlciwgbWFzdGVyLCBpbnN0YWxsYXRpb25JZCwgaXApIHtcbiAgICBjb25zdCB7IF9lbWFpbF92ZXJpZnlfdG9rZW4gfSA9IHVzZXI7XG4gICAgbGV0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IH0gPSB1c2VyO1xuICAgIGlmIChfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgJiYgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuaXNvO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAmJlxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbiAmJlxuICAgICAgbmV3IERhdGUoKSA8IG5ldyBEYXRlKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdClcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIGNvbnN0IHNob3VsZFNlbmQgPSBhd2FpdCB0aGlzLnNldEVtYWlsVmVyaWZ5VG9rZW4odXNlciwge1xuICAgICAgb2JqZWN0OiBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbWFzdGVyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpcCxcbiAgICAgIHJlc2VuZFJlcXVlc3Q6IHRydWVcbiAgICB9KTtcbiAgICBpZiAoIXNob3VsZFNlbmQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sIHVzZXIpO1xuICB9XG5cbiAgYXN5bmMgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUsIHJlcSwgdG9rZW4pIHtcbiAgICBjb25zdCBhVXNlciA9IGF3YWl0IHRoaXMuZ2V0VXNlcklmTmVlZGVkKHsgdXNlcm5hbWUsIF9lbWFpbF92ZXJpZnlfdG9rZW46IHRva2VuIH0pO1xuICAgIGlmICghYVVzZXIgfHwgYVVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBnZW5lcmF0ZSA9IGF3YWl0IHRoaXMucmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4oYVVzZXIsIHJlcS5hdXRoPy5pc01hc3RlciwgcmVxLmF1dGg/Lmluc3RhbGxhdGlvbklkLCByZXEuaXApO1xuICAgIGlmIChnZW5lcmF0ZSkge1xuICAgICAgdGhpcy5zZW5kVmVyaWZpY2F0aW9uRW1haWwoYVVzZXIsIHJlcSk7XG4gICAgfVxuICB9XG5cbiAgc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKSB7XG4gICAgY29uc3QgdG9rZW4gPSB7IF9wZXJpc2hhYmxlX3Rva2VuOiByYW5kb21TdHJpbmcoMjUpIH07XG5cbiAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRva2VuLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICB0aGlzLmNvbmZpZy5nZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAnX1VzZXInLFxuICAgICAgeyAkb3I6IFt7IGVtYWlsIH0sIHsgdXNlcm5hbWU6IGVtYWlsLCBlbWFpbDogeyAkZXhpc3RzOiBmYWxzZSB9IH1dIH0sXG4gICAgICB0b2tlbixcbiAgICAgIHt9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cblxuICBhc3luYyBzZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKSB7XG4gICAgaWYgKCF0aGlzLmFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdUcnlpbmcgdG8gc2VuZCBhIHJlc2V0IHBhc3N3b3JkIGJ1dCBubyBhZGFwdGVyIGlzIHNldCc7XG4gICAgICAvLyAgVE9ETzogTm8gYWRhcHRlcj9cbiAgICB9XG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKFxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uXG4gICAgKSB7XG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogW1xuICAgICAgICAgICAgeyBlbWFpbCwgX3BlcmlzaGFibGVfdG9rZW46IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgICB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSwgX3BlcmlzaGFibGVfdG9rZW46IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgeyBsaW1pdDogMSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKTtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgaWYgKGV4cGlyZXNEYXRlICYmIGV4cGlyZXNEYXRlLl9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBleHBpcmVzRGF0ZSA9IG5ldyBEYXRlKGV4cGlyZXNEYXRlLmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV4cGlyZXNEYXRlID4gbmV3IERhdGUoKSkge1xuICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghdXNlciB8fCAhdXNlci5fcGVyaXNoYWJsZV90b2tlbikge1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKTtcbiAgICB9XG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fcGVyaXNoYWJsZV90b2tlbik7XG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgbGluazogbGluayxcbiAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgdXNlciksXG4gICAgfTtcblxuICAgIGlmICh0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbCkge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwob3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwob3B0aW9ucykpO1xuICAgIH1cblxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodXNlcik7XG4gIH1cblxuICBhc3luYyB1cGRhdGVQYXNzd29yZCh0b2tlbiwgcGFzc3dvcmQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmF3VXNlciA9IGF3YWl0IHRoaXMuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodG9rZW4pO1xuICAgICAgY29uc3QgdXNlciA9IGF3YWl0IHVwZGF0ZVVzZXJQYXNzd29yZChyYXdVc2VyLCBwYXNzd29yZCwgdGhpcy5jb25maWcpO1xuXG4gICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCB0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gYXdhaXQgYWNjb3VudExvY2tvdXRQb2xpY3kudW5sb2NrQWNjb3VudCgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAvLyBpbiBjYXNlIG9mIFBhcnNlLkVycm9yLCBmYWlsIHdpdGggdGhlIGVycm9yIG1lc3NhZ2Ugb25seVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCh7IGxpbmssIHVzZXIsIGFwcE5hbWUgfSkge1xuICAgIGNvbnN0IHRleHQgPVxuICAgICAgJ0hpLFxcblxcbicgK1xuICAgICAgJ1lvdSBhcmUgYmVpbmcgYXNrZWQgdG8gY29uZmlybSB0aGUgZS1tYWlsIGFkZHJlc3MgJyArXG4gICAgICB1c2VyLmdldCgnZW1haWwnKSArXG4gICAgICAnIHdpdGggJyArXG4gICAgICBhcHBOYW1lICtcbiAgICAgICdcXG5cXG4nICtcbiAgICAgICcnICtcbiAgICAgICdDbGljayBoZXJlIHRvIGNvbmZpcm0gaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQbGVhc2UgdmVyaWZ5IHlvdXIgZS1tYWlsIGZvciAnICsgYXBwTmFtZTtcbiAgICByZXR1cm4geyB0ZXh0LCB0bywgc3ViamVjdCB9O1xuICB9XG5cbiAgZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCh7IGxpbmssIHVzZXIsIGFwcE5hbWUgfSkge1xuICAgIGNvbnN0IHRleHQgPVxuICAgICAgJ0hpLFxcblxcbicgK1xuICAgICAgJ1lvdSByZXF1ZXN0ZWQgdG8gcmVzZXQgeW91ciBwYXNzd29yZCBmb3IgJyArXG4gICAgICBhcHBOYW1lICtcbiAgICAgICh1c2VyLmdldCgndXNlcm5hbWUnKSA/IFwiICh5b3VyIHVzZXJuYW1lIGlzICdcIiArIHVzZXIuZ2V0KCd1c2VybmFtZScpICsgXCInKVwiIDogJycpICtcbiAgICAgICcuXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byByZXNldCBpdDpcXG4nICtcbiAgICAgIGxpbms7XG4gICAgY29uc3QgdG8gPSB1c2VyLmdldCgnZW1haWwnKSB8fCB1c2VyLmdldCgndXNlcm5hbWUnKTtcbiAgICBjb25zdCBzdWJqZWN0ID0gJ1Bhc3N3b3JkIFJlc2V0IGZvciAnICsgYXBwTmFtZTtcbiAgICByZXR1cm4geyB0ZXh0LCB0bywgc3ViamVjdCB9O1xuICB9XG59XG5cbi8vIE1hcmsgdGhpcyBwcml2YXRlXG5mdW5jdGlvbiB1cGRhdGVVc2VyUGFzc3dvcmQodXNlciwgcGFzc3dvcmQsIGNvbmZpZykge1xuICByZXR1cm4gcmVzdFxuICAgIC51cGRhdGUoXG4gICAgICBjb25maWcsXG4gICAgICBBdXRoLm1hc3Rlcihjb25maWcpLFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgIHtcbiAgICAgICAgcGFzc3dvcmQ6IHBhc3N3b3JkLFxuICAgICAgfVxuICAgIClcbiAgICAudGhlbigoKSA9PiB1c2VyKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRFbWFpbExpbmsoZGVzdGluYXRpb24sIHRva2VuLCBjb25maWcpIHtcbiAgdG9rZW4gPSBgdG9rZW49JHt0b2tlbn1gO1xuICBpZiAoY29uZmlnLnBhcnNlRnJhbWVVUkwpIHtcbiAgICBjb25zdCBkZXN0aW5hdGlvbldpdGhvdXRIb3N0ID0gZGVzdGluYXRpb24ucmVwbGFjZShjb25maWcucHVibGljU2VydmVyVVJMLCAnJyk7XG5cbiAgICByZXR1cm4gYCR7Y29uZmlnLnBhcnNlRnJhbWVVUkx9P2xpbms9JHtlbmNvZGVVUklDb21wb25lbnQoZGVzdGluYXRpb25XaXRob3V0SG9zdCl9JiR7dG9rZW59YDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYCR7ZGVzdGluYXRpb259PyR7dG9rZW59YDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2VyQ29udHJvbGxlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsWUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLFlBQUEsR0FBQUQsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFPLGVBQUEsR0FBQUosc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFRLE9BQUEsR0FBQUwsc0JBQUEsQ0FBQUgsT0FBQTtBQUErQixTQUFBRyx1QkFBQU0sQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUUvQixJQUFJRyxTQUFTLEdBQUdaLE9BQU8sQ0FBQyxjQUFjLENBQUM7QUFDdkMsSUFBSWEsSUFBSSxHQUFHYixPQUFPLENBQUMsU0FBUyxDQUFDO0FBRXRCLE1BQU1jLGNBQWMsU0FBU0MsNEJBQW1CLENBQUM7RUFDdERDLFdBQVdBLENBQUNDLE9BQU8sRUFBRUMsS0FBSyxFQUFFQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDeEMsS0FBSyxDQUFDRixPQUFPLEVBQUVDLEtBQUssRUFBRUMsT0FBTyxDQUFDO0VBQ2hDO0VBRUEsSUFBSUMsTUFBTUEsQ0FB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