"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = void 0;
var _logger = _interopRequireDefault(require("../logger"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const dafaultFields = ['className', 'objectId', 'updatedAt', 'createdAt', 'ACL'];
class Client {
  constructor(id, parseWebSocket, hasMasterKey = false, sessionToken, installationId) {
    this.id = id;
    this.parseWebSocket = parseWebSocket;
    this.hasMasterKey = hasMasterKey;
    this.sessionToken = sessionToken;
    this.installationId = installationId;
    this.roles = [];
    this.subscriptionInfos = new Map();
    this.pushConnect = this._pushEvent('connected');
    this.pushSubscribe = this._pushEvent('subscribed');
    this.pushUnsubscribe = this._pushEvent('unsubscribed');
    this.pushCreate = this._pushEvent('create');
    this.pushEnter = this._pushEvent('enter');
    this.pushUpdate = this._pushEvent('update');
    this.pushDelete = this._pushEvent('delete');
    this.pushLeave = this._pushEvent('leave');
  }
  static pushResponse(parseWebSocket, message) {
    _logger.default.verbose('Push Response : %j', message);
    parseWebSocket.send(message);
  }
  static pushError(parseWebSocket, code, error, reconnect = true, requestId = null) {
    Client.pushResponse(parseWebSocket, JSON.stringify({
      op: 'error',
      error,
      code,
      reconnect,
      requestId
    }));
  }
  addSubscriptionInfo(requestId, subscriptionInfo) {
    this.subscriptionInfos.set(requestId, subscriptionInfo);
  }
  getSubscriptionInfo(requestId) {
    return this.subscriptionInfos.get(requestId);
  }
  deleteSubscriptionInfo(requestId) {
    return this.subscriptionInfos.delete(requestId);
  }
  _pushEvent(type) {
    return function (subscriptionId, parseObjectJSON, parseOriginalObjectJSON) {
      const response = {
        op: type,
        clientId: this.id,
        installationId: this.installationId
      };
      if (typeof subscriptionId !== 'undefined') {
        response['requestId'] = subscriptionId;
      }
      if (typeof parseObjectJSON !== 'undefined') {
        let keys;
        if (this.subscriptionInfos.has(subscriptionId)) {
          keys = this.subscriptionInfos.get(subscriptionId).keys;
        }
        response['object'] = this._toJSONWithFields(parseObjectJSON, keys);
        if (parseOriginalObjectJSON) {
          response['original'] = this._toJSONWithFields(parseOriginalObjectJSON, keys);
        }
      }
      Client.pushResponse(this.parseWebSocket, JSON.stringify(response));
    };
  }
  _toJSONWithFields(parseObjectJSON, fields) {
    if (!fields) {
      return parseObjectJSON;
    }
    const limitedParseObject = {};
    for (const field of dafaultFields) {
      limitedParseObject[field] = parseObjectJSON[field];
    }
    for (const field of fields) {
      if (field in parseObjectJSON) {
        limitedParseObject[field] = parseObjectJSON[field];
      }
    }
    return limitedParseObject;
  }
}
exports.Client = Client;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImRhZmF1bHRGaWVsZHMiLCJDbGllbnQiLCJjb25zdHJ1Y3RvciIsImlkIiwicGFyc2VXZWJTb2NrZXQiLCJoYXNNYXN0ZXJLZXkiLCJzZXNzaW9uVG9rZW4iLCJpbnN0YWxsYXRpb25JZCIsInJvbGVzIiwic3Vic2NyaXB0aW9uSW5mb3MiLCJNYXAiLCJwdXNoQ29ubmVjdCIsIl9wdXNoRXZlbnQiLCJwdXNoU3Vic2NyaWJlIiwicHVzaFVuc3Vic2NyaWJlIiwicHVzaENyZWF0ZSIsInB1c2hFbnRlciIsInB1c2hVcGRhdGUiLCJwdXNoRGVsZXRlIiwicHVzaExlYXZlIiwicHVzaFJlc3BvbnNlIiwibWVzc2FnZSIsImxvZ2dlciIsInZlcmJvc2UiLCJzZW5kIiwicHVzaEVycm9yIiwiY29kZSIsImVycm9yIiwicmVjb25uZWN0IiwicmVxdWVzdElkIiwiSlNPTiIsInN0cmluZ2lmeSIsIm9wIiwiYWRkU3Vic2NyaXB0aW9uSW5mbyIsInN1YnNjcmlwdGlvbkluZm8iLCJzZXQiLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiZ2V0IiwiZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyIsImRlbGV0ZSIsInR5cGUiLCJzdWJzY3JpcHRpb25JZCIsInBhcnNlT2JqZWN0SlNPTiIsInBhcnNlT3JpZ2luYWxPYmplY3RKU09OIiwicmVzcG9uc2UiLCJjbGllbnRJZCIsImtleXMiLCJoYXMiLCJfdG9KU09OV2l0aEZpZWxkcyIsImZpZWxkcyIsImxpbWl0ZWRQYXJzZU9iamVjdCIsImZpZWxkIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvQ2xpZW50LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcblxuaW1wb3J0IHR5cGUgeyBGbGF0dGVuZWRPYmplY3REYXRhIH0gZnJvbSAnLi9TdWJzY3JpcHRpb24nO1xuZXhwb3J0IHR5cGUgTWVzc2FnZSA9IHsgW2F0dHI6IHN0cmluZ106IGFueSB9O1xuXG5jb25zdCBkYWZhdWx0RmllbGRzID0gWydjbGFzc05hbWUnLCAnb2JqZWN0SWQnLCAndXBkYXRlZEF0JywgJ2NyZWF0ZWRBdCcsICdBQ0wnXTtcblxuY2xhc3MgQ2xpZW50IHtcbiAgaWQ6IG51bWJlcjtcbiAgcGFyc2VXZWJTb2NrZXQ6IGFueTtcbiAgaGFzTWFzdGVyS2V5OiBib29sZWFuO1xuICBzZXNzaW9uVG9rZW46IHN0cmluZztcbiAgaW5zdGFsbGF0aW9uSWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHJvbGVzOiBBcnJheTxzdHJpbmc+O1xuICBzdWJzY3JpcHRpb25JbmZvczogT2JqZWN0O1xuICBwdXNoQ29ubmVjdDogRnVuY3Rpb247XG4gIHB1c2hTdWJzY3JpYmU6IEZ1bmN0aW9uO1xuICBwdXNoVW5zdWJzY3JpYmU6IEZ1bmN0aW9uO1xuICBwdXNoQ3JlYXRlOiBGdW5jdGlvbjtcbiAgcHVzaEVudGVyOiBGdW5jdGlvbjtcbiAgcHVzaFVwZGF0ZTogRnVuY3Rpb247XG4gIHB1c2hEZWxldGU6IEZ1bmN0aW9uO1xuICBwdXNoTGVhdmU6IEZ1bmN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIGlkOiBudW1iZXIsXG4gICAgcGFyc2VXZWJTb2NrZXQ6IGFueSxcbiAgICBoYXNNYXN0ZXJLZXk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBzZXNzaW9uVG9rZW46IHN0cmluZyxcbiAgICBpbnN0YWxsYXRpb25JZDogc3RyaW5nXG4gICkge1xuICAgIHRoaXMuaWQgPSBpZDtcbiAgICB0aGlzLnBhcnNlV2ViU29ja2V0ID0gcGFyc2VXZWJTb2NrZXQ7XG4gICAgdGhpcy5oYXNNYXN0ZXJLZXkgPSBoYXNNYXN0ZXJLZXk7XG4gICAgdGhpcy5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICAgIHRoaXMucm9sZXMgPSBbXTtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbkluZm9zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMucHVzaENvbm5lY3QgPSB0aGlzLl9wdXNoRXZlbnQoJ2Nvbm5lY3RlZCcpO1xuICAgIHRoaXMucHVzaFN1YnNjcmliZSA9IHRoaXMuX3B1c2hFdmVudCgnc3Vic2NyaWJlZCcpO1xuICAgIHRoaXMucHVzaFVuc3Vic2NyaWJlID0gdGhpcy5fcHVzaEV2ZW50KCd1bnN1YnNjcmliZWQnKTtcbiAgICB0aGlzLnB1c2hDcmVhdGUgPSB0aGlzLl9wdXNoRXZlbnQoJ2NyZWF0ZScpO1xuICAgIHRoaXMucHVzaEVudGVyID0gdGhpcy5fcHVzaEV2ZW50KCdlbnRlcicpO1xuICAgIHRoaXMucHVzaFVwZGF0ZSA9IHRoaXMuX3B1c2hFdmVudCgndXBkYXRlJyk7XG4gICAgdGhpcy5wdXNoRGVsZXRlID0gdGhpcy5fcHVzaEV2ZW50KCdkZWxldGUnKTtcbiAgICB0aGlzLnB1c2hMZWF2ZSA9IHRoaXMuX3B1c2hFdmVudCgnbGVhdmUnKTtcbiAgfVxuXG4gIHN0YXRpYyBwdXNoUmVzcG9uc2UocGFyc2VXZWJTb2NrZXQ6IGFueSwgbWVzc2FnZTogTWVzc2FnZSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKCdQdXNoIFJlc3BvbnNlIDogJWonLCBtZXNzYWdlKTtcbiAgICBwYXJzZVdlYlNvY2tldC5zZW5kKG1lc3NhZ2UpO1xuICB9XG5cbiAgc3RhdGljIHB1c2hFcnJvcihcbiAgICBwYXJzZVdlYlNvY2tldDogYW55LFxuICAgIGNvZGU6IG51bWJlcixcbiAgICBlcnJvcjogc3RyaW5nLFxuICAgIHJlY29ubmVjdDogYm9vbGVhbiA9IHRydWUsXG4gICAgcmVxdWVzdElkOiBudW1iZXIgfCB2b2lkID0gbnVsbFxuICApOiB2b2lkIHtcbiAgICBDbGllbnQucHVzaFJlc3BvbnNlKFxuICAgICAgcGFyc2VXZWJTb2NrZXQsXG4gICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG9wOiAnZXJyb3InLFxuICAgICAgICBlcnJvcixcbiAgICAgICAgY29kZSxcbiAgICAgICAgcmVjb25uZWN0LFxuICAgICAgICByZXF1ZXN0SWQsXG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICBhZGRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZDogbnVtYmVyLCBzdWJzY3JpcHRpb25JbmZvOiBhbnkpOiB2b2lkIHtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbkluZm9zLnNldChyZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuICB9XG5cbiAgZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQ6IG51bWJlcik6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuc3Vic2NyaXB0aW9uSW5mb3MuZ2V0KHJlcXVlc3RJZCk7XG4gIH1cblxuICBkZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZDogbnVtYmVyKTogdm9pZCB7XG4gICAgcmV0dXJuIHRoaXMuc3Vic2NyaXB0aW9uSW5mb3MuZGVsZXRlKHJlcXVlc3RJZCk7XG4gIH1cblxuICBfcHVzaEV2ZW50KHR5cGU6IHN0cmluZyk6IEZ1bmN0aW9uIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKFxuICAgICAgc3Vic2NyaXB0aW9uSWQ6IG51bWJlcixcbiAgICAgIHBhcnNlT2JqZWN0SlNPTjogYW55LFxuICAgICAgcGFyc2VPcmlnaW5hbE9iamVjdEpTT046IGFueVxuICAgICk6IHZvaWQge1xuICAgICAgY29uc3QgcmVzcG9uc2U6IE1lc3NhZ2UgPSB7XG4gICAgICAgIG9wOiB0eXBlLFxuICAgICAgICBjbGllbnRJZDogdGhpcy5pZCxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9O1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JZCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmVzcG9uc2VbJ3JlcXVlc3RJZCddID0gc3Vic2NyaXB0aW9uSWQ7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHBhcnNlT2JqZWN0SlNPTiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbGV0IGtleXM7XG4gICAgICAgIGlmICh0aGlzLnN1YnNjcmlwdGlvbkluZm9zLmhhcyhzdWJzY3JpcHRpb25JZCkpIHtcbiAgICAgICAgICBrZXlzID0gdGhpcy5zdWJzY3JpcHRpb25JbmZvcy5nZXQoc3Vic2NyaXB0aW9uSWQpLmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gdGhpcy5fdG9KU09OV2l0aEZpZWxkcyhwYXJzZU9iamVjdEpTT04sIGtleXMpO1xuICAgICAgICBpZiAocGFyc2VPcmlnaW5hbE9iamVjdEpTT04pIHtcbiAgICAgICAgICByZXNwb25zZVsnb3JpZ2luYWwnXSA9IHRoaXMuX3RvSlNPTldpdGhGaWVsZHMocGFyc2VPcmlnaW5hbE9iamVjdEpTT04sIGtleXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBDbGllbnQucHVzaFJlc3BvbnNlKHRoaXMucGFyc2VXZWJTb2NrZXQsIEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKSk7XG4gICAgfTtcbiAgfVxuXG4gIF90b0pTT05XaXRoRmllbGRzKHBhcnNlT2JqZWN0SlNPTjogYW55LCBmaWVsZHM6IGFueSk6IEZsYXR0ZW5lZE9iamVjdERhdGEge1xuICAgIGlmICghZmllbGRzKSB7XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RKU09OO1xuICAgIH1cbiAgICBjb25zdCBsaW1pdGVkUGFyc2VPYmplY3QgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGRhZmF1bHRGaWVsZHMpIHtcbiAgICAgIGxpbWl0ZWRQYXJzZU9iamVjdFtmaWVsZF0gPSBwYXJzZU9iamVjdEpTT05bZmllbGRdO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgICAgaWYgKGZpZWxkIGluIHBhcnNlT2JqZWN0SlNPTikge1xuICAgICAgICBsaW1pdGVkUGFyc2VPYmplY3RbZmllbGRdID0gcGFyc2VPYmplY3RKU09OW2ZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpbWl0ZWRQYXJzZU9iamVjdDtcbiAgfVxufVxuXG5leHBvcnQgeyBDbGllbnQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsT0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFELHVCQUFBRSxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBSy9CLE1BQU1HLGFBQWEsR0FBRyxDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUM7QUFFaEYsTUFBTUMsTUFBTSxDQUFDO0VBa0JYQyxXQUFXQSxDQUNUQyxFQUFVLEVBQ1ZDLGNBQW1CLEVBQ25CQyxZQUFxQixHQUFHLEtBQUssRUFDN0JDLFlBQW9CLEVBQ3BCQyxjQUFzQixFQUN0QjtJQUNBLElBQUksQ0FBQ0osRUFBRSxHQUFHQSxFQUFFO0lBQ1osSUFBSSxDQUFDQyxjQUFjLEdBQUdBLGNBQWM7SUFDcEMsSUFBSSxDQUFDQyxZQUFZLEdBQUdBLFlBQVk7SUFDaEMsSUFBSSxDQUFDQyxZQUFZLEdBQUdBLFlBQVk7SUFDaEMsSUFBSSxDQUFDQyxjQUFjLEdBQUdBLGNBQWM7SUFDcEMsSUFBSSxDQUFDQyxLQUFLLEdBQUcsRUFBRTtJQUNmLElBQUksQ0FBQ0MsaUJBQWlCLEdBQUcsSUFBSUMsR0FBRyxDQUFDLENBQUM7SUFDbEMsSUFBSSxDQUFDQyxXQUFXLEdBQUcsSUFBSSxDQUFDQyxVQUFVLENBQUMsV0FBVyxDQUFDO0lBQy9DLElBQUksQ0FBQ0MsYUFBYSxHQUFHLElBQUksQ0FBQ0QsVUFBVSxDQUFDLFlBQVksQ0FBQztJQUNsRCxJQUFJLENBQUNFLGVBQWUsR0FBRyxJQUFJLENBQUNGLFVBQVUsQ0FBQyxjQUFjLENBQUM7SUFDdEQsSUFB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