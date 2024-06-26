"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushQueue = void 0;
var _ParseMessageQueue = require("../ParseMessageQueue");
var _rest = _interopRequireDefault(require("../rest"));
var _utils = require("./utils");
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;
class PushQueue {
  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config = {}) {
    this.channel = config.channel || PushQueue.defaultPushChannel();
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = _ParseMessageQueue.ParseMessageQueue.createPublisher(config);
  }
  static defaultPushChannel() {
    return `${_node.default.applicationId}-${PUSH_CHANNEL}`;
  }
  enqueue(body, where, config, auth, pushStatus) {
    const limit = this.batchSize;
    where = (0, _utils.applyDeviceTokenExists)(where);

    // Order by objectId so no impact on the DB
    const order = 'objectId';
    return Promise.resolve().then(() => {
      return _rest.default.find(config, auth, '_Installation', where, {
        limit: 0,
        count: true
      });
    }).then(({
      results,
      count
    }) => {
      if (!results || count == 0) {
        return pushStatus.complete();
      }
      pushStatus.setRunning(Math.ceil(count / limit));
      let skip = 0;
      while (skip < count) {
        const query = {
          where,
          limit,
          skip,
          order
        };
        const pushWorkItem = {
          body,
          query,
          pushStatus: {
            objectId: pushStatus.objectId
          },
          applicationId: config.applicationId
        };
        this.parsePublisher.publish(this.channel, JSON.stringify(pushWorkItem));
        skip += limit;
      }
    });
  }
}
exports.PushQueue = PushQueue;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VNZXNzYWdlUXVldWUiLCJyZXF1aXJlIiwiX3Jlc3QiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX3V0aWxzIiwiX25vZGUiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlBVU0hfQ0hBTk5FTCIsIkRFRkFVTFRfQkFUQ0hfU0laRSIsIlB1c2hRdWV1ZSIsImNvbnN0cnVjdG9yIiwiY29uZmlnIiwiY2hhbm5lbCIsImRlZmF1bHRQdXNoQ2hhbm5lbCIsImJhdGNoU2l6ZSIsInBhcnNlUHVibGlzaGVyIiwiUGFyc2VNZXNzYWdlUXVldWUiLCJjcmVhdGVQdWJsaXNoZXIiLCJQYXJzZSIsImFwcGxpY2F0aW9uSWQiLCJlbnF1ZXVlIiwiYm9keSIsIndoZXJlIiwiYXV0aCIsInB1c2hTdGF0dXMiLCJsaW1pdCIsImFwcGx5RGV2aWNlVG9rZW5FeGlzdHMiLCJvcmRlciIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsInJlc3QiLCJmaW5kIiwiY291bnQiLCJyZXN1bHRzIiwiY29tcGxldGUiLCJzZXRSdW5uaW5nIiwiTWF0aCIsImNlaWwiLCJza2lwIiwicXVlcnkiLCJwdXNoV29ya0l0ZW0iLCJvYmplY3RJZCIsInB1Ymxpc2giLCJKU09OIiwic3RyaW5naWZ5IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9QdXNoL1B1c2hRdWV1ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZU1lc3NhZ2VRdWV1ZSB9IGZyb20gJy4uL1BhcnNlTWVzc2FnZVF1ZXVlJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IHsgYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5jb25zdCBQVVNIX0NIQU5ORUwgPSAncGFyc2Utc2VydmVyLXB1c2gnO1xuY29uc3QgREVGQVVMVF9CQVRDSF9TSVpFID0gMTAwO1xuXG5leHBvcnQgY2xhc3MgUHVzaFF1ZXVlIHtcbiAgcGFyc2VQdWJsaXNoZXI6IE9iamVjdDtcbiAgY2hhbm5lbDogU3RyaW5nO1xuICBiYXRjaFNpemU6IE51bWJlcjtcblxuICAvLyBjb25maWcgb2JqZWN0IG9mIHRoZSBwdWJsaXNoZXIsIHJpZ2h0IG5vdyBpdCBvbmx5IGNvbnRhaW5zIHRoZSByZWRpc1VSTCxcbiAgLy8gYnV0IHdlIG1heSBleHRlbmQgaXQgbGF0ZXIuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLmNoYW5uZWwgPSBjb25maWcuY2hhbm5lbCB8fCBQdXNoUXVldWUuZGVmYXVsdFB1c2hDaGFubmVsKCk7XG4gICAgdGhpcy5iYXRjaFNpemUgPSBjb25maWcuYmF0Y2hTaXplIHx8IERFRkFVTFRfQkFUQ0hfU0laRTtcbiAgICB0aGlzLnBhcnNlUHVibGlzaGVyID0gUGFyc2VNZXNzYWdlUXVldWUuY3JlYXRlUHVibGlzaGVyKGNvbmZpZyk7XG4gIH1cblxuICBzdGF0aWMgZGVmYXVsdFB1c2hDaGFubmVsKCkge1xuICAgIHJldHVybiBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfS0ke1BVU0hfQ0hBTk5FTH1gO1xuICB9XG5cbiAgZW5xdWV1ZShib2R5LCB3aGVyZSwgY29uZmlnLCBhdXRoLCBwdXNoU3RhdHVzKSB7XG4gICAgY29uc3QgbGltaXQgPSB0aGlzLmJhdGNoU2l6ZTtcblxuICAgIHdoZXJlID0gYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyh3aGVyZSk7XG5cbiAgICAvLyBPcmRlciBieSBvYmplY3RJZCBzbyBubyBpbXBhY3Qgb24gdGhlIERCXG4gICAgY29uc3Qgb3JkZXIgPSAnb2JqZWN0SWQnO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcmVzdC5maW5kKGNvbmZpZywgYXV0aCwgJ19JbnN0YWxsYXRpb24nLCB3aGVyZSwge1xuICAgICAgICAgIGxpbWl0OiAwLFxuICAgICAgICAgIGNvdW50OiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoeyByZXN1bHRzLCBjb3VudCB9KSA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0cyB8fCBjb3VudCA9PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIHB1c2hTdGF0dXMuY29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgICBwdXNoU3RhdHVzLnNldFJ1bm5pbmcoTWF0aC5jZWlsKGNvdW50IC8gbGltaXQpKTtcbiAgICAgICAgbGV0IHNraXAgPSAwO1xuICAgICAgICB3aGlsZSAoc2tpcCA8IGNvdW50KSB7XG4gICAgICAgICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBjb25zdCBwdXNoV29ya0l0ZW0gPSB7XG4gICAgICAgICAgICBib2R5LFxuICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICBwdXNoU3RhdHVzOiB7IG9iamVjdElkOiBwdXNoU3RhdHVzLm9iamVjdElkIH0sXG4gICAgICAgICAgICBhcHBsaWNhdGlvbklkOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRoaXMucGFyc2VQdWJsaXNoZXIucHVibGlzaCh0aGlzLmNoYW5uZWwsIEpTT04uc3RyaW5naWZ5KHB1c2hXb3JrSXRlbSkpO1xuICAgICAgICAgIHNraXAgKz0gbGltaXQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLGtCQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxNQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFBK0IsU0FBQUUsdUJBQUFHLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFFL0IsTUFBTUcsWUFBWSxHQUFHLG1CQUFtQjtBQUN4QyxNQUFNQyxrQkFBa0IsR0FBRyxHQUFHO0FBRXZCLE1BQU1DLFNBQVMsQ0FBQztFQUtyQjtFQUNBO0VBQ0FDLFdBQVdBLENBQUNDLE1BQVcsR0FBRyxDQUFDLENBQUMsRUFBRTtJQUM1QixJQUFJLENBQUNDLE9BQU8sR0FBR0QsTUFBTSxDQUFDQyxPQUFPLElBQUlILFNBQVMsQ0FBQ0ksa0JBQWtCLENBQUMsQ0FBQztJQUMvRCxJQUFJLENBQUNDLFNBQVMsR0FBR0gsTUFBTSxDQUFDRyxTQUFTLElBQUlOLGtCQUFrQjtJQUN2RCxJQUFJLENBQUNPLGNBQWMsR0FBR0Msb0NBQWlCLENBQUNDLGVBQWUsQ0FBQ04sTUFBTSxDQUFDO0VBQ2pFO0VBRUEsT0FBT0Usa0JBQWtCQSxDQUFBLEVBQUc7SUFDMUIsT0FBUSxHQUFFSyxhQUFLLENBQUNDLGFBQWMsSUFBR1osWUFBYSxFQUFDO0VBQ2pEO0VBRUFhLE9BQU9BLENBQUNDLElBQUksRUFBRUMsS0FBSyxFQUFFWCxNQUFNLEVBQUVZLElBQUksRUFBRUMsVUFBVSxFQUFFO0lBQzdDLE1BQU1DLEtBQUssR0FBRyxJQUFJLENBQUNYLFNBQVM7SUFFNUJRLEtBQUssR0FBRyxJQUFBSSw2QkFBc0IsRUFBQ0osS0FBSyxDQUFDOztJQUVyQztJQUNBLE1BQU1LLEtBQUssR0FBRyxVQUFVO0lBQ3hCLE9BQU9DLE9BQU8sQ0FBQ0MsT0FBTyxDQUFDLENBQUMsQ0FDckJDLElBQUksQ0FBQyxNQUFNO01BQ1YsT0FBT0MsYUFBSSxDQUFDQyxJQUFJLENBQUNyQixNQUFNLEVBQUVZLElBQUksRUFBRSxlQUFlLEVBQUVELEtBQUssRUFBRTtRQUNyREcsS0FBSyxFQUFFLENBQUM7UUFDUlEsS0FBSyxFQUFFO01BQ1QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQ0RILElBQUksQ0FBQyxDQUFDO01BQUVJLE9BQU87TUFBRUQ7SUFBTSxDQUFDLEtBQUs7TUFDNUIsSUFBSSxDQUFDQyxPQUFPLElBQUlELEtBQUssSUFBSSxDQUFDLEVBQUU7UUFDMUIsT0FBT1QsVUFBVSxDQUFDVyxRQUFRLENBQUMsQ0FBQztNQUM5QjtNQUNBWCxVQUFVLENBQUNZLFVBQVUsQ0FBQ0MsSUFBSSxDQUFDQyxJQUFJLENBQUNMLEtBQUssR0FBR1IsS0FBSyxDQUFDLENBQUM7TUFDL0MsSUFBSWMsSUFBSSxHQUFHLENBQUM7TUFDWixPQUFPQSxJQUFJLEdBQUdOLEtBQUssRUFBRTtRQUNuQixNQUFNTyxLQUFLLEdBQUc7VUFDWmxCLEtBQUs7VUFDTEcsS0FBSztVQUNMYyxJQUFJO1VBQ0paO1FBQ0YsQ0FBQztRQUVELE1BQU1jLFlBQVksR0FBRztVQUNuQnBCLElBQUk7VUFDSm1CLEtBQUs7VUFDTGhCLFVBQVUsRUFBRTtZQUFFa0IsUUFBUSxFQUFFbEIsVUFBVSxDQUFDa0I7VUFBUyxDQUFDO1VBQzdDdkIsYUFBYSxFQUFFUixNQUFNLENBQUNRO1FBQ3hCLENBQUM7UUFDRCxJQUFJLENBQUNKLGNBQWMsQ0FBQzRCLE9BQU8sQ0FBQyxJQUFJLENBQUMvQixPQUFPLEVBQUVnQyxJQUFJLENBQUNDLFNBQVMsQ0FBQ0osWUFBWSxDQUFDLENBQUM7UUFDdkVGLElBQUksSUFBSWQsS0FBSztNQUNmO0lBQ0YsQ0FBQyxDQUFDO0VBQ047QUFDRjtBQUFDcUIsT0FBQSxDQUFBckMsU0FBQSxHQUFBQSxTQUFBIiwiaWdub3JlTGlzdCI6W119