"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LRUCache = void 0;
var _lruCache = require("lru-cache");
var _defaults = _interopRequireDefault(require("../../defaults"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class LRUCache {
  constructor({
    ttl = _defaults.default.cacheTTL,
    maxSize = _defaults.default.cacheMaxSize
  }) {
    this.cache = new _lruCache.LRUCache({
      max: maxSize,
      ttl
    });
  }
  get(key) {
    return this.cache.get(key) || null;
  }
  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }
  del(key) {
    this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
}
exports.LRUCache = LRUCache;
var _default = exports.default = LRUCache;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbHJ1Q2FjaGUiLCJyZXF1aXJlIiwiX2RlZmF1bHRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiTFJVQ2FjaGUiLCJjb25zdHJ1Y3RvciIsInR0bCIsImRlZmF1bHRzIiwiY2FjaGVUVEwiLCJtYXhTaXplIiwiY2FjaGVNYXhTaXplIiwiY2FjaGUiLCJMUlUiLCJtYXgiLCJnZXQiLCJrZXkiLCJwdXQiLCJ2YWx1ZSIsInNldCIsImRlbCIsImRlbGV0ZSIsImNsZWFyIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0NhY2hlL0xSVUNhY2hlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IExSVUNhY2hlIGFzIExSVSB9IGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5leHBvcnQgY2xhc3MgTFJVQ2FjaGUge1xuICBjb25zdHJ1Y3Rvcih7IHR0bCA9IGRlZmF1bHRzLmNhY2hlVFRMLCBtYXhTaXplID0gZGVmYXVsdHMuY2FjaGVNYXhTaXplIH0pIHtcbiAgICB0aGlzLmNhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IG1heFNpemUsXG4gICAgICB0dGwsXG4gICAgfSk7XG4gIH1cblxuICBnZXQoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGUuZ2V0KGtleSkgfHwgbnVsbDtcbiAgfVxuXG4gIHB1dChrZXksIHZhbHVlLCB0dGwgPSB0aGlzLnR0bCkge1xuICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgdmFsdWUsIHR0bCk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgdGhpcy5jYWNoZS5kZWxldGUoa2V5KTtcbiAgfVxuXG4gIGNsZWFyKCkge1xuICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMUlVDYWNoZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsU0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQXNDLFNBQUFFLHVCQUFBQyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBRS9CLE1BQU1HLFFBQVEsQ0FBQztFQUNwQkMsV0FBV0EsQ0FBQztJQUFFQyxHQUFHLEdBQUdDLGlCQUFRLENBQUNDLFFBQVE7SUFBRUMsT0FBTyxHQUFHRixpQkFBUSxDQUFDRztFQUFhLENBQUMsRUFBRTtJQUN4RSxJQUFJLENBQUNDLEtBQUssR0FBRyxJQUFJQyxrQkFBRyxDQUFDO01BQ25CQyxHQUFHLEVBQUVKLE9BQU87TUFDWkg7SUFDRixDQUFDLENBQUM7RUFDSjtFQUVBUSxHQUFHQSxDQUFDQyxHQUFHLEVBQUU7SUFDUCxPQUFPLElBQUksQ0FBQ0osS0FBSyxDQUFDRyxHQUFHLENBQUNDLEdBQUcsQ0FBQyxJQUFJLElBQUk7RUFDcEM7RUFFQUMsR0FBR0EsQ0FBQ0QsR0FBRyxFQUFFRSxLQUFLLEVBQUVYLEdBQUcsR0FBRyxJQUFJLENBQUNBLEdBQUcsRUFBRTtJQUM5QixJQUFJLENBQUNLLEtBQUssQ0FBQ08sR0FBRyxDQUFDSCxHQUFHLEVBQUVFLEtBQUssRUFBRVgsR0FBRyxDQUFDO0VBQ2pDO0VBRUFhLEdBQUdBLENBQUNKLEdBQUcsRUFBRTtJQUNQLElBQUksQ0FBQ0osS0FBSyxDQUFDUyxNQUFNLENBQUNMLEdBQUcsQ0FBQztFQUN4QjtFQUVBTSxLQUFLQSxDQUFBLEVBQUc7SUFDTixJQUFJLENBQUNWLEtBQUssQ0FBQ1UsS0FBSyxDQUFDLENBQUM7RUFDcEI7QUFDRjtBQUFDQyxPQUFBLENBQUFsQixRQUFBLEdBQUFBLFFBQUE7QUFBQSxJQUFBbUIsUUFBQSxHQUFBRCxPQUFBLENBQUFuQixPQUFBLEdBRWNDLFFBQVEiLCJpZ25vcmVMaXN0IjpbXX0=