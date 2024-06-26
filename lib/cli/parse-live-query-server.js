"use strict";

var _parseLiveQueryServer = _interopRequireDefault(require("./definitions/parse-live-query-server"));
var _runner = _interopRequireDefault(require("./utils/runner"));
var _index = require("../index");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
(0, _runner.default)({
  definitions: _parseLiveQueryServer.default,
  start: function (program, options, logOptions) {
    logOptions();
    _index.ParseServer.createLiveQueryServer(undefined, options);
  }
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ydW5uZXIiLCJfaW5kZXgiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJ1bm5lciIsImRlZmluaXRpb25zIiwic3RhcnQiLCJwcm9ncmFtIiwib3B0aW9ucyIsImxvZ09wdGlvbnMiLCJQYXJzZVNlcnZlciIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsInVuZGVmaW5lZCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbGkvcGFyc2UtbGl2ZS1xdWVyeS1zZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGRlZmluaXRpb25zIGZyb20gJy4vZGVmaW5pdGlvbnMvcGFyc2UtbGl2ZS1xdWVyeS1zZXJ2ZXInO1xuaW1wb3J0IHJ1bm5lciBmcm9tICcuL3V0aWxzL3J1bm5lcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlciB9IGZyb20gJy4uL2luZGV4JztcblxucnVubmVyKHtcbiAgZGVmaW5pdGlvbnMsXG4gIHN0YXJ0OiBmdW5jdGlvbiAocHJvZ3JhbSwgb3B0aW9ucywgbG9nT3B0aW9ucykge1xuICAgIGxvZ09wdGlvbnMoKTtcbiAgICBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIodW5kZWZpbmVkLCBvcHRpb25zKTtcbiAgfSxcbn0pO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLHFCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxNQUFBLEdBQUFGLE9BQUE7QUFBdUMsU0FBQUQsdUJBQUFJLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFFdkMsSUFBQUcsZUFBTSxFQUFDO0VBQ0xDLFdBQVcsRUFBWEEsNkJBQVc7RUFDWEMsS0FBSyxFQUFFLFNBQUFBLENBQVVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFQyxVQUFVLEVBQUU7SUFDN0NBLFVBQVUsQ0FBQyxDQUFDO0lBQ1pDLGtCQUFXLENBQUNDLHFCQUFxQixDQUFDQyxTQUFTLEVBQUVKLE9BQU8sQ0FBQztFQUN2RDtBQUNGLENBQUMsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==