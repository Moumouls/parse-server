"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeSchema = makeSchema;
exports.CLP = void 0;

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// @Typescript 4.1+ // type CLPPermission = 'requiresAuthentication' | '*' |  `user:${string}` | `role:${string}`
class CLP {
  static allow(perms) {
    const out = {};

    for (const [perm, ops] of Object.entries(perms)) {
      for (const op of ops) {
        out[op] = out[op] || {};
        out[op][perm] = true;
      }
    }

    return out;
  }

}

exports.CLP = CLP;

function makeSchema(className, schema) {
  // This function solve two things:
  // 1. It provides auto-completion to the users who are implementing schemas
  // 2. It allows forward-compatible point in order to allow future changes to the internal structure of JSONSchema without affecting all the users
  return _objectSpread({
    className
  }, schema);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL01pZ3JhdGlvbnMuanMiXSwibmFtZXMiOlsiQ0xQIiwiYWxsb3ciLCJwZXJtcyIsIm91dCIsInBlcm0iLCJvcHMiLCJPYmplY3QiLCJlbnRyaWVzIiwib3AiLCJtYWtlU2NoZW1hIiwiY2xhc3NOYW1lIiwic2NoZW1hIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQWlEQTtBQXNCTyxNQUFNQSxHQUFOLENBQVU7QUFDSCxTQUFMQyxLQUFLLENBQUNDLEtBQUQsRUFBK0I7QUFDekMsVUFBTUMsR0FBRyxHQUFHLEVBQVo7O0FBRUEsU0FBSyxNQUFNLENBQUNDLElBQUQsRUFBT0MsR0FBUCxDQUFYLElBQTBCQyxNQUFNLENBQUNDLE9BQVAsQ0FBZUwsS0FBZixDQUExQixFQUFpRDtBQUMvQyxXQUFLLE1BQU1NLEVBQVgsSUFBaUJILEdBQWpCLEVBQXNCO0FBQ3BCRixRQUFBQSxHQUFHLENBQUNLLEVBQUQsQ0FBSCxHQUFVTCxHQUFHLENBQUNLLEVBQUQsQ0FBSCxJQUFXLEVBQXJCO0FBQ0FMLFFBQUFBLEdBQUcsQ0FBQ0ssRUFBRCxDQUFILENBQVFKLElBQVIsSUFBZ0IsSUFBaEI7QUFDRDtBQUNGOztBQUVELFdBQU9ELEdBQVA7QUFDRDs7QUFaYzs7OztBQWVWLFNBQVNNLFVBQVQsQ0FBb0JDLFNBQXBCLEVBQThDQyxNQUE5QyxFQUE4RTtBQUNuRjtBQUNBO0FBQ0E7QUFFQTtBQUNFRCxJQUFBQTtBQURGLEtBRUtDLE1BRkw7QUFJRCIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5cbmV4cG9ydCB0eXBlIEZpZWxkVmFsdWVUeXBlID1cbiAgfCAnU3RyaW5nJ1xuICB8ICdCb29sZWFuJ1xuICB8ICdGaWxlJ1xuICB8ICdOdW1iZXInXG4gIHwgJ1JlbGF0aW9uJ1xuICB8ICdQb2ludGVyJ1xuICB8ICdEYXRlJ1xuICB8ICdHZW9Qb2ludCdcbiAgfCAnUG9seWdvbidcbiAgfCAnQXJyYXknXG4gIHwgJ09iamVjdCdcbiAgfCAnQUNMJztcblxuZXhwb3J0IGludGVyZmFjZSBGaWVsZFR5cGUge1xuICB0eXBlOiBGaWVsZFZhbHVlVHlwZTtcbiAgcmVxdWlyZWQ/OiBib29sZWFuO1xuICBkZWZhdWx0VmFsdWU/OiBtaXhlZDtcbiAgdGFyZ2V0Q2xhc3M/OiBzdHJpbmc7XG59XG5cbnR5cGUgQ2xhc3NOYW1lVHlwZSA9ICdfVXNlcicgfCAnX1JvbGUnIHwgc3RyaW5nO1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb3RlY3RlZEZpZWxkc0ludGVyZmFjZSB7XG4gIFtrZXk6IHN0cmluZ106IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEluZGV4SW50ZXJmYWNlIHtcbiAgW2tleTogc3RyaW5nXTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEluZGV4ZXNJbnRlcmZhY2Uge1xuICBba2V5OiBzdHJpbmddOiBJbmRleEludGVyZmFjZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTY2hlbWFPcHRpb25zIHtcbiAgZGVmaW5pdGlvbnM6IEpTT05TY2hlbWFbXTtcbiAgc3RyaWN0OiA/Ym9vbGVhbjtcbiAgZGVsZXRlRXh0cmFGaWVsZHM6ID9ib29sZWFuO1xuICByZWNyZWF0ZU1vZGlmaWVkRmllbGRzOiA/Ym9vbGVhbjtcbiAgbG9ja1NjaGVtYXM6ID9ib29sZWFuO1xuICAvKiBDYWxsYmFjayB3aGVuIHNlcnZlciBoYXMgc3RhcnRlZCBhbmQgYmVmb3JlIHJ1bm5pbmcgc2NoZW1hcyBtaWdyYXRpb24gb3BlcmF0aW9ucyBpZiBzY2hlbWFzIGtleSBwcm92aWRlZCAqL1xuICBiZWZvcmVNaWdyYXRpb246ID8oKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbiAgYWZ0ZXJNaWdyYXRpb246ID8oKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IHR5cGUgQ0xQT3BlcmF0aW9uID0gJ2ZpbmQnIHwgJ2NvdW50JyB8ICdnZXQnIHwgJ3VwZGF0ZScgfCAnY3JlYXRlJyB8ICdkZWxldGUnO1xuLy8gQFR5cGVzY3JpcHQgNC4xKyAvLyB0eXBlIENMUFBlcm1pc3Npb24gPSAncmVxdWlyZXNBdXRoZW50aWNhdGlvbicgfCAnKicgfCAgYHVzZXI6JHtzdHJpbmd9YCB8IGByb2xlOiR7c3RyaW5nfWBcblxudHlwZSBDTFBWYWx1ZSA9IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9O1xudHlwZSBDTFBEYXRhID0geyBba2V5OiBzdHJpbmddOiBDTFBPcGVyYXRpb25bXSB9O1xudHlwZSBDTFBJbnRlcmZhY2UgPSB7IFtrZXk6IHN0cmluZ106IENMUFZhbHVlIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSlNPTlNjaGVtYSB7XG4gIGNsYXNzTmFtZTogQ2xhc3NOYW1lVHlwZTtcbiAgZmllbGRzPzogeyBba2V5OiBzdHJpbmddOiBGaWVsZFR5cGUgfTtcbiAgaW5kZXhlcz86IEluZGV4ZXNJbnRlcmZhY2U7XG4gIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucz86IHtcbiAgICBmaW5kPzogQ0xQVmFsdWUsXG4gICAgY291bnQ/OiBDTFBWYWx1ZSxcbiAgICBnZXQ/OiBDTFBWYWx1ZSxcbiAgICB1cGRhdGU/OiBDTFBWYWx1ZSxcbiAgICBjcmVhdGU/OiBDTFBWYWx1ZSxcbiAgICBkZWxldGU/OiBDTFBWYWx1ZSxcbiAgICBhZGRGaWVsZD86IENMUFZhbHVlLFxuICAgIHByb3RlY3RlZEZpZWxkcz86IFByb3RlY3RlZEZpZWxkc0ludGVyZmFjZSxcbiAgfTtcbn1cblxuZXhwb3J0IGNsYXNzIENMUCB7XG4gIHN0YXRpYyBhbGxvdyhwZXJtczogQ0xQRGF0YSk6IENMUEludGVyZmFjZSB7XG4gICAgY29uc3Qgb3V0ID0ge307XG5cbiAgICBmb3IgKGNvbnN0IFtwZXJtLCBvcHNdIG9mIE9iamVjdC5lbnRyaWVzKHBlcm1zKSkge1xuICAgICAgZm9yIChjb25zdCBvcCBvZiBvcHMpIHtcbiAgICAgICAgb3V0W29wXSA9IG91dFtvcF0gfHwge307XG4gICAgICAgIG91dFtvcF1bcGVybV0gPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvdXQ7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VTY2hlbWEoY2xhc3NOYW1lOiBDbGFzc05hbWVUeXBlLCBzY2hlbWE6IEpTT05TY2hlbWEpOiBKU09OU2NoZW1hIHtcbiAgLy8gVGhpcyBmdW5jdGlvbiBzb2x2ZSB0d28gdGhpbmdzOlxuICAvLyAxLiBJdCBwcm92aWRlcyBhdXRvLWNvbXBsZXRpb24gdG8gdGhlIHVzZXJzIHdobyBhcmUgaW1wbGVtZW50aW5nIHNjaGVtYXNcbiAgLy8gMi4gSXQgYWxsb3dzIGZvcndhcmQtY29tcGF0aWJsZSBwb2ludCBpbiBvcmRlciB0byBhbGxvdyBmdXR1cmUgY2hhbmdlcyB0byB0aGUgaW50ZXJuYWwgc3RydWN0dXJlIG9mIEpTT05TY2hlbWEgd2l0aG91dCBhZmZlY3RpbmcgYWxsIHRoZSB1c2Vyc1xuXG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lLFxuICAgIC4uLnNjaGVtYSxcbiAgfTtcbn1cbiJdfQ==