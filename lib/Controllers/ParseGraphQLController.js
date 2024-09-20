"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = void 0;
var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _CacheController = _interopRequireDefault(require("./CacheController"));
const _excluded = ["enabledForClasses", "disabledForClasses", "classConfigs"],
  _excluded2 = ["className", "type", "query", "mutation"],
  _excluded3 = ["inputFields", "outputFields", "constraintFields", "sortFields"],
  _excluded4 = ["field", "asc", "desc"],
  _excluded5 = ["create", "update"],
  _excluded6 = ["find", "get", "findAlias", "getAlias"],
  _excluded7 = ["create", "update", "destroy", "createAlias", "updateAlias", "destroyAlias"];
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var s = Object.getOwnPropertySymbols(e); for (r = 0; r < s.length; r++) o = s[r], t.includes(o) || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.includes(n)) continue; t[n] = r[n]; } return t; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const GraphQLConfigClassName = exports.GraphQLConfigClassName = '_GraphQLConfig';
const GraphQLConfigId = exports.GraphQLConfigId = '1';
const GraphQLConfigKey = exports.GraphQLConfigKey = 'config';
class ParseGraphQLController {
  constructor(params = {}) {
    this.databaseController = params.databaseController || (0, _requiredParameter.default)(`ParseGraphQLController requires a "databaseController" to be instantiated.`);
    this.cacheController = params.cacheController;
    this.isMounted = !!params.mountGraphQL;
    this.configCacheKey = GraphQLConfigKey;
  }
  async getGraphQLConfig() {
    if (this.isMounted) {
      const _cachedConfig = await this._getCachedGraphQLConfig();
      if (_cachedConfig) {
        return _cachedConfig;
      }
    }
    const results = await this.databaseController.find(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, {
      limit: 1
    });
    let graphQLConfig;
    if (results.length != 1) {
      // If there is no config in the database - return empty config.
      return {};
    } else {
      graphQLConfig = results[0][GraphQLConfigKey];
    }
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return graphQLConfig;
  }
  async updateGraphQLConfig(graphQLConfig) {
    // throws if invalid
    this._validateGraphQLConfig(graphQLConfig || (0, _requiredParameter.default)('You must provide a graphQLConfig!'));

    // Transform in dot notation to make sure it works
    const update = Object.keys(graphQLConfig).reduce((acc, key) => {
      return {
        [GraphQLConfigKey]: _objectSpread(_objectSpread({}, acc[GraphQLConfigKey]), {}, {
          [key]: graphQLConfig[key]
        })
      };
    }, {
      [GraphQLConfigKey]: {}
    });
    await this.databaseController.update(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, update, {
      upsert: true
    });
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return {
      response: {
        result: true
      }
    };
  }
  _getCachedGraphQLConfig() {
    return this.cacheController.graphQL.get(this.configCacheKey);
  }
  _putCachedGraphQLConfig(graphQLConfig) {
    return this.cacheController.graphQL.put(this.configCacheKey, graphQLConfig, 60000);
  }
  _validateGraphQLConfig(graphQLConfig) {
    const errorMessages = [];
    if (!graphQLConfig) {
      errorMessages.push('cannot be undefined, null or empty');
    } else if (!isValidSimpleObject(graphQLConfig)) {
      errorMessages.push('must be a valid object');
    } else {
      const {
          enabledForClasses = null,
          disabledForClasses = null,
          classConfigs = null
        } = graphQLConfig,
        invalidKeys = _objectWithoutProperties(graphQLConfig, _excluded);
      if (Object.keys(invalidKeys).length) {
        errorMessages.push(`encountered invalid keys: [${Object.keys(invalidKeys)}]`);
      }
      if (enabledForClasses !== null && !isValidStringArray(enabledForClasses)) {
        errorMessages.push(`"enabledForClasses" is not a valid array`);
      }
      if (disabledForClasses !== null && !isValidStringArray(disabledForClasses)) {
        errorMessages.push(`"disabledForClasses" is not a valid array`);
      }
      if (classConfigs !== null) {
        if (Array.isArray(classConfigs)) {
          classConfigs.forEach(classConfig => {
            const errorMessage = this._validateClassConfig(classConfig);
            if (errorMessage) {
              errorMessages.push(`classConfig:${classConfig.className} is invalid because ${errorMessage}`);
            }
          });
        } else {
          errorMessages.push(`"classConfigs" is not a valid array`);
        }
      }
    }
    if (errorMessages.length) {
      throw new Error(`Invalid graphQLConfig: ${errorMessages.join('; ')}`);
    }
  }
  _validateClassConfig(classConfig) {
    if (!isValidSimpleObject(classConfig)) {
      return 'it must be a valid object';
    } else {
      const {
          className,
          type = null,
          query = null,
          mutation = null
        } = classConfig,
        invalidKeys = _objectWithoutProperties(classConfig, _excluded2);
      if (Object.keys(invalidKeys).length) {
        return `"invalidKeys" [${Object.keys(invalidKeys)}] should not be present`;
      }
      if (typeof className !== 'string' || !className.trim().length) {
        // TODO consider checking class exists in schema?
        return `"className" must be a valid string`;
      }
      if (type !== null) {
        if (!isValidSimpleObject(type)) {
          return `"type" must be a valid object`;
        }
        const {
            inputFields = null,
            outputFields = null,
            constraintFields = null,
            sortFields = null
          } = type,
          invalidKeys = _objectWithoutProperties(type, _excluded3);
        if (Object.keys(invalidKeys).length) {
          return `"type" contains invalid keys, [${Object.keys(invalidKeys)}]`;
        } else if (outputFields !== null && !isValidStringArray(outputFields)) {
          return `"outputFields" must be a valid string array`;
        } else if (constraintFields !== null && !isValidStringArray(constraintFields)) {
          return `"constraintFields" must be a valid string array`;
        }
        if (sortFields !== null) {
          if (Array.isArray(sortFields)) {
            let errorMessage;
            sortFields.every((sortField, index) => {
              if (!isValidSimpleObject(sortField)) {
                errorMessage = `"sortField" at index ${index} is not a valid object`;
                return false;
              } else {
                const {
                    field,
                    asc,
                    desc
                  } = sortField,
                  invalidKeys = _objectWithoutProperties(sortField, _excluded4);
                if (Object.keys(invalidKeys).length) {
                  errorMessage = `"sortField" at index ${index} contains invalid keys, [${Object.keys(invalidKeys)}]`;
                  return false;
                } else {
                  if (typeof field !== 'string' || field.trim().length === 0) {
                    errorMessage = `"sortField" at index ${index} did not provide the "field" as a string`;
                    return false;
                  } else if (typeof asc !== 'boolean' || typeof desc !== 'boolean') {
                    errorMessage = `"sortField" at index ${index} did not provide "asc" or "desc" as booleans`;
                    return false;
                  }
                }
              }
              return true;
            });
            if (errorMessage) {
              return errorMessage;
            }
          } else {
            return `"sortFields" must be a valid array.`;
          }
        }
        if (inputFields !== null) {
          if (isValidSimpleObject(inputFields)) {
            const {
                create = null,
                update = null
              } = inputFields,
              invalidKeys = _objectWithoutProperties(inputFields, _excluded5);
            if (Object.keys(invalidKeys).length) {
              return `"inputFields" contains invalid keys: [${Object.keys(invalidKeys)}]`;
            } else {
              if (update !== null && !isValidStringArray(update)) {
                return `"inputFields.update" must be a valid string array`;
              } else if (create !== null) {
                if (!isValidStringArray(create)) {
                  return `"inputFields.create" must be a valid string array`;
                } else if (className === '_User') {
                  if (!create.includes('username') || !create.includes('password')) {
                    return `"inputFields.create" must include required fields, username and password`;
                  }
                }
              }
            }
          } else {
            return `"inputFields" must be a valid object`;
          }
        }
      }
      if (query !== null) {
        if (isValidSimpleObject(query)) {
          const {
              find = null,
              get = null,
              findAlias = null,
              getAlias = null
            } = query,
            invalidKeys = _objectWithoutProperties(query, _excluded6);
          if (Object.keys(invalidKeys).length) {
            return `"query" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          } else if (find !== null && typeof find !== 'boolean') {
            return `"query.find" must be a boolean`;
          } else if (get !== null && typeof get !== 'boolean') {
            return `"query.get" must be a boolean`;
          } else if (findAlias !== null && typeof findAlias !== 'string') {
            return `"query.findAlias" must be a string`;
          } else if (getAlias !== null && typeof getAlias !== 'string') {
            return `"query.getAlias" must be a string`;
          }
        } else {
          return `"query" must be a valid object`;
        }
      }
      if (mutation !== null) {
        if (isValidSimpleObject(mutation)) {
          const {
              create = null,
              update = null,
              destroy = null,
              createAlias = null,
              updateAlias = null,
              destroyAlias = null
            } = mutation,
            invalidKeys = _objectWithoutProperties(mutation, _excluded7);
          if (Object.keys(invalidKeys).length) {
            return `"mutation" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          }
          if (create !== null && typeof create !== 'boolean') {
            return `"mutation.create" must be a boolean`;
          }
          if (update !== null && typeof update !== 'boolean') {
            return `"mutation.update" must be a boolean`;
          }
          if (destroy !== null && typeof destroy !== 'boolean') {
            return `"mutation.destroy" must be a boolean`;
          }
          if (createAlias !== null && typeof createAlias !== 'string') {
            return `"mutation.createAlias" must be a string`;
          }
          if (updateAlias !== null && typeof updateAlias !== 'string') {
            return `"mutation.updateAlias" must be a string`;
          }
          if (destroyAlias !== null && typeof destroyAlias !== 'string') {
            return `"mutation.destroyAlias" must be a string`;
          }
        } else {
          return `"mutation" must be a valid object`;
        }
      }
    }
  }
}
const isValidStringArray = function (array) {
  return Array.isArray(array) ? !array.some(s => typeof s !== 'string' || s.trim().length < 1) : false;
};
/**
 * Ensures the obj is a simple JSON/{}
 * object, i.e. not an array, null, date
 * etc.
 */
const isValidSimpleObject = function (obj) {
  return typeof obj === 'object' && !Array.isArray(obj) && obj !== null && obj instanceof Date !== true && obj instanceof Promise !== true;
};
var _default = exports.default = ParseGraphQLController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ2FjaGVDb250cm9sbGVyIiwiX2V4Y2x1ZGVkIiwiX2V4Y2x1ZGVkMiIsIl9leGNsdWRlZDMiLCJfZXhjbHVkZWQ0IiwiX2V4Y2x1ZGVkNSIsIl9leGNsdWRlZDYiLCJfZXhjbHVkZWQ3IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwidCIsIm8iLCJyIiwiaSIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllc0xvb3NlIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwicyIsImxlbmd0aCIsImluY2x1ZGVzIiwicHJvcGVydHlJc0VudW1lcmFibGUiLCJjYWxsIiwibiIsImhhc093blByb3BlcnR5Iiwib3duS2V5cyIsImtleXMiLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lIiwiZXhwb3J0cyIsIkdyYXBoUUxDb25maWdJZCIsIkdyYXBoUUxDb25maWdLZXkiLCJQYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJyZXF1aXJlZFBhcmFtZXRlciIsImNhY2hlQ29udHJvbGxlciIsImlzTW91bnRlZCIsIm1vdW50R3JhcGhRTCIsImNvbmZpZ0NhY2hlS2V5IiwiZ2V0R3JhcGhRTENvbmZpZyIsIl9jYWNoZWRDb25maWciLCJfZ2V0Q2FjaGVkR3JhcGhRTENvbmZpZyIsInJlc3VsdHMiLCJmaW5kIiwib2JqZWN0SWQiLCJsaW1pdCIsImdyYXBoUUxDb25maWciLCJfcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyIsInVwZGF0ZUdyYXBoUUxDb25maWciLCJfdmFsaWRhdGVHcmFwaFFMQ29uZmlnIiwidXBkYXRlIiwicmVkdWNlIiwiYWNjIiwia2V5IiwidXBzZXJ0IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJncmFwaFFMIiwiZ2V0IiwicHV0IiwiZXJyb3JNZXNzYWdlcyIsImlzVmFsaWRTaW1wbGVPYmplY3QiLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImNsYXNzQ29uZmlncyIsImludmFsaWRLZXlzIiwiaXNWYWxpZFN0cmluZ0FycmF5IiwiQXJyYXkiLCJpc0FycmF5IiwiY2xhc3NDb25maWciLCJlcnJvck1lc3NhZ2UiLCJfdmFsaWRhdGVDbGFzc0NvbmZpZyIsImNsYXNzTmFtZSIsIkVycm9yIiwiam9pbiIsInR5cGUiLCJxdWVyeSIsIm11dGF0aW9uIiwidHJpbSIsImlucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiY29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJldmVyeSIsInNvcnRGaWVsZCIsImluZGV4IiwiZmllbGQiLCJhc2MiLCJkZXNjIiwiY3JlYXRlIiwiZmluZEFsaWFzIiwiZ2V0QWxpYXMiLCJkZXN0cm95IiwiY3JlYXRlQWxpYXMiLCJ1cGRhdGVBbGlhcyIsImRlc3Ryb3lBbGlhcyIsImFycmF5Iiwic29tZSIsIm9iaiIsIkRhdGUiLCJQcm9taXNlIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vLi4vbGliL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENhY2hlQ29udHJvbGxlciBmcm9tICcuL0NhY2hlQ29udHJvbGxlcic7XG5cbmNvbnN0IEdyYXBoUUxDb25maWdDbGFzc05hbWUgPSAnX0dyYXBoUUxDb25maWcnO1xuY29uc3QgR3JhcGhRTENvbmZpZ0lkID0gJzEnO1xuY29uc3QgR3JhcGhRTENvbmZpZ0tleSA9ICdjb25maWcnO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxDb250cm9sbGVyIHtcbiAgZGF0YWJhc2VDb250cm9sbGVyOiBEYXRhYmFzZUNvbnRyb2xsZXI7XG4gIGNhY2hlQ29udHJvbGxlcjogQ2FjaGVDb250cm9sbGVyO1xuICBpc01vdW50ZWQ6IGJvb2xlYW47XG4gIGNvbmZpZ0NhY2hlS2V5OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGNhY2hlQ29udHJvbGxlcjogQ2FjaGVDb250cm9sbGVyLFxuICAgIH0gPSB7fVxuICApIHtcbiAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMuZGF0YWJhc2VDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcihcbiAgICAgICAgYFBhcnNlR3JhcGhRTENvbnRyb2xsZXIgcmVxdWlyZXMgYSBcImRhdGFiYXNlQ29udHJvbGxlclwiIHRvIGJlIGluc3RhbnRpYXRlZC5gXG4gICAgICApO1xuICAgIHRoaXMuY2FjaGVDb250cm9sbGVyID0gcGFyYW1zLmNhY2hlQ29udHJvbGxlcjtcbiAgICB0aGlzLmlzTW91bnRlZCA9ICEhcGFyYW1zLm1vdW50R3JhcGhRTDtcbiAgICB0aGlzLmNvbmZpZ0NhY2hlS2V5ID0gR3JhcGhRTENvbmZpZ0tleTtcbiAgfVxuXG4gIGFzeW5jIGdldEdyYXBoUUxDb25maWcoKTogUHJvbWlzZTxQYXJzZUdyYXBoUUxDb25maWc+IHtcbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIGNvbnN0IF9jYWNoZWRDb25maWcgPSBhd2FpdCB0aGlzLl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnKCk7XG4gICAgICBpZiAoX2NhY2hlZENvbmZpZykge1xuICAgICAgICByZXR1cm4gX2NhY2hlZENvbmZpZztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIuZmluZChcbiAgICAgIEdyYXBoUUxDb25maWdDbGFzc05hbWUsXG4gICAgICB7IG9iamVjdElkOiBHcmFwaFFMQ29uZmlnSWQgfSxcbiAgICAgIHsgbGltaXQ6IDEgfVxuICAgICk7XG5cbiAgICBsZXQgZ3JhcGhRTENvbmZpZztcbiAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgLy8gSWYgdGhlcmUgaXMgbm8gY29uZmlnIGluIHRoZSBkYXRhYmFzZSAtIHJldHVybiBlbXB0eSBjb25maWcuXG4gICAgICByZXR1cm4ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIGdyYXBoUUxDb25maWcgPSByZXN1bHRzWzBdW0dyYXBoUUxDb25maWdLZXldO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgdGhpcy5fcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZ3JhcGhRTENvbmZpZztcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKTogUHJvbWlzZTxQYXJzZUdyYXBoUUxDb25maWc+IHtcbiAgICAvLyB0aHJvd3MgaWYgaW52YWxpZFxuICAgIHRoaXMuX3ZhbGlkYXRlR3JhcGhRTENvbmZpZyhcbiAgICAgIGdyYXBoUUxDb25maWcgfHwgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBncmFwaFFMQ29uZmlnIScpXG4gICAgKTtcblxuICAgIC8vIFRyYW5zZm9ybSBpbiBkb3Qgbm90YXRpb24gdG8gbWFrZSBzdXJlIGl0IHdvcmtzXG4gICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZ3JhcGhRTENvbmZpZykucmVkdWNlKFxuICAgICAgKGFjYywga2V5KSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgW0dyYXBoUUxDb25maWdLZXldOiB7XG4gICAgICAgICAgICAuLi5hY2NbR3JhcGhRTENvbmZpZ0tleV0sXG4gICAgICAgICAgICBba2V5XTogZ3JhcGhRTENvbmZpZ1trZXldLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgeyBbR3JhcGhRTENvbmZpZ0tleV06IHt9IH1cbiAgICApO1xuXG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIudXBkYXRlKFxuICAgICAgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSxcbiAgICAgIHsgb2JqZWN0SWQ6IEdyYXBoUUxDb25maWdJZCB9LFxuICAgICAgdXBkYXRlLFxuICAgICAgeyB1cHNlcnQ6IHRydWUgfVxuICAgICk7XG5cbiAgICBpZiAodGhpcy5pc01vdW50ZWQpIHtcbiAgICAgIHRoaXMuX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgcmVzdWx0OiB0cnVlIH0gfTtcbiAgfVxuXG4gIF9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnKCkge1xuICAgIHJldHVybiB0aGlzLmNhY2hlQ29udHJvbGxlci5ncmFwaFFMLmdldCh0aGlzLmNvbmZpZ0NhY2hlS2V5KTtcbiAgfVxuXG4gIF9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIHJldHVybiB0aGlzLmNhY2hlQ29udHJvbGxlci5ncmFwaFFMLnB1dCh0aGlzLmNvbmZpZ0NhY2hlS2V5LCBncmFwaFFMQ29uZmlnLCA2MDAwMCk7XG4gIH1cblxuICBfdmFsaWRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcpOiB2b2lkIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2VzOiBzdHJpbmcgPSBbXTtcbiAgICBpZiAoIWdyYXBoUUxDb25maWcpIHtcbiAgICAgIGVycm9yTWVzc2FnZXMucHVzaCgnY2Fubm90IGJlIHVuZGVmaW5lZCwgbnVsbCBvciBlbXB0eScpO1xuICAgIH0gZWxzZSBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QoZ3JhcGhRTENvbmZpZykpIHtcbiAgICAgIGVycm9yTWVzc2FnZXMucHVzaCgnbXVzdCBiZSBhIHZhbGlkIG9iamVjdCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGVuYWJsZWRGb3JDbGFzc2VzID0gbnVsbCxcbiAgICAgICAgZGlzYWJsZWRGb3JDbGFzc2VzID0gbnVsbCxcbiAgICAgICAgY2xhc3NDb25maWdzID0gbnVsbCxcbiAgICAgICAgLi4uaW52YWxpZEtleXNcbiAgICAgIH0gPSBncmFwaFFMQ29uZmlnO1xuXG4gICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYGVuY291bnRlcmVkIGludmFsaWQga2V5czogWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gKTtcbiAgICAgIH1cbiAgICAgIGlmIChlbmFibGVkRm9yQ2xhc3NlcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiZW5hYmxlZEZvckNsYXNzZXNcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgfVxuICAgICAgaWYgKGRpc2FibGVkRm9yQ2xhc3NlcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKGBcImRpc2FibGVkRm9yQ2xhc3Nlc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICB9XG4gICAgICBpZiAoY2xhc3NDb25maWdzICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNsYXNzQ29uZmlncykpIHtcbiAgICAgICAgICBjbGFzc0NvbmZpZ3MuZm9yRWFjaChjbGFzc0NvbmZpZyA9PiB7XG4gICAgICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSB0aGlzLl92YWxpZGF0ZUNsYXNzQ29uZmlnKGNsYXNzQ29uZmlnKTtcbiAgICAgICAgICAgIGlmIChlcnJvck1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKFxuICAgICAgICAgICAgICAgIGBjbGFzc0NvbmZpZzoke2NsYXNzQ29uZmlnLmNsYXNzTmFtZX0gaXMgaW52YWxpZCBiZWNhdXNlICR7ZXJyb3JNZXNzYWdlfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiY2xhc3NDb25maWdzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZXJyb3JNZXNzYWdlcy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBncmFwaFFMQ29uZmlnOiAke2Vycm9yTWVzc2FnZXMuam9pbignOyAnKX1gKTtcbiAgICB9XG4gIH1cblxuICBfdmFsaWRhdGVDbGFzc0NvbmZpZyhjbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKTogc3RyaW5nIHwgdm9pZCB7XG4gICAgaWYgKCFpc1ZhbGlkU2ltcGxlT2JqZWN0KGNsYXNzQ29uZmlnKSkge1xuICAgICAgcmV0dXJuICdpdCBtdXN0IGJlIGEgdmFsaWQgb2JqZWN0JztcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIHR5cGUgPSBudWxsLCBxdWVyeSA9IG51bGwsIG11dGF0aW9uID0gbnVsbCwgLi4uaW52YWxpZEtleXMgfSA9IGNsYXNzQ29uZmlnO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGBcImludmFsaWRLZXlzXCIgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV0gc2hvdWxkIG5vdCBiZSBwcmVzZW50YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgY2xhc3NOYW1lICE9PSAnc3RyaW5nJyB8fCAhY2xhc3NOYW1lLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgLy8gVE9ETyBjb25zaWRlciBjaGVja2luZyBjbGFzcyBleGlzdHMgaW4gc2NoZW1hP1xuICAgICAgICByZXR1cm4gYFwiY2xhc3NOYW1lXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZ2A7XG4gICAgICB9XG4gICAgICBpZiAodHlwZSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICByZXR1cm4gYFwidHlwZVwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBpbnB1dEZpZWxkcyA9IG51bGwsXG4gICAgICAgICAgb3V0cHV0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBjb25zdHJhaW50RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBzb3J0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICB9ID0gdHlwZTtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gYFwidHlwZVwiIGNvbnRhaW5zIGludmFsaWQga2V5cywgWyR7T2JqZWN0LmtleXMoaW52YWxpZEtleXMpfV1gO1xuICAgICAgICB9IGVsc2UgaWYgKG91dHB1dEZpZWxkcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KG91dHB1dEZpZWxkcykpIHtcbiAgICAgICAgICByZXR1cm4gYFwib3V0cHV0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEZpZWxkcyAhPT0gbnVsbCAmJiAhaXNWYWxpZFN0cmluZ0FycmF5KGNvbnN0cmFpbnRGaWVsZHMpKSB7XG4gICAgICAgICAgcmV0dXJuIGBcImNvbnN0cmFpbnRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc29ydEZpZWxkcyAhPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNvcnRGaWVsZHMpKSB7XG4gICAgICAgICAgICBsZXQgZXJyb3JNZXNzYWdlO1xuICAgICAgICAgICAgc29ydEZpZWxkcy5ldmVyeSgoc29ydEZpZWxkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3Qoc29ydEZpZWxkKSkge1xuICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGlzIG5vdCBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgZmllbGQsIGFzYywgZGVzYywgLi4uaW52YWxpZEtleXMgfSA9IHNvcnRGaWVsZDtcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgICAgICAgaW52YWxpZEtleXNcbiAgICAgICAgICAgICAgICAgICl9XWA7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZmllbGQgIT09ICdzdHJpbmcnIHx8IGZpZWxkLnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gZGlkIG5vdCBwcm92aWRlIHRoZSBcImZpZWxkXCIgYXMgYSBzdHJpbmdgO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhc2MgIT09ICdib29sZWFuJyB8fCB0eXBlb2YgZGVzYyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZSA9IGBcInNvcnRGaWVsZFwiIGF0IGluZGV4ICR7aW5kZXh9IGRpZCBub3QgcHJvdmlkZSBcImFzY1wiIG9yIFwiZGVzY1wiIGFzIGJvb2xlYW5zYDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgICByZXR1cm4gZXJyb3JNZXNzYWdlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYFwic29ydEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBhcnJheS5gO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoaW5wdXRGaWVsZHMgIT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChpbnB1dEZpZWxkcykpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgY3JlYXRlID0gbnVsbCwgdXBkYXRlID0gbnVsbCwgLi4uaW52YWxpZEtleXMgfSA9IGlucHV0RmllbGRzO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGludmFsaWRLZXlzKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzXCIgY29udGFpbnMgaW52YWxpZCBrZXlzOiBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkodXBkYXRlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy51cGRhdGVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjcmVhdGUgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRTdHJpbmdBcnJheShjcmVhdGUpKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMuY3JlYXRlXCIgbXVzdCBiZSBhIHZhbGlkIHN0cmluZyBhcnJheWA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghY3JlYXRlLmluY2x1ZGVzKCd1c2VybmFtZScpIHx8ICFjcmVhdGUuaW5jbHVkZXMoJ3Bhc3N3b3JkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLmNyZWF0ZVwiIG11c3QgaW5jbHVkZSByZXF1aXJlZCBmaWVsZHMsIHVzZXJuYW1lIGFuZCBwYXNzd29yZGA7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHF1ZXJ5ICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KHF1ZXJ5KSkge1xuICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIGZpbmQgPSBudWxsLFxuICAgICAgICAgICAgZ2V0ID0gbnVsbCxcbiAgICAgICAgICAgIGZpbmRBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICBnZXRBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBxdWVyeTtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5XCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgICAgfSBlbHNlIGlmIChmaW5kICE9PSBudWxsICYmIHR5cGVvZiBmaW5kICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJxdWVyeS5maW5kXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0ICE9PSBudWxsICYmIHR5cGVvZiBnZXQgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmdldFwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpbmRBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZmluZEFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmZpbmRBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0QWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGdldEFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmdldEFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJxdWVyeVwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobXV0YXRpb24gIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QobXV0YXRpb24pKSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgY3JlYXRlID0gbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZSA9IG51bGwsXG4gICAgICAgICAgICBkZXN0cm95ID0gbnVsbCxcbiAgICAgICAgICAgIGNyZWF0ZUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIGRlc3Ryb3lBbGlhcyA9IG51bGwsXG4gICAgICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgICAgIH0gPSBtdXRhdGlvbjtcbiAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uXCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGUgIT09IG51bGwgJiYgdHlwZW9mIGNyZWF0ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodXBkYXRlICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGUgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLnVwZGF0ZVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRlc3Ryb3kgIT09IG51bGwgJiYgdHlwZW9mIGRlc3Ryb3kgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLmRlc3Ryb3lcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChjcmVhdGVBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgY3JlYXRlQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uY3JlYXRlQWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHVwZGF0ZUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiB1cGRhdGVBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi51cGRhdGVBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVzdHJveUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBkZXN0cm95QWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uZGVzdHJveUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvblwiIG11c3QgYmUgYSB2YWxpZCBvYmplY3RgO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGlzVmFsaWRTdHJpbmdBcnJheSA9IGZ1bmN0aW9uIChhcnJheSk6IGJvb2xlYW4ge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcnJheSlcbiAgICA/ICFhcnJheS5zb21lKHMgPT4gdHlwZW9mIHMgIT09ICdzdHJpbmcnIHx8IHMudHJpbSgpLmxlbmd0aCA8IDEpXG4gICAgOiBmYWxzZTtcbn07XG4vKipcbiAqIEVuc3VyZXMgdGhlIG9iaiBpcyBhIHNpbXBsZSBKU09OL3t9XG4gKiBvYmplY3QsIGkuZS4gbm90IGFuIGFycmF5LCBudWxsLCBkYXRlXG4gKiBldGMuXG4gKi9cbmNvbnN0IGlzVmFsaWRTaW1wbGVPYmplY3QgPSBmdW5jdGlvbiAob2JqKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcbiAgICAhQXJyYXkuaXNBcnJheShvYmopICYmXG4gICAgb2JqICE9PSBudWxsICYmXG4gICAgb2JqIGluc3RhbmNlb2YgRGF0ZSAhPT0gdHJ1ZSAmJlxuICAgIG9iaiBpbnN0YW5jZW9mIFByb21pc2UgIT09IHRydWVcbiAgKTtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VHcmFwaFFMQ29uZmlnIHtcbiAgZW5hYmxlZEZvckNsYXNzZXM/OiBzdHJpbmdbXTtcbiAgZGlzYWJsZWRGb3JDbGFzc2VzPzogc3RyaW5nW107XG4gIGNsYXNzQ29uZmlncz86IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcge1xuICBjbGFzc05hbWU6IHN0cmluZztcbiAgLyogVGhlIGB0eXBlYCBvYmplY3QgY29udGFpbnMgb3B0aW9ucyBmb3IgaG93IHRoZSBjbGFzcyB0eXBlcyBhcmUgZ2VuZXJhdGVkICovXG4gIHR5cGU6ID97XG4gICAgLyogRmllbGRzIHRoYXQgYXJlIGFsbG93ZWQgd2hlbiBjcmVhdGluZyBvciB1cGRhdGluZyBhbiBvYmplY3QuICovXG4gICAgaW5wdXRGaWVsZHM6ID97XG4gICAgICAvKiBMZWF2ZSBibGFuayB0byBhbGxvdyBhbGwgYXZhaWxhYmxlIGZpZWxkcyBpbiB0aGUgc2NoZW1hLiAqL1xuICAgICAgY3JlYXRlPzogc3RyaW5nW10sXG4gICAgICB1cGRhdGU/OiBzdHJpbmdbXSxcbiAgICB9LFxuICAgIC8qIEZpZWxkcyBvbiB0aGUgZWRnZXMgdGhhdCBjYW4gYmUgcmVzb2x2ZWQgZnJvbSBhIHF1ZXJ5LCBpLmUuIHRoZSBSZXN1bHQgVHlwZS4gKi9cbiAgICBvdXRwdXRGaWVsZHM6ID8oc3RyaW5nW10pLFxuICAgIC8qIEZpZWxkcyBieSB3aGljaCBhIHF1ZXJ5IGNhbiBiZSBmaWx0ZXJlZCwgaS5lLiB0aGUgYHdoZXJlYCBvYmplY3QuICovXG4gICAgY29uc3RyYWludEZpZWxkczogPyhzdHJpbmdbXSksXG4gICAgLyogRmllbGRzIGJ5IHdoaWNoIGEgcXVlcnkgY2FuIGJlIHNvcnRlZDsgKi9cbiAgICBzb3J0RmllbGRzOiA/KHtcbiAgICAgIGZpZWxkOiBzdHJpbmcsXG4gICAgICBhc2M6IGJvb2xlYW4sXG4gICAgICBkZXNjOiBib29sZWFuLFxuICAgIH1bXSksXG4gIH07XG4gIC8qIFRoZSBgcXVlcnlgIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciB3aGljaCBjbGFzcyBxdWVyaWVzIGFyZSBnZW5lcmF0ZWQgKi9cbiAgcXVlcnk6ID97XG4gICAgZ2V0OiA/Ym9vbGVhbixcbiAgICBmaW5kOiA/Ym9vbGVhbixcbiAgICBmaW5kQWxpYXM6ID9TdHJpbmcsXG4gICAgZ2V0QWxpYXM6ID9TdHJpbmcsXG4gIH07XG4gIC8qIFRoZSBgbXV0YXRpb25gIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciB3aGljaCBjbGFzcyBtdXRhdGlvbnMgYXJlIGdlbmVyYXRlZCAqL1xuICBtdXRhdGlvbjogP3tcbiAgICBjcmVhdGU6ID9ib29sZWFuLFxuICAgIHVwZGF0ZTogP2Jvb2xlYW4sXG4gICAgLy8gZGVsZXRlIGlzIGEgcmVzZXJ2ZWQga2V5IHdvcmQgaW4ganNcbiAgICBkZXN0cm95OiA/Ym9vbGVhbixcbiAgICBjcmVhdGVBbGlhczogP1N0cmluZyxcbiAgICB1cGRhdGVBbGlhczogP1N0cmluZyxcbiAgICBkZXN0cm95QWxpYXM6ID9TdHJpbmcsXG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG5leHBvcnQgeyBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLCBHcmFwaFFMQ29uZmlnSWQsIEdyYXBoUUxDb25maWdLZXkgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsa0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLG1CQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxnQkFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQWdELE1BQUFHLFNBQUE7RUFBQUMsVUFBQTtFQUFBQyxVQUFBO0VBQUFDLFVBQUE7RUFBQUMsVUFBQTtFQUFBQyxVQUFBO0VBQUFDLFVBQUE7QUFBQSxTQUFBVix1QkFBQVcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUFBLFNBQUFHLHlCQUFBSCxDQUFBLEVBQUFJLENBQUEsZ0JBQUFKLENBQUEsaUJBQUFLLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLEdBQUFDLDZCQUFBLENBQUFSLENBQUEsRUFBQUksQ0FBQSxPQUFBSyxNQUFBLENBQUFDLHFCQUFBLFFBQUFDLENBQUEsR0FBQUYsTUFBQSxDQUFBQyxxQkFBQSxDQUFBVixDQUFBLFFBQUFNLENBQUEsTUFBQUEsQ0FBQSxHQUFBSyxDQUFBLENBQUFDLE1BQUEs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LElBQUksQ0FBQzhELFdBQVcsQ0FBQyxHQUFHO1VBQzFFO1VBQ0EsSUFBSXdCLE1BQU0sS0FBSyxJQUFJLElBQUksT0FBT0EsTUFBTSxLQUFLLFNBQVMsRUFBRTtZQUNsRCxPQUFPLHFDQUFxQztVQUM5QztVQUNBLElBQUl2QyxNQUFNLEtBQUssSUFBSSxJQUFJLE9BQU9BLE1BQU0sS0FBSyxTQUFTLEVBQUU7WUFDbEQsT0FBTyxxQ0FBcUM7VUFDOUM7VUFDQSxJQUFJMEMsT0FBTyxLQUFLLElBQUksSUFBSSxPQUFPQSxPQUFPLEtBQUssU0FBUyxFQUFFO1lBQ3BELE9BQU8sc0NBQXNDO1VBQy9DO1VBQ0EsSUFBSUMsV0FBVyxLQUFLLElBQUksSUFBSSxPQUFPQSxXQUFXLEtBQUssUUFBUSxFQUFFO1lBQzNELE9BQU8seUNBQXlDO1VBQ2xEO1VBQ0EsSUFBSUMsV0FBVyxLQUFLLElBQUksSUFBSSxPQUFPQSxXQUFXLEtBQUssUUFBUSxFQUFFO1lBQzNELE9BQU8seUNBQXlDO1VBQ2xEO1VBQ0EsSUFBSUMsWUFBWSxLQUFLLElBQUksSUFBSSxPQUFPQSxZQUFZLEtBQUssUUFBUSxFQUFFO1lBQzdELE9BQU8sMENBQTBDO1VBQ25EO1FBQ0YsQ0FBQyxNQUFNO1VBQ0wsT0FBTyxtQ0FBbUM7UUFDNUM7TUFDRjtJQUNGO0VBQ0Y7QUFDRjtBQUVBLE1BQU03QixrQkFBa0IsR0FBRyxTQUFBQSxDQUFVOEIsS0FBSyxFQUFXO0VBQ25ELE9BQU83QixLQUFLLENBQUNDLE9BQU8sQ0FBQzRCLEtBQUssQ0FBQyxHQUN2QixDQUFDQSxLQUFLLENBQUNDLElBQUksQ0FBQ3RHLENBQUMsSUFBSSxPQUFPQSxDQUFDLEtBQUssUUFBUSxJQUFJQSxDQUFDLENBQUNtRixJQUFJLENBQUMsQ0FBQyxDQUFDbEYsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUM5RCxLQUFLO0FBQ1gsQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNaUUsbUJBQW1CLEdBQUcsU0FBQUEsQ0FBVXFDLEdBQUcsRUFBVztFQUNsRCxPQUNFLE9BQU9BLEdBQUcsS0FBSyxRQUFRLElBQ3ZCLENBQUMvQixLQUFLLENBQUNDLE9BQU8sQ0FBQzhCLEdBQUcsQ0FBQyxJQUNuQkEsR0FBRyxLQUFLLElBQUksSUFDWkEsR0FBRyxZQUFZQyxJQUFJLEtBQUssSUFBSSxJQUM1QkQsR0FBRyxZQUFZRSxPQUFPLEtBQUssSUFBSTtBQUVuQyxDQUFDO0FBQUMsSUFBQUMsUUFBQSxHQUFBMUUsT0FBQSxDQUFBekMsT0FBQSxHQWdEYTRDLHNCQUFzQiIsImlnbm9yZUxpc3QiOltdfQ==