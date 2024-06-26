"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.destroyAllDataPermanently = destroyAllDataPermanently;
var _cache = _interopRequireDefault(require("./cache"));
var _SchemaCache = _interopRequireDefault(require("./Adapters/Cache/SchemaCache"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
/**
 * Destroys all data in the database
 * @param {boolean} fast set to true if it's ok to just drop objects and not indexes.
 */
function destroyAllDataPermanently(fast) {
  if (!process.env.TESTING) {
    throw 'Only supported in test environment';
  }
  return Promise.all(Object.keys(_cache.default.cache).map(appId => {
    const app = _cache.default.get(appId);
    const deletePromises = [];
    if (app.cacheAdapter && app.cacheAdapter.clear) {
      deletePromises.push(app.cacheAdapter.clear());
    }
    if (app.databaseController) {
      deletePromises.push(app.databaseController.deleteEverything(fast));
    } else if (app.databaseAdapter) {
      _SchemaCache.default.clear();
      deletePromises.push(app.databaseAdapter.deleteAllClasses(fast));
    }
    return Promise.all(deletePromises);
  }));
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9TY2hlbWFDYWNoZSIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiZGVzdHJveUFsbERhdGFQZXJtYW5lbnRseSIsImZhc3QiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsIlByb21pc2UiLCJhbGwiLCJPYmplY3QiLCJrZXlzIiwiQXBwQ2FjaGUiLCJjYWNoZSIsIm1hcCIsImFwcElkIiwiYXBwIiwiZ2V0IiwiZGVsZXRlUHJvbWlzZXMiLCJjYWNoZUFkYXB0ZXIiLCJjbGVhciIsInB1c2giLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJkZWxldGVFdmVyeXRoaW5nIiwiZGF0YWJhc2VBZGFwdGVyIiwiU2NoZW1hQ2FjaGUiLCJkZWxldGVBbGxDbGFzc2VzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Rlc3RVdGlscy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5cbi8qKlxuICogRGVzdHJveXMgYWxsIGRhdGEgaW4gdGhlIGRhdGFiYXNlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRyb3Agb2JqZWN0cyBhbmQgbm90IGluZGV4ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXN0cm95QWxsRGF0YVBlcm1hbmVudGx5KGZhc3QpIHtcbiAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgdGhyb3cgJ09ubHkgc3VwcG9ydGVkIGluIHRlc3QgZW52aXJvbm1lbnQnO1xuICB9XG4gIHJldHVybiBQcm9taXNlLmFsbChcbiAgICBPYmplY3Qua2V5cyhBcHBDYWNoZS5jYWNoZSkubWFwKGFwcElkID0+IHtcbiAgICAgIGNvbnN0IGFwcCA9IEFwcENhY2hlLmdldChhcHBJZCk7XG4gICAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgICAgaWYgKGFwcC5jYWNoZUFkYXB0ZXIgJiYgYXBwLmNhY2hlQWRhcHRlci5jbGVhcikge1xuICAgICAgICBkZWxldGVQcm9taXNlcy5wdXNoKGFwcC5jYWNoZUFkYXB0ZXIuY2xlYXIoKSk7XG4gICAgICB9XG4gICAgICBpZiAoYXBwLmRhdGFiYXNlQ29udHJvbGxlcikge1xuICAgICAgICBkZWxldGVQcm9taXNlcy5wdXNoKGFwcC5kYXRhYmFzZUNvbnRyb2xsZXIuZGVsZXRlRXZlcnl0aGluZyhmYXN0KSk7XG4gICAgICB9IGVsc2UgaWYgKGFwcC5kYXRhYmFzZUFkYXB0ZXIpIHtcbiAgICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChhcHAuZGF0YWJhc2VBZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKGRlbGV0ZVByb21pc2VzKTtcbiAgICB9KVxuICApO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFBdUQsU0FBQUQsdUJBQUFHLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFFdkQ7QUFDQTtBQUNBO0FBQ0E7QUFDTyxTQUFTRyx5QkFBeUJBLENBQUNDLElBQUksRUFBRTtFQUM5QyxJQUFJLENBQUNDLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDQyxPQUFPLEVBQUU7SUFDeEIsTUFBTSxvQ0FBb0M7RUFDNUM7RUFDQSxPQUFPQyxPQUFPLENBQUNDLEdBQUcsQ0FDaEJDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDQyxjQUFRLENBQUNDLEtBQUssQ0FBQyxDQUFDQyxHQUFHLENBQUNDLEtBQUssSUFBSTtJQUN2QyxNQUFNQyxHQUFHLEdBQUdKLGNBQVEsQ0FBQ0ssR0FBRyxDQUFDRixLQUFLLENBQUM7SUFDL0IsTUFBTUcsY0FBYyxHQUFHLEVBQUU7SUFDekIsSUFBSUYsR0FBRyxDQUFDRyxZQUFZLElBQUlILEdBQUcsQ0FBQ0csWUFBWSxDQUFDQyxLQUFLLEVBQUU7TUFDOUNGLGNBQWMsQ0FBQ0csSUFBSSxDQUFDTCxHQUFHLENBQUNHLFlBQVksQ0FBQ0MsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMvQztJQUNBLElBQUlKLEdBQUcsQ0FBQ00sa0JBQWtCLEVBQUU7TUFDMUJKLGNBQWMsQ0FBQ0csSUFBSSxDQUFDTCxHQUFHLENBQUNNLGtCQUFrQixDQUFDQyxnQkFBZ0IsQ0FBQ25CLElBQUksQ0FBQyxDQUFDO0lBQ3BFLENBQUMsTUFBTSxJQUFJWSxHQUFHLENBQUNRLGVBQWUsRUFBRTtNQUM5QkMsb0JBQVcsQ0FBQ0wsS0FBSyxDQUFDLENBQUM7TUFDbkJGLGNBQWMsQ0FBQ0csSUFBSSxDQUFDTCxHQUFHLENBQUNRLGVBQWUsQ0FBQ0UsZ0JBQWdCLENBQUN0QixJQUFJLENBQUMsQ0FBQztJQUNqRTtJQUNBLE9BQU9JLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDUyxjQUFjLENBQUM7RUFDcEMsQ0FBQyxDQUNILENBQUM7QUFDSCIsImlnbm9yZUxpc3QiOltdfQ==