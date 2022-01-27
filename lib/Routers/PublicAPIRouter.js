"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PublicAPIRouter = void 0;

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var _Config = _interopRequireDefault(require("../Config"));

var _express = _interopRequireDefault(require("express"));

var _path = _interopRequireDefault(require("path"));

var _fs = _interopRequireDefault(require("fs"));

var _querystring = _interopRequireDefault(require("querystring"));

var _node = require("parse/node");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const public_html = _path.default.resolve(__dirname, '../../public_html');

const views = _path.default.resolve(__dirname, '../../views');

class PublicAPIRouter extends _PromiseRouter.default {
  verifyEmail(req) {
    const {
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    const appId = req.params.appId;

    const config = _Config.default.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!token || !username) {
      return this.invalidLink(req);
    }

    const userController = config.userController;
    return userController.verifyEmail(username, token).then(() => {
      const params = _querystring.default.stringify({
        username
      });

      return Promise.resolve({
        status: 302,
        location: `${config.verifyEmailSuccessURL}?${params}`
      });
    }, () => {
      return this.invalidVerificationLink(req);
    });
  }

  resendVerificationEmail(req) {
    const username = req.body.username;
    const appId = req.params.appId;

    const config = _Config.default.get(appId);

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    if (!username) {
      return this.invalidLink(req);
    }

    const userController = config.userController;
    return userController.resendVerificationEmail(username).then(() => {
      return Promise.resolve({
        status: 302,
        location: `${config.linkSendSuccessURL}`
      });
    }, () => {
      return Promise.resolve({
        status: 302,
        location: `${config.linkSendFailURL}`
      });
    });
  }

  changePassword(req) {
    return new Promise((resolve, reject) => {
      const config = _Config.default.get(req.query.id);

      if (!config) {
        this.invalidRequest();
      }

      if (!config.publicServerURL) {
        return resolve({
          status: 404,
          text: 'Not found.'
        });
      } // Should we keep the file in memory or leave like that?


      _fs.default.readFile(_path.default.resolve(views, 'choose_password'), 'utf-8', (err, data) => {
        if (err) {
          return reject(err);
        }

        data = data.replace('PARSE_SERVER_URL', `'${config.publicServerURL}'`);
        resolve({
          text: data
        });
      });
    });
  }

  requestResetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const {
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username || !token) {
      return this.invalidLink(req);
    }

    return config.userController.checkResetTokenValidity(username, token).then(() => {
      const params = _querystring.default.stringify({
        token,
        id: config.applicationId,
        username,
        app: config.appName
      });

      return Promise.resolve({
        status: 302,
        location: `${config.choosePasswordURL}?${params}`
      });
    }, () => {
      return this.invalidLink(req);
    });
  }

  resetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    if (!config.publicServerURL) {
      return this.missingPublicServerURL();
    }

    const {
      username,
      new_password,
      token: rawToken
    } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if ((!username || !token || !new_password) && req.xhr === false) {
      return this.invalidLink(req);
    }

    if (!username) {
      throw new _node.Parse.Error(_node.Parse.Error.USERNAME_MISSING, 'Missing username');
    }

    if (!token) {
      throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, 'Missing token');
    }

    if (!new_password) {
      throw new _node.Parse.Error(_node.Parse.Error.PASSWORD_MISSING, 'Missing password');
    }

    return config.userController.updatePassword(username, token, new_password).then(() => {
      return Promise.resolve({
        success: true
      });
    }, err => {
      return Promise.resolve({
        success: false,
        err
      });
    }).then(result => {
      const params = _querystring.default.stringify({
        username: username,
        token: token,
        id: config.applicationId,
        error: result.err,
        app: config.appName
      });

      if (req.xhr) {
        if (result.success) {
          return Promise.resolve({
            status: 200,
            response: 'Password successfully reset'
          });
        }

        if (result.err) {
          throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, `${result.err}`);
        }
      }

      const encodedUsername = encodeURIComponent(username);
      const location = result.success ? `${config.passwordResetSuccessURL}?username=${encodedUsername}` : `${config.choosePasswordURL}?${params}`;
      return Promise.resolve({
        status: 302,
        location
      });
    });
  }

  invalidLink(req) {
    return Promise.resolve({
      status: 302,
      location: req.config.invalidLinkURL
    });
  }

  invalidVerificationLink(req) {
    const config = req.config;

    if (req.query.username && req.params.appId) {
      const params = _querystring.default.stringify({
        username: req.query.username,
        appId: req.params.appId
      });

      return Promise.resolve({
        status: 302,
        location: `${config.invalidVerificationLinkURL}?${params}`
      });
    } else {
      return this.invalidLink(req);
    }
  }

  missingPublicServerURL() {
    return Promise.resolve({
      text: 'Not found.',
      status: 404
    });
  }

  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  setConfig(req) {
    req.config = _Config.default.get(req.params.appId);
    return Promise.resolve();
  }

  mountRoutes() {
    this.route('GET', '/apps/:appId/verify_email', req => {
      this.setConfig(req);
    }, req => {
      return this.verifyEmail(req);
    });
    this.route('POST', '/apps/:appId/resend_verification_email', req => {
      this.setConfig(req);
    }, req => {
      return this.resendVerificationEmail(req);
    });
    this.route('GET', '/apps/choose_password', req => {
      return this.changePassword(req);
    });
    this.route('POST', '/apps/:appId/request_password_reset', req => {
      this.setConfig(req);
    }, req => {
      return this.resetPassword(req);
    });
    this.route('GET', '/apps/:appId/request_password_reset', req => {
      this.setConfig(req);
    }, req => {
      return this.requestResetPassword(req);
    });
  }

  expressRouter() {
    const router = _express.default.Router();

    router.use('/apps', _express.default.static(public_html));
    router.use('/', super.expressRouter());
    return router;
  }

}

exports.PublicAPIRouter = PublicAPIRouter;
var _default = PublicAPIRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlci5qcyJdLCJuYW1lcyI6WyJwdWJsaWNfaHRtbCIsInBhdGgiLCJyZXNvbHZlIiwiX19kaXJuYW1lIiwidmlld3MiLCJQdWJsaWNBUElSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwidmVyaWZ5RW1haWwiLCJyZXEiLCJ1c2VybmFtZSIsInRva2VuIiwicmF3VG9rZW4iLCJxdWVyeSIsInRvU3RyaW5nIiwiYXBwSWQiLCJwYXJhbXMiLCJjb25maWciLCJDb25maWciLCJnZXQiLCJpbnZhbGlkUmVxdWVzdCIsInB1YmxpY1NlcnZlclVSTCIsIm1pc3NpbmdQdWJsaWNTZXJ2ZXJVUkwiLCJpbnZhbGlkTGluayIsInVzZXJDb250cm9sbGVyIiwidGhlbiIsInFzIiwic3RyaW5naWZ5IiwiUHJvbWlzZSIsInN0YXR1cyIsImxvY2F0aW9uIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImJvZHkiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZEZhaWxVUkwiLCJjaGFuZ2VQYXNzd29yZCIsInJlamVjdCIsImlkIiwidGV4dCIsImZzIiwicmVhZEZpbGUiLCJlcnIiLCJkYXRhIiwicmVwbGFjZSIsInJlcXVlc3RSZXNldFBhc3N3b3JkIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJhcHBsaWNhdGlvbklkIiwiYXBwIiwiYXBwTmFtZSIsImNob29zZVBhc3N3b3JkVVJMIiwicmVzZXRQYXNzd29yZCIsIm5ld19wYXNzd29yZCIsInhociIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJzdWNjZXNzIiwicmVzdWx0IiwiZXJyb3IiLCJyZXNwb25zZSIsImVuY29kZWRVc2VybmFtZSIsImVuY29kZVVSSUNvbXBvbmVudCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwiaW52YWxpZExpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsIm1lc3NhZ2UiLCJzZXRDb25maWciLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiZXhwcmVzc1JvdXRlciIsInJvdXRlciIsImV4cHJlc3MiLCJSb3V0ZXIiLCJ1c2UiLCJzdGF0aWMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUVBLE1BQU1BLFdBQVcsR0FBR0MsY0FBS0MsT0FBTCxDQUFhQyxTQUFiLEVBQXdCLG1CQUF4QixDQUFwQjs7QUFDQSxNQUFNQyxLQUFLLEdBQUdILGNBQUtDLE9BQUwsQ0FBYUMsU0FBYixFQUF3QixhQUF4QixDQUFkOztBQUVPLE1BQU1FLGVBQU4sU0FBOEJDLHNCQUE5QixDQUE0QztBQUNqREMsRUFBQUEsV0FBVyxDQUFDQyxHQUFELEVBQU07QUFDZixVQUFNO0FBQUVDLE1BQUFBLFFBQUY7QUFBWUMsTUFBQUEsS0FBSyxFQUFFQztBQUFuQixRQUFnQ0gsR0FBRyxDQUFDSSxLQUExQztBQUNBLFVBQU1GLEtBQUssR0FBR0MsUUFBUSxJQUFJLE9BQU9BLFFBQVAsS0FBb0IsUUFBaEMsR0FBMkNBLFFBQVEsQ0FBQ0UsUUFBVCxFQUEzQyxHQUFpRUYsUUFBL0U7QUFFQSxVQUFNRyxLQUFLLEdBQUdOLEdBQUcsQ0FBQ08sTUFBSixDQUFXRCxLQUF6Qjs7QUFDQSxVQUFNRSxNQUFNLEdBQUdDLGdCQUFPQyxHQUFQLENBQVdKLEtBQVgsQ0FBZjs7QUFFQSxRQUFJLENBQUNFLE1BQUwsRUFBYTtBQUNYLFdBQUtHLGNBQUw7QUFDRDs7QUFFRCxRQUFJLENBQUNILE1BQU0sQ0FBQ0ksZUFBWixFQUE2QjtBQUMzQixhQUFPLEtBQUtDLHNCQUFMLEVBQVA7QUFDRDs7QUFFRCxRQUFJLENBQUNYLEtBQUQsSUFBVSxDQUFDRCxRQUFmLEVBQXlCO0FBQ3ZCLGFBQU8s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cnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBxcyBmcm9tICdxdWVyeXN0cmluZyc7XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuXG5jb25zdCBwdWJsaWNfaHRtbCA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wdWJsaWNfaHRtbCcpO1xuY29uc3Qgdmlld3MgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vdmlld3MnKTtcblxuZXhwb3J0IGNsYXNzIFB1YmxpY0FQSVJvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICB2ZXJpZnlFbWFpbChyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBjb25zdCBhcHBJZCA9IHJlcS5wYXJhbXMuYXBwSWQ7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChhcHBJZCk7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghY29uZmlnLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgcmV0dXJuIHRoaXMubWlzc2luZ1B1YmxpY1NlcnZlclVSTCgpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4gfHwgIXVzZXJuYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5pbnZhbGlkTGluayhyZXEpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci52ZXJpZnlFbWFpbCh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHFzLnN0cmluZ2lmeSh7IHVzZXJuYW1lIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBzdGF0dXM6IDMwMixcbiAgICAgICAgICBsb2NhdGlvbjogYCR7Y29uZmlnLnZlcmlmeUVtYWlsU3VjY2Vzc1VSTH0/JHtwYXJhbXN9YCxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayhyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpIHtcbiAgICBjb25zdCB1c2VybmFtZSA9IHJlcS5ib2R5LnVzZXJuYW1lO1xuICAgIGNvbnN0IGFwcElkID0gcmVxLnBhcmFtcy5hcHBJZDtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkKTtcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCFjb25maWcucHVibGljU2VydmVyVVJMKSB7XG4gICAgICByZXR1cm4gdGhpcy5taXNzaW5nUHVibGljU2VydmVyVVJMKCk7XG4gICAgfVxuXG4gICAgaWYgKCF1c2VybmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuaW52YWxpZExpbmsocmVxKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgc3RhdHVzOiAzMDIsXG4gICAgICAgICAgbG9jYXRpb246IGAke2NvbmZpZy5saW5rU2VuZFN1Y2Nlc3NVUkx9YCxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBzdGF0dXM6IDMwMixcbiAgICAgICAgICBsb2NhdGlvbjogYCR7Y29uZmlnLmxpbmtTZW5kRmFpbFVSTH1gLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgY2hhbmdlUGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnF1ZXJ5LmlkKTtcblxuICAgICAgaWYgKCFjb25maWcpIHtcbiAgICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoe1xuICAgICAgICAgIHN0YXR1czogNDA0LFxuICAgICAgICAgIHRleHQ6ICdOb3QgZm91bmQuJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICAvLyBTaG91bGQgd2Uga2VlcCB0aGUgZmlsZSBpbiBtZW1vcnkgb3IgbGVhdmUgbGlrZSB0aGF0P1xuICAgICAgZnMucmVhZEZpbGUocGF0aC5yZXNvbHZlKHZpZXdzLCAnY2hvb3NlX3Bhc3N3b3JkJyksICd1dGYtOCcsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBkYXRhID0gZGF0YS5yZXBsYWNlKCdQQVJTRV9TRVJWRVJfVVJMJywgYCcke2NvbmZpZy5wdWJsaWNTZXJ2ZXJVUkx9J2ApO1xuICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICB0ZXh0OiBkYXRhLFxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVxdWVzdFJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCFjb25maWcucHVibGljU2VydmVyVVJMKSB7XG4gICAgICByZXR1cm4gdGhpcy5taXNzaW5nUHVibGljU2VydmVyVVJMKCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VybmFtZSwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEucXVlcnk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCF1c2VybmFtZSB8fCAhdG9rZW4pIHtcbiAgICAgIHJldHVybiB0aGlzLmludmFsaWRMaW5rKHJlcSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZy51c2VyQ29udHJvbGxlci5jaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHFzLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdG9rZW4sXG4gICAgICAgICAgaWQ6IGNvbmZpZy5hcHBsaWNhdGlvbklkLFxuICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgIGFwcDogY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBzdGF0dXM6IDMwMixcbiAgICAgICAgICBsb2NhdGlvbjogYCR7Y29uZmlnLmNob29zZVBhc3N3b3JkVVJMfT8ke3BhcmFtc31gLFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmludmFsaWRMaW5rKHJlcSk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgaWYgKCFjb25maWcucHVibGljU2VydmVyVVJMKSB7XG4gICAgICByZXR1cm4gdGhpcy5taXNzaW5nUHVibGljU2VydmVyVVJMKCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VybmFtZSwgbmV3X3Bhc3N3b3JkLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5ib2R5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICgoIXVzZXJuYW1lIHx8ICF0b2tlbiB8fCAhbmV3X3Bhc3N3b3JkKSAmJiByZXEueGhyID09PSBmYWxzZSkge1xuICAgICAgcmV0dXJuIHRoaXMuaW52YWxpZExpbmsocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ01pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgaWYgKCFuZXdfcGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAnTWlzc2luZyBwYXNzd29yZCcpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXJcbiAgICAgIC51cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIG5ld19wYXNzd29yZClcbiAgICAgIC50aGVuKFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnIsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHFzLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgIHRva2VuOiB0b2tlbixcbiAgICAgICAgICBpZDogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgZXJyb3I6IHJlc3VsdC5lcnIsXG4gICAgICAgICAgYXBwOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlcS54aHIpIHtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgICAgICAgcmVzcG9uc2U6ICdQYXNzd29yZCBzdWNjZXNzZnVsbHkgcmVzZXQnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXN1bHQuZXJyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGAke3Jlc3VsdC5lcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZW5jb2RlZFVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXJuYW1lKTtcbiAgICAgICAgY29uc3QgbG9jYXRpb24gPSByZXN1bHQuc3VjY2Vzc1xuICAgICAgICAgID8gYCR7Y29uZmlnLnBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMfT91c2VybmFtZT0ke2VuY29kZWRVc2VybmFtZX1gXG4gICAgICAgICAgOiBgJHtjb25maWcuY2hvb3NlUGFzc3dvcmRVUkx9PyR7cGFyYW1zfWA7XG5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgc3RhdHVzOiAzMDIsXG4gICAgICAgICAgbG9jYXRpb24sXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBpbnZhbGlkTGluayhyZXEpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHN0YXR1czogMzAyLFxuICAgICAgbG9jYXRpb246IHJlcS5jb25maWcuaW52YWxpZExpbmtVUkwsXG4gICAgfSk7XG4gIH1cblxuICBpbnZhbGlkVmVyaWZpY2F0aW9uTGluayhyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGlmIChyZXEucXVlcnkudXNlcm5hbWUgJiYgcmVxLnBhcmFtcy5hcHBJZCkge1xuICAgICAgY29uc3QgcGFyYW1zID0gcXMuc3RyaW5naWZ5KHtcbiAgICAgICAgdXNlcm5hbWU6IHJlcS5xdWVyeS51c2VybmFtZSxcbiAgICAgICAgYXBwSWQ6IHJlcS5wYXJhbXMuYXBwSWQsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBzdGF0dXM6IDMwMixcbiAgICAgICAgbG9jYXRpb246IGAke2NvbmZpZy5pbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTH0/JHtwYXJhbXN9YCxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5pbnZhbGlkTGluayhyZXEpO1xuICAgIH1cbiAgfVxuXG4gIG1pc3NpbmdQdWJsaWNTZXJ2ZXJVUkwoKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICB0ZXh0OiAnTm90IGZvdW5kLicsXG4gICAgICBzdGF0dXM6IDQwNCxcbiAgICB9KTtcbiAgfVxuXG4gIGludmFsaWRSZXF1ZXN0KCkge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCk7XG4gICAgZXJyb3Iuc3RhdHVzID0gNDAzO1xuICAgIGVycm9yLm1lc3NhZ2UgPSAndW5hdXRob3JpemVkJztcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIHNldENvbmZpZyhyZXEpIHtcbiAgICByZXEuY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2FwcHMvOmFwcElkL3ZlcmlmeV9lbWFpbCcsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnZlcmlmeUVtYWlsKHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICAnL2FwcHMvOmFwcElkL3Jlc2VuZF92ZXJpZmljYXRpb25fZW1haWwnLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2FwcHMvY2hvb3NlX3Bhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNoYW5nZVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgJy9hcHBzLzphcHBJZC9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0JyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2FwcHMvOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXQnLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBleHByZXNzUm91dGVyKCkge1xuICAgIGNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLnVzZSgnL2FwcHMnLCBleHByZXNzLnN0YXRpYyhwdWJsaWNfaHRtbCkpO1xuICAgIHJvdXRlci51c2UoJy8nLCBzdXBlci5leHByZXNzUm91dGVyKCkpO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHVibGljQVBJUm91dGVyO1xuIl19