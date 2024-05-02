"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var _parseGraphQLUtils = require("../parseGraphQLUtils");
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));
var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");
var _className = require("../transformers/className");
var _mutation = require("../transformers/mutation");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const filterDeletedFields = fields => Object.keys(fields).reduce((acc, key) => {
  var _fields$key;
  if (typeof fields[key] === 'object' && ((_fields$key = fields[key]) === null || _fields$key === void 0 ? void 0 : _fields$key.__op) === 'Delete') {
    acc[key] = null;
  }
  return acc;
}, fields);
const getOnlyRequiredFields = (updatedFields, selectedFieldsString, includedFieldsString, nativeObjectFields) => {
  const includedFields = includedFieldsString ? includedFieldsString.split(',') : [];
  const selectedFields = selectedFieldsString ? selectedFieldsString.split(',') : [];
  const missingFields = selectedFields.filter(field => !nativeObjectFields.includes(field) || includedFields.includes(field)).join(',');
  if (!missingFields.length) {
    return {
      needGet: false,
      keys: ''
    };
  } else {
    return {
      needGet: true,
      keys: missingFields
    };
  }
};
const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const getGraphQLQueryName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
    destroy: isDestroyEnabled = true,
    createAlias = '',
    updateAlias = '',
    destroyAlias = ''
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLOutputType
  } = parseGraphQLSchema.parseClassTypes[className];
  if (isCreateEnabled) {
    const createGraphQLMutationName = createAlias || `create${graphQLClassName}`;
    const createGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Create${graphQLClassName}`,
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      inputFields: {
        fields: {
          description: 'These are the fields that will be used to create the new object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the created object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            fields
          } = (0, _deepcopy.default)(args);
          if (!fields) fields = {};
          const {
            config,
            auth,
            info
          } = context;
          const parseFields = await (0, _mutation.transformTypes)('create', fields, {
            className,
            parseGraphQLSchema,
            originalFields: args.fields,
            req: {
              config,
              auth,
              info
            }
          });
          const createdObject = await objectsMutations.createObject(className, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'objectId', 'createdAt', 'updatedAt']);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys, parseGraphQLSchema.parseClasses);
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, undefined, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }
          return {
            [getGraphQLQueryName]: _objectSpread(_objectSpread(_objectSpread({}, createdObject), {}, {
              updatedAt: createdObject.createdAt
            }, filterDeletedFields(parseFields)), optimizedObject)
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    if (parseGraphQLSchema.addGraphQLType(createGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(createGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, createGraphQLMutation);
    }
  }
  if (isUpdateEnabled) {
    const updateGraphQLMutationName = updateAlias || `update${graphQLClassName}`;
    const updateGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Update${graphQLClassName}`,
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields that will be used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the updated object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            id,
            fields
          } = (0, _deepcopy.default)(args);
          if (!fields) fields = {};
          const {
            config,
            auth,
            info
          } = context;
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);
          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }
          const parseFields = await (0, _mutation.transformTypes)('update', fields, {
            className,
            parseGraphQLSchema,
            originalFields: args.fields,
            req: {
              config,
              auth,
              info
            }
          });
          const updatedObject = await objectsMutations.updateObject(className, id, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'objectId', 'updatedAt']);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys, parseGraphQLSchema.parseClasses);
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, undefined, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }
          return {
            [getGraphQLQueryName]: _objectSpread(_objectSpread(_objectSpread({
              objectId: id
            }, updatedObject), filterDeletedFields(parseFields)), optimizedObject)
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    if (parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, updateGraphQLMutation);
    }
  }
  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = destroyAlias || `delete${graphQLClassName}`;
    const deleteGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Delete${graphQLClassName}`,
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the deleted object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            id
          } = (0, _deepcopy.default)(args);
          const {
            config,
            auth,
            info
          } = context;
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);
          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          let optimizedObject = {};
          if (keys && keys.split(',').filter(key => !['id', 'objectId'].includes(key)).length > 0) {
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }
          await objectsMutations.deleteObject(className, id, config, auth, info);
          return {
            [getGraphQLQueryName]: _objectSpread({
              objectId: id
            }, optimizedObject)
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
    if (parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, deleteGraphQLMutation);
    }
  }
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9kZWVwY29weSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9wYXJzZUdyYXBoUUxVdGlscyIsIm9iamVjdHNNdXRhdGlvbnMiLCJvYmplY3RzUXVlcmllcyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX2NsYXNzTmFtZSIsIl9tdXRhdGlvbiIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm9iaiIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJmaWx0ZXJEZWxldGVkRmllbGRzIiwiZmllbGRzIiwicmVkdWNlIiwiYWNjIiwiX2ZpZWxkcyRrZXkiLCJfX29wIiwiZ2V0T25seVJlcXVpcmVkRmllbGRzIiwidXBkYXRlZEZpZWxkcyIsInNlbGVjdGVkRmllbGRzU3RyaW5nIiwiaW5jbHVkZWRGaWVsZHNTdHJpbmciLCJuYXRpdmVPYmplY3RGaWVsZHMiLCJpbmNsdWRlZEZpZWxkcyIsInNwbGl0Iiwic2VsZWN0ZWRGaWVsZHMiLCJtaXNzaW5nRmllbGRzIiwiZmllbGQiLCJpbmNsdWRlcyIsImpvaW4iLCJuZWVkR2V0IiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJpbnB1dEZpZWxkcyIsInR5cGUiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwib3JpZ2luYWxGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0IiwiY3JlYXRlT2JqZWN0IiwiZ2V0RmllbGROYW1lcyIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsImV4dHJhY3RLZXlzQW5kSW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm5lZWRUb0dldEFsbEtleXMiLCJwYXJzZUNsYXNzZXMiLCJvcHRpbWl6ZWRPYmplY3QiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb24iLCJpZCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiZ2xvYmFsSWRPYmplY3QiLCJmcm9tR2xvYmFsSWQiLCJ1cGRhdGVkT2JqZWN0IiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbiIsImRlbGV0ZU9iamVjdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCwgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgZmlsdGVyRGVsZXRlZEZpZWxkcyA9IGZpZWxkcyA9PlxuICBPYmplY3Qua2V5cyhmaWVsZHMpLnJlZHVjZSgoYWNjLCBrZXkpID0+IHtcbiAgICBpZiAodHlwZW9mIGZpZWxkc1trZXldID09PSAnb2JqZWN0JyAmJiBmaWVsZHNba2V5XT8uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgIGFjY1trZXldID0gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwgZmllbGRzKTtcblxuY29uc3QgZ2V0T25seVJlcXVpcmVkRmllbGRzID0gKFxuICB1cGRhdGVkRmllbGRzLFxuICBzZWxlY3RlZEZpZWxkc1N0cmluZyxcbiAgaW5jbHVkZWRGaWVsZHNTdHJpbmcsXG4gIG5hdGl2ZU9iamVjdEZpZWxkc1xuKSA9PiB7XG4gIGNvbnN0IGluY2x1ZGVkRmllbGRzID0gaW5jbHVkZWRGaWVsZHNTdHJpbmcgPyBpbmNsdWRlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpIDogW107XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNTdHJpbmcgPyBzZWxlY3RlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpIDogW107XG4gIGNvbnN0IG1pc3NpbmdGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1xuICAgIC5maWx0ZXIoZmllbGQgPT4gIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkgfHwgaW5jbHVkZWRGaWVsZHMuaW5jbHVkZXMoZmllbGQpKVxuICAgIC5qb2luKCcsJyk7XG4gIGlmICghbWlzc2luZ0ZpZWxkcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiBmYWxzZSwga2V5czogJycgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiB0cnVlLCBrZXlzOiBtaXNzaW5nRmllbGRzIH07XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbiAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9IGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIGRlc3Ryb3k6IGlzRGVzdHJveUVuYWJsZWQgPSB0cnVlLFxuICAgIGNyZWF0ZUFsaWFzOiBjcmVhdGVBbGlhcyA9ICcnLFxuICAgIHVwZGF0ZUFsaWFzOiB1cGRhdGVBbGlhcyA9ICcnLFxuICAgIGRlc3Ryb3lBbGlhczogZGVzdHJveUFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gY3JlYXRlQWxpYXMgfHwgYGNyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGNyZWF0ZSB0aGUgbmV3IG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICBvcmlnaW5hbEZpZWxkczogYXJncy5maWVsZHMsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCBjcmVhdGVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICdjcmVhdGVkQXQnLFxuICAgICAgICAgICAgJ3VwZGF0ZWRBdCcsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQgJiYgIW5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIGlmIChuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIC4uLmNyZWF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIHVwZGF0ZWRBdDogY3JlYXRlZE9iamVjdC5jcmVhdGVkQXQsXG4gICAgICAgICAgICAgIC4uLmZpbHRlckRlbGV0ZWRGaWVsZHMocGFyc2VGaWVsZHMpLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIGNyZWF0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzVXBkYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSB1cGRhdGVBbGlhcyB8fCBgdXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIHVwZGF0ZSB0aGUgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cGRhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQsIGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgdXBkYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBkZXN0cm95QWxpYXMgfHwgYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAoa2V5cyAmJiBrZXlzLnNwbGl0KCcsJykuZmlsdGVyKGtleSA9PiAhWydpZCcsICdvYmplY3RJZCddLmluY2x1ZGVzKGtleSkpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoY2xhc3NOYW1lLCBpZCwgY29uZmlnLCBhdXRoLCBpbmZvKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lLCBkZWxldGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxhQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxrQkFBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksU0FBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssbUJBQUEsR0FBQUMsdUJBQUEsQ0FBQU4sT0FBQTtBQUNBLElBQUFPLGtCQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxnQkFBQSxHQUFBRix1QkFBQSxDQUFBTixPQUFBO0FBQ0EsSUFBQVMsY0FBQSxHQUFBSCx1QkFBQSxDQUFBTixPQUFBO0FBQ0EsSUFBQVUsdUJBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLFVBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLFNBQUEsR0FBQVosT0FBQTtBQUEwRCxTQUFBYSx5QkFBQUMsQ0FBQSw2QkFBQUMsT0FBQSxtQkFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxDQUFBLFdBQUFBLENBQUEsR0FBQUcsQ0FBQSxHQUFBRCxDQUFBLEtBQUFGLENBQUE7QUFBQSxTQUFBUix3QkFBQVEsQ0FBQSxFQUFBRSxDQUFBLFNBQUFBLENBQUEsSUFBQUYsQ0FBQSxJQUFBQSxDQUFBLENBQUFJLFVBQUEsU0FBQUosQ0FBQSxlQUFBQSxDQUFBLHVCQUFBQSxDQUFBLHlCQUFBQSxDQUFBLFdBQUFLLE9BQUEsRUFBQUwsQ0FBQSxRQUFBRyxDQUFBLEdBQUFKLHdCQUFBLENBQUFHLENBQUEsT0FBQUMsQ0FBQSxJQUFBQSxDQUFBLENBQUFHLEdBQUEsQ0FBQU4sQ0FBQSxVQUFBRyxDQUFBLENBQUFJLEdBQUEsQ0FB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