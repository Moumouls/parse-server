"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _stitch = require("@graphql-tools/stitch");

var _util = require("util");

var _utils = require("@graphql-tools/utils");

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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
      } // Fields order inside the schema seems to not be consistent across
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
        // In following code we use underscore attr to avoid js var un ref
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
        }; // Add non shared types from custom schema to auto schema
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
        }); // Handle shared types
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
          stitchSchemas: _stitch.stitchSchemas
        });
      } else {
        this.graphQLSchema = (0, _stitch.stitchSchemas)({
          schemas: [this.graphQLSchemaDirectivesDefinitions, this.graphQLAutoSchema, this.graphQLCustomTypeDefs],
          mergeDirectives: true
        });
      } // Only merge directive when string schema provided


      const graphQLSchemaTypeMap = this.graphQLSchema.getTypeMap();
      Object.keys(graphQLSchemaTypeMap).forEach(graphQLSchemaTypeName => {
        const graphQLSchemaType = graphQLSchemaTypeMap[graphQLSchemaTypeName];

        if (typeof graphQLSchemaType.getFields === 'function' && this.graphQLCustomTypeDefs.definitions) {
          const graphQLCustomTypeDef = this.graphQLCustomTypeDefs.definitions.find(definition => definition.name.value === graphQLSchemaTypeName);

          if (graphQLCustomTypeDef) {
            const graphQLSchemaTypeFieldMap = graphQLSchemaType.getFields();
            Object.keys(graphQLSchemaTypeFieldMap).forEach(graphQLSchemaTypeFieldName => {
              const graphQLSchemaTypeField = graphQLSchemaTypeFieldMap[graphQLSchemaTypeFieldName];

              if (!graphQLSchemaTypeField.astNode) {
                const astNode = graphQLCustomTypeDef.fields.find(field => field.name.value === graphQLSchemaTypeFieldName);

                if (astNode) {
                  graphQLSchemaTypeField.astNode = astNode;
                }
              }
            });
          }
        }
      });

      _utils.SchemaDirectiveVisitor.visitSchemaDirectives(this.graphQLSchema, this.graphQLSchemaDirectives);
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

      if (this.warnCache) this.log.warn(message);
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
    } = parseGraphQLConfig; // Make sures that the default classes and classes that
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
    } = params; // First init

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNjaGVtYS5qcyJdLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImxvZyIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsImFwcElkIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImxvZ0NhY2hlIiwibG9hZCIsInBhcnNlR3JhcGhRTENvbmZpZyIsIl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnIiwicGFyc2VDbGFzc2VzQXJyYXkiLCJfZ2V0Q2xhc3Nlc0ZvclNjaGVtYSIsImZ1bmN0aW9uTmFtZXMiLCJfZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXNTdHJpbmciLCJqb2luIiwicGFyc2VDbGFzc2VzIiwicmVkdWNlIiwiYWNjIiwiY2xhenoiLCJjbGFzc05hbWUiLCJfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkIiwiZ3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3NUeXBlcyIsInZpZXdlclR5cGUiLCJncmFwaFFMQXV0b1NjaGVtYSIsImdyYXBoUUxUeXBlcyIsImdyYXBoUUxRdWVyaWVzIiwiZ3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxTdWJzY3JpcHRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyIsImdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsImRlZmF1bHRSZWxheVNjaGVtYSIsInNjaGVtYVR5cGVzIiwiX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWciLCJmb3JFYWNoIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJPYmplY3QiLCJrZXlzIiwiZmllbGRzIiwiZmllbGROYW1lIiwic3RhcnRzV2l0aCIsIm9yZGVyZWRGaWVsZHMiLCJzb3J0IiwicGFyc2VDbGFzc1F1ZXJpZXMiLCJwYXJzZUNsYXNzTXV0YXRpb25zIiwibG9hZEFycmF5UmVzdWx0IiwiZGVmYXVsdEdyYXBoUUxRdWVyaWVzIiwiZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMiLCJncmFwaFFMUXVlcnkiLCJ1bmRlZmluZWQiLCJsZW5ndGgiLCJHcmFwaFFMT2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImFkZEdyYXBoUUxUeXBlIiwiZ3JhcGhRTE11dGF0aW9uIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbiIsIkdyYXBoUUxTY2hlbWEiLCJ0eXBlcyIsInF1ZXJ5IiwibXV0YXRpb24iLCJzdWJzY3JpcHRpb24iLCJzY2hlbWFEaXJlY3RpdmVzIiwiZ2V0VHlwZU1hcCIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwIiwiX3R5cGVNYXAiLCJmaW5kQW5kUmVwbGFjZUxhc3RUeXBlIiwicGFyZW50Iiwia2V5Iiwib2ZUeXBlIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSIsImF1dG9HcmFwaFFMU2NoZW1hVHlwZSIsImdldEZpZWxkcyIsIl9maWVsZHMiLCJmaWVsZEtleSIsImZpZWxkIiwiZGlyZWN0aXZlc0RlZmluaXRpb25zU2NoZW1hIiwiYXV0b1NjaGVtYSIsInN0aXRjaFNjaGVtYXMiLCJzY2hlbWFzIiwibWVyZ2VEaXJlY3RpdmVzIiwiZ3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJncmFwaFFMU2NoZW1hVHlwZU5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZSIsImRlZmluaXRpb25zIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWYiLCJmaW5kIiwiZGVmaW5pdGlvbiIsInZhbHVlIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcCIsImdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCIsImFzdE5vZGUiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRTY2hlbWFEaXJlY3RpdmVzIiwiX2xvZ09uY2UiLCJzZXZlcml0eSIsIm1lc3NhZ2UiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZXhpc3RpbmdUeXBlIiwiZW5kc1dpdGgiLCJFcnJvciIsIndhcm5DYWNoZSIsIndhcm4iLCJwdXNoIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiYWRkR3JhcGhRTE11dGF0aW9uIiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsIlBhcnNlIiwic3RhY2siLCJzY2hlbWFDb250cm9sbGVyIiwiUHJvbWlzZSIsImFsbCIsImxvYWRTY2hlbWEiLCJnZXRHcmFwaFFMQ29uZmlnIiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJhbGxDbGFzc2VzIiwiZ2V0QWxsQ2xhc3NlcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVkQ2xhc3NlcyIsImZpbHRlciIsImlzVXNlcnNDbGFzc0Rpc2FibGVkIiwic29tZSIsImNsYXNzQ29uZmlncyIsInNvcnRDbGFzc2VzIiwiYSIsImIiLCJtYXAiLCJjIiwiZnVuY3Rpb25OYW1lIiwidGVzdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENBQ2xDLFFBRGtDLEVBRWxDLFNBRmtDLEVBR2xDLEtBSGtDLEVBSWxDLE9BSmtDLEVBS2xDLElBTGtDLEVBTWxDLGFBTmtDLEVBT2xDLE9BUGtDLEVBUWxDLFVBUmtDLEVBU2xDLGNBVGtDLEVBVWxDLGlCQVZrQyxFQVdsQyxtQkFYa0MsRUFZbEMsUUFaa0MsRUFhbEMsYUFia0MsRUFjbEMsZUFka0MsRUFlbEMsWUFma0MsRUFnQmxDLGNBaEJrQyxFQWlCbEMsYUFqQmtDLEVBa0JsQyxlQWxCa0MsRUFtQmxDLG1CQW5Ca0MsRUFvQmxDLG9CQXBCa0MsRUFxQmxDLHNCQXJCa0MsRUFzQmxDLGtCQXRCa0MsRUF1QmxDLG9CQXZCa0MsRUF3QmxDLGtCQXhCa0MsRUF5QmxDLG9CQXpCa0MsRUEwQmxDLGtCQTFCa0MsRUEyQmxDLG9CQTNCa0MsRUE0QmxDLFVBNUJrQyxDQUFwQztBQThCQSxNQUFNQyw0QkFBNEIsR0FBRyxDQUFDLFFBQUQsRUFBVyxRQUFYLEVBQXFCLE9BQXJCLEVBQThCLFNBQTlCLENBQXJDO0FBQ0EsTUFBTUMsK0JBQStCLEdBQUcsQ0FDdEMsUUFEc0MsRUFFdEMsT0FGc0MsRUFHdEMsUUFIc0MsRUFJdEMsWUFKc0MsRUFLdEMsZUFMc0MsRUFNdEMsYUFOc0MsRUFPdEMsYUFQc0MsRUFRdEMsYUFSc0MsQ0FBeEM7O0FBV0EsTUFBTUMsa0JBQU4sQ0FBeUI7QUFTdkJDLEVBQUFBLFdBQVcsQ0FDVEMsTUFNQyxHQUFHLEVBUEssRUFRVDtBQUNBLFNBQUtDLHNCQUFMLEdBQ0VELE1BQU0sQ0FBQ0Msc0JBQVAsSUFDQSxnQ0FBa0IscURBQWxCLENBRkY7QUFHQSxTQUFLQyxrQkFBTCxHQUNFRixNQUFNLENBQUNFLGtCQUFQLElBQ0EsZ0NBQWtCLGlEQUFsQixDQUZGO0FBR0EsU0FBS0MsR0FBTCxHQUFXSCxNQUFNLENBQUNHLEdBQVAsSUFBYyxnQ0FBa0Isa0NBQWxCLENBQXpCO0FBQ0EsU0FBS0MscUJBQUwsR0FBNkJKLE1BQU0sQ0FBQ0kscUJBQXBDO0FBQ0EsU0FBS0MsS0FBTCxHQUFhTCxNQUFNLENBQUNLLEtBQVAsSUFBZ0IsZ0NBQWtCLDZCQUFsQixDQUE3QjtBQUNBLFNBQUtDLFdBQUwsR0FBbUJDLG9CQUFuQjtBQUNBLFNBQUtDLFFBQUwsR0FBZ0IsRUFBaEI7QUFDRDs7QUFFUyxRQUFKQyxJQUFJLEdBQUc7QUFDWCxVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBeUIsTUFBTSxLQUFLQywwQkFBTCxFQUFyQztBQUNBLFVBQU1DLGlCQUFpQixHQUFHLE1BQU0sS0FBS0Msb0JBQUwsQ0FBMEJILGtCQUExQixDQUFoQztBQUNBLFVBQU1JLGFBQWEsR0FBRyxNQUFNLEtBQUtDLGlCQUFMLEVBQTVCO0FBQ0EsVUFBTUMsbUJBQW1CLEdBQUdGLGFBQWEsQ0FBQ0csSUFBZCxFQUE1QjtBQUVBLFVBQU1DLFlBQVksR0FBR04saUJBQWlCLENBQUNPLE1BQWxCLENBQXlCLENBQUNDLEdBQUQsRUFBTUMsS0FBTixLQUFnQjtBQUM1REQsTUFBQUEsR0FBRyxDQUFDQyxLQUFLLENBQUNDLFNBQVAsQ0FBSCxHQUF1QkQsS0FBdkI7QUFDQSxhQUFPRCxHQUFQO0FBQ0QsS0FIb0IsRUFHbEIsRUFIa0IsQ0FBckI7O0FBSUEsUUFDRSxDQUFDLEtBQUtHLHNCQUFMLENBQTRCO0FBQzNCTCxNQUFBQSxZQUQyQjtBQUUzQlIsTUFBQUEsa0JBRjJCO0FBRzNCTSxNQUFBQTtBQUgyQixLQUE1QixDQURILEVBTUU7QUFDQSxhQUFPLEtBQUtRLGFBQVo7QUFDRDs7QUFFRCxTQUFLTixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLFNBQUtSLGtCQUFMLEdBQTBCQSxrQkFBMUI7QUFDQSxTQUFLSSxhQUFMLEdBQXFCQSxhQUFyQjtBQUNBLFNBQUtFLG1CQUFMLEdBQTJCQSxtQkFBM0I7QUFDQSxTQUFLUyxlQUFMLEdBQXVCLEVBQXZCO0FBQ0EsU0FBS0MsVUFBTCxHQUFrQixJQUFsQjtBQUNBLFNBQUtDLGlCQUFMLEdBQXlCLElBQXpCO0FBQ0EsU0FBS0gsYUFBTCxHQUFxQixJQUFyQjtBQUNBLFNBQUtJLFlBQUwsR0FBb0IsRUFBcEI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCLEVBQXRCO0FBQ0EsU0FBS0MsZ0JBQUwsR0FBd0IsRUFBeEI7QUFDQSxTQUFLQyxvQkFBTCxHQUE0QixFQUE1QjtBQUNBLFNBQUtDLGtDQUFMLEdBQTBDLElBQTFDO0FBQ0EsU0FBS0MsdUJBQUwsR0FBK0IsRUFBL0I7QUFDQSxTQUFLQyxrQkFBTCxHQUEwQixJQUExQjtBQUVBQyxJQUFBQSxtQkFBbUIsQ0FBQzFCLElBQXBCLENBQXlCLElBQXpCO0FBQ0EyQixJQUFBQSxrQkFBa0IsQ0FBQzNCLElBQW5CLENBQXdCLElBQXhCO0FBQ0E0QixJQUFBQSxXQUFXLENBQUM1QixJQUFaLENBQWlCLElBQWpCOztBQUVBLFNBQUs2QiwwQkFBTCxDQUFnQzFCLGlCQUFoQyxFQUFtREYsa0JBQW5ELEVBQXVFNkIsT0FBdkUsQ0FDRSxDQUFDLENBQUNDLFVBQUQsRUFBYUMsZ0JBQWIsQ0FBRCxLQUFvQztBQUNsQztBQUNBO0FBQ0EsVUFBSUQsVUFBVSxDQUFDbEIsU0FBWCxLQUF5QixPQUE3QixFQUFzQztBQUNwQ29CLFFBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSCxVQUFVLENBQUNJLE1BQXZCLEVBQStCTCxPQUEvQixDQUF1Q00sU0FBUyxJQUFJO0FBQ2xELGNBQUlBLFNBQVMsQ0FBQ0MsVUFBVixDQUFxQixhQUFyQixDQUFKLEVBQXlDO0FBQ3ZDLG1CQUFPTixVQUFVLENBQUNJLE1BQVgsQ0FBa0JDLFNBQWxCLENBQVA7QUFDRDtBQUNGLFNBSkQ7QUFLRCxPQVRpQyxDQVdsQztBQUNBO0FBQ0E7OztBQUNBLFlBQU1FLGFBQWEsR0FBRyxFQUF0QjtBQUNBTCxNQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWUgsVUFBVSxDQUFDSSxNQUF2QixFQUNHSSxJQURILEdBRUdULE9BRkgsQ0FFV00sU0FBUyxJQUFJO0FBQ3BCRSxRQUFBQSxhQUFhLENBQUNGLFNBQUQsQ0FBYixHQUEyQkwsVUFBVSxDQUFDSSxNQUFYLENBQWtCQyxTQUFsQixDQUEzQjtBQUNELE9BSkg7QUFLQUwsTUFBQUEsVUFBVSxDQUFDSSxNQUFYLEdBQW9CRyxhQUFwQjtBQUNBdEIsTUFBQUEsZUFBZSxDQUFDaEIsSUFBaEIsQ0FBcUIsSUFBckIsRUFBMkIrQixVQUEzQixFQUF1Q0MsZ0JBQXZDO0FBQ0FRLE1BQUFBLGlCQUFpQixDQUFDeEMsSUFBbEIsQ0FBdUIsSUFBdkIsRUFBNkIrQixVQUE3QixFQUF5Q0MsZ0JBQXpDO0FBQ0FTLE1BQUFBLG1CQUFtQixDQUFDekMsSUFBcEIsQ0FBeUIsSUFBekIsRUFBK0IrQixVQUEvQixFQUEyQ0MsZ0JBQTNDO0FBQ0QsS0F6Qkg7O0FBNEJBTixJQUFBQSxtQkFBbUIsQ0FBQ2dCLGVBQXBCLENBQW9DLElBQXBDLEVBQTBDdkMsaUJBQTFDO0FBQ0F3QyxJQUFBQSxxQkFBcUIsQ0FBQzNDLElBQXRCLENBQTJCLElBQTNCO0FBQ0E0QyxJQUFBQSx1QkFBdUIsQ0FBQzVDLElBQXhCLENBQTZCLElBQTdCO0FBRUEsUUFBSTZDLFlBQVksR0FBR0MsU0FBbkI7O0FBQ0EsUUFBSWIsTUFBTSxDQUFDQyxJQUFQLENBQVksS0FBS2QsY0FBakIsRUFBaUMyQixNQUFqQyxHQUEwQyxDQUE5QyxFQUFpRDtBQUMvQ0YsTUFBQUEsWUFBWSxHQUFHLElBQUlHLDBCQUFKLENBQXNCO0FBQ25DQyxRQUFBQSxJQUFJLEVBQUUsT0FENkI7QUFFbkNDLFFBQUFBLFdBQVcsRUFBRSwwQ0FGc0I7QUFHbkNmLFFBQUFBLE1BQU0sRUFBRSxLQUFLZjtBQUhzQixPQUF0QixDQUFmO0FBS0EsV0FBSytCLGNBQUwsQ0FBb0JOLFlBQXBCLEVBQWtDLElBQWxDLEVBQXdDLElBQXhDO0FBQ0Q7O0FBRUQsUUFBSU8sZUFBZSxHQUFHTixTQUF0Qjs7QUFDQSxRQUFJYixNQUFNLENBQUNDLElBQVAsQ0FBWSxLQUFLYixnQkFBakIsRUFBbUMwQixNQUFuQyxHQUE0QyxDQUFoRCxFQUFtRDtBQUNqREssTUFBQUEsZUFBZSxHQUFHLElBQUlKLDBCQUFKLENBQXNCO0FBQ3RDQyxRQUFBQSxJQUFJLEVBQUUsVUFEZ0M7QUFFdENDLFFBQUFBLFdBQVcsRUFBRSwrQ0FGeUI7QUFHdENmLFFBQUFBLE1BQU0sRUFBRSxLQUFLZDtBQUh5QixPQUF0QixDQUFsQjtBQUtBLFdBQUs4QixjQUFMLENBQW9CQyxlQUFwQixFQUFxQyxJQUFyQyxFQUEyQyxJQUEzQztBQUNEOztBQUVELFFBQUlDLG1CQUFtQixHQUFHUCxTQUExQjs7QUFDQSxRQUFJYixNQUFNLENBQUNDLElBQVAsQ0FBWSxLQUFLWixvQkFBakIsRUFBdUN5QixNQUF2QyxHQUFnRCxDQUFwRCxFQUF1RDtBQUNyRE0sTUFBQUEsbUJBQW1CLEdBQUcsSUFBSUwsMEJBQUosQ0FBc0I7QUFDMUNDLFFBQUFBLElBQUksRUFBRSxjQURvQztBQUUxQ0MsUUFBQUEsV0FBVyxFQUFFLHVEQUY2QjtBQUcxQ2YsUUFBQUEsTUFBTSxFQUFFLEtBQUtiO0FBSDZCLE9BQXRCLENBQXRCO0FBS0EsV0FBSzZCLGNBQUwsQ0FBb0JFLG1CQUFwQixFQUF5QyxJQUF6QyxFQUErQyxJQUEvQztBQUNEOztBQUVELFNBQUtuQyxpQkFBTCxHQUF5QixJQUFJb0Msc0JBQUosQ0FBa0I7QUFDekNDLE1BQUFBLEtBQUssRUFBRSxLQUFLcEMsWUFENkI7QUFFekNxQyxNQUFBQSxLQUFLLEVBQUVYLFlBRmtDO0FBR3pDWSxNQUFBQSxRQUFRLEVBQUVMLGVBSCtCO0FBSXpDTSxNQUFBQSxZQUFZLEVBQUVMO0FBSjJCLEtBQWxCLENBQXpCOztBQU9BLFFBQUksS0FBSzFELHFCQUFULEVBQWdDO0FBQzlCZ0UsTUFBQUEsZ0JBQWdCLENBQUMzRCxJQUFqQixDQUFzQixJQUF0Qjs7QUFFQSxVQUFJLE9BQU8sS0FBS0wscUJBQUwsQ0FBMkJpRSxVQUFsQyxLQUFpRCxVQUFyRCxFQUFpRTtBQUMvRDtBQUNBLGNBQU1DLDBCQUEwQixHQUFHLEtBQUtsRSxxQkFBTCxDQUEyQm1FLFFBQTlEOztBQUNBLGNBQU1DLHNCQUFzQixHQUFHLENBQUNDLE1BQUQsRUFBU0MsR0FBVCxLQUFpQjtBQUM5QyxjQUFJRCxNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZaEIsSUFBaEIsRUFBc0I7QUFDcEIsZ0JBQ0UsS0FBSy9CLGlCQUFMLENBQXVCNEMsUUFBdkIsQ0FBZ0NFLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVloQixJQUE1QyxLQUNBLEtBQUsvQixpQkFBTCxDQUF1QjRDLFFBQXZCLENBQWdDRSxNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZaEIsSUFBNUMsTUFBc0RlLE1BQU0sQ0FBQ0MsR0FBRCxDQUY5RCxFQUdFO0FBQ0E7QUFDQTtBQUNBRCxjQUFBQSxNQUFNLENBQUNDLEdBQUQsQ0FBTixHQUFjLEtBQUsvQyxpQkFBTCxDQUF1QjRDLFFBQXZCLENBQWdDRSxNQUFNLENBQUNDLEdBQUQsQ0FBTixDQUFZaEIsSUFBNUMsQ0FBZDtBQUNEO0FBQ0YsV0FURCxNQVNPO0FBQ0wsZ0JBQUllLE1BQU0sQ0FBQ0MsR0FBRCxDQUFOLENBQVlDLE1BQWhCLEVBQXdCO0FBQ3RCSCxjQUFBQSxzQkFBc0IsQ0FBQ0MsTUFBTSxDQUFDQyxHQUFELENBQVAsRUFBYyxRQUFkLENBQXRCO0FBQ0Q7QUFDRjtBQUNGLFNBZkQsQ0FIK0QsQ0FtQi9EO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQWhDLFFBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZMkIsMEJBQVosRUFDR3RCLElBREgsR0FFR1QsT0FGSCxDQUVXcUMsMEJBQTBCLElBQUk7QUFDckMsZ0JBQU1DLHVCQUF1QixHQUFHUCwwQkFBMEIsQ0FBQ00sMEJBQUQsQ0FBMUQ7O0FBQ0EsY0FDRSxDQUFDQyx1QkFBRCxJQUNBLENBQUNBLHVCQUF1QixDQUFDbkIsSUFEekIsSUFFQW1CLHVCQUF1QixDQUFDbkIsSUFBeEIsQ0FBNkJaLFVBQTdCLENBQXdDLElBQXhDLENBSEYsRUFJRTtBQUNBO0FBQ0Q7O0FBQ0QsZ0JBQU1nQyxxQkFBcUIsR0FBRyxLQUFLbkQsaUJBQUwsQ0FBdUI0QyxRQUF2QixDQUM1Qk0sdUJBQXVCLENBQUNuQixJQURJLENBQTlCOztBQUdBLGNBQUksQ0FBQ29CLHFCQUFMLEVBQTRCO0FBQzFCLGlCQUFLbkQsaUJBQUwsQ0FBdUI0QyxRQUF2QixDQUNFTSx1QkFBdUIsQ0FBQ25CLElBRDFCLElBRUltQix1QkFGSjtBQUdEO0FBQ0YsU0FuQkgsRUF2QitELENBMkMvRDtBQUNBO0FBQ0E7O0FBQ0FuQyxRQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWTJCLDBCQUFaLEVBQ0d0QixJQURILEdBRUdULE9BRkgsQ0FFV3FDLDBCQUEwQixJQUFJO0FBQ3JDLGdCQUFNQyx1QkFBdUIsR0FBR1AsMEJBQTBCLENBQUNNLDBCQUFELENBQTFEOztBQUNBLGNBQ0UsQ0FBQ0MsdUJBQUQsSUFDQSxDQUFDQSx1QkFBdUIsQ0FBQ25CLElBRHpCLElBRUFtQix1QkFBdUIsQ0FBQ25CLElBQXhCLENBQTZCWixVQUE3QixDQUF3QyxJQUF4QyxDQUhGLEVBSUU7QUFDQTtBQUNEOztBQUNELGdCQUFNZ0MscUJBQXFCLEdBQUcsS0FBS25ELGlCQUFMLENBQXVCNEMsUUFBdkIsQ0FDNUJNLHVCQUF1QixDQUFDbkIsSUFESSxDQUE5Qjs7QUFJQSxjQUFJb0IscUJBQXFCLElBQUksT0FBT0QsdUJBQXVCLENBQUNFLFNBQS9CLEtBQTZDLFVBQTFFLEVBQXNGO0FBQ3BGckMsWUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlrQyx1QkFBdUIsQ0FBQ0csT0FBcEMsRUFDR2hDLElBREgsR0FFR1QsT0FGSCxDQUVXMEMsUUFBUSxJQUFJO0FBQ25CLG9CQUFNQyxLQUFLLEdBQUdMLHVCQUF1QixDQUFDRyxPQUF4QixDQUFnQ0MsUUFBaEMsQ0FBZDtBQUNBVCxjQUFBQSxzQkFBc0IsQ0FBQ1UsS0FBRCxFQUFRLE1BQVIsQ0FBdEI7QUFDQUosY0FBQUEscUJBQXFCLENBQUNFLE9BQXRCLENBQThCRSxLQUFLLENBQUN4QixJQUFwQyxJQUE0Q3dCLEtBQTVDO0FBQ0QsYUFOSDtBQU9EO0FBQ0YsU0F4Qkg7QUF5QkEsYUFBSzFELGFBQUwsR0FBcUIsS0FBS0csaUJBQTFCO0FBQ0QsT0F4RUQsTUF3RU8sSUFBSSxPQUFPLEtBQUt2QixxQkFBWixLQUFzQyxVQUExQyxFQUFzRDtBQUMzRCxhQUFLb0IsYUFBTCxHQUFxQixNQUFNLEtBQUtwQixxQkFBTCxDQUEyQjtBQUNwRCtFLFVBQUFBLDJCQUEyQixFQUFFLEtBQUtuRCxrQ0FEa0I7QUFFcERvRCxVQUFBQSxVQUFVLEVBQUUsS0FBS3pELGlCQUZtQztBQUdwRDBELFVBQUFBLGFBQWEsRUFBYkE7QUFIb0QsU0FBM0IsQ0FBM0I7QUFLRCxPQU5NLE1BTUE7QUFDTCxhQUFLN0QsYUFBTCxHQUFxQiwyQkFBYztBQUNqQzhELFVBQUFBLE9BQU8sRUFBRSxDQUNQLEtBQUt0RCxrQ0FERSxFQUVQLEtBQUtMLGlCQUZFLEVBR1AsS0FBS3ZCLHFCQUhFLENBRHdCO0FBTWpDbUYsVUFBQUEsZUFBZSxFQUFFO0FBTmdCLFNBQWQsQ0FBckI7QUFRRCxPQTFGNkIsQ0E0RjlCOzs7QUFDQSxZQUFNQyxvQkFBb0IsR0FBRyxLQUFLaEUsYUFBTCxDQUFtQjZDLFVBQW5CLEVBQTdCO0FBQ0EzQixNQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWTZDLG9CQUFaLEVBQWtDakQsT0FBbEMsQ0FBMENrRCxxQkFBcUIsSUFBSTtBQUNqRSxjQUFNQyxpQkFBaUIsR0FBR0Ysb0JBQW9CLENBQUNDLHFCQUFELENBQTlDOztBQUNBLFlBQ0UsT0FBT0MsaUJBQWlCLENBQUNYLFNBQXpCLEtBQXVDLFVBQXZDLElBQ0EsS0FBSzNFLHFCQUFMLENBQTJCdUYsV0FGN0IsRUFHRTtBQUNBLGdCQUFNQyxvQkFBb0IsR0FBRyxLQUFLeEYscUJBQUwsQ0FBMkJ1RixXQUEzQixDQUF1Q0UsSUFBdkMsQ0FDM0JDLFVBQVUsSUFBSUEsVUFBVSxDQUFDcEMsSUFBWCxDQUFnQnFDLEtBQWhCLEtBQTBCTixxQkFEYixDQUE3Qjs7QUFHQSxjQUFJRyxvQkFBSixFQUEwQjtBQUN4QixrQkFBTUkseUJBQXlCLEdBQUdOLGlCQUFpQixDQUFDWCxTQUFsQixFQUFsQztBQUNBckMsWUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlxRCx5QkFBWixFQUF1Q3pELE9BQXZDLENBQStDMEQsMEJBQTBCLElBQUk7QUFDM0Usb0JBQU1DLHNCQUFzQixHQUFHRix5QkFBeUIsQ0FBQ0MsMEJBQUQsQ0FBeEQ7O0FBQ0Esa0JBQUksQ0FBQ0Msc0JBQXNCLENBQUNDLE9BQTVCLEVBQXFDO0FBQ25DLHNCQUFNQSxPQUFPLEdBQUdQLG9CQUFvQixDQUFDaEQsTUFBckIsQ0FBNEJpRCxJQUE1QixDQUNkWCxLQUFLLElBQUlBLEtBQUssQ0FBQ3hCLElBQU4sQ0FBV3FDLEtBQVgsS0FBcUJFLDBCQURoQixDQUFoQjs7QUFHQSxvQkFBSUUsT0FBSixFQUFhO0FBQ1hELGtCQUFBQSxzQkFBc0IsQ0FBQ0MsT0FBdkIsR0FBaUNBLE9BQWpDO0FBQ0Q7QUFDRjtBQUNGLGFBVkQ7QUFXRDtBQUNGO0FBQ0YsT0F4QkQ7O0FBMEJBQyxvQ0FBdUJDLHFCQUF2QixDQUNFLEtBQUs3RSxhQURQLEVBRUUsS0FBS1MsdUJBRlA7QUFJRCxLQTVIRCxNQTRITztBQUNMLFdBQUtULGFBQUwsR0FBcUIsS0FBS0csaUJBQTFCO0FBQ0Q7O0FBRUQsV0FBTyxLQUFLSCxhQUFaO0FBQ0Q7O0FBRUQ4RSxFQUFBQSxRQUFRLENBQUNDLFFBQUQsRUFBV0MsT0FBWCxFQUFvQjtBQUMxQixRQUFJLEtBQUtoRyxRQUFMLENBQWNnRyxPQUFkLENBQUosRUFBNEI7QUFDMUI7QUFDRDs7QUFDRCxTQUFLckcsR0FBTCxDQUFTb0csUUFBVCxFQUFtQkMsT0FBbkI7QUFDQSxTQUFLaEcsUUFBTCxDQUFjZ0csT0FBZCxJQUF5QixJQUF6QjtBQUNEOztBQUVENUMsRUFBQUEsY0FBYyxDQUFDNkMsSUFBRCxFQUFPQyxVQUFVLEdBQUcsS0FBcEIsRUFBMkJDLGNBQWMsR0FBRyxLQUE1QyxFQUFtREMsZ0JBQWdCLEdBQUcsS0FBdEUsRUFBNkU7QUFDekYsUUFDRyxDQUFDRCxjQUFELElBQW1CaEgsMkJBQTJCLENBQUNrSCxRQUE1QixDQUFxQ0osSUFBSSxDQUFDL0MsSUFBMUMsQ0FBcEIsSUFDQSxLQUFLOUIsWUFBTCxDQUFrQmlFLElBQWxCLENBQXVCaUIsWUFBWSxJQUFJQSxZQUFZLENBQUNwRCxJQUFiLEtBQXNCK0MsSUFBSSxDQUFDL0MsSUFBbEUsQ0FEQSxJQUVDLENBQUNrRCxnQkFBRCxJQUFxQkgsSUFBSSxDQUFDL0MsSUFBTCxDQUFVcUQsUUFBVixDQUFtQixZQUFuQixDQUh4QixFQUlFO0FBQ0EsWUFBTVAsT0FBTyxHQUFJLFFBQU9DLElBQUksQ0FBQy9DLElBQUssbUZBQWxDOztBQUNBLFVBQUlnRCxVQUFKLEVBQWdCO0FBQ2QsY0FBTSxJQUFJTSxLQUFKLENBQVVSLE9BQVYsQ0FBTjtBQUNEOztBQUNELFVBQUksS0FBS1MsU0FBVCxFQUFvQixLQUFLOUcsR0FBTCxDQUFTK0csSUFBVCxDQUFjVixPQUFkO0FBQ3BCLGFBQU9qRCxTQUFQO0FBQ0Q7O0FBQ0QsU0FBSzNCLFlBQUwsQ0FBa0J1RixJQUFsQixDQUF1QlYsSUFBdkI7QUFDQSxXQUFPQSxJQUFQO0FBQ0Q7O0FBRURXLEVBQUFBLGVBQWUsQ0FBQ3ZFLFNBQUQsRUFBWXFDLEtBQVosRUFBbUJ3QixVQUFVLEdBQUcsS0FBaEMsRUFBdUNDLGNBQWMsR0FBRyxLQUF4RCxFQUErRDtBQUM1RSxRQUNHLENBQUNBLGNBQUQsSUFBbUIvRyw0QkFBNEIsQ0FBQ2lILFFBQTdCLENBQXNDaEUsU0FBdEMsQ0FBcEIsSUFDQSxLQUFLaEIsY0FBTCxDQUFvQmdCLFNBQXBCLENBRkYsRUFHRTtBQUNBLFlBQU0yRCxPQUFPLEdBQUksU0FBUTNELFNBQVUsb0ZBQW5DOztBQUNBLFVBQUk2RCxVQUFKLEVBQWdCO0FBQ2QsY0FBTSxJQUFJTSxLQUFKLENBQVVSLE9BQVYsQ0FBTjtBQUNEOztBQUNELFdBQUtGLFFBQUwsQ0FBYyxNQUFkLEVBQXNCRSxPQUF0Qjs7QUFDQSxhQUFPakQsU0FBUDtBQUNEOztBQUNELFNBQUsxQixjQUFMLENBQW9CZ0IsU0FBcEIsSUFBaUNxQyxLQUFqQztBQUNBLFdBQU9BLEtBQVA7QUFDRDs7QUFFRG1DLEVBQUFBLGtCQUFrQixDQUFDeEUsU0FBRCxFQUFZcUMsS0FBWixFQUFtQndCLFVBQVUsR0FBRyxLQUFoQyxFQUF1Q0MsY0FBYyxHQUFHLEtBQXhELEVBQStEO0FBQy9FLFFBQ0csQ0FBQ0EsY0FBRCxJQUFtQjlHLCtCQUErQixDQUFDZ0gsUUFBaEMsQ0FBeUNoRSxTQUF6QyxDQUFwQixJQUNBLEtBQUtmLGdCQUFMLENBQXNCZSxTQUF0QixDQUZGLEVBR0U7QUFDQSxZQUFNMkQsT0FBTyxHQUFJLFlBQVczRCxTQUFVLG9GQUF0Qzs7QUFDQSxVQUFJNkQsVUFBSixFQUFnQjtBQUNkLGNBQU0sSUFBSU0sS0FBSixDQUFVUixPQUFWLENBQU47QUFDRDs7QUFDRCxXQUFLRixRQUFMLENBQWMsTUFBZCxFQUFzQkUsT0FBdEI7O0FBQ0EsYUFBT2pELFNBQVA7QUFDRDs7QUFDRCxTQUFLekIsZ0JBQUwsQ0FBc0JlLFNBQXRCLElBQW1DcUMsS0FBbkM7QUFDQSxXQUFPQSxLQUFQO0FBQ0Q7O0FBRURvQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBUTtBQUNqQixRQUFJQSxLQUFLLFlBQVlDLGNBQU1SLEtBQTNCLEVBQWtDO0FBQ2hDLFdBQUs3RyxHQUFMLENBQVNvSCxLQUFULENBQWUsZUFBZixFQUFnQ0EsS0FBaEM7QUFDRCxLQUZELE1BRU87QUFDTCxXQUFLcEgsR0FBTCxDQUFTb0gsS0FBVCxDQUFlLGlDQUFmLEVBQWtEQSxLQUFsRCxFQUF5REEsS0FBSyxDQUFDRSxLQUEvRDtBQUNEOztBQUNELFVBQU0sdUNBQWVGLEtBQWYsQ0FBTjtBQUNEOztBQUUrQixRQUExQjVHLDBCQUEwQixHQUFHO0FBQ2pDLFVBQU0sQ0FBQytHLGdCQUFELEVBQW1CaEgsa0JBQW5CLElBQXlDLE1BQU1pSCxPQUFPLENBQUNDLEdBQVIsQ0FBWSxDQUMvRCxLQUFLMUgsa0JBQUwsQ0FBd0IySCxVQUF4QixFQUQrRCxFQUUvRCxLQUFLNUgsc0JBQUwsQ0FBNEI2SCxnQkFBNUIsRUFGK0QsQ0FBWixDQUFyRDtBQUtBLFNBQUtKLGdCQUFMLEdBQXdCQSxnQkFBeEI7QUFFQSxXQUFPO0FBQ0xoSCxNQUFBQTtBQURLLEtBQVA7QUFHRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7QUFDNEIsUUFBcEJHLG9CQUFvQixDQUFDSCxrQkFBRCxFQUF5QztBQUNqRSxVQUFNO0FBQUVxSCxNQUFBQSxpQkFBRjtBQUFxQkMsTUFBQUE7QUFBckIsUUFBNEN0SCxrQkFBbEQ7QUFDQSxVQUFNdUgsVUFBVSxHQUFHLE1BQU0sS0FBS1AsZ0JBQUwsQ0FBc0JRLGFBQXRCLEVBQXpCOztBQUVBLFFBQUlDLEtBQUssQ0FBQ0MsT0FBTixDQUFjTCxpQkFBZCxLQUFvQ0ksS0FBSyxDQUFDQyxPQUFOLENBQWNKLGtCQUFkLENBQXhDLEVBQTJFO0FBQ3pFLFVBQUlLLGVBQWUsR0FBR0osVUFBdEI7O0FBQ0EsVUFBSUYsaUJBQUosRUFBdUI7QUFDckJNLFFBQUFBLGVBQWUsR0FBR0osVUFBVSxDQUFDSyxNQUFYLENBQWtCakgsS0FBSyxJQUFJO0FBQzNDLGlCQUFPMEcsaUJBQWlCLENBQUNsQixRQUFsQixDQUEyQnhGLEtBQUssQ0FBQ0MsU0FBakMsQ0FBUDtBQUNELFNBRmlCLENBQWxCO0FBR0Q7O0FBQ0QsVUFBSTBHLGtCQUFKLEVBQXdCO0FBQ3RCO0FBQ0E7QUFDQTtBQUNBSyxRQUFBQSxlQUFlLEdBQUdBLGVBQWUsQ0FBQ0MsTUFBaEIsQ0FBdUJqSCxLQUFLLElBQUk7QUFDaEQsaUJBQU8sQ0FBQzJHLGtCQUFrQixDQUFDbkIsUUFBbkIsQ0FBNEJ4RixLQUFLLENBQUNDLFNBQWxDLENBQVI7QUFDRCxTQUZpQixDQUFsQjtBQUdEOztBQUVELFdBQUtpSCxvQkFBTCxHQUE0QixDQUFDRixlQUFlLENBQUNHLElBQWhCLENBQXFCbkgsS0FBSyxJQUFJO0FBQ3pELGVBQU9BLEtBQUssQ0FBQ0MsU0FBTixLQUFvQixPQUEzQjtBQUNELE9BRjRCLENBQTdCO0FBSUEsYUFBTytHLGVBQVA7QUFDRCxLQXJCRCxNQXFCTztBQUNMLGFBQU9KLFVBQVA7QUFDRDtBQUNGO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0UzRixFQUFBQSwwQkFBMEIsQ0FBQ3BCLFlBQUQsRUFBZVIsa0JBQWYsRUFBdUQ7QUFDL0UsVUFBTTtBQUFFK0gsTUFBQUE7QUFBRixRQUFtQi9ILGtCQUF6QixDQUQrRSxDQUcvRTtBQUNBOztBQUNBLFVBQU1nSSxXQUFXLEdBQUcsQ0FBQ0MsQ0FBRCxFQUFJQyxDQUFKLEtBQVU7QUFDNUJELE1BQUFBLENBQUMsR0FBR0EsQ0FBQyxDQUFDckgsU0FBTjtBQUNBc0gsTUFBQUEsQ0FBQyxHQUFHQSxDQUFDLENBQUN0SCxTQUFOOztBQUNBLFVBQUlxSCxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixZQUFJQyxDQUFDLENBQUMsQ0FBRCxDQUFELEtBQVMsR0FBYixFQUFrQjtBQUNoQixpQkFBTyxDQUFDLENBQVI7QUFDRDtBQUNGOztBQUNELFVBQUlBLENBQUMsQ0FBQyxDQUFELENBQUQsS0FBUyxHQUFiLEVBQWtCO0FBQ2hCLFlBQUlELENBQUMsQ0FBQyxDQUFELENBQUQsS0FBUyxHQUFiLEVBQWtCO0FBQ2hCLGlCQUFPLENBQVA7QUFDRDtBQUNGOztBQUNELFVBQUlBLENBQUMsS0FBS0MsQ0FBVixFQUFhO0FBQ1gsZUFBTyxDQUFQO0FBQ0QsT0FGRCxNQUVPLElBQUlELENBQUMsR0FBR0MsQ0FBUixFQUFXO0FBQ2hCLGVBQU8sQ0FBQyxDQUFSO0FBQ0QsT0FGTSxNQUVBO0FBQ0wsZUFBTyxDQUFQO0FBQ0Q7QUFDRixLQXBCRDs7QUFzQkEsV0FBTzFILFlBQVksQ0FBQzhCLElBQWIsQ0FBa0IwRixXQUFsQixFQUErQkcsR0FBL0IsQ0FBbUNyRyxVQUFVLElBQUk7QUFDdEQsVUFBSUMsZ0JBQUo7O0FBQ0EsVUFBSWdHLFlBQUosRUFBa0I7QUFDaEJoRyxRQUFBQSxnQkFBZ0IsR0FBR2dHLFlBQVksQ0FBQzVDLElBQWIsQ0FBa0JpRCxDQUFDLElBQUlBLENBQUMsQ0FBQ3hILFNBQUYsS0FBZ0JrQixVQUFVLENBQUNsQixTQUFsRCxDQUFuQjtBQUNEOztBQUNELGFBQU8sQ0FBQ2tCLFVBQUQsRUFBYUMsZ0JBQWIsQ0FBUDtBQUNELEtBTk0sQ0FBUDtBQU9EOztBQUVzQixRQUFqQjFCLGlCQUFpQixHQUFHO0FBQ3hCLFdBQU8sTUFBTSxnQ0FBaUIsS0FBS1YsS0FBdEIsRUFBNkJpSSxNQUE3QixDQUFvQ1MsWUFBWSxJQUFJO0FBQy9ELFVBQUksMkJBQTJCQyxJQUEzQixDQUFnQ0QsWUFBaEMsQ0FBSixFQUFtRDtBQUNqRCxlQUFPLElBQVA7QUFDRCxPQUZELE1BRU87QUFDTCxhQUFLekMsUUFBTCxDQUNFLE1BREYsRUFFRyxZQUFXeUMsWUFBYSxxR0FGM0I7O0FBSUEsZUFBTyxLQUFQO0FBQ0Q7QUFDRixLQVZZLENBQWI7QUFXRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0V4SCxFQUFBQSxzQkFBc0IsQ0FBQ3ZCLE1BQUQsRUFJVjtBQUNWLFVBQU07QUFBRWtCLE1BQUFBLFlBQUY7QUFBZ0JSLE1BQUFBLGtCQUFoQjtBQUFvQ00sTUFBQUE7QUFBcEMsUUFBNERoQixNQUFsRSxDQURVLENBR1Y7O0FBQ0EsUUFBSSxDQUFDLEtBQUt3QixhQUFWLEVBQXlCO0FBQ3ZCLGFBQU8sSUFBUDtBQUNEOztBQUVELFFBQ0UsNkJBQWtCLEtBQUtkLGtCQUF2QixFQUEyQ0Esa0JBQTNDLEtBQ0EsS0FBS00sbUJBQUwsS0FBNkJBLG1CQUQ3QixJQUVBLDZCQUFrQixLQUFLRSxZQUF2QixFQUFxQ0EsWUFBckMsQ0FIRixFQUlFO0FBQ0EsYUFBTyxLQUFQO0FBQ0Q7O0FBQ0QsV0FBTyxJQUFQO0FBQ0Q7O0FBamRzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IEdyYXBoUUxTY2hlbWEsIEdyYXBoUUxPYmplY3RUeXBlLCBEb2N1bWVudE5vZGUsIEdyYXBoUUxOYW1lZFR5cGUgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHN0aXRjaFNjaGVtYXMgfSBmcm9tICdAZ3JhcGhxbC10b29scy9zdGl0Y2gnO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IgfSBmcm9tICdAZ3JhcGhxbC10b29scy91dGlscyc7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgcGFyc2VDbGFzc011dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMnO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsIHsgUGFyc2VHcmFwaFFMQ29uZmlnIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHsgdG9HcmFwaFFMRXJyb3IgfSBmcm9tICcuL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIHNjaGVtYURpcmVjdGl2ZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hVHlwZXMgZnJvbSAnLi9sb2FkZXJzL3NjaGVtYVR5cGVzJztcbmltcG9ydCB7IGdldEZ1bmN0aW9uTmFtZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0UmVsYXlTY2hlbWEgZnJvbSAnLi9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYSc7XG5cbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfVFlQRV9OQU1FUyA9IFtcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0ludCcsXG4gICdGbG9hdCcsXG4gICdJRCcsXG4gICdBcnJheVJlc3VsdCcsXG4gICdRdWVyeScsXG4gICdNdXRhdGlvbicsXG4gICdTdWJzY3JpcHRpb24nLFxuICAnQ3JlYXRlRmlsZUlucHV0JyxcbiAgJ0NyZWF0ZUZpbGVQYXlsb2FkJyxcbiAgJ1ZpZXdlcicsXG4gICdTaWduVXBJbnB1dCcsXG4gICdTaWduVXBQYXlsb2FkJyxcbiAgJ0xvZ0luSW5wdXQnLFxuICAnTG9nSW5QYXlsb2FkJyxcbiAgJ0xvZ091dElucHV0JyxcbiAgJ0xvZ091dFBheWxvYWQnLFxuICAnQ2xvdWRDb2RlRnVuY3Rpb24nLFxuICAnQ2FsbENsb3VkQ29kZUlucHV0JyxcbiAgJ0NhbGxDbG91ZENvZGVQYXlsb2FkJyxcbiAgJ0NyZWF0ZUNsYXNzSW5wdXQnLFxuICAnQ3JlYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1VwZGF0ZUNsYXNzSW5wdXQnLFxuICAnVXBkYXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ0RlbGV0ZUNsYXNzSW5wdXQnLFxuICAnRGVsZXRlQ2xhc3NQYXlsb2FkJyxcbiAgJ1BhZ2VJbmZvJyxcbl07XG5jb25zdCBSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTID0gWydoZWFsdGgnLCAndmlld2VyJywgJ2NsYXNzJywgJ2NsYXNzZXMnXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMgPSBbXG4gICdzaWduVXAnLFxuICAnbG9nSW4nLFxuICAnbG9nT3V0JyxcbiAgJ2NyZWF0ZUZpbGUnLFxuICAnY2FsbENsb3VkQ29kZScsXG4gICdjcmVhdGVDbGFzcycsXG4gICd1cGRhdGVDbGFzcycsXG4gICdkZWxldGVDbGFzcycsXG5dO1xuXG5jbGFzcyBQYXJzZUdyYXBoUUxTY2hlbWEge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbiAgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWc7XG4gIGxvZzogYW55O1xuICBhcHBJZDogc3RyaW5nO1xuICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSk7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcGFyYW1zOiB7XG4gICAgICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgICBsb2c6IGFueSxcbiAgICAgIGFwcElkOiBzdHJpbmcsXG4gICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnM6ID8oc3RyaW5nIHwgR3JhcGhRTFNjaGVtYSB8IERvY3VtZW50Tm9kZSB8IEdyYXBoUUxOYW1lZFR5cGVbXSksXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9XG4gICAgICBwYXJhbXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXJzZUdyYXBoUUxDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgZGF0YWJhc2VDb250cm9sbGVyIGluc3RhbmNlIScpO1xuICAgIHRoaXMubG9nID0gcGFyYW1zLmxvZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGxvZyBpbnN0YW5jZSEnKTtcbiAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcmFtcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnM7XG4gICAgdGhpcy5hcHBJZCA9IHBhcmFtcy5hcHBJZCB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSB0aGUgYXBwSWQhJyk7XG4gICAgdGhpcy5zY2hlbWFDYWNoZSA9IFNjaGVtYUNhY2hlO1xuICAgIHRoaXMubG9nQ2FjaGUgPSB7fTtcbiAgfVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgY29uc3QgeyBwYXJzZUdyYXBoUUxDb25maWcgfSA9IGF3YWl0IHRoaXMuX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKTtcbiAgICBjb25zdCBwYXJzZUNsYXNzZXNBcnJheSA9IGF3YWl0IHRoaXMuX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnKTtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0RnVuY3Rpb25OYW1lcygpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzLmpvaW4oKTtcblxuICAgIGNvbnN0IHBhcnNlQ2xhc3NlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5LnJlZHVjZSgoYWNjLCBjbGF6eikgPT4ge1xuICAgICAgYWNjW2NsYXp6LmNsYXNzTmFtZV0gPSBjbGF6ejtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICAgIGlmIChcbiAgICAgICF0aGlzLl9oYXNTY2hlbWFJbnB1dENoYW5nZWQoe1xuICAgICAgICBwYXJzZUNsYXNzZXMsXG4gICAgICAgIHBhcnNlR3JhcGhRTENvbmZpZyxcbiAgICAgICAgZnVuY3Rpb25OYW1lc1N0cmluZyxcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICAgIH1cblxuICAgIHRoaXMucGFyc2VDbGFzc2VzID0gcGFyc2VDbGFzc2VzO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29uZmlnID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIHRoaXMuZnVuY3Rpb25OYW1lcyA9IGZ1bmN0aW9uTmFtZXM7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzU3RyaW5nID0gZnVuY3Rpb25OYW1lc1N0cmluZztcbiAgICB0aGlzLnBhcnNlQ2xhc3NUeXBlcyA9IHt9O1xuICAgIHRoaXMudmlld2VyVHlwZSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG51bGw7XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxUeXBlcyA9IFtdO1xuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zID0ge307XG4gICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzID0ge307XG4gICAgdGhpcy5yZWxheU5vZGVJbnRlcmZhY2UgPSBudWxsO1xuXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5sb2FkKHRoaXMpO1xuICAgIGRlZmF1bHRSZWxheVNjaGVtYS5sb2FkKHRoaXMpO1xuICAgIHNjaGVtYVR5cGVzLmxvYWQodGhpcyk7XG5cbiAgICB0aGlzLl9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3Nlc0FycmF5LCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIC8vIFNvbWUgdGltZXMgc2NoZW1hIHJldHVybiB0aGUgX2F1dGhfZGF0YV8gZmllbGRcbiAgICAgICAgLy8gaXQgd2lsbCBsZWFkIHRvIHVuc3RhYmxlIGdyYXBocWwgZ2VuZXJhdGlvbiBvcmRlclxuICAgICAgICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5zdGFydHNXaXRoKCdfYXV0aF9kYXRhXycpKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIG9yZGVyIGluc2lkZSB0aGUgc2NoZW1hIHNlZW1zIHRvIG5vdCBiZSBjb25zaXN0ZW50IGFjcm9zc1xuICAgICAgICAvLyByZXN0YXJ0IHNvIHdlIG5lZWQgdG8gZW5zdXJlIGFuIGFscGhhYmV0aWNhbCBvcmRlclxuICAgICAgICAvLyBhbHNvIGl0J3MgYmV0dGVyIGZvciB0aGUgcGxheWdyb3VuZCBkb2N1bWVudGF0aW9uXG4gICAgICAgIGNvbnN0IG9yZGVyZWRGaWVsZHMgPSB7fTtcbiAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBvcmRlcmVkRmllbGRzW2ZpZWxkTmFtZV0gPSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyA9IG9yZGVyZWRGaWVsZHM7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlc0FycmF5KTtcbiAgICBkZWZhdWx0R3JhcGhRTFF1ZXJpZXMubG9hZCh0aGlzKTtcbiAgICBkZWZhdWx0R3JhcGhRTE11dGF0aW9ucy5sb2FkKHRoaXMpO1xuXG4gICAgbGV0IGdyYXBoUUxRdWVyeSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMUXVlcmllcykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTFF1ZXJ5ID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1F1ZXJ5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHF1ZXJpZXMuJyxcbiAgICAgICAgZmllbGRzOiB0aGlzLmdyYXBoUUxRdWVyaWVzLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxRdWVyeSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxNdXRhdGlvbiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoT2JqZWN0LmtleXModGhpcy5ncmFwaFFMTXV0YXRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnTXV0YXRpb24nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3IgbXV0YXRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMTXV0YXRpb25zLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmFkZEdyYXBoUUxUeXBlKGdyYXBoUUxNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGdyYXBoUUxTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxTdWJzY3JpcHRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgICBuYW1lOiAnU3Vic2NyaXB0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTdWJzY3JpcHRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBzdWJzY3JpcHRpb25zLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMU3Vic2NyaXB0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMU3Vic2NyaXB0aW9uLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbmV3IEdyYXBoUUxTY2hlbWEoe1xuICAgICAgdHlwZXM6IHRoaXMuZ3JhcGhRTFR5cGVzLFxuICAgICAgcXVlcnk6IGdyYXBoUUxRdWVyeSxcbiAgICAgIG11dGF0aW9uOiBncmFwaFFMTXV0YXRpb24sXG4gICAgICBzdWJzY3JpcHRpb246IGdyYXBoUUxTdWJzY3JpcHRpb24sXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMpIHtcbiAgICAgIHNjaGVtYURpcmVjdGl2ZXMubG9hZCh0aGlzKTtcblxuICAgICAgaWYgKHR5cGVvZiB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5nZXRUeXBlTWFwID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIEluIGZvbGxvd2luZyBjb2RlIHdlIHVzZSB1bmRlcnNjb3JlIGF0dHIgdG8gYXZvaWQganMgdmFyIHVuIHJlZlxuICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLl90eXBlTWFwO1xuICAgICAgICBjb25zdCBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlID0gKHBhcmVudCwga2V5KSA9PiB7XG4gICAgICAgICAgaWYgKHBhcmVudFtrZXldLm5hbWUpIHtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAmJlxuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdICE9PSBwYXJlbnRba2V5XVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIFRvIGF2b2lkIHVucmVzb2x2ZWQgZmllbGQgb24gb3ZlcmxvYWRlZCBzY2hlbWFcbiAgICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgZmluYWwgdHlwZSB3aXRoIHRoZSBhdXRvIHNjaGVtYSBvbmVcbiAgICAgICAgICAgICAgcGFyZW50W2tleV0gPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW3BhcmVudFtrZXldLm5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocGFyZW50W2tleV0ub2ZUeXBlKSB7XG4gICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUocGFyZW50W2tleV0sICdvZlR5cGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIEFkZCBub24gc2hhcmVkIHR5cGVzIGZyb20gY3VzdG9tIHNjaGVtYSB0byBhdXRvIHNjaGVtYVxuICAgICAgICAvLyBub3RlOiBzb21lIG5vbiBzaGFyZWQgdHlwZXMgY2FuIHVzZSBzb21lIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBzbyB0aGlzIGNvZGUgbmVlZCB0byBiZSByYW4gYmVmb3JlIHRoZSBzaGFyZWQgdHlwZXMgYWRkaXRpb25cbiAgICAgICAgLy8gd2UgdXNlIHNvcnQgdG8gZW5zdXJlIHNjaGVtYSBjb25zaXN0ZW5jeSBvdmVyIHJlc3RhcnRzXG4gICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwKVxuICAgICAgICAgIC5zb3J0KClcbiAgICAgICAgICAuZm9yRWFjaChjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlTWFwW2N1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5XTtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIHx8XG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lIHx8XG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUuc3RhcnRzV2l0aCgnX18nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGF1dG9HcmFwaFFMU2NoZW1hVHlwZSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbXG4gICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBpZiAoIWF1dG9HcmFwaFFMU2NoZW1hVHlwZSkge1xuICAgICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICAgIGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWVcbiAgICAgICAgICAgICAgXSA9IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAvLyBIYW5kbGUgc2hhcmVkIHR5cGVzXG4gICAgICAgIC8vIFdlIHBhc3MgdGhyb3VnaCBlYWNoIHR5cGUgYW5kIGVuc3VyZSB0aGF0IGFsbCBzdWIgZmllbGQgdHlwZXMgYXJlIHJlcGxhY2VkXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBpZiAoYXV0b0dyYXBoUUxTY2hlbWFUeXBlICYmIHR5cGVvZiBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkcylcbiAgICAgICAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgICAgICAgLmZvckVhY2goZmllbGRLZXkgPT4ge1xuICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5fZmllbGRzW2ZpZWxkS2V5XTtcbiAgICAgICAgICAgICAgICAgIGZpbmRBbmRSZXBsYWNlTGFzdFR5cGUoZmllbGQsICd0eXBlJyk7XG4gICAgICAgICAgICAgICAgICBhdXRvR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZC5uYW1lXSA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gYXdhaXQgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMoe1xuICAgICAgICAgIGRpcmVjdGl2ZXNEZWZpbml0aW9uc1NjaGVtYTogdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgIGF1dG9TY2hlbWE6IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEsXG4gICAgICAgICAgc3RpdGNoU2NoZW1hcyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBzdGl0Y2hTY2hlbWFzKHtcbiAgICAgICAgICBzY2hlbWFzOiBbXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMsXG4gICAgICAgICAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBtZXJnZURpcmVjdGl2ZXM6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBPbmx5IG1lcmdlIGRpcmVjdGl2ZSB3aGVuIHN0cmluZyBzY2hlbWEgcHJvdmlkZWRcbiAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlTWFwID0gdGhpcy5ncmFwaFFMU2NoZW1hLmdldFR5cGVNYXAoKTtcbiAgICAgIE9iamVjdC5rZXlzKGdyYXBoUUxTY2hlbWFUeXBlTWFwKS5mb3JFYWNoKGdyYXBoUUxTY2hlbWFUeXBlTmFtZSA9PiB7XG4gICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlID0gZ3JhcGhRTFNjaGVtYVR5cGVNYXBbZ3JhcGhRTFNjaGVtYVR5cGVOYW1lXTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBncmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5kZWZpbml0aW9uc1xuICAgICAgICApIHtcbiAgICAgICAgICBjb25zdCBncmFwaFFMQ3VzdG9tVHlwZURlZiA9IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLmRlZmluaXRpb25zLmZpbmQoXG4gICAgICAgICAgICBkZWZpbml0aW9uID0+IGRlZmluaXRpb24ubmFtZS52YWx1ZSA9PT0gZ3JhcGhRTFNjaGVtYVR5cGVOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoZ3JhcGhRTEN1c3RvbVR5cGVEZWYpIHtcbiAgICAgICAgICAgIGNvbnN0IGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXAgPSBncmFwaFFMU2NoZW1hVHlwZS5nZXRGaWVsZHMoKTtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXApLmZvckVhY2goZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkID0gZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE1hcFtncmFwaFFMU2NoZW1hVHlwZUZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIGlmICghZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXN0Tm9kZSA9IGdyYXBoUUxDdXN0b21UeXBlRGVmLmZpZWxkcy5maW5kKFxuICAgICAgICAgICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmIChhc3ROb2RlKSB7XG4gICAgICAgICAgICAgICAgICBncmFwaFFMU2NoZW1hVHlwZUZpZWxkLmFzdE5vZGUgPSBhc3ROb2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgU2NoZW1hRGlyZWN0aXZlVmlzaXRvci52aXNpdFNjaGVtYURpcmVjdGl2ZXMoXG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSxcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5ncmFwaFFMU2NoZW1hO1xuICB9XG5cbiAgX2xvZ09uY2Uoc2V2ZXJpdHksIG1lc3NhZ2UpIHtcbiAgICBpZiAodGhpcy5sb2dDYWNoZVttZXNzYWdlXSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxvZ1tzZXZlcml0eV0obWVzc2FnZSk7XG4gICAgdGhpcy5sb2dDYWNoZVttZXNzYWdlXSA9IHRydWU7XG4gIH1cblxuICBhZGRHcmFwaFFMVHlwZSh0eXBlLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UsIGlnbm9yZUNvbm5lY3Rpb24gPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTLmluY2x1ZGVzKHR5cGUubmFtZSkpIHx8XG4gICAgICB0aGlzLmdyYXBoUUxUeXBlcy5maW5kKGV4aXN0aW5nVHlwZSA9PiBleGlzdGluZ1R5cGUubmFtZSA9PT0gdHlwZS5uYW1lKSB8fFxuICAgICAgKCFpZ25vcmVDb25uZWN0aW9uICYmIHR5cGUubmFtZS5lbmRzV2l0aCgnQ29ubmVjdGlvbicpKVxuICAgICkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUeXBlICR7dHlwZS5uYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyB0eXBlLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy53YXJuQ2FjaGUpIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxUeXBlcy5wdXNoKHR5cGUpO1xuICAgIHJldHVybiB0eXBlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFF1ZXJ5KGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbG9nT25jZSgnd2FybicsIG1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgYWRkR3JhcGhRTE11dGF0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMTXV0YXRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgTXV0YXRpb24gJHtmaWVsZE5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIGZpZWxkLmA7XG4gICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sb2dPbmNlKCd3YXJuJywgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxNdXRhdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGhhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVycm9yLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IHRvR3JhcGhRTEVycm9yKGVycm9yKTtcbiAgfVxuXG4gIGFzeW5jIF9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCkge1xuICAgIGNvbnN0IFtzY2hlbWFDb250cm9sbGVyLCBwYXJzZUdyYXBoUUxDb25maWddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIubG9hZFNjaGVtYSgpLFxuICAgICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyLmdldEdyYXBoUUxDb25maWcoKSxcbiAgICBdKTtcblxuICAgIHRoaXMuc2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0cyBhbGwgY2xhc3NlcyBmb3VuZCBieSB0aGUgYHNjaGVtYUNvbnRyb2xsZXJgXG4gICAqIG1pbnVzIHRob3NlIGZpbHRlcmVkIG91dCBieSB0aGUgYXBwJ3MgcGFyc2VHcmFwaFFMQ29uZmlnLlxuICAgKi9cbiAgYXN5bmMgX2dldENsYXNzZXNGb3JTY2hlbWEocGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGVuYWJsZWRGb3JDbGFzc2VzLCBkaXNhYmxlZEZvckNsYXNzZXMgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcbiAgICBjb25zdCBhbGxDbGFzc2VzID0gYXdhaXQgdGhpcy5zY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KGVuYWJsZWRGb3JDbGFzc2VzKSB8fCBBcnJheS5pc0FycmF5KGRpc2FibGVkRm9yQ2xhc3NlcykpIHtcbiAgICAgIGxldCBpbmNsdWRlZENsYXNzZXMgPSBhbGxDbGFzc2VzO1xuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gZW5hYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzKSB7XG4gICAgICAgIC8vIENsYXNzZXMgaW5jbHVkZWQgaW4gYGVuYWJsZWRGb3JDbGFzc2VzYCB0aGF0XG4gICAgICAgIC8vIGFyZSBhbHNvIHByZXNlbnQgaW4gYGRpc2FibGVkRm9yQ2xhc3Nlc2Agd2lsbFxuICAgICAgICAvLyBzdGlsbCBiZSBmaWx0ZXJlZCBvdXRcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gaW5jbHVkZWRDbGFzc2VzLmZpbHRlcihjbGF6eiA9PiB7XG4gICAgICAgICAgcmV0dXJuICFkaXNhYmxlZEZvckNsYXNzZXMuaW5jbHVkZXMoY2xhenouY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXNVc2Vyc0NsYXNzRGlzYWJsZWQgPSAhaW5jbHVkZWRDbGFzc2VzLnNvbWUoY2xhenogPT4ge1xuICAgICAgICByZXR1cm4gY2xhenouY2xhc3NOYW1lID09PSAnX1VzZXInO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbmNsdWRlZENsYXNzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBhbGxDbGFzc2VzO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIG1ldGhvZCByZXR1cm5zIGEgbGlzdCBvZiB0dXBsZXNcbiAgICogdGhhdCBwcm92aWRlIHRoZSBwYXJzZUNsYXNzIGFsb25nIHdpdGhcbiAgICogaXRzIHBhcnNlQ2xhc3NDb25maWcgd2hlcmUgcHJvdmlkZWQuXG4gICAqL1xuICBfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyhwYXJzZUNsYXNzZXMsIHBhcnNlR3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgY29uc3QgeyBjbGFzc0NvbmZpZ3MgfSA9IHBhcnNlR3JhcGhRTENvbmZpZztcblxuICAgIC8vIE1ha2Ugc3VyZXMgdGhhdCB0aGUgZGVmYXVsdCBjbGFzc2VzIGFuZCBjbGFzc2VzIHRoYXRcbiAgICAvLyBzdGFydHMgd2l0aCBjYXBpdGFsaXplZCBsZXR0ZXIgd2lsbCBiZSBnZW5lcmF0ZWQgZmlyc3QuXG4gICAgY29uc3Qgc29ydENsYXNzZXMgPSAoYSwgYikgPT4ge1xuICAgICAgYSA9IGEuY2xhc3NOYW1lO1xuICAgICAgYiA9IGIuY2xhc3NOYW1lO1xuICAgICAgaWYgKGFbMF0gPT09ICdfJykge1xuICAgICAgICBpZiAoYlswXSAhPT0gJ18nKSB7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYlswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChhWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9IGVsc2UgaWYgKGEgPCBiKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAxO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gcGFyc2VDbGFzc2VzLnNvcnQoc29ydENsYXNzZXMpLm1hcChwYXJzZUNsYXNzID0+IHtcbiAgICAgIGxldCBwYXJzZUNsYXNzQ29uZmlnO1xuICAgICAgaWYgKGNsYXNzQ29uZmlncykge1xuICAgICAgICBwYXJzZUNsYXNzQ29uZmlnID0gY2xhc3NDb25maWdzLmZpbmQoYyA9PiBjLmNsYXNzTmFtZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFtwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIF9nZXRGdW5jdGlvbk5hbWVzKCkge1xuICAgIHJldHVybiBhd2FpdCBnZXRGdW5jdGlvbk5hbWVzKHRoaXMuYXBwSWQpLmZpbHRlcihmdW5jdGlvbk5hbWUgPT4ge1xuICAgICAgaWYgKC9eW19hLXpBLVpdW19hLXpBLVowLTldKiQvLnRlc3QoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2xvZ09uY2UoXG4gICAgICAgICAgJ3dhcm4nLFxuICAgICAgICAgIGBGdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSBiZWNhdXNlIEdyYXBoUUwgbmFtZXMgbXVzdCBtYXRjaCAvXltfYS16QS1aXVtfYS16QS1aMC05XSokLy5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGNoYW5nZXMgdG8gdGhlIHBhcnNlQ2xhc3Nlc1xuICAgKiBvYmplY3RzIChpLmUuIGRhdGFiYXNlIHNjaGVtYSkgb3IgdG9cbiAgICogdGhlIHBhcnNlR3JhcGhRTENvbmZpZyBvYmplY3QuIElmIG5vXG4gICAqIGNoYW5nZXMgYXJlIGZvdW5kLCByZXR1cm4gdHJ1ZTtcbiAgICovXG4gIF9oYXNTY2hlbWFJbnB1dENoYW5nZWQocGFyYW1zOiB7XG4gICAgcGFyc2VDbGFzc2VzOiBhbnksXG4gICAgcGFyc2VHcmFwaFFMQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgIGZ1bmN0aW9uTmFtZXNTdHJpbmc6IHN0cmluZyxcbiAgfSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgcGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcsIGZ1bmN0aW9uTmFtZXNTdHJpbmcgfSA9IHBhcmFtcztcblxuICAgIC8vIEZpcnN0IGluaXRcbiAgICBpZiAoIXRoaXMuZ3JhcGhRTFNjaGVtYSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUdyYXBoUUxDb25maWcsIHBhcnNlR3JhcGhRTENvbmZpZykgJiZcbiAgICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9PT0gZnVuY3Rpb25OYW1lc1N0cmluZyAmJlxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUNsYXNzZXMsIHBhcnNlQ2xhc3NlcylcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VHcmFwaFFMU2NoZW1hIH07XG4iXX0=