"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IAPValidationRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const request = require('../request');
const rest = require('../rest');
// TODO move validation logic in IAPValidationController
const IAP_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const IAP_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APP_STORE_ERRORS = {
  21000: 'The App Store could not read the JSON object you provided.',
  21002: 'The data in the receipt-data property was malformed or missing.',
  21003: 'The receipt could not be authenticated.',
  21004: 'The shared secret you provided does not match the shared secret on file for your account.',
  21005: 'The receipt server is not currently available.',
  21006: 'This receipt is valid but the subscription has expired.',
  21007: 'This receipt is from the test environment, but it was sent to the production environment for verification. Send it to the test environment instead.',
  21008: 'This receipt is from the production environment, but it was sent to the test environment for verification. Send it to the production environment instead.'
};
function appStoreError(status) {
  status = parseInt(status);
  var errorString = APP_STORE_ERRORS[status] || 'unknown error.';
  return {
    status: status,
    error: errorString
  };
}
function validateWithAppStore(url, receipt) {
  return request({
    url: url,
    method: 'POST',
    body: {
      'receipt-data': receipt
    },
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(httpResponse => {
    const body = httpResponse.data;
    if (body && body.status === 0) {
      // No need to pass anything, status is OK
      return;
    }
    // receipt is from test and should go to test
    throw body;
  });
}
function getFileForProductIdentifier(productIdentifier, req) {
  return rest.find(req.config, req.auth, '_Product', {
    productIdentifier: productIdentifier
  }, undefined, req.info.clientSDK, req.info.context).then(function (result) {
    const products = result.results;
    if (!products || products.length != 1) {
      // Error not found or too many
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
    }
    var download = products[0].download;
    return Promise.resolve({
      response: download
    });
  });
}
class IAPValidationRouter extends _PromiseRouter.default {
  handleRequest(req) {
    let receipt = req.body.receipt;
    const productIdentifier = req.body.productIdentifier;
    if (!receipt || !productIdentifier) {
      // TODO: Error, malformed request
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'missing receipt or productIdentifier');
    }

    // Transform the object if there
    // otherwise assume it's in Base64 already
    if (typeof receipt == 'object') {
      if (receipt['__type'] == 'Bytes') {
        receipt = receipt.base64;
      }
    }
    if (process.env.TESTING == '1' && req.body.bypassAppStoreValidation) {
      return getFileForProductIdentifier(productIdentifier, req);
    }
    function successCallback() {
      return getFileForProductIdentifier(productIdentifier, req);
    }
    function errorCallback(error) {
      return Promise.resolve({
        response: appStoreError(error.status)
      });
    }
    return validateWithAppStore(IAP_PRODUCTION_URL, receipt).then(() => {
      return successCallback();
    }, error => {
      if (error.status == 21007) {
        return validateWithAppStore(IAP_SANDBOX_URL, receipt).then(() => {
          return successCallback();
        }, error => {
          return errorCallback(error);
        });
      }
      return errorCallback(error);
    });
  }
  mountRoutes() {
    this.route('POST', '/validate_purchase', this.handleRequest);
  }
}
exports.IAPValidationRouter = IAPValidationRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX25vZGUiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJlcXVlc3QiLCJyZXN0IiwiSUFQX1NBTkRCT1hfVVJMIiwiSUFQX1BST0RVQ1RJT05fVVJMIiwiQVBQX1NUT1JFX0VSUk9SUyIsImFwcFN0b3JlRXJyb3IiLCJzdGF0dXMiLCJwYXJzZUludCIsImVycm9yU3RyaW5nIiwiZXJyb3IiLCJ2YWxpZGF0ZVdpdGhBcHBTdG9yZSIsInVybCIsInJlY2VpcHQiLCJtZXRob2QiLCJib2R5IiwiaGVhZGVycyIsInRoZW4iLCJodHRwUmVzcG9uc2UiLCJkYXRhIiwiZ2V0RmlsZUZvclByb2R1Y3RJZGVudGlmaWVyIiwicHJvZHVjdElkZW50aWZpZXIiLCJyZXEiLCJmaW5kIiwiY29uZmlnIiwiYXV0aCIsInVuZGVmaW5lZCIsImluZm8iLCJjbGllbnRTREsiLCJjb250ZXh0IiwicmVzdWx0IiwicHJvZHVjdHMiLCJyZXN1bHRzIiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJkb3dubG9hZCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVzcG9uc2UiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsImhhbmRsZVJlcXVlc3QiLCJJTlZBTElEX0pTT04iLCJiYXNlNjQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsImJ5cGFzc0FwcFN0b3JlVmFsaWRhdGlvbiIsInN1Y2Nlc3NDYWxsYmFjayIsImVycm9yQ2FsbGJhY2siLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5jb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi4vcmVxdWVzdCcpO1xuY29uc3QgcmVzdCA9IHJlcXVpcmUoJy4uL3Jlc3QnKTtcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuLy8gVE9ETyBtb3ZlIHZhbGlkYXRpb24gbG9naWMgaW4gSUFQVmFsaWRhdGlvbkNvbnRyb2xsZXJcbmNvbnN0IElBUF9TQU5EQk9YX1VSTCA9ICdodHRwczovL3NhbmRib3guaXR1bmVzLmFwcGxlLmNvbS92ZXJpZnlSZWNlaXB0JztcbmNvbnN0IElBUF9QUk9EVUNUSU9OX1VSTCA9ICdodHRwczovL2J1eS5pdHVuZXMuYXBwbGUuY29tL3ZlcmlmeVJlY2VpcHQnO1xuXG5jb25zdCBBUFBfU1RPUkVfRVJST1JTID0ge1xuICAyMTAwMDogJ1RoZSBBcHAgU3RvcmUgY291bGQgbm90IHJlYWQgdGhlIEpTT04gb2JqZWN0IHlvdSBwcm92aWRlZC4nLFxuICAyMTAwMjogJ1RoZSBkYXRhIGluIHRoZSByZWNlaXB0LWRhdGEgcHJvcGVydHkgd2FzIG1hbGZvcm1lZCBvciBtaXNzaW5nLicsXG4gIDIxMDAzOiAnVGhlIHJlY2VpcHQgY291bGQgbm90IGJlIGF1dGhlbnRpY2F0ZWQuJyxcbiAgMjEwMDQ6ICdUaGUgc2hhcmVkIHNlY3JldCB5b3UgcHJvdmlkZWQgZG9lcyBub3QgbWF0Y2ggdGhlIHNoYXJlZCBzZWNyZXQgb24gZmlsZSBmb3IgeW91ciBhY2NvdW50LicsXG4gIDIxMDA1OiAnVGhlIHJlY2VpcHQgc2VydmVyIGlzIG5vdCBjdXJyZW50bHkgYXZhaWxhYmxlLicsXG4gIDIxMDA2OiAnVGhpcyByZWNlaXB0IGlzIHZhbGlkIGJ1dCB0aGUgc3Vic2NyaXB0aW9uIGhhcyBleHBpcmVkLicsXG4gIDIxMDA3OiAnVGhpcyByZWNlaXB0IGlzIGZyb20gdGhlIHRlc3QgZW52aXJvbm1lbnQsIGJ1dCBpdCB3YXMgc2VudCB0byB0aGUgcHJvZHVjdGlvbiBlbnZpcm9ubWVudCBmb3IgdmVyaWZpY2F0aW9uLiBTZW5kIGl0IHRvIHRoZSB0ZXN0IGVudmlyb25tZW50IGluc3RlYWQuJyxcbiAgMjEwMDg6ICdUaGlzIHJlY2VpcHQgaXMgZnJvbSB0aGUgcHJvZHVjdGlvbiBlbnZpcm9ubWVudCwgYnV0IGl0IHdhcyBzZW50IHRvIHRoZSB0ZXN0IGVudmlyb25tZW50IGZvciB2ZXJpZmljYXRpb24uIFNlbmQgaXQgdG8gdGhlIHByb2R1Y3Rpb24gZW52aXJvbm1lbnQgaW5zdGVhZC4nLFxufTtcblxuZnVuY3Rpb24gYXBwU3RvcmVFcnJvcihzdGF0dXMpIHtcbiAgc3RhdHVzID0gcGFyc2VJbnQoc3RhdHVzKTtcbiAgdmFyIGVycm9yU3RyaW5nID0gQVBQX1NUT1JFX0VSUk9SU1tzdGF0dXNdIHx8ICd1bmtub3duIGVycm9yLic7XG4gIHJldHVybiB7IHN0YXR1czogc3RhdHVzLCBlcnJvcjogZXJyb3JTdHJpbmcgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVXaXRoQXBwU3RvcmUodXJsLCByZWNlaXB0KSB7XG4gIHJldHVybiByZXF1ZXN0KHtcbiAgICB1cmw6IHVybCxcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBib2R5OiB7ICdyZWNlaXB0LWRhdGEnOiByZWNlaXB0IH0sXG4gICAgaGVhZGVyczoge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICB9LFxuICB9KS50aGVuKGh0dHBSZXNwb25zZSA9PiB7XG4gICAgY29uc3QgYm9keSA9IGh0dHBSZXNwb25zZS5kYXRhO1xuICAgIGlmIChib2R5ICYmIGJvZHkuc3RhdHVzID09PSAwKSB7XG4gICAgICAvLyBObyBuZWVkIHRvIHBhc3MgYW55dGhpbmcsIHN0YXR1cyBpcyBPS1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyByZWNlaXB0IGlzIGZyb20gdGVzdCBhbmQgc2hvdWxkIGdvIHRvIHRlc3RcbiAgICB0aHJvdyBib2R5O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0RmlsZUZvclByb2R1Y3RJZGVudGlmaWVyKHByb2R1Y3RJZGVudGlmaWVyLCByZXEpIHtcbiAgcmV0dXJuIHJlc3RcbiAgICAuZmluZChcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICByZXEuYXV0aCxcbiAgICAgICdfUHJvZHVjdCcsXG4gICAgICB7IHByb2R1Y3RJZGVudGlmaWVyOiBwcm9kdWN0SWRlbnRpZmllciB9LFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgIClcbiAgICAudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBjb25zdCBwcm9kdWN0cyA9IHJlc3VsdC5yZXN1bHRzO1xuICAgICAgaWYgKCFwcm9kdWN0cyB8fCBwcm9kdWN0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAvLyBFcnJvciBub3QgZm91bmQgb3IgdG9vIG1hbnlcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgfVxuXG4gICAgICB2YXIgZG93bmxvYWQgPSBwcm9kdWN0c1swXS5kb3dubG9hZDtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyByZXNwb25zZTogZG93bmxvYWQgfSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBjbGFzcyBJQVBWYWxpZGF0aW9uUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIGhhbmRsZVJlcXVlc3QocmVxKSB7XG4gICAgbGV0IHJlY2VpcHQgPSByZXEuYm9keS5yZWNlaXB0O1xuICAgIGNvbnN0IHByb2R1Y3RJZGVudGlmaWVyID0gcmVxLmJvZHkucHJvZHVjdElkZW50aWZpZXI7XG5cbiAgICBpZiAoIXJlY2VpcHQgfHwgIXByb2R1Y3RJZGVudGlmaWVyKSB7XG4gICAgICAvLyBUT0RPOiBFcnJvciwgbWFsZm9ybWVkIHJlcXVlc3RcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdtaXNzaW5nIHJlY2VpcHQgb3IgcHJvZHVjdElkZW50aWZpZXInKTtcbiAgICB9XG5cbiAgICAvLyBUcmFuc2Zvcm0gdGhlIG9iamVjdCBpZiB0aGVyZVxuICAgIC8vIG90aGVyd2lzZSBhc3N1bWUgaXQncyBpbiBCYXNlNjQgYWxyZWFkeVxuICAgIGlmICh0eXBlb2YgcmVjZWlwdCA9PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKHJlY2VpcHRbJ19fdHlwZSddID09ICdCeXRlcycpIHtcbiAgICAgICAgcmVjZWlwdCA9IHJlY2VpcHQuYmFzZTY0O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwcm9jZXNzLmVudi5URVNUSU5HID09ICcxJyAmJiByZXEuYm9keS5ieXBhc3NBcHBTdG9yZVZhbGlkYXRpb24pIHtcbiAgICAgIHJldHVybiBnZXRGaWxlRm9yUHJvZHVjdElkZW50aWZpZXIocHJvZHVjdElkZW50aWZpZXIsIHJlcSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3VjY2Vzc0NhbGxiYWNrKCkge1xuICAgICAgcmV0dXJuIGdldEZpbGVGb3JQcm9kdWN0SWRlbnRpZmllcihwcm9kdWN0SWRlbnRpZmllciwgcmVxKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvckNhbGxiYWNrKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgcmVzcG9uc2U6IGFwcFN0b3JlRXJyb3IoZXJyb3Iuc3RhdHVzKSB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsaWRhdGVXaXRoQXBwU3RvcmUoSUFQX1BST0RVQ1RJT05fVVJMLCByZWNlaXB0KS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gc3VjY2Vzc0NhbGxiYWNrKCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzID09IDIxMDA3KSB7XG4gICAgICAgICAgcmV0dXJuIHZhbGlkYXRlV2l0aEFwcFN0b3JlKElBUF9TQU5EQk9YX1VSTCwgcmVjZWlwdCkudGhlbihcbiAgICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHN1Y2Nlc3NDYWxsYmFjaygpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVycm9yQ2FsbGJhY2soZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXJyb3JDYWxsYmFjayhlcnJvcik7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZhbGlkYXRlX3B1cmNoYXNlJywgdGhpcy5oYW5kbGVSZXF1ZXN0KTtcbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxjQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFHQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFBK0IsU0FBQUQsdUJBQUFHLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFGL0IsTUFBTUcsT0FBTyxHQUFHTCxPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3JDLE1BQU1NLElBQUksR0FBR04sT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUcvQjtBQUNBLE1BQU1PLGVBQWUsR0FBRyxnREFBZ0Q7QUFDeEUsTUFBTUMsa0JBQWtCLEdBQUcsNENBQTRDO0FBRXZFLE1BQU1DLGdCQUFnQixHQUFHO0VBQ3ZCLEtBQUssRUFBRSw0REFBNEQ7RUFDbkUsS0FBSyxFQUFFLGlFQUFpRTtFQUN4RSxLQUFLLEVBQUUseUNBQXlDO0VBQ2hELEtBQUssRUFBRSwyRkFBMkY7RUFDbEcsS0FBSyxFQUFFLGdEQUFnRDtFQUN2RCxLQUFLLEVBQUUseURBQXlEO0VBQ2hFLEtBQUssRUFBRSxxSkFBcUo7RUFDNUosS0FB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