"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = void 0;
var _logger = _interopRequireDefault(require("../logger"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJkYWZhdWx0RmllbGRzIiwiQ2xpZW50IiwiY29uc3RydWN0b3IiLCJpZCIsInBhcnNlV2ViU29ja2V0IiwiaGFzTWFzdGVyS2V5Iiwic2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJyb2xlcyIsInN1YnNjcmlwdGlvbkluZm9zIiwiTWFwIiwicHVzaENvbm5lY3QiLCJfcHVzaEV2ZW50IiwicHVzaFN1YnNjcmliZSIsInB1c2hVbnN1YnNjcmliZSIsInB1c2hDcmVhdGUiLCJwdXNoRW50ZXIiLCJwdXNoVXBkYXRlIiwicHVzaERlbGV0ZSIsInB1c2hMZWF2ZSIsInB1c2hSZXNwb25zZSIsIm1lc3NhZ2UiLCJsb2dnZXIiLCJ2ZXJib3NlIiwic2VuZCIsInB1c2hFcnJvciIsImNvZGUiLCJlcnJvciIsInJlY29ubmVjdCIsInJlcXVlc3RJZCIsIkpTT04iLCJzdHJpbmdpZnkiLCJvcCIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvIiwic2V0IiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImdldCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJkZWxldGUiLCJ0eXBlIiwic3Vic2NyaXB0aW9uSWQiLCJwYXJzZU9iamVjdEpTT04iLCJwYXJzZU9yaWdpbmFsT2JqZWN0SlNPTiIsInJlc3BvbnNlIiwiY2xpZW50SWQiLCJrZXlzIiwiaGFzIiwiX3RvSlNPTldpdGhGaWVsZHMiLCJmaWVsZHMiLCJsaW1pdGVkUGFyc2VPYmplY3QiLCJmaWVsZCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L0NsaWVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5cbmltcG9ydCB0eXBlIHsgRmxhdHRlbmVkT2JqZWN0RGF0YSB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmV4cG9ydCB0eXBlIE1lc3NhZ2UgPSB7IFthdHRyOiBzdHJpbmddOiBhbnkgfTtcblxuY29uc3QgZGFmYXVsdEZpZWxkcyA9IFsnY2xhc3NOYW1lJywgJ29iamVjdElkJywgJ3VwZGF0ZWRBdCcsICdjcmVhdGVkQXQnLCAnQUNMJ107XG5cbmNsYXNzIENsaWVudCB7XG4gIGlkOiBudW1iZXI7XG4gIHBhcnNlV2ViU29ja2V0OiBhbnk7XG4gIGhhc01hc3RlcktleTogYm9vbGVhbjtcbiAgc2Vzc2lvblRva2VuOiBzdHJpbmc7XG4gIGluc3RhbGxhdGlvbklkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICByb2xlczogQXJyYXk8c3RyaW5nPjtcbiAgc3Vic2NyaXB0aW9uSW5mb3M6IE9iamVjdDtcbiAgcHVzaENvbm5lY3Q6IEZ1bmN0aW9uO1xuICBwdXNoU3Vic2NyaWJlOiBGdW5jdGlvbjtcbiAgcHVzaFVuc3Vic2NyaWJlOiBGdW5jdGlvbjtcbiAgcHVzaENyZWF0ZTogRnVuY3Rpb247XG4gIHB1c2hFbnRlcjogRnVuY3Rpb247XG4gIHB1c2hVcGRhdGU6IEZ1bmN0aW9uO1xuICBwdXNoRGVsZXRlOiBGdW5jdGlvbjtcbiAgcHVzaExlYXZlOiBGdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBpZDogbnVtYmVyLFxuICAgIHBhcnNlV2ViU29ja2V0OiBhbnksXG4gICAgaGFzTWFzdGVyS2V5OiBib29sZWFuID0gZmFsc2UsXG4gICAgc2Vzc2lvblRva2VuOiBzdHJpbmcsXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHN0cmluZ1xuICApIHtcbiAgICB0aGlzLmlkID0gaWQ7XG4gICAgdGhpcy5wYXJzZVdlYlNvY2tldCA9IHBhcnNlV2ViU29ja2V0O1xuICAgIHRoaXMuaGFzTWFzdGVyS2V5ID0gaGFzTWFzdGVyS2V5O1xuICAgIHRoaXMuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgIHRoaXMuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgICB0aGlzLnJvbGVzID0gW107XG4gICAgdGhpcy5zdWJzY3JpcHRpb25JbmZvcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnB1c2hDb25uZWN0ID0gdGhpcy5fcHVzaEV2ZW50KCdjb25uZWN0ZWQnKTtcbiAgICB0aGlzLnB1c2hTdWJzY3JpYmUgPSB0aGlzLl9wdXNoRXZlbnQoJ3N1YnNjcmliZWQnKTtcbiAgICB0aGlzLnB1c2hVbnN1YnNjcmliZSA9IHRoaXMuX3B1c2hFdmVudCgndW5zdWJzY3JpYmVkJyk7XG4gICAgdGhpcy5wdXNoQ3JlYXRlID0gdGhpcy5fcHVzaEV2ZW50KCdjcmVhdGUnKTtcbiAgICB0aGlzLnB1c2hFbnRlciA9IHRoaXMuX3B1c2hFdmVudCgnZW50ZXInKTtcbiAgICB0aGlzLnB1c2hVcGRhdGUgPSB0aGlzLl9wdXNoRXZlbnQoJ3VwZGF0ZScpO1xuICAgIHRoaXMucHVzaERlbGV0ZSA9IHRoaXMuX3B1c2hFdmVudCgnZGVsZXRlJyk7XG4gICAgdGhpcy5wdXNoTGVhdmUgPSB0aGlzLl9wdXNoRXZlbnQoJ2xlYXZlJyk7XG4gIH1cblxuICBzdGF0aWMgcHVzaFJlc3BvbnNlKHBhcnNlV2ViU29ja2V0OiBhbnksIG1lc3NhZ2U6IE1lc3NhZ2UpOiB2b2lkIHtcbiAgICBsb2dnZXIudmVyYm9zZSgnUHVzaCBSZXNwb25zZSA6ICVqJywgbWVzc2FnZSk7XG4gICAgcGFyc2VXZWJTb2NrZXQuc2VuZChtZXNzYWdlKTtcbiAgfVxuXG4gIHN0YXRpYyBwdXNoRXJyb3IoXG4gICAgcGFyc2VXZWJTb2NrZXQ6IGFueSxcbiAgICBjb2RlOiBudW1iZXIsXG4gICAgZXJyb3I6IHN0cmluZyxcbiAgICByZWNvbm5lY3Q6IGJvb2xlYW4gPSB0cnVlLFxuICAgIHJlcXVlc3RJZDogbnVtYmVyIHwgdm9pZCA9IG51bGxcbiAgKTogdm9pZCB7XG4gICAgQ2xpZW50LnB1c2hSZXNwb25zZShcbiAgICAgIHBhcnNlV2ViU29ja2V0LFxuICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBvcDogJ2Vycm9yJyxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvZGUsXG4gICAgICAgIHJlY29ubmVjdCxcbiAgICAgICAgcmVxdWVzdElkLFxuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQ6IG51bWJlciwgc3Vic2NyaXB0aW9uSW5mbzogYW55KTogdm9pZCB7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25JbmZvcy5zZXQocmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvKTtcbiAgfVxuXG4gIGdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkOiBudW1iZXIpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnN1YnNjcmlwdGlvbkluZm9zLmdldChyZXF1ZXN0SWQpO1xuICB9XG5cbiAgZGVsZXRlU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQ6IG51bWJlcik6IHZvaWQge1xuICAgIHJldHVybiB0aGlzLnN1YnNjcmlwdGlvbkluZm9zLmRlbGV0ZShyZXF1ZXN0SWQpO1xuICB9XG5cbiAgX3B1c2hFdmVudCh0eXBlOiBzdHJpbmcpOiBGdW5jdGlvbiB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChcbiAgICAgIHN1YnNjcmlwdGlvbklkOiBudW1iZXIsXG4gICAgICBwYXJzZU9iamVjdEpTT046IGFueSxcbiAgICAgIHBhcnNlT3JpZ2luYWxPYmplY3RKU09OOiBhbnlcbiAgICApOiB2b2lkIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBNZXNzYWdlID0ge1xuICAgICAgICBvcDogdHlwZSxcbiAgICAgICAgY2xpZW50SWQ6IHRoaXMuaWQsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSWQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJlc3BvbnNlWydyZXF1ZXN0SWQnXSA9IHN1YnNjcmlwdGlvbklkO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBwYXJzZU9iamVjdEpTT04gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGxldCBrZXlzO1xuICAgICAgICBpZiAodGhpcy5zdWJzY3JpcHRpb25JbmZvcy5oYXMoc3Vic2NyaXB0aW9uSWQpKSB7XG4gICAgICAgICAga2V5cyA9IHRoaXMuc3Vic2NyaXB0aW9uSW5mb3MuZ2V0KHN1YnNjcmlwdGlvbklkKS5rZXlzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHRoaXMuX3RvSlNPTldpdGhGaWVsZHMocGFyc2VPYmplY3RKU09OLCBrZXlzKTtcbiAgICAgICAgaWYgKHBhcnNlT3JpZ2luYWxPYmplY3RKU09OKSB7XG4gICAgICAgICAgcmVzcG9uc2VbJ29yaWdpbmFsJ10gPSB0aGlzLl90b0pTT05XaXRoRmllbGRzKHBhcnNlT3JpZ2luYWxPYmplY3RKU09OLCBrZXlzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgQ2xpZW50LnB1c2hSZXNwb25zZSh0aGlzLnBhcnNlV2ViU29ja2V0LCBKU09OLnN0cmluZ2lmeShyZXNwb25zZSkpO1xuICAgIH07XG4gIH1cblxuICBfdG9KU09OV2l0aEZpZWxkcyhwYXJzZU9iamVjdEpTT046IGFueSwgZmllbGRzOiBhbnkpOiBGbGF0dGVuZWRPYmplY3REYXRhIHtcbiAgICBpZiAoIWZpZWxkcykge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0SlNPTjtcbiAgICB9XG4gICAgY29uc3QgbGltaXRlZFBhcnNlT2JqZWN0ID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBkYWZhdWx0RmllbGRzKSB7XG4gICAgICBsaW1pdGVkUGFyc2VPYmplY3RbZmllbGRdID0gcGFyc2VPYmplY3RKU09OW2ZpZWxkXTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcbiAgICAgIGlmIChmaWVsZCBpbiBwYXJzZU9iamVjdEpTT04pIHtcbiAgICAgICAgbGltaXRlZFBhcnNlT2JqZWN0W2ZpZWxkXSA9IHBhcnNlT2JqZWN0SlNPTltmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBsaW1pdGVkUGFyc2VPYmplY3Q7XG4gIH1cbn1cblxuZXhwb3J0IHsgQ2xpZW50IH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUErQixTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUsvQixNQUFNRyxhQUFhLEdBQUcsQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDO0FBRWhGLE1BQU1DLE1BQU0sQ0FBQztFQWtCWEMsV0FBV0EsQ0FDVEMsRUFBVSxFQUNWQyxjQUFtQixFQUNuQkMsWUFBcUIsR0FBRyxLQUFLLEVBQzdCQyxZQUFvQixFQUNwQkMsY0FBc0IsRUFDdEI7SUFDQSxJQUFJLENBQUNKLEVBQUUsR0FBR0EsRUFBRTtJQUNaLElBQUksQ0FBQ0MsY0FBYyxHQUFHQSxjQUFjO0lBQ3BDLElBQUksQ0FBQ0MsWUFBWSxHQUFHQSxZQUFZO0lBQ2hDLElBQUksQ0FBQ0MsWUFBWSxHQUFHQSxZQUFZO0lBQ2hDLElBQUksQ0FBQ0MsY0FBYyxHQUFHQSxjQUFjO0lBQ3BDLElBQUksQ0FBQ0MsS0FBSyxHQUFHLEVBQUU7SUFDZixJQUFJLENBQUNDLGlCQUFpQixHQUFHLElBQUlDLEdBQUcsQ0FBQyxDQUFDO0lBQ2xDLElBQUksQ0FBQ0MsV0FBVyxHQUFHLElBQUksQ0FBQ0MsVUFBVSxDQUFDLFdBQVcsQ0FBQztJQUMvQyxJQUFJLENBQUNDLGFBQWEsR0FBRyxJQUFJLENBQUNELFVBQVUsQ0FBQyxZQUFZLENBQUM7SUFDbEQsSUFBSSxDQUFDRSxlQUFlLEdBQUcsSUFBSSxDQUFDRixVQUFVLENBQUMsY0FBYyxDQUFDO0lBQ3RELElBQUks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