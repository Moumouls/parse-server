"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.md5Hash = md5Hash;
exports.newObjectId = newObjectId;
exports.newToken = newToken;
exports.randomHexString = randomHexString;
exports.randomString = randomString;
var _crypto = require("crypto");
// Returns a new random hex string of the given even size.
function randomHexString(size) {
  if (size === 0) {
    throw new Error('Zero-length randomHexString is useless.');
  }
  if (size % 2 !== 0) {
    throw new Error('randomHexString size must be divisible by 2.');
  }
  return (0, _crypto.randomBytes)(size / 2).toString('hex');
}

// Returns a new random alphanumeric string of the given size.
//
// Note: to simplify implementation, the result has slight modulo bias,
// because chars length of 62 doesn't divide the number of all bytes
// (256) evenly. Such bias is acceptable for most cases when the output
// length is long enough and doesn't need to be uniform.
function randomString(size) {
  if (size === 0) {
    throw new Error('Zero-length randomString is useless.');
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz' + '0123456789';
  let objectId = '';
  const bytes = (0, _crypto.randomBytes)(size);
  for (let i = 0; i < bytes.length; ++i) {
    objectId += chars[bytes.readUInt8(i) % chars.length];
  }
  return objectId;
}

// Returns a new random alphanumeric string suitable for object ID.
function newObjectId(size = 10) {
  return randomString(size);
}

// Returns a new random hex string suitable for secure tokens.
function newToken() {
  return randomHexString(32);
}
function md5Hash(string) {
  return (0, _crypto.createHash)('md5').update(string).digest('hex');
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvIiwicmVxdWlyZSIsInJhbmRvbUhleFN0cmluZyIsInNpemUiLCJFcnJvciIsInJhbmRvbUJ5dGVzIiwidG9TdHJpbmciLCJyYW5kb21TdHJpbmciLCJjaGFycyIsIm9iamVjdElkIiwiYnl0ZXMiLCJpIiwibGVuZ3RoIiwicmVhZFVJbnQ4IiwibmV3T2JqZWN0SWQiLCJuZXdUb2tlbiIsIm1kNUhhc2giLCJzdHJpbmciLCJjcmVhdGVIYXNoIiwidXBkYXRlIiwiZGlnZXN0Il0sInNvdXJjZXMiOlsiLi4vc3JjL2NyeXB0b1V0aWxzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qIEBmbG93ICovXG5cbmltcG9ydCB7IHJhbmRvbUJ5dGVzLCBjcmVhdGVIYXNoIH0gZnJvbSAnY3J5cHRvJztcblxuLy8gUmV0dXJucyBhIG5ldyByYW5kb20gaGV4IHN0cmluZyBvZiB0aGUgZ2l2ZW4gZXZlbiBzaXplLlxuZXhwb3J0IGZ1bmN0aW9uIHJhbmRvbUhleFN0cmluZyhzaXplOiBudW1iZXIpOiBzdHJpbmcge1xuICBpZiAoc2l6ZSA9PT0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignWmVyby1sZW5ndGggcmFuZG9tSGV4U3RyaW5nIGlzIHVzZWxlc3MuJyk7XG4gIH1cbiAgaWYgKHNpemUgJSAyICE9PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdyYW5kb21IZXhTdHJpbmcgc2l6ZSBtdXN0IGJlIGRpdmlzaWJsZSBieSAyLicpO1xuICB9XG4gIHJldHVybiByYW5kb21CeXRlcyhzaXplIC8gMikudG9TdHJpbmcoJ2hleCcpO1xufVxuXG4vLyBSZXR1cm5zIGEgbmV3IHJhbmRvbSBhbHBoYW51bWVyaWMgc3RyaW5nIG9mIHRoZSBnaXZlbiBzaXplLlxuLy9cbi8vIE5vdGU6IHRvIHNpbXBsaWZ5IGltcGxlbWVudGF0aW9uLCB0aGUgcmVzdWx0IGhhcyBzbGlnaHQgbW9kdWxvIGJpYXMsXG4vLyBiZWNhdXNlIGNoYXJzIGxlbmd0aCBvZiA2MiBkb2Vzbid0IGRpdmlkZSB0aGUgbnVtYmVyIG9mIGFsbCBieXRlc1xuLy8gKDI1NikgZXZlbmx5LiBTdWNoIGJpYXMgaXMgYWNjZXB0YWJsZSBmb3IgbW9zdCBjYXNlcyB3aGVuIHRoZSBvdXRwdXRcbi8vIGxlbmd0aCBpcyBsb25nIGVub3VnaCBhbmQgZG9lc24ndCBuZWVkIHRvIGJlIHVuaWZvcm0uXG5leHBvcnQgZnVuY3Rpb24gcmFuZG9tU3RyaW5nKHNpemU6IG51bWJlcik6IHN0cmluZyB7XG4gIGlmIChzaXplID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdaZXJvLWxlbmd0aCByYW5kb21TdHJpbmcgaXMgdXNlbGVzcy4nKTtcbiAgfVxuICBjb25zdCBjaGFycyA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWicgKyAnYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXonICsgJzAxMjM0NTY3ODknO1xuICBsZXQgb2JqZWN0SWQgPSAnJztcbiAgY29uc3QgYnl0ZXMgPSByYW5kb21CeXRlcyhzaXplKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7ICsraSkge1xuICAgIG9iamVjdElkICs9IGNoYXJzW2J5dGVzLnJlYWRVSW50OChpKSAlIGNoYXJzLmxlbmd0aF07XG4gIH1cbiAgcmV0dXJuIG9iamVjdElkO1xufVxuXG4vLyBSZXR1cm5zIGEgbmV3IHJhbmRvbSBhbHBoYW51bWVyaWMgc3RyaW5nIHN1aXRhYmxlIGZvciBvYmplY3QgSUQuXG5leHBvcnQgZnVuY3Rpb24gbmV3T2JqZWN0SWQoc2l6ZTogbnVtYmVyID0gMTApOiBzdHJpbmcge1xuICByZXR1cm4gcmFuZG9tU3RyaW5nKHNpemUpO1xufVxuXG4vLyBSZXR1cm5zIGEgbmV3IHJhbmRvbSBoZXggc3RyaW5nIHN1aXRhYmxlIGZvciBzZWN1cmUgdG9rZW5zLlxuZXhwb3J0IGZ1bmN0aW9uIG5ld1Rva2VuKCk6IHN0cmluZyB7XG4gIHJldHVybiByYW5kb21IZXhTdHJpbmcoMzIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWQ1SGFzaChzdHJpbmc6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBjcmVhdGVIYXNoKCdtZDUnKS51cGRhdGUoc3RyaW5nKS5kaWdlc3QoJ2hleCcpO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBRUEsSUFBQUEsT0FBQSxHQUFBQyxPQUFBO0FBRUE7QUFDTyxTQUFTQyxlQUFlQSxDQUFDQyxJQUFZLEVBQVU7RUFDcEQsSUFBSUEsSUFBSSxLQUFLLENBQUMsRUFBRTtJQUNkLE1BQU0sSUFBSUMsS0FBSyxDQUFDLHlDQUF5QyxDQUFDO0VBQzVEO0VBQ0EsSUFBSUQsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUU7SUFDbEIsTUFBTSxJQUFJQyxLQUFLLENBQUMsOENBQThDLENBQUM7RUFDakU7RUFDQSxPQUFPLElBQUFDLG1CQUFXLEVBQUNGLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQ0csUUFBUSxDQUFDLEtBQUssQ0FBQztBQUM5Qzs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxTQUFTQyxZQUFZQSxDQUFDSixJQUFZLEVBQVU7RUFDakQsSUFBSUEsSUFBSSxLQUFLLENBQUMsRUFBRTtJQUNkLE1BQU0sSUFBSUMsS0FBSyxDQUFDLHNDQUFzQyxDQUFDO0VBQ3pEO0VBQ0EsTUFBTUksS0FBSyxHQUFHLDRCQUE0QixHQUFHLDRCQUE0QixHQUFHLFlBQVk7RUFDeEYsSUFBSUMsUUFBUSxHQUFHLEVBQUU7RUFDakIsTUFBTUMsS0FBSyxHQUFHLElBQUFMLG1CQUFXLEVBQUNGLElBQUksQ0FBQztFQUMvQixLQUFLLElBQUlRLENBQUMsR0FBRyxDQUFDLEVBQUVBLENBQUMsR0FBR0QsS0FBSyxDQUFDRSxNQUFNLEVBQUUsRUFBRUQsQ0FBQyxFQUFFO0lBQ3JDRixRQUFRLElBQUlELEtBQUssQ0FBQ0UsS0FBSyxDQUFDRyxTQUFTLENBQUNGLENBQUMsQ0FBQyxHQUFHSCxLQUFLLENBQUNJLE1BQU0sQ0FBQztFQUN0RDtFQUNBLE9BQU9ILFFBQVE7QUFDakI7O0FBRUE7QUFDTyxTQUFTSyxXQUFXQSxDQUFDWCxJQUFZLEdBQUcsRUFBRSxFQUFVO0VBQ3JELE9BQU9JLFlBQVksQ0FBQ0osSUFBSSxDQUFDO0FBQzNCOztBQUVBO0FBQ08sU0FBU1ksUUFBUUEsQ0FBQSxFQUFXO0VBQ2pDLE9BQU9iLGVBQWUsQ0FBQyxFQUFFLENBQUM7QUFDNUI7QUFFTyxTQUFTYyxPQUFPQSxDQUFDQyxNQUFjLEVBQVU7RUFDOUMsT0FBTyxJQUFBQyxrQkFBVSxFQUFDLEtBQUssQ0FBQyxDQUFDQyxNQUFNLENBQUNGLE1BQU0sQ0FBQyxDQUFDRyxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ3ZEIiwiaWdub3JlTGlzdCI6W119