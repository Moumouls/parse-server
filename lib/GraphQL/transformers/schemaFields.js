"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformToParse = exports.transformToGraphQL = void 0;
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const transformToParse = (graphQLSchemaFields, existingFields) => {
  if (!graphQLSchemaFields) {
    return {};
  }
  let parseSchemaFields = {};
  const reducerGenerator = type => (parseSchemaFields, field) => {
    if (type === 'Remove') {
      if (existingFields[field.name]) {
        return _objectSpread(_objectSpread({}, parseSchemaFields), {}, {
          [field.name]: {
            __op: 'Delete'
          }
        });
      } else {
        return parseSchemaFields;
      }
    }
    if (graphQLSchemaFields.remove && graphQLSchemaFields.remove.find(removeField => removeField.name === field.name)) {
      return parseSchemaFields;
    }
    if (parseSchemaFields[field.name] || existingFields && existingFields[field.name]) {
      throw new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, `Duplicated field name: ${field.name}`);
    }
    if (type === 'Relation' || type === 'Pointer') {
      return _objectSpread(_objectSpread({}, parseSchemaFields), {}, {
        [field.name]: {
          type,
          targetClass: field.targetClassName
        }
      });
    }
    return _objectSpread(_objectSpread({}, parseSchemaFields), {}, {
      [field.name]: {
        type
      }
    });
  };
  if (graphQLSchemaFields.addStrings) {
    parseSchemaFields = graphQLSchemaFields.addStrings.reduce(reducerGenerator('String'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addNumbers) {
    parseSchemaFields = graphQLSchemaFields.addNumbers.reduce(reducerGenerator('Number'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addBooleans) {
    parseSchemaFields = graphQLSchemaFields.addBooleans.reduce(reducerGenerator('Boolean'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addArrays) {
    parseSchemaFields = graphQLSchemaFields.addArrays.reduce(reducerGenerator('Array'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addObjects) {
    parseSchemaFields = graphQLSchemaFields.addObjects.reduce(reducerGenerator('Object'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addDates) {
    parseSchemaFields = graphQLSchemaFields.addDates.reduce(reducerGenerator('Date'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addFiles) {
    parseSchemaFields = graphQLSchemaFields.addFiles.reduce(reducerGenerator('File'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addGeoPoint) {
    parseSchemaFields = [graphQLSchemaFields.addGeoPoint].reduce(reducerGenerator('GeoPoint'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addPolygons) {
    parseSchemaFields = graphQLSchemaFields.addPolygons.reduce(reducerGenerator('Polygon'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addBytes) {
    parseSchemaFields = graphQLSchemaFields.addBytes.reduce(reducerGenerator('Bytes'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addPointers) {
    parseSchemaFields = graphQLSchemaFields.addPointers.reduce(reducerGenerator('Pointer'), parseSchemaFields);
  }
  if (graphQLSchemaFields.addRelations) {
    parseSchemaFields = graphQLSchemaFields.addRelations.reduce(reducerGenerator('Relation'), parseSchemaFields);
  }
  if (existingFields && graphQLSchemaFields.remove) {
    parseSchemaFields = graphQLSchemaFields.remove.reduce(reducerGenerator('Remove'), parseSchemaFields);
  }
  return parseSchemaFields;
};
exports.transformToParse = transformToParse;
const transformToGraphQL = parseSchemaFields => {
  return Object.keys(parseSchemaFields).map(name => ({
    name,
    type: parseSchemaFields[name].type,
    targetClassName: parseSchemaFields[name].targetClass
  }));
};
exports.transformToGraphQL = transformToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsInRyYW5zZm9ybVRvUGFyc2UiLCJncmFwaFFMU2NoZW1hRmllbGRzIiwiZXhpc3RpbmdGaWVsZHMiLCJwYXJzZVNjaGVtYUZpZWxkcyIsInJlZHVjZXJHZW5lcmF0b3IiLCJ0eXBlIiwiZmllbGQiLCJuYW1lIiwiX19vcCIsInJlbW92ZSIsImZpbmQiLCJyZW1vdmVGaWVsZCIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX0tFWV9OQU1FIiwidGFyZ2V0Q2xhc3MiLCJ0YXJnZXRDbGFzc05hbWUiLCJhZGRTdHJpbmdzIiwicmVkdWNlIiwiYWRkTnVtYmVycyIsImFkZEJvb2xlYW5zIiwiYWRkQXJyYXlzIiwiYWRkT2JqZWN0cyIsImFkZERhdGVzIiwiYWRkRmlsZXMiLCJhZGRHZW9Qb2ludCIsImFkZFBvbHlnb25zIiwiYWRkQnl0ZXMiLCJhZGRQb2ludGVycyIsImFkZFJlbGF0aW9ucyIsImV4cG9ydHMiLCJ0cmFuc2Zvcm1Ub0dyYXBoUUwiLCJtYXAiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC90cmFuc2Zvcm1lcnMvc2NoZW1hRmllbGRzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuY29uc3QgdHJhbnNmb3JtVG9QYXJzZSA9IChncmFwaFFMU2NoZW1hRmllbGRzLCBleGlzdGluZ0ZpZWxkcykgPT4ge1xuICBpZiAoIWdyYXBoUUxTY2hlbWFGaWVsZHMpIHtcbiAgICByZXR1cm4ge307XG4gIH1cblxuICBsZXQgcGFyc2VTY2hlbWFGaWVsZHMgPSB7fTtcblxuICBjb25zdCByZWR1Y2VyR2VuZXJhdG9yID0gdHlwZSA9PiAocGFyc2VTY2hlbWFGaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgaWYgKHR5cGUgPT09ICdSZW1vdmUnKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZHNbZmllbGQubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5wYXJzZVNjaGVtYUZpZWxkcyxcbiAgICAgICAgICBbZmllbGQubmFtZV06IHtcbiAgICAgICAgICAgIF9fb3A6ICdEZWxldGUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gcGFyc2VTY2hlbWFGaWVsZHM7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChcbiAgICAgIGdyYXBoUUxTY2hlbWFGaWVsZHMucmVtb3ZlICYmXG4gICAgICBncmFwaFFMU2NoZW1hRmllbGRzLnJlbW92ZS5maW5kKHJlbW92ZUZpZWxkID0+IHJlbW92ZUZpZWxkLm5hbWUgPT09IGZpZWxkLm5hbWUpXG4gICAgKSB7XG4gICAgICByZXR1cm4gcGFyc2VTY2hlbWFGaWVsZHM7XG4gICAgfVxuICAgIGlmIChwYXJzZVNjaGVtYUZpZWxkc1tmaWVsZC5uYW1lXSB8fCAoZXhpc3RpbmdGaWVsZHMgJiYgZXhpc3RpbmdGaWVsZHNbZmllbGQubmFtZV0pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYER1cGxpY2F0ZWQgZmllbGQgbmFtZTogJHtmaWVsZC5uYW1lfWApO1xuICAgIH1cbiAgICBpZiAodHlwZSA9PT0gJ1JlbGF0aW9uJyB8fCB0eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLnBhcnNlU2NoZW1hRmllbGRzLFxuICAgICAgICBbZmllbGQubmFtZV06IHtcbiAgICAgICAgICB0eXBlLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzc05hbWUsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgLi4ucGFyc2VTY2hlbWFGaWVsZHMsXG4gICAgICBbZmllbGQubmFtZV06IHtcbiAgICAgICAgdHlwZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfTtcblxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRTdHJpbmdzKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZFN0cmluZ3MucmVkdWNlKFxuICAgICAgcmVkdWNlckdlbmVyYXRvcignU3RyaW5nJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkTnVtYmVycykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGROdW1iZXJzLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ051bWJlcicpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZEJvb2xlYW5zKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZEJvb2xlYW5zLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ0Jvb2xlYW4nKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRBcnJheXMpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkQXJyYXlzLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ0FycmF5JyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkT2JqZWN0cykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRPYmplY3RzLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ09iamVjdCcpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZERhdGVzKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZERhdGVzLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ0RhdGUnKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRGaWxlcykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRGaWxlcy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdGaWxlJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkR2VvUG9pbnQpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IFtncmFwaFFMU2NoZW1hRmllbGRzLmFkZEdlb1BvaW50XS5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdHZW9Qb2ludCcpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZFBvbHlnb25zKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZFBvbHlnb25zLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ1BvbHlnb24nKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRCeXRlcykge1xuICAgIHBhcnNlU2NoZW1hRmllbGRzID0gZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRCeXRlcy5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdCeXRlcycpLFxuICAgICAgcGFyc2VTY2hlbWFGaWVsZHNcbiAgICApO1xuICB9XG4gIGlmIChncmFwaFFMU2NoZW1hRmllbGRzLmFkZFBvaW50ZXJzKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLmFkZFBvaW50ZXJzLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ1BvaW50ZXInKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuICBpZiAoZ3JhcGhRTFNjaGVtYUZpZWxkcy5hZGRSZWxhdGlvbnMpIHtcbiAgICBwYXJzZVNjaGVtYUZpZWxkcyA9IGdyYXBoUUxTY2hlbWFGaWVsZHMuYWRkUmVsYXRpb25zLnJlZHVjZShcbiAgICAgIHJlZHVjZXJHZW5lcmF0b3IoJ1JlbGF0aW9uJyksXG4gICAgICBwYXJzZVNjaGVtYUZpZWxkc1xuICAgICk7XG4gIH1cbiAgaWYgKGV4aXN0aW5nRmllbGRzICYmIGdyYXBoUUxTY2hlbWFGaWVsZHMucmVtb3ZlKSB7XG4gICAgcGFyc2VTY2hlbWFGaWVsZHMgPSBncmFwaFFMU2NoZW1hRmllbGRzLnJlbW92ZS5yZWR1Y2UoXG4gICAgICByZWR1Y2VyR2VuZXJhdG9yKCdSZW1vdmUnKSxcbiAgICAgIHBhcnNlU2NoZW1hRmllbGRzXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBwYXJzZVNjaGVtYUZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVRvR3JhcGhRTCA9IHBhcnNlU2NoZW1hRmllbGRzID0+IHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKHBhcnNlU2NoZW1hRmllbGRzKS5tYXAobmFtZSA9PiAoe1xuICAgIG5hbWUsXG4gICAgdHlwZTogcGFyc2VTY2hlbWFGaWVsZHNbbmFtZV0udHlwZSxcbiAgICB0YXJnZXRDbGFzc05hbWU6IHBhcnNlU2NoZW1hRmllbGRzW25hbWVdLnRhcmdldENsYXNzLFxuICB9KSk7XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1Ub1BhcnNlLCB0cmFuc2Zvcm1Ub0dyYXBoUUwgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFELHVCQUFBRSxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsQ0FBQSxFQUFBQyxDQUFBLFFBQUFDLENBQUEsR0FBQUMsTUFBQSxDQUFBQyxJQUFBLENBQUFKLENBQUEsT0FBQUcsTUFBQSxDQUFBRSxxQkFBQSxRQUFBQyxDQUFBLEdBQUFILE1BQUEsQ0FBQUUscUJBQUEsQ0FBQUwsQ0FBQSxHQUFBQyxDQUFBLEtBQUFLLENBQUEsR0FBQUEsQ0FBQSxDQUFBQyxNQUFBLFdBQUFOLENBQUEsV0FBQUUsTUFBQSxDQUFBSyx3QkFBQSxDQUFBUixDQUFBLEVBQUFDLENBQUEsRUFBQVEsVUFBQSxPQUFBUCxDQUFBLENBQUFRLElBQUEsQ0FBQUMsS0FBQSxDQUFBVCxDQUFBLEVBQUFJLENBQUEsWUFBQUosQ0FBQTtBQUFBLFNBQUFVLGNBQUFaLENBQUEsYUFBQUMsQ0FBQSxNQUFBQSxDQUFBLEdBQUFZ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