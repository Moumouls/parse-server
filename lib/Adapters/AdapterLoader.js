"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.loadAdapter = loadAdapter;
exports.loadModule = loadModule;
/**
 * @module AdapterLoader
 */
/**
 * @static
 * Attempt to load an adapter or fallback to the default.
 * @param {Adapter} adapter an adapter
 * @param {Adapter} defaultAdapter the default adapter to load
 * @param {any} options options to pass to the contstructor
 * @returns {Object} the loaded adapter
 */
function loadAdapter(adapter, defaultAdapter, options) {
  if (!adapter) {
    if (!defaultAdapter) {
      return options;
    }
    // Load from the default adapter when no adapter is set
    return loadAdapter(defaultAdapter, undefined, options);
  } else if (typeof adapter === 'function') {
    try {
      return adapter(options);
    } catch (e) {
      if (e.name === 'TypeError') {
        var Adapter = adapter;
        return new Adapter(options);
      } else {
        throw e;
      }
    }
  } else if (typeof adapter === 'string') {
    adapter = require(adapter);
    // If it's define as a module, get the default
    if (adapter.default) {
      adapter = adapter.default;
    }
    return loadAdapter(adapter, undefined, options);
  } else if (adapter.module) {
    return loadAdapter(adapter.module, undefined, adapter.options);
  } else if (adapter.class) {
    return loadAdapter(adapter.class, undefined, adapter.options);
  } else if (adapter.adapter) {
    return loadAdapter(adapter.adapter, undefined, adapter.options);
  }
  // return the adapter as provided
  return adapter;
}
async function loadModule(modulePath) {
  const module = await import(modulePath);
  return module?.default || module;
}
var _default = exports.default = loadAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkQWRhcHRlciIsImFkYXB0ZXIiLCJkZWZhdWx0QWRhcHRlciIsIm9wdGlvbnMiLCJ1bmRlZmluZWQiLCJlIiwibmFtZSIsIkFkYXB0ZXIiLCJyZXF1aXJlIiwiZGVmYXVsdCIsIm1vZHVsZSIsImNsYXNzIiwibG9hZE1vZHVsZSIsIm1vZHVsZVBhdGgiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQWRhcHRlcnMvQWRhcHRlckxvYWRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBtb2R1bGUgQWRhcHRlckxvYWRlclxuICovXG4vKipcbiAqIEBzdGF0aWNcbiAqIEF0dGVtcHQgdG8gbG9hZCBhbiBhZGFwdGVyIG9yIGZhbGxiYWNrIHRvIHRoZSBkZWZhdWx0LlxuICogQHBhcmFtIHtBZGFwdGVyfSBhZGFwdGVyIGFuIGFkYXB0ZXJcbiAqIEBwYXJhbSB7QWRhcHRlcn0gZGVmYXVsdEFkYXB0ZXIgdGhlIGRlZmF1bHQgYWRhcHRlciB0byBsb2FkXG4gKiBAcGFyYW0ge2FueX0gb3B0aW9ucyBvcHRpb25zIHRvIHBhc3MgdG8gdGhlIGNvbnRzdHJ1Y3RvclxuICogQHJldHVybnMge09iamVjdH0gdGhlIGxvYWRlZCBhZGFwdGVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2FkQWRhcHRlcjxUPihhZGFwdGVyLCBkZWZhdWx0QWRhcHRlciwgb3B0aW9ucyk6IFQge1xuICBpZiAoIWFkYXB0ZXIpIHtcbiAgICBpZiAoIWRlZmF1bHRBZGFwdGVyKSB7XG4gICAgICByZXR1cm4gb3B0aW9ucztcbiAgICB9XG4gICAgLy8gTG9hZCBmcm9tIHRoZSBkZWZhdWx0IGFkYXB0ZXIgd2hlbiBubyBhZGFwdGVyIGlzIHNldFxuICAgIHJldHVybiBsb2FkQWRhcHRlcihkZWZhdWx0QWRhcHRlciwgdW5kZWZpbmVkLCBvcHRpb25zKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYWRhcHRlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gYWRhcHRlcihvcHRpb25zKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZS5uYW1lID09PSAnVHlwZUVycm9yJykge1xuICAgICAgICB2YXIgQWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgICAgIHJldHVybiBuZXcgQWRhcHRlcihvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiBhZGFwdGVyID09PSAnc3RyaW5nJykge1xuICAgIGFkYXB0ZXIgPSByZXF1aXJlKGFkYXB0ZXIpO1xuICAgIC8vIElmIGl0J3MgZGVmaW5lIGFzIGEgbW9kdWxlLCBnZXQgdGhlIGRlZmF1bHRcbiAgICBpZiAoYWRhcHRlci5kZWZhdWx0KSB7XG4gICAgICBhZGFwdGVyID0gYWRhcHRlci5kZWZhdWx0O1xuICAgIH1cbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoYWRhcHRlciwgdW5kZWZpbmVkLCBvcHRpb25zKTtcbiAgfSBlbHNlIGlmIChhZGFwdGVyLm1vZHVsZSkge1xuICAgIHJldHVybiBsb2FkQWRhcHRlcihhZGFwdGVyLm1vZHVsZSwgdW5kZWZpbmVkLCBhZGFwdGVyLm9wdGlvbnMpO1xuICB9IGVsc2UgaWYgKGFkYXB0ZXIuY2xhc3MpIHtcbiAgICByZXR1cm4gbG9hZEFkYXB0ZXIoYWRhcHRlci5jbGFzcywgdW5kZWZpbmVkLCBhZGFwdGVyLm9wdGlvbnMpO1xuICB9IGVsc2UgaWYgKGFkYXB0ZXIuYWRhcHRlcikge1xuICAgIHJldHVybiBsb2FkQWRhcHRlcihhZGFwdGVyLmFkYXB0ZXIsIHVuZGVmaW5lZCwgYWRhcHRlci5vcHRpb25zKTtcbiAgfVxuICAvLyByZXR1cm4gdGhlIGFkYXB0ZXIgYXMgcHJvdmlkZWRcbiAgcmV0dXJuIGFkYXB0ZXI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkTW9kdWxlKG1vZHVsZVBhdGgpIHtcbiAgY29uc3QgbW9kdWxlID0gYXdhaXQgaW1wb3J0KG1vZHVsZVBhdGgpO1xuICByZXR1cm4gbW9kdWxlPy5kZWZhdWx0IHx8IG1vZHVsZTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgbG9hZEFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVNBLFdBQVdBLENBQUlDLE9BQU8sRUFBRUMsY0FBYyxFQUFFQyxPQUFPLEVBQUs7RUFDbEUsSUFBSSxDQUFDRixPQUFPLEVBQUU7SUFDWixJQUFJLENBQUNDLGNBQWMsRUFBRTtNQUNuQixPQUFPQyxPQUFPO0lBQ2hCO0lBQ0E7SUFDQSxPQUFPSCxXQUFXLENBQUNFLGNBQWMsRUFBRUUsU0FBUyxFQUFFRCxPQUFPLENBQUM7RUFDeEQsQ0FBQyxNQUFNLElBQUksT0FBT0YsT0FBTyxLQUFLLFVBQVUsRUFBRTtJQUN4QyxJQUFJO01BQ0YsT0FBT0EsT0FBTyxDQUFDRSxPQUFPLENBQUM7SUFDekIsQ0FBQyxDQUFDLE9BQU9FLENBQUMsRUFBRTtNQUNWLElBQUlBLENBQUMsQ0FBQ0MsSUFBSSxLQUFLLFdBQVcsRUFBRTtRQUMxQixJQUFJQyxPQUFPLEdBQUdOLE9BQU87UUFDckIsT0FBTyxJQUFJTSxPQUFPLENBQUNKLE9BQU8sQ0FBQztNQUM3QixDQUFDLE1BQU07UUFDTCxNQUFNRSxDQUFDO01BQ1Q7SUFDRjtFQUNGLENBQUMsTUFBTSxJQUFJLE9BQU9KLE9BQU8sS0FBSyxRQUFRLEVBQUU7SUFDdENBLE9BQU8sR0FBR08sT0FBTyxDQUFDUCxPQUFPLENBQUM7SUFDMUI7SUFDQSxJQUFJQSxPQUFPLENBQUNRLE9BQU8sRUFBRTtNQUNuQlIsT0FBTyxHQUFHQSxPQUFPLENBQUNRLE9BQU87SUFDM0I7SUFDQSxPQUFPVCxXQUFXLENBQUNDLE9BQU8sRUFBRUcsU0FBUyxFQUFFRCxPQUFPLENBQUM7RUFDakQsQ0FBQyxNQUFNLElBQUlGLE9BQU8sQ0FBQ1MsTUFBTSxFQUFFO0lBQ3pCLE9BQU9WLFdBQVcsQ0FBQ0MsT0FBTyxDQUFDUyxNQUFNLEVBQUVOLFNBQVMsRUFBRUgsT0FBTyxDQUFDRSxPQUFPLENBQUM7RUFDaEUsQ0FBQyxNQUFNLElBQUlGLE9BQU8sQ0FBQ1UsS0FBSyxFQUFFO0lBQ3hCLE9BQU9YLFdBQVcsQ0FBQ0MsT0FBTyxDQUFDVSxLQUFLLEVBQUVQLFNBQVMsRUFBRUgsT0FBTyxDQUFDRSxPQUFPLENBQUM7RUFDL0QsQ0FBQyxNQUFNLElBQUlGLE9BQU8sQ0FBQ0EsT0FBTyxFQUFFO0lBQzFCLE9BQU9ELFdBQVcsQ0FBQ0MsT0FBTyxDQUFDQSxPQUFPLEVBQUVHLFNBQVMsRUFBRUgsT0FBTyxDQUFDRSxPQUFPLENBQUM7RUFDakU7RUFDQTtFQUNBLE9BQU9GLE9BQU87QUFDaEI7QUFFTyxlQUFlVyxVQUFVQSxDQUFDQyxVQUFVLEVBQUU7RUFDM0MsTUFBTUgsTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDRyxVQUFVLENBQUM7RUFDdkMsT0FBT0gsTUFBTSxFQUFFRCxPQUFPLElBQUlDLE1BQU07QUFDbEM7QUFBQyxJQUFBSSxRQUFBLEdBQUFDLE9BQUEsQ0FBQU4sT0FBQSxHQUVjVCxXQUFXIiwiaWdub3JlTGlzdCI6W119