"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _otpauth = require("otpauth");
var _cryptoUtils = require("../../cryptoUtils");
var _AuthAdapter = _interopRequireDefault(require("./AuthAdapter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class MFAAdapter extends _AuthAdapter.default {
  validateOptions(opts) {
    const validOptions = opts.options;
    if (!Array.isArray(validOptions)) {
      throw 'mfa.options must be an array';
    }
    this.sms = validOptions.includes('SMS');
    this.totp = validOptions.includes('TOTP');
    if (!this.sms && !this.totp) {
      throw 'mfa.options must include SMS or TOTP';
    }
    const digits = opts.digits || 6;
    const period = opts.period || 30;
    if (typeof digits !== 'number') {
      throw 'mfa.digits must be a number';
    }
    if (typeof period !== 'number') {
      throw 'mfa.period must be a number';
    }
    if (digits < 4 || digits > 10) {
      throw 'mfa.digits must be between 4 and 10';
    }
    if (period < 10) {
      throw 'mfa.period must be greater than 10';
    }
    const sendSMS = opts.sendSMS;
    if (this.sms && typeof sendSMS !== 'function') {
      throw 'mfa.sendSMS callback must be defined when using SMS OTPs';
    }
    this.smsCallback = sendSMS;
    this.digits = digits;
    this.period = period;
    this.algorithm = opts.algorithm || 'SHA1';
  }
  validateSetUp(mfaData) {
    if (mfaData.mobile && this.sms) {
      return this.setupMobileOTP(mfaData.mobile);
    }
    if (this.totp) {
      return this.setupTOTP(mfaData);
    }
    throw 'Invalid MFA data';
  }
  async validateLogin(loginData, _, req) {
    const saveResponse = {
      doNotSave: true
    };
    const token = loginData.token;
    const auth = req.original.get('authData') || {};
    const {
      secret,
      recovery,
      mobile,
      token: saved,
      expiry
    } = auth.mfa || {};
    if (this.sms && mobile) {
      if (token === 'request') {
        const {
          token: sendToken,
          expiry
        } = await this.sendSMS(mobile);
        auth.mfa.token = sendToken;
        auth.mfa.expiry = expiry;
        req.object.set('authData', auth);
        await req.object.save(null, {
          useMasterKey: true
        });
        throw 'Please enter the token';
      }
      if (!saved || token !== saved) {
        throw 'Invalid MFA token 1';
      }
      if (new Date() > expiry) {
        throw 'Invalid MFA token 2';
      }
      delete auth.mfa.token;
      delete auth.mfa.expiry;
      return {
        save: auth.mfa
      };
    }
    if (this.totp) {
      if (typeof token !== 'string') {
        throw 'Invalid MFA token';
      }
      if (!secret) {
        return saveResponse;
      }
      if (recovery[0] === token || recovery[1] === token) {
        return saveResponse;
      }
      const totp = new _otpauth.TOTP({
        algorithm: this.algorithm,
        digits: this.digits,
        period: this.period,
        secret: _otpauth.Secret.fromBase32(secret)
      });
      const valid = totp.validate({
        token
      });
      if (valid === null) {
        throw 'Invalid MFA token';
      }
    }
    return saveResponse;
  }
  async validateUpdate(authData, _, req) {
    if (req.master) {
      return;
    }
    if (authData.mobile && this.sms) {
      if (!authData.token) {
        throw 'MFA is already set up on this account';
      }
      return this.confirmSMSOTP(authData, req.original.get('authData')?.mfa || {});
    }
    if (this.totp) {
      await this.validateLogin({
        token: authData.old
      }, null, req);
      return this.validateSetUp(authData);
    }
    throw 'Invalid MFA data';
  }
  afterFind(req, authData) {
    if (req.master) {
      return;
    }
    if (this.totp && authData.secret) {
      return {
        status: 'enabled'
      };
    }
    if (this.sms && authData.mobile) {
      return {
        status: 'enabled'
      };
    }
    return {
      status: 'disabled'
    };
  }
  policy(req, auth) {
    if (this.sms && auth?.pending && Object.keys(auth).length === 1) {
      return 'default';
    }
    return 'additional';
  }
  async setupMobileOTP(mobile) {
    const {
      token,
      expiry
    } = await this.sendSMS(mobile);
    return {
      save: {
        pending: {
          [mobile]: {
            token,
            expiry
          }
        }
      }
    };
  }
  async sendSMS(mobile) {
    if (!/^[+]*[(]{0,1}[0-9]{1,3}[)]{0,1}[-\s\./0-9]*$/g.test(mobile)) {
      throw 'Invalid mobile number.';
    }
    let token = '';
    while (token.length < this.digits) {
      token += (0, _cryptoUtils.randomString)(10).replace(/\D/g, '');
    }
    token = token.substring(0, this.digits);
    await Promise.resolve(this.smsCallback(token, mobile));
    const expiry = new Date(new Date().getTime() + this.period * 1000);
    return {
      token,
      expiry
    };
  }
  async confirmSMSOTP(inputData, authData) {
    const {
      mobile,
      token
    } = inputData;
    if (!authData.pending?.[mobile]) {
      throw 'This number is not pending';
    }
    const pendingData = authData.pending[mobile];
    if (token !== pendingData.token) {
      throw 'Invalid MFA token';
    }
    if (new Date() > pendingData.expiry) {
      throw 'Invalid MFA token';
    }
    delete authData.pending[mobile];
    authData.mobile = mobile;
    return {
      save: authData
    };
  }
  setupTOTP(mfaData) {
    const {
      secret,
      token
    } = mfaData;
    if (!secret || !token || secret.length < 20) {
      throw 'Invalid MFA data';
    }
    const totp = new _otpauth.TOTP({
      algorithm: this.algorithm,
      digits: this.digits,
      period: this.period,
      secret: _otpauth.Secret.fromBase32(secret)
    });
    const valid = totp.validate({
      token
    });
    if (valid === null) {
      throw 'Invalid MFA token';
    }
    const recovery = [(0, _cryptoUtils.randomString)(30), (0, _cryptoUtils.randomString)(30)];
    return {
      response: {
        recovery: recovery.join(', ')
      },
      save: {
        secret,
        recovery
      }
    };
  }
}
var _default = exports.default = new MFAAdapter();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfb3RwYXV0aCIsInJlcXVpcmUiLCJfY3J5cHRvVXRpbHMiLCJfQXV0aEFkYXB0ZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiTUZBQWRhcHRlciIsIkF1dGhBZGFwdGVyIiwidmFsaWRhdGVPcHRpb25zIiwib3B0cyIsInZhbGlkT3B0aW9ucyIsIm9wdGlvbnMiLCJBcnJheSIsImlzQXJyYXkiLCJzbXMiLCJpbmNsdWRlcyIsInRvdHAiLCJkaWdpdHMiLCJwZXJpb2QiLCJzZW5kU01TIiwic21zQ2FsbGJhY2siLCJhbGdvcml0aG0iLCJ2YWxpZGF0ZVNldFVwIiwibWZhRGF0YSIsIm1vYmlsZSIsInNldHVwTW9iaWxlT1RQIiwic2V0dXBUT1RQIiwidmFsaWRhdGVMb2dpbiIsImxvZ2luRGF0YSIsIl8iLCJyZXEiLCJzYXZlUmVzcG9uc2UiLCJkb05vdFNhdmUiLCJ0b2tlbiIsImF1dGgiLCJvcmlnaW5hbCIsImdldCIsInNlY3JldCIsInJlY292ZXJ5Iiwic2F2ZWQiLCJleHBpcnkiLCJtZmEiLCJzZW5kVG9rZW4iLCJvYmplY3QiLCJzZXQiLCJzYXZlIiwidXNlTWFzdGVyS2V5IiwiRGF0ZSIsIlRPVFAiLCJTZWNyZXQiLCJmcm9tQmFzZTMyIiwidmFsaWQiLCJ2YWxpZGF0ZSIsInZhbGlkYXRlVXBkYXRlIiwiYXV0aERhdGEiLCJtYXN0ZXIiLCJjb25maXJtU01TT1RQIiwib2xkIiwiYWZ0ZXJGaW5kIiwic3RhdHVzIiwicG9saWN5IiwicGVuZGluZyIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJ0ZXN0IiwicmFuZG9tU3RyaW5nIiwicmVwbGFjZSIsInN1YnN0cmluZyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZ2V0VGltZSIsImlucHV0RGF0YSIsInBlbmRpbmdEYXRhIiwicmVzcG9uc2UiLCJqb2luIiwiX2RlZmF1bHQiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgvbWZhLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRPVFAsIFNlY3JldCB9IGZyb20gJ290cGF1dGgnO1xuaW1wb3J0IHsgcmFuZG9tU3RyaW5nIH0gZnJvbSAnLi4vLi4vY3J5cHRvVXRpbHMnO1xuaW1wb3J0IEF1dGhBZGFwdGVyIGZyb20gJy4vQXV0aEFkYXB0ZXInO1xuY2xhc3MgTUZBQWRhcHRlciBleHRlbmRzIEF1dGhBZGFwdGVyIHtcbiAgdmFsaWRhdGVPcHRpb25zKG9wdHMpIHtcbiAgICBjb25zdCB2YWxpZE9wdGlvbnMgPSBvcHRzLm9wdGlvbnM7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHZhbGlkT3B0aW9ucykpIHtcbiAgICAgIHRocm93ICdtZmEub3B0aW9ucyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICB9XG4gICAgdGhpcy5zbXMgPSB2YWxpZE9wdGlvbnMuaW5jbHVkZXMoJ1NNUycpO1xuICAgIHRoaXMudG90cCA9IHZhbGlkT3B0aW9ucy5pbmNsdWRlcygnVE9UUCcpO1xuICAgIGlmICghdGhpcy5zbXMgJiYgIXRoaXMudG90cCkge1xuICAgICAgdGhyb3cgJ21mYS5vcHRpb25zIG11c3QgaW5jbHVkZSBTTVMgb3IgVE9UUCc7XG4gICAgfVxuICAgIGNvbnN0IGRpZ2l0cyA9IG9wdHMuZGlnaXRzIHx8IDY7XG4gICAgY29uc3QgcGVyaW9kID0gb3B0cy5wZXJpb2QgfHwgMzA7XG4gICAgaWYgKHR5cGVvZiBkaWdpdHMgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyAnbWZhLmRpZ2l0cyBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwZXJpb2QgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyAnbWZhLnBlcmlvZCBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKGRpZ2l0cyA8IDQgfHwgZGlnaXRzID4gMTApIHtcbiAgICAgIHRocm93ICdtZmEuZGlnaXRzIG11c3QgYmUgYmV0d2VlbiA0IGFuZCAxMCc7XG4gICAgfVxuICAgIGlmIChwZXJpb2QgPCAxMCkge1xuICAgICAgdGhyb3cgJ21mYS5wZXJpb2QgbXVzdCBiZSBncmVhdGVyIHRoYW4gMTAnO1xuICAgIH1cbiAgICBjb25zdCBzZW5kU01TID0gb3B0cy5zZW5kU01TO1xuICAgIGlmICh0aGlzLnNtcyAmJiB0eXBlb2Ygc2VuZFNNUyAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ21mYS5zZW5kU01TIGNhbGxiYWNrIG11c3QgYmUgZGVmaW5lZCB3aGVuIHVzaW5nIFNNUyBPVFBzJztcbiAgICB9XG4gICAgdGhpcy5zbXNDYWxsYmFjayA9IHNlbmRTTVM7XG4gICAgdGhpcy5kaWdpdHMgPSBkaWdpdHM7XG4gICAgdGhpcy5wZXJpb2QgPSBwZXJpb2Q7XG4gICAgdGhpcy5hbGdvcml0aG0gPSBvcHRzLmFsZ29yaXRobSB8fCAnU0hBMSc7XG4gIH1cbiAgdmFsaWRhdGVTZXRVcChtZmFEYXRhKSB7XG4gICAgaWYgKG1mYURhdGEubW9iaWxlICYmIHRoaXMuc21zKSB7XG4gICAgICByZXR1cm4gdGhpcy5zZXR1cE1vYmlsZU9UUChtZmFEYXRhLm1vYmlsZSk7XG4gICAgfVxuICAgIGlmICh0aGlzLnRvdHApIHtcbiAgICAgIHJldHVybiB0aGlzLnNldHVwVE9UUChtZmFEYXRhKTtcbiAgICB9XG4gICAgdGhyb3cgJ0ludmFsaWQgTUZBIGRhdGEnO1xuICB9XG4gIGFzeW5jIHZhbGlkYXRlTG9naW4obG9naW5EYXRhLCBfLCByZXEpIHtcbiAgICBjb25zdCBzYXZlUmVzcG9uc2UgPSB7XG4gICAgICBkb05vdFNhdmU6IHRydWUsXG4gICAgfTtcbiAgICBjb25zdCB0b2tlbiA9IGxvZ2luRGF0YS50b2tlbjtcbiAgICBjb25zdCBhdXRoID0gcmVxLm9yaWdpbmFsLmdldCgnYXV0aERhdGEnKSB8fCB7fTtcbiAgICBjb25zdCB7IHNlY3JldCwgcmVjb3ZlcnksIG1vYmlsZSwgdG9rZW46IHNhdmVkLCBleHBpcnkgfSA9IGF1dGgubWZhIHx8IHt9O1xuICAgIGlmICh0aGlzLnNtcyAmJiBtb2JpbGUpIHtcbiAgICAgIGlmICh0b2tlbiA9PT0gJ3JlcXVlc3QnKSB7XG4gICAgICAgIGNvbnN0IHsgdG9rZW46IHNlbmRUb2tlbiwgZXhwaXJ5IH0gPSBhd2FpdCB0aGlzLnNlbmRTTVMobW9iaWxlKTtcbiAgICAgICAgYXV0aC5tZmEudG9rZW4gPSBzZW5kVG9rZW47XG4gICAgICAgIGF1dGgubWZhLmV4cGlyeSA9IGV4cGlyeTtcbiAgICAgICAgcmVxLm9iamVjdC5zZXQoJ2F1dGhEYXRhJywgYXV0aCk7XG4gICAgICAgIGF3YWl0IHJlcS5vYmplY3Quc2F2ZShudWxsLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBlbnRlciB0aGUgdG9rZW4nO1xuICAgICAgfVxuICAgICAgaWYgKCFzYXZlZCB8fCB0b2tlbiAhPT0gc2F2ZWQpIHtcbiAgICAgICAgdGhyb3cgJ0ludmFsaWQgTUZBIHRva2VuIDEnO1xuICAgICAgfVxuICAgICAgaWYgKG5ldyBEYXRlKCkgPiBleHBpcnkpIHtcbiAgICAgICAgdGhyb3cgJ0ludmFsaWQgTUZBIHRva2VuIDInO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGF1dGgubWZhLnRva2VuO1xuICAgICAgZGVsZXRlIGF1dGgubWZhLmV4cGlyeTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNhdmU6IGF1dGgubWZhLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHRoaXMudG90cCkge1xuICAgICAgaWYgKHR5cGVvZiB0b2tlbiAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgJ0ludmFsaWQgTUZBIHRva2VuJztcbiAgICAgIH1cbiAgICAgIGlmICghc2VjcmV0KSB7XG4gICAgICAgIHJldHVybiBzYXZlUmVzcG9uc2U7XG4gICAgICB9XG4gICAgICBpZiAocmVjb3ZlcnlbMF0gPT09IHRva2VuIHx8IHJlY292ZXJ5WzFdID09PSB0b2tlbikge1xuICAgICAgICByZXR1cm4gc2F2ZVJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgY29uc3QgdG90cCA9IG5ldyBUT1RQKHtcbiAgICAgICAgYWxnb3JpdGhtOiB0aGlzLmFsZ29yaXRobSxcbiAgICAgICAgZGlnaXRzOiB0aGlzLmRpZ2l0cyxcbiAgICAgICAgcGVyaW9kOiB0aGlzLnBlcmlvZCxcbiAgICAgICAgc2VjcmV0OiBTZWNyZXQuZnJvbUJhc2UzMihzZWNyZXQpLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB2YWxpZCA9IHRvdHAudmFsaWRhdGUoe1xuICAgICAgICB0b2tlbixcbiAgICAgIH0pO1xuICAgICAgaWYgKHZhbGlkID09PSBudWxsKSB7XG4gICAgICAgIHRocm93ICdJbnZhbGlkIE1GQSB0b2tlbic7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzYXZlUmVzcG9uc2U7XG4gIH1cbiAgYXN5bmMgdmFsaWRhdGVVcGRhdGUoYXV0aERhdGEsIF8sIHJlcSkge1xuICAgIGlmIChyZXEubWFzdGVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChhdXRoRGF0YS5tb2JpbGUgJiYgdGhpcy5zbXMpIHtcbiAgICAgIGlmICghYXV0aERhdGEudG9rZW4pIHtcbiAgICAgICAgdGhyb3cgJ01GQSBpcyBhbHJlYWR5IHNldCB1cCBvbiB0aGlzIGFjY291bnQnO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlybVNNU09UUChhdXRoRGF0YSwgcmVxLm9yaWdpbmFsLmdldCgnYXV0aERhdGEnKT8ubWZhIHx8IHt9KTtcbiAgICB9XG4gICAgaWYgKHRoaXMudG90cCkge1xuICAgICAgYXdhaXQgdGhpcy52YWxpZGF0ZUxvZ2luKHsgdG9rZW46IGF1dGhEYXRhLm9sZCB9LCBudWxsLCByZXEpO1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTZXRVcChhdXRoRGF0YSk7XG4gICAgfVxuICAgIHRocm93ICdJbnZhbGlkIE1GQSBkYXRhJztcbiAgfVxuICBhZnRlckZpbmQocmVxLCBhdXRoRGF0YSkge1xuICAgIGlmIChyZXEubWFzdGVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0aGlzLnRvdHAgJiYgYXV0aERhdGEuc2VjcmV0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXM6ICdlbmFibGVkJyxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh0aGlzLnNtcyAmJiBhdXRoRGF0YS5tb2JpbGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2VuYWJsZWQnLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ2Rpc2FibGVkJyxcbiAgICB9O1xuICB9XG5cbiAgcG9saWN5KHJlcSwgYXV0aCkge1xuICAgIGlmICh0aGlzLnNtcyAmJiBhdXRoPy5wZW5kaW5nICYmIE9iamVjdC5rZXlzKGF1dGgpLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcmV0dXJuICdkZWZhdWx0JztcbiAgICB9XG4gICAgcmV0dXJuICdhZGRpdGlvbmFsJztcbiAgfVxuXG4gIGFzeW5jIHNldHVwTW9iaWxlT1RQKG1vYmlsZSkge1xuICAgIGNvbnN0IHsgdG9rZW4sIGV4cGlyeSB9ID0gYXdhaXQgdGhpcy5zZW5kU01TKG1vYmlsZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHNhdmU6IHtcbiAgICAgICAgcGVuZGluZzoge1xuICAgICAgICAgIFttb2JpbGVdOiB7XG4gICAgICAgICAgICB0b2tlbixcbiAgICAgICAgICAgIGV4cGlyeSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgc2VuZFNNUyhtb2JpbGUpIHtcbiAgICBpZiAoIS9eWytdKlsoXXswLDF9WzAtOV17MSwzfVspXXswLDF9Wy1cXHNcXC4vMC05XSokL2cudGVzdChtb2JpbGUpKSB7XG4gICAgICB0aHJvdyAnSW52YWxpZCBtb2JpbGUgbnVtYmVyLic7XG4gICAgfVxuICAgIGxldCB0b2tlbiA9ICcnO1xuICAgIHdoaWxlICh0b2tlbi5sZW5ndGggPCB0aGlzLmRpZ2l0cykge1xuICAgICAgdG9rZW4gKz0gcmFuZG9tU3RyaW5nKDEwKS5yZXBsYWNlKC9cXEQvZywgJycpO1xuICAgIH1cbiAgICB0b2tlbiA9IHRva2VuLnN1YnN0cmluZygwLCB0aGlzLmRpZ2l0cyk7XG4gICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc21zQ2FsbGJhY2sodG9rZW4sIG1vYmlsZSkpO1xuICAgIGNvbnN0IGV4cGlyeSA9IG5ldyBEYXRlKG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgdGhpcy5wZXJpb2QgKiAxMDAwKTtcbiAgICByZXR1cm4geyB0b2tlbiwgZXhwaXJ5IH07XG4gIH1cblxuICBhc3luYyBjb25maXJtU01TT1RQKGlucHV0RGF0YSwgYXV0aERhdGEpIHtcbiAgICBjb25zdCB7IG1vYmlsZSwgdG9rZW4gfSA9IGlucHV0RGF0YTtcbiAgICBpZiAoIWF1dGhEYXRhLnBlbmRpbmc/Llttb2JpbGVdKSB7XG4gICAgICB0aHJvdyAnVGhpcyBudW1iZXIgaXMgbm90IHBlbmRpbmcnO1xuICAgIH1cbiAgICBjb25zdCBwZW5kaW5nRGF0YSA9IGF1dGhEYXRhLnBlbmRpbmdbbW9iaWxlXTtcbiAgICBpZiAodG9rZW4gIT09IHBlbmRpbmdEYXRhLnRva2VuKSB7XG4gICAgICB0aHJvdyAnSW52YWxpZCBNRkEgdG9rZW4nO1xuICAgIH1cbiAgICBpZiAobmV3IERhdGUoKSA+IHBlbmRpbmdEYXRhLmV4cGlyeSkge1xuICAgICAgdGhyb3cgJ0ludmFsaWQgTUZBIHRva2VuJztcbiAgICB9XG4gICAgZGVsZXRlIGF1dGhEYXRhLnBlbmRpbmdbbW9iaWxlXTtcbiAgICBhdXRoRGF0YS5tb2JpbGUgPSBtb2JpbGU7XG4gICAgcmV0dXJuIHtcbiAgICAgIHNhdmU6IGF1dGhEYXRhLFxuICAgIH07XG4gIH1cblxuICBzZXR1cFRPVFAobWZhRGF0YSkge1xuICAgIGNvbnN0IHsgc2VjcmV0LCB0b2tlbiB9ID0gbWZhRGF0YTtcbiAgICBpZiAoIXNlY3JldCB8fCAhdG9rZW4gfHwgc2VjcmV0Lmxlbmd0aCA8IDIwKSB7XG4gICAgICB0aHJvdyAnSW52YWxpZCBNRkEgZGF0YSc7XG4gICAgfVxuICAgIGNvbnN0IHRvdHAgPSBuZXcgVE9UUCh7XG4gICAgICBhbGdvcml0aG06IHRoaXMuYWxnb3JpdGhtLFxuICAgICAgZGlnaXRzOiB0aGlzLmRpZ2l0cyxcbiAgICAgIHBlcmlvZDogdGhpcy5wZXJpb2QsXG4gICAgICBzZWNyZXQ6IFNlY3JldC5mcm9tQmFzZTMyKHNlY3JldCksXG4gICAgfSk7XG4gICAgY29uc3QgdmFsaWQgPSB0b3RwLnZhbGlkYXRlKHtcbiAgICAgIHRva2VuLFxuICAgIH0pO1xuICAgIGlmICh2YWxpZCA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgJ0ludmFsaWQgTUZBIHRva2VuJztcbiAgICB9XG4gICAgY29uc3QgcmVjb3ZlcnkgPSBbcmFuZG9tU3RyaW5nKDMwKSwgcmFuZG9tU3RyaW5nKDMwKV07XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3BvbnNlOiB7IHJlY292ZXJ5OiByZWNvdmVyeS5qb2luKCcsICcpIH0sXG4gICAgICBzYXZlOiB7IHNlY3JldCwgcmVjb3ZlcnkgfSxcbiAgICB9O1xuICB9XG59XG5leHBvcnQgZGVmYXVsdCBuZXcgTUZBQWRhcHRlcigpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxZQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFBd0MsU0FBQUcsdUJBQUFDLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFDeEMsTUFBTUcsVUFBVSxTQUFTQyxvQkFBVyxDQUFDO0VBQ25DQyxlQUFlQSxDQUFDQyxJQUFJLEVBQUU7SUFDcEIsTUFBTUMsWUFBWSxHQUFHRCxJQUFJLENB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