"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _graphql = require("graphql");
var _schema = require("@graphql-tools/schema");
var _merge = require("@graphql-tools/merge");
var _util = require("util");
var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./loaders/defaultGraphQLTypes"));
var parseClassTypes = _interopRequireWildcard(require("./loaders/parseClassTypes"));
var parseClassQueries = _interopRequireWildcard(require("./loaders/parseClassQueries"));
var parseClassMutations = _interopRequireWildcard(require("./loaders/parseClassMutations"));
var defaultGraphQLQueries = _interopRequireWildcard(require("./loaders/defaultGraphQLQueries"));
var defaultGraphQLMutations = _interopRequireWildcard(require("./loaders/defaultGraphQLMutations"));
var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));
var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _parseGraphQLUtils = require("./parseGraphQLUtils");
var schemaDirectives = _interopRequireWildcard(require("./loaders/schemaDirectives"));
var schemaTypes = _interopRequireWildcard(require("./loaders/schemaTypes"));
var _triggers = require("../triggers");
var defaultRelaySchema = _interopRequireWildcard(require("./loaders/defaultRelaySchema"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const RESERVED_GRAPHQL_TYPE_NAMES = ['String', 'Boolean', 'Int', 'Float', 'ID', 'ArrayResult', 'Query', 'Mutation', 'Subscription', 'CreateFileInput', 'CreateFilePayload', 'Viewer', 'SignUpInput', 'SignUpPayload', 'LogInInput', 'LogInPayload', 'LogOutInput', 'LogOutPayload', 'CloudCodeFunction', 'CallCloudCodeInput', 'CallCloudCodePayload', 'CreateClassInput', 'CreateClassPayload', 'UpdateClassInput', 'UpdateClassPayload', 'DeleteClassInput', 'DeleteClassPayload', 'PageInfo'];
const RESERVED_GRAPHQL_QUERY_NAMES = ['health', 'viewer', 'class', 'classes'];
const RESERVED_GRAPHQL_MUTATION_NAMES = ['signUp', 'logIn', 'logOut', 'createFile', 'callCloudCode', 'createClass', 'updateClass', 'deleteClass'];
class ParseGraphQLSchema {
  constructor(params = {}) {
    this.parseGraphQLController = params.parseGraphQLController || (0, _requiredParameter.default)('You must provide a parseGraphQLController instance!');
    this.databaseController = params.databaseController || (0, _requiredParameter.default)('You must provide a databaseController instance!');
    this.log = params.log || (0, _requiredParameter.default)('You must provide a log instance!');
    this.graphQLCustomTypeDefs = params.graphQLCustomTypeDefs;
    this.appId = params.appId || (0, _requiredParameter.default)('You must provide the appId!');
    this.schemaCache = _SchemaCache.default;
    this.logCache = {};
  }
  async load() {
    const {
      parseGraphQLConfig
    } = await this._initializeSchemaAndConfig();
    const parseClassesArray = await this._getClassesForSchema(parseGraphQLConfig);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = functionNames.join();
    const parseClasses = parseClassesArray.reduce((acc, clazz) => {
      acc[clazz.className] = clazz;
      return acc;
    }, {});
    if (!this._hasSchemaInputChanged({
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    })) {
      return this.graphQLSchema;
    }
    this.parseClasses = parseClasses;
    this.parseGraphQLConfig = parseGraphQLConfig;
    this.functionNames = functionNames;
    this.functionNamesString = functionNamesString;
    this.parseClassTypes = {};
    this.viewerType = null;
    this.graphQLAutoSchema = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLQueries = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};
    this.graphQLSchemaDirectivesDefinitions = null;
    this.graphQLSchemaDirectives = {};
    this.relayNodeInterface = null;
    defaultGraphQLTypes.load(this);
    defaultRelaySchema.load(this);
    schemaTypes.load(this);
    this._getParseClassesWithConfig(parseClassesArray, parseGraphQLConfig).forEach(([parseClass, parseClassConfig]) => {
      // Some times schema return the _auth_data_ field
      // it will lead to unstable graphql generation order
      if (parseClass.className === '_User') {
        Object.keys(parseClass.fields).forEach(fieldName => {
          if (fieldName.startsWith('_auth_data_')) {
            delete parseClass.fields[fieldName];
          }
        });
      }

      // Fields order inside the schema seems to not be consistent across
      // restart so we need to ensure an alphabetical order
      // also it's better for the playground documentation
      const orderedFields = {};
      Object.keys(parseClass.fields).sort().forEach(fieldName => {
        orderedFields[fieldName] = parseClass.fields[fieldName];
      });
      parseClass.fields = orderedFields;
      parseClassTypes.load(this, parseClass, parseClassConfig);
      parseClassQueries.load(this, parseClass, parseClassConfig);
      parseClassMutations.load(this, parseClass, parseClassConfig);
    });
    defaultGraphQLTypes.loadArrayResult(this, parseClassesArray);
    defaultGraphQLQueries.load(this);
    defaultGraphQLMutations.load(this);
    let graphQLQuery = undefined;
    if (Object.keys(this.graphQLQueries).length > 0) {
      graphQLQuery = new _graphql.GraphQLObjectType({
        name: 'Query',
        description: 'Query is the top level type for queries.',
        fields: this.graphQLQueries
      });
      this.addGraphQLType(graphQLQuery, true, true);
    }
    let graphQLMutation = undefined;
    if (Object.keys(this.graphQLMutations).length > 0) {
      graphQLMutation = new _graphql.GraphQLObjectType({
        name: 'Mutation',
        description: 'Mutation is the top level type for mutations.',
        fields: this.graphQLMutations
      });
      this.addGraphQLType(graphQLMutation, true, true);
    }
    let graphQLSubscription = undefined;
    if (Object.keys(this.graphQLSubscriptions).length > 0) {
      graphQLSubscription = new _graphql.GraphQLObjectType({
        name: 'Subscription',
        description: 'Subscription is the top level type for subscriptions.',
        fields: this.graphQLSubscriptions
      });
      this.addGraphQLType(graphQLSubscription, true, true);
    }
    this.graphQLAutoSchema = new _graphql.GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription
    });
    if (this.graphQLCustomTypeDefs) {
      schemaDirectives.load(this);
      if (typeof this.graphQLCustomTypeDefs.getTypeMap === 'function') {
        // In following code we use underscore attr to keep the direct variable reference
        const customGraphQLSchemaTypeMap = this.graphQLCustomTypeDefs._typeMap;
        const findAndReplaceLastType = (parent, key) => {
          if (parent[key].name) {
            if (this.graphQLAutoSchema._typeMap[parent[key].name] && this.graphQLAutoSchema._typeMap[parent[key].name] !== parent[key]) {
              // To avoid unresolved field on overloaded schema
              // replace the final type with the auto schema one
              parent[key] = this.graphQLAutoSchema._typeMap[parent[key].name];
            }
          } else {
            if (parent[key].ofType) {
              findAndReplaceLastType(parent[key], 'ofType');
            }
          }
        };
        // Add non shared types from custom schema to auto schema
        // note: some non shared types can use some shared types
        // so this code need to be ran before the shared types addition
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }
          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];
          if (!autoGraphQLSchemaType) {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
          }
        });
        // Handle shared types
        // We pass through each type and ensure that all sub field types are replaced
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }
          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];
          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            Object.keys(customGraphQLSchemaType._fields).sort().forEach(fieldKey => {
              const field = customGraphQLSchemaType._fields[fieldKey];
              findAndReplaceLastType(field, 'type');
              autoGraphQLSchemaType._fields[field.name] = field;
            });
          }
        });
        this.graphQLSchema = this.graphQLAutoSchema;
      } else if (typeof this.graphQLCustomTypeDefs === 'function') {
        this.graphQLSchema = await this.graphQLCustomTypeDefs({
          directivesDefinitionsSchema: this.graphQLSchemaDirectivesDefinitions,
          autoSchema: this.graphQLAutoSchema,
          graphQLSchemaDirectives: this.graphQLSchemaDirectives
        });
      } else {
        this.graphQLSchema = (0, _schema.mergeSchemas)({
          schemas: [this.graphQLAutoSchema],
          typeDefs: (0, _merge.mergeTypeDefs)([this.graphQLCustomTypeDefs, this.graphQLSchemaDirectivesDefinitions])
        });
        this.graphQLSchema = this.graphQLSchemaDirectives(this.graphQLSchema);
      }
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }
    return this.graphQLSchema;
  }
  _logOnce(severity, message) {
    if (this.logCache[message]) {
      return;
    }
    this.log[severity](message);
    this.logCache[message] = true;
  }
  addGraphQLType(type, throwError = false, ignoreReserved = false, ignoreConnection = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_TYPE_NAMES.includes(type.name) || this.graphQLTypes.find(existingType => existingType.name === type.name) || !ignoreConnection && type.name.endsWith('Connection')) {
      const message = `Type ${type.name} could not be added to the auto schema because it collided with an existing type.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLTypes.push(type);
    return type;
  }
  addGraphQLQuery(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_QUERY_NAMES.includes(fieldName) || this.graphQLQueries[fieldName]) {
      const message = `Query ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLQueries[fieldName] = field;
    return field;
  }
  addGraphQLMutation(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_MUTATION_NAMES.includes(fieldName) || this.graphQLMutations[fieldName]) {
      const message = `Mutation ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this._logOnce('warn', message);
      return undefined;
    }
    this.graphQLMutations[fieldName] = field;
    return field;
  }
  handleError(error) {
    if (error instanceof _node.default.Error) {
      this.log.error('Parse error: ', error);
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
    }
    throw (0, _parseGraphQLUtils.toGraphQLError)(error);
  }
  async _initializeSchemaAndConfig() {
    const [schemaController, parseGraphQLConfig] = await Promise.all([this.databaseController.loadSchema(), this.parseGraphQLController.getGraphQLConfig()]);
    this.schemaController = schemaController;
    return {
      parseGraphQLConfig
    };
  }

  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's parseGraphQLConfig.
   */
  async _getClassesForSchema(parseGraphQLConfig) {
    const {
      enabledForClasses,
      disabledForClasses
    } = parseGraphQLConfig;
    const allClasses = await this.schemaController.getAllClasses();
    if (Array.isArray(enabledForClasses) || Array.isArray(disabledForClasses)) {
      let includedClasses = allClasses;
      if (enabledForClasses) {
        includedClasses = allClasses.filter(clazz => {
          return enabledForClasses.includes(clazz.className);
        });
      }
      if (disabledForClasses) {
        // Classes included in `enabledForClasses` that
        // are also present in `disabledForClasses` will
        // still be filtered out
        includedClasses = includedClasses.filter(clazz => {
          return !disabledForClasses.includes(clazz.className);
        });
      }
      this.isUsersClassDisabled = !includedClasses.some(clazz => {
        return clazz.className === '_User';
      });
      return includedClasses;
    } else {
      return allClasses;
    }
  }

  /**
   * This method returns a list of tuples
   * that provide the parseClass along with
   * its parseClassConfig where provided.
   */
  _getParseClassesWithConfig(parseClasses, parseGraphQLConfig) {
    const {
      classConfigs
    } = parseGraphQLConfig;

    // Make sures that the default classes and classes that
    // starts with capitalized letter will be generated first.
    const sortClasses = (a, b) => {
      a = a.className;
      b = b.className;
      if (a[0] === '_') {
        if (b[0] !== '_') {
          return -1;
        }
      }
      if (b[0] === '_') {
        if (a[0] !== '_') {
          return 1;
        }
      }
      if (a === b) {
        return 0;
      } else if (a < b) {
        return -1;
      } else {
        return 1;
      }
    };
    return parseClasses.sort(sortClasses).map(parseClass => {
      let parseClassConfig;
      if (classConfigs) {
        parseClassConfig = classConfigs.find(c => c.className === parseClass.className);
      }
      return [parseClass, parseClassConfig];
    });
  }
  async _getFunctionNames() {
    return await (0, _triggers.getFunctionNames)(this.appId).filter(functionName => {
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(functionName)) {
        return true;
      } else {
        this._logOnce('warn', `Function ${functionName} could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.`);
        return false;
      }
    });
  }

  /**
   * Checks for changes to the parseClasses
   * objects (i.e. database schema) or to
   * the parseGraphQLConfig object. If no
   * changes are found, return true;
   */
  _hasSchemaInputChanged(params) {
    const {
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    } = params;

    // First init
    if (!this.graphQLSchema) {
      return true;
    }
    if ((0, _util.isDeepStrictEqual)(this.parseGraphQLConfig, parseGraphQLConfig) && this.functionNamesString === functionNamesString && (0, _util.isDeepStrictEqual)(this.parseClasses, parseClasses)) {
      return false;
    }
    return true;
  }
}
exports.ParseGraphQLSchema = ParseGraphQLSchema;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2dyYXBocWwiLCJfc2NoZW1hIiwiX21lcmdlIiwiX3V0aWwiLCJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJwYXJzZUNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9TY2hlbWFDYWNoZSIsIl9wYXJzZUdyYXBoUUxVdGlscyIsInNjaGVtYURpcmVjdGl2ZXMiLCJzY2hlbWFUeXBlcyIsIl90cmlnZ2VycyIsImRlZmF1bHRSZWxheVNjaGVtYSIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsIlJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyIsIlJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTIiwiUGFyc2VHcmFwaFFMU2NoZW1hIiwiY29uc3RydWN0b3IiLCJwYXJhbXMiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJsb2ciLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsInNjaGVtYUNhY2hlIiwiU2NoZW1hQ2FjaGUiLCJsb2dDYWNoZSIsImxvYWQiLCJwYXJzZUdyYXBoUUxDb25maWciLCJfaW5pdGlhbGl6ZVNjaGVtYUFuZENvbmZpZyIsInBhcnNlQ2xhc3Nlc0FycmF5IiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwiX2dldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzU3RyaW5nIiwiam9pbiIsInBhcnNlQ2xhc3NlcyIsInJlZHVjZSIsImFjYyIsImNsYXp6IiwiY2xhc3NOYW1lIiwiX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCIsImdyYXBoUUxTY2hlbWEiLCJ2aWV3ZXJUeXBlIiwiZ3JhcGhRTEF1dG9TY2hlbWEiLCJncmFwaFFMVHlwZXMiLCJncmFwaFFMUXVlcmllcyIsImdyYXBoUUxNdXRhdGlvbnMiLCJncmFwaFFMU3Vic2NyaXB0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsInJlbGF5Tm9kZUludGVyZmFjZSIsIl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnIiwiZm9yRWFjaCIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwia2V5cyIsImZpZWxkcyIsImZpZWxkTmFtZSIsInN0YXJ0c1dpdGgiLCJvcmRlcmVkRmllbGRzIiwic29ydCIsImxvYWRBcnJheVJlc3VsdCIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsImdldFR5cGVNYXAiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCIsIl90eXBlTWFwIiwiZmluZEFuZFJlcGxhY2VMYXN0VHlwZSIsInBhcmVudCIsImtleSIsIm9mVHlwZSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5IiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUiLCJhdXRvR3JhcGhRTFNjaGVtYVR5cGUiLCJnZXRGaWVsZHMiLCJfZmllbGRzIiwiZmllbGRLZXkiLCJmaWVsZCIsImRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYSIsImF1dG9TY2hlbWEiLCJtZXJnZVNjaGVtYXMiLCJzY2hlbWFzIiwidHlwZURlZnMiLCJtZXJnZVR5cGVEZWZzIiwiX2xvZ09uY2UiLCJzZXZlcml0eSIsIm1lc3NhZ2UiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZmluZCIsImV4aXN0aW5nVHlwZSIsImVuZHNXaXRoIiwiRXJyb3IiLCJwdXNoIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiYWRkR3JhcGhRTE11dGF0aW9uIiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsIlBhcnNlIiwic3RhY2siLCJ0b0dyYXBoUUxFcnJvciIsInNjaGVtYUNvbnRyb2xsZXIiLCJQcm9taXNlIiwiYWxsIiwibG9hZFNjaGVtYSIsImdldEdyYXBoUUxDb25maWciLCJlbmFibGVkRm9yQ2xhc3NlcyIsImRpc2FibGVkRm9yQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJnZXRBbGxDbGFzc2VzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZWRDbGFzc2VzIiwiZmlsdGVyIiwiaXNVc2Vyc0NsYXNzRGlzYWJsZWQiLCJzb21lIiwiY2xhc3NDb25maWdzIiwic29ydENsYXNzZXMiLCJhIiwiYiIsIm1hcCIsImMiLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lIiwidGVzdCIsImlzRGVlcFN0cmljdEVxdWFsIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBHcmFwaFFMU2NoZW1hLCBHcmFwaFFMT2JqZWN0VHlwZSwgRG9jdW1lbnROb2RlLCBHcmFwaFFMTmFtZWRUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtZXJnZVNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zY2hlbWEnO1xuaW1wb3J0IHsgbWVyZ2VUeXBlRGVmcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL21lcmdlJztcbmltcG9ydCB7IGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICAgIHRoaXMubG9nQ2FjaGUgPSB7fTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNBcnJheSA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzLmpvaW4oKTtcblxuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5LnJlZHVjZSgoYWNjLCBjbGF6eikgPT4ge1xuICAgICAgYWNjW2NsYXp6LmNsYXNzTmFtZV0gPSBjbGF6ejtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICAgIGlmIChcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxUeXBlcyA9IFtdO1xuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzID0ge307XG4gICAgdGhpcy5yZWxheU5vZGVJbnRlcmZhY2UgPSBudWxsO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRSZWxheVNjaGVtYS5sb2FkKHRoaXMpO1xuICAgIHNjaGVtYVR5cGVzLmxvYWQodGhpcyk7XG5cbiAgICB0aGlzLl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3Nlc0FycmF5LCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIC8vIFNvbWUgdGltZXMgc2NoZW1hIHJldHVybiB0aGUgX2F1dGhfZGF0YV8gZmllbGRcbiAgICAgICAgLy8gaXQgd2lsbCBsZWFkIHRvIHVuc3RhYmxlIGdyYXBocWwgZ2VuZXJhdGlvbiBvcmRlclxuICAgICAgICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5zdGFydHNXaXRoKCdfYXV0aF9kYXRhXycpKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIG9yZGVyIGluc2lkZSB0aGUgc2NoZW1hIHNlZW1zIHRvIG5vdCBiZSBjb25zaXN0ZW50IGFjcm9zc1xuICAgICAgICAvLyByZXN0YXJ0IHNvIHdlIG5lZWQgdG8gZW5zdXJlIGFuIGFscGhhYmV0aWNhbCBvcmRlclxuICAgICAgICAvLyBhbHNvIGl0J3MgYmV0dGVyIGZvciB0aGUgcGxheWdyb3VuZCBkb2N1bWVudGF0aW9uXG4gICAgICAgIGNvbnN0IG9yZGVyZWRGaWVsZHMgPSB7fTtcbiAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBvcmRlcmVkRmllbGRzW2ZpZWxkTmFtZV0gPSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyA9IG9yZGVyZWRGaWVsZHM7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlc0FycmF5KTtcbiAgICBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucy5sb2FkKHRoaXMpO1xuXG4gICAgbGV0IGdyYXBoUUxRdWVyeSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMUXVlcmllcykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFF1ZXJ5ID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1F1ZXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHF1ZXJpZXMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxRdWVyaWVzLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxRdWVyeSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxNdXRhdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMTXV0YXRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnTXV0YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgbXV0YXRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMTXV0YXRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxTdWJzY3JpcHRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnU3Vic2NyaXB0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBzdWJzY3JpcHRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMU3Vic2NyaXB0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbmV3IEdyYXBoUUxTY2hlbWEoe1xuICAgICAgdHlwZXM6IHRoaXMuZ3JhcGhRTFR5cGVzLFxuICAgICAgcXVlcnk6IGdyYXBoUUxRdWVyeSxcbiAgICAgIG11dGF0aW9uOiBncmFwaFFMTXV0YXRpb24sXG4gICAgICBzdWJzY3JpcHRpb246IGdyYXBoUUxTdWJzY3JpcHRpb24sXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMpIHtcbiAgICAgIHNjaGVtYURpcmVjdGl2ZXMubG9hZCh0aGlzKTtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBJbiBmb2xsb3dpbmcgY29kZSB3ZSB1c2UgdW5kZXJzY29yZSBhdHRyIHRvIGtlZXAgdGhlIGRpcmVjdCB2YXJpYWJsZSByZWZlcmVuY2VcbiAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5fdHlwZU1hcDtcbiAgICAgICAgY29uc3QgZmluZEFuZFJlcGxhY2VMYXN0VHlwZSA9IChwYXJlbnQsIGtleSkgPT4ge1xuICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5uYW1lKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gJiZcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAhPT0gcGFyZW50W2tleV1cbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyBUbyBhdm9pZCB1bnJlc29sdmVkIGZpZWxkIG9uIG92ZXJsb2FkZWQgc2NoZW1hXG4gICAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIGZpbmFsIHR5cGUgd2l0aCB0aGUgYXV0byBzY2hlbWEgb25lXG4gICAgICAgICAgICAgIHBhcmVudFtrZXldID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBhcmVudFtrZXldLm9mVHlwZSkge1xuICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKHBhcmVudFtrZXldLCAnb2ZUeXBlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBBZGQgbm9uIHNoYXJlZCB0eXBlcyBmcm9tIGN1c3RvbSBzY2hlbWEgdG8gYXV0byBzY2hlbWFcbiAgICAgICAgLy8gbm90ZTogc29tZSBub24gc2hhcmVkIHR5cGVzIGNhbiB1c2Ugc29tZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gc28gdGhpcyBjb2RlIG5lZWQgdG8gYmUgcmFuIGJlZm9yZSB0aGUgc2hhcmVkIHR5cGVzIGFkZGl0aW9uXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKCFhdXRvR3JhcGhRTFNjaGVtYVR5cGUpIHtcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICAgIF0gPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gSGFuZGxlIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBXZSBwYXNzIHRocm91Z2ggZWFjaCB0eXBlIGFuZCBlbnN1cmUgdGhhdCBhbGwgc3ViIGZpZWxkIHR5cGVzIGFyZSByZXBsYWNlZFxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgaWYgKGF1dG9HcmFwaFFMU2NoZW1hVHlwZSAmJiB0eXBlb2YgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHMpXG4gICAgICAgICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKGZpZWxkS2V5ID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZEtleV07XG4gICAgICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKGZpZWxkLCAndHlwZScpO1xuICAgICAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGQubmFtZV0gPSBmaWVsZDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IGF3YWl0IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKHtcbiAgICAgICAgICBkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWE6IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBhdXRvU2NoZW1hOiB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgIGdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzOiB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IG1lcmdlU2NoZW1hcyh7XG4gICAgICAgICAgc2NoZW1hczogW3RoaXMuZ3JhcGhRTEF1dG9TY2hlbWFdLFxuICAgICAgICAgIHR5cGVEZWZzOiBtZXJnZVR5cGVEZWZzKFtcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyh0aGlzLmdyYXBoUUxTY2hlbWEpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gIH1cblxuICBfbG9nT25jZShzZXZlcml0eSwgbWVzc2FnZSkge1xuICAgIGlmICh0aGlzLmxvZ0NhY2hlW21lc3NhZ2VdKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMubG9nW3NldmVyaXR5XShtZXNzYWdlKTtcbiAgICB0aGlzLmxvZ0NhY2hlW21lc3NhZ2VdID0gdHJ1ZTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxUeXBlKHR5cGUsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSwgaWdub3JlQ29ubmVjdGlvbiA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMuaW5jbHVkZXModHlwZS5uYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFR5cGVzLmZpbmQoZXhpc3RpbmdUeXBlID0+IGV4aXN0aW5nVHlwZS5uYW1lID09PSB0eXBlLm5hbWUpIHx8XG4gICAgICAoIWlnbm9yZUNvbm5lY3Rpb24gJiYgdHlwZS5uYW1lLmVuZHNXaXRoKCdDb25uZWN0aW9uJykpXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFR5cGUgJHt0eXBlLm5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIHR5cGUuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xvZ09uY2UoJ3dhcm4nLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFR5cGVzLnB1c2godHlwZSk7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cblxuICBhZGRHcmFwaFFMUXVlcnkoZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgUXVlcnkgJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxRdWVyaWVzW2ZpZWxkTmFtZV0gPSBmaWVsZDtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBhZGRHcmFwaFFMTXV0YXRpb24oZmllbGROYW1lLCBmaWVsZCwgdGhyb3dFcnJvciA9IGZhbHNlLCBpZ25vcmVSZXNlcnZlZCA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX01VVEFUSU9OX05BTUVTLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBNdXRhdGlvbiAke2ZpZWxkTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3RpbmcgZmllbGQuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xvZ09uY2UoJ3dhcm4nLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgdG9HcmFwaFFMRXJyb3IoZXJyb3IpO1xuICB9XG5cbiAgYXN5bmMgX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKSB7XG4gICAgY29uc3QgW3NjaGVtYUNvbnRyb2xsZXIsIHBhcnNlR3JhcGhRTENvbmZpZ10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5sb2FkU2NoZW1hKCksXG4gICAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpLFxuICAgIF0pO1xuXG4gICAgdGhpcy5zY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB7XG4gICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGFsbCBjbGFzc2VzIGZvdW5kIGJ5IHRoZSBgc2NoZW1hQ29udHJvbGxlcmBcbiAgICogbWludXMgdGhvc2UgZmlsdGVyZWQgb3V0IGJ5IHRoZSBhcHAncyBwYXJzZUdyYXBoUUxDb25maWcuXG4gICAqL1xuICBhc3luYyBfZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgZW5hYmxlZEZvckNsYXNzZXMsIGRpc2FibGVkRm9yQ2xhc3NlcyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIGNvbnN0IGFsbENsYXNzZXMgPSBhd2FpdCB0aGlzLnNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpIHx8IEFycmF5LmlzQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgbGV0IGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXM7XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiBlbmFibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgLy8gQ2xhc3NlcyBpbmNsdWRlZCBpbiBgZW5hYmxlZEZvckNsYXNzZXNgIHRoYXRcbiAgICAgICAgLy8gYXJlIGFsc28gcHJlc2VudCBpbiBgZGlzYWJsZWRGb3JDbGFzc2VzYCB3aWxsXG4gICAgICAgIC8vIHN0aWxsIGJlIGZpbHRlcmVkIG91dFxuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBpbmNsdWRlZENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gIWRpc2FibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc1VzZXJzQ2xhc3NEaXNhYmxlZCA9ICFpbmNsdWRlZENsYXNzZXMuc29tZShjbGF6eiA9PiB7XG4gICAgICAgIHJldHVybiBjbGF6ei5jbGFzc05hbWUgPT09ICdfVXNlcic7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGluY2x1ZGVkQ2xhc3NlcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFsbENsYXNzZXM7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgbWV0aG9kIHJldHVybnMgYSBsaXN0IG9mIHR1cGxlc1xuICAgKiB0aGF0IHByb3ZpZGUgdGhlIHBhcnNlQ2xhc3MgYWxvbmcgd2l0aFxuICAgKiBpdHMgcGFyc2VDbGFzc0NvbmZpZyB3aGVyZSBwcm92aWRlZC5cbiAgICovXG4gIF9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGNsYXNzQ29uZmlncyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuXG4gICAgLy8gTWFrZSBzdXJlcyB0aGF0IHRoZSBkZWZhdWx0IGNsYXNzZXMgYW5kIGNsYXNzZXMgdGhhdFxuICAgIC8vIHN0YXJ0cyB3aXRoIGNhcGl0YWxpemVkIGxldHRlciB3aWxsIGJlIGdlbmVyYXRlZCBmaXJzdC5cbiAgICBjb25zdCBzb3J0Q2xhc3NlcyA9IChhLCBiKSA9PiB7XG4gICAgICBhID0gYS5jbGFzc05hbWU7XG4gICAgICBiID0gYi5jbGFzc05hbWU7XG4gICAgICBpZiAoYVswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChiWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGFbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0gZWxzZSBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBwYXJzZUNsYXNzZXMuc29ydChzb3J0Q2xhc3NlcykubWFwKHBhcnNlQ2xhc3MgPT4ge1xuICAgICAgbGV0IHBhcnNlQ2xhc3NDb25maWc7XG4gICAgICBpZiAoY2xhc3NDb25maWdzKSB7XG4gICAgICAgIHBhcnNlQ2xhc3NDb25maWcgPSBjbGFzc0NvbmZpZ3MuZmluZChjID0+IGMuY2xhc3NOYW1lID09PSBwYXJzZUNsYXNzLmNsYXNzTmFtZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEZ1bmN0aW9uTmFtZXMoKSB7XG4gICAgcmV0dXJuIGF3YWl0IGdldEZ1bmN0aW9uTmFtZXModGhpcy5hcHBJZCkuZmlsdGVyKGZ1bmN0aW9uTmFtZSA9PiB7XG4gICAgICBpZiAoL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8udGVzdChmdW5jdGlvbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fbG9nT25jZShcbiAgICAgICAgICAnd2FybicsXG4gICAgICAgICAgYEZ1bmN0aW9uICR7ZnVuY3Rpb25OYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgR3JhcGhRTCBuYW1lcyBtdXN0IG1hdGNoIC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLmBcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgY2hhbmdlcyB0byB0aGUgcGFyc2VDbGFzc2VzXG4gICAqIG9iamVjdHMgKGkuZS4gZGF0YWJhc2Ugc2NoZW1hKSBvciB0b1xuICAgKiB0aGUgcGFyc2VHcmFwaFFMQ29uZmlnIG9iamVjdC4gSWYgbm9cbiAgICogY2hhbmdlcyBhcmUgZm91bmQsIHJldHVybiB0cnVlO1xuICAgKi9cbiAgX2hhc1NjaGVtYUlucHV0Q2hhbmdlZChwYXJhbXM6IHtcbiAgICBwYXJzZUNsYXNzZXM6IGFueSxcbiAgICBwYXJzZUdyYXBoUUxDb25maWc6ID9QYXJzZUdyYXBoUUxDb25maWcsXG4gICAgZnVuY3Rpb25OYW1lc1N0cmluZzogc3RyaW5nLFxuICB9KTogYm9vbGVhbiB7XG4gICAgY29uc3QgeyBwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZywgZnVuY3Rpb25OYW1lc1N0cmluZyB9ID0gcGFyYW1zO1xuXG4gICAgLy8gRmlyc3QgaW5pdFxuICAgIGlmICghdGhpcy5ncmFwaFFMU2NoZW1hKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBpc0RlZXBTdHJpY3RFcXVhbCh0aGlzLnBhcnNlR3JhcGhRTENvbmZpZywgcGFyc2VHcmFwaFFMQ29uZmlnKSAmJlxuICAgICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID09PSBmdW5jdGlvbk5hbWVzU3RyaW5nICYmXG4gICAgICBpc0RlZXBTdHJpY3RFcXVhbCh0aGlzLnBhcnNlQ2xhc3NlcywgcGFyc2VDbGFzc2VzKVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsUUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsT0FBQSxHQUFBRixPQUFBO0FBQ0EsSUFBQUcsTUFBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssa0JBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLG1CQUFBLEdBQUFDLHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBUSxlQUFBLEdBQUFELHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBUyxpQkFBQSxHQUFBRix1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVUsbUJBQUEsR0FBQUgsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFXLHFCQUFBLEdBQUFKLHVCQUFBLENBQUFQLE9BQUE7QUFDQSxJQUFBWSx1QkFBQSxHQUFBTCx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQWEsdUJBQUEsR0FBQU4sdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFjLG1CQUFBLEdBQUFmLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBZSxZQUFBLEdBQUFoQixzQkFBQSxDQUFBQyxPQUFB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O1FBQ2hCLE9BQU8sQ0FBQyxDQUFDO01BQ1gsQ0FBQyxNQUFNO1FBQ0wsT0FBTyxDQUFDO01BQ1Y7SUFDRixDQUFDO0lBRUQsT0FBT25HLFlBQVksQ0FBQ3lCLElBQUksQ0FBQ3dFLFdBQVcsQ0FBQyxDQUFDRyxHQUFHLENBQUNsRixVQUFVLElBQUk7TUFDdEQsSUFBSUMsZ0JBQWdCO01BQ3BCLElBQUk2RSxZQUFZLEVBQUU7UUFDaEI3RSxnQkFBZ0IsR0FBRzZFLFlBQVksQ0FBQzNCLElBQUksQ0FBQ2dDLENBQUMsSUFBSUEsQ0FBQyxDQUFDakcsU0FBUyxLQUFLYyxVQUFVLENBQUNkLFNBQVMsQ0FBQztNQUNqRjtNQUNBLE9BQU8sQ0FBQ2MsVUFBVSxFQUFFQyxnQkFBZ0IsQ0FBQztJQUN2QyxDQUFDLENBQUM7RUFDSjtFQUVBLE1BQU10QixpQkFBaUJBLENBQUEsRUFBRztJQUN4QixPQUFPLE1BQU0sSUFBQXlHLDBCQUFnQixFQUFDLElBQUksQ0FBQ25ILEtBQUssQ0FBQyxDQUFDMEcsTUFBTSxDQUFDVSxZQUFZLElBQUk7TUFDL0QsSUFBSSwwQkFBMEIsQ0FBQ0MsSUFBSSxDQUFDRCxZQUFZLENBQUMsRUFBRTtRQUNqRCxPQUFPLElBQUk7TUFDYixDQUFDLE1BQU07UUFDTCxJQUFJLENBQUMxQyxRQUFRLENBQ1gsTUFBTSxFQUNOLFlBQVkwQyxZQUFZLHFHQUMxQixDQUFDO1FBQ0QsT0FBTyxLQUFLO01BQ2Q7SUFDRixDQUFDLENBQUM7RUFDSjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRWxHLHNCQUFzQkEsQ0FBQ3hCLE1BSXRCLEVBQVc7SUFDVixNQUFNO01BQUVtQixZQUFZO01BQUVSLGtCQUFrQjtNQUFFTTtJQUFvQixDQUFDLEdBQUdqQixNQUFNOztJQUV4RTtJQUNBLElBQUksQ0FBQyxJQUFJLENBQUN5QixhQUFhLEVBQUU7TUFDdkIsT0FBTyxJQUFJO0lBQ2I7SUFFQSxJQUNFLElBQUFtRyx1QkFBaUIsRUFBQyxJQUFJLENBQUNqSCxrQkFBa0IsRUFBRUEsa0JBQWtCLENBQUMsSUFDOUQsSUFBSSxDQUFDTSxtQkFBbUIsS0FBS0EsbUJBQW1CLElBQ2hELElBQUEyRyx1QkFBaUIsRUFBQyxJQUFJLENBQUN6RyxZQUFZLEVBQUVBLFlBQVksQ0FBQyxFQUNsRDtNQUNBLE9BQU8sS0FBSztJQUNkO0lBQ0EsT0FBTyxJQUFJO0VBQ2I7QUFDRjtBQUFDMEcsT0FBQSxDQUFBL0gsa0JBQUEsR0FBQUEsa0JBQUEiLCJpZ25vcmVMaXN0IjpbXX0=