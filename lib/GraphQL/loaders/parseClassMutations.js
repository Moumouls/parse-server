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
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const filterDeletedFields = fields => Object.keys(fields).reduce((acc, key) => {
  if (typeof fields[key] === 'object' && fields[key]?.__op === 'Delete') {
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
          if (!fields) {
            fields = {};
          }
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
            [getGraphQLQueryName]: {
              ...createdObject,
              updatedAt: createdObject.createdAt,
              ...filterDeletedFields(parseFields),
              ...optimizedObject
            }
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
          if (!fields) {
            fields = {};
          }
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
            [getGraphQLQueryName]: {
              objectId: id,
              ...updatedObject,
              ...filterDeletedFields(parseFields),
              ...optimizedObject
            }
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
            [getGraphQLQueryName]: {
              objectId: id,
              ...optimizedObject
            }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9kZWVwY29weSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9wYXJzZUdyYXBoUUxVdGlscyIsIm9iamVjdHNNdXRhdGlvbnMiLCJvYmplY3RzUXVlcmllcyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX2NsYXNzTmFtZSIsIl9tdXRhdGlvbiIsImUiLCJ0IiwiV2Vha01hcCIsInIiLCJuIiwiX19lc01vZHVsZSIsIm8iLCJpIiwiZiIsIl9fcHJvdG9fXyIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJzZXQiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImZpbHRlckRlbGV0ZWRGaWVsZHMiLCJmaWVsZHMiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwiX19vcCIsImdldE9ubHlSZXF1aXJlZEZpZWxkcyIsInVwZGF0ZWRGaWVsZHMiLCJzZWxlY3RlZEZpZWxkc1N0cmluZyIsImluY2x1ZGVkRmllbGRzU3RyaW5nIiwibmF0aXZlT2JqZWN0RmllbGRzIiwiaW5jbHVkZWRGaWVsZHMiLCJzcGxpdCIsInNlbGVjdGVkRmllbGRzIiwibWlzc2luZ0ZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJqb2luIiwibGVuZ3RoIiwibmVlZEdldCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsImNsYXNzTmFtZSIsImdyYXBoUUxDbGFzc05hbWUiLCJ0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwiLCJnZXRHcmFwaFFMUXVlcnlOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImNyZWF0ZSIsImlzQ3JlYXRlRW5hYmxlZCIsInVwZGF0ZSIsImlzVXBkYXRlRW5hYmxlZCIsImRlc3Ryb3kiLCJpc0Rlc3Ryb3lFbmFibGVkIiwiY3JlYXRlQWxpYXMiLCJ1cGRhdGVBbGlhcyIsImRlc3Ryb3lBbGlhcyIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiT0JKRUNUIiwib3V0cHV0RmllbGRzIiwiR3JhcGhRTE5vbk51bGwiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJkZWVwY29weSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJ0cmFuc2Zvcm1UeXBlcyIsIm9yaWdpbmFsRmllbGRzIiwicmVxIiwiY3JlYXRlZE9iamVjdCIsImNyZWF0ZU9iamVjdCIsImdldEZpZWxkTmFtZXMiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJyZXF1aXJlZEtleXMiLCJuZWVkVG9HZXRBbGxLZXlzIiwicGFyc2VDbGFzc2VzIiwib3B0aW1pemVkT2JqZWN0IiwiZ2V0T2JqZWN0Iiwib2JqZWN0SWQiLCJ1bmRlZmluZWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uIiwiaWQiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidXBkYXRlZE9iamVjdCIsInVwZGF0ZU9iamVjdCIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJkZWxldGVHcmFwaFFMTXV0YXRpb24iLCJkZWxldGVPYmplY3QiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQsIG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5cbmNvbnN0IGZpbHRlckRlbGV0ZWRGaWVsZHMgPSBmaWVsZHMgPT5cbiAgT2JqZWN0LmtleXMoZmllbGRzKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiBmaWVsZHNba2V5XSA9PT0gJ29iamVjdCcgJiYgZmllbGRzW2tleV0/Ll9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICBhY2Nba2V5XSA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIGZpZWxkcyk7XG5cbmNvbnN0IGdldE9ubHlSZXF1aXJlZEZpZWxkcyA9IChcbiAgdXBkYXRlZEZpZWxkcyxcbiAgc2VsZWN0ZWRGaWVsZHNTdHJpbmcsXG4gIGluY2x1ZGVkRmllbGRzU3RyaW5nLFxuICBuYXRpdmVPYmplY3RGaWVsZHNcbikgPT4ge1xuICBjb25zdCBpbmNsdWRlZEZpZWxkcyA9IGluY2x1ZGVkRmllbGRzU3RyaW5nID8gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzU3RyaW5nID8gc2VsZWN0ZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKGZpZWxkID0+ICFuYXRpdmVPYmplY3RGaWVsZHMuaW5jbHVkZXMoZmllbGQpIHx8IGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKSlcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IGdldEdyYXBoUUxRdWVyeU5hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgICBjcmVhdGVBbGlhczogY3JlYXRlQWxpYXMgPSAnJyxcbiAgICB1cGRhdGVBbGlhczogdXBkYXRlQWxpYXMgPSAnJyxcbiAgICBkZXN0cm95QWxpYXM6IGRlc3Ryb3lBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGNyZWF0ZUFsaWFzIHx8IGBjcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byBjcmVhdGUgdGhlIG5ldyBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSB7IGZpZWxkcyA9IHt9OyB9XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgICAndXBkYXRlZEF0JyxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgY3JlYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNVcGRhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IHVwZGF0ZUFsaWFzIHx8IGB1cGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7dXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCwgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgeyBmaWVsZHMgPSB7fTsgfVxuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgdXBkYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBkZXN0cm95QWxpYXMgfHwgYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAoa2V5cyAmJiBrZXlzLnNwbGl0KCcsJykuZmlsdGVyKGtleSA9PiAhWydpZCcsICdvYmplY3RJZCddLmluY2x1ZGVzKGtleSkpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoY2xhc3NOYW1lLCBpZCwgY29uZmlnLCBhdXRoLCBpbmZvKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lLCBkZWxldGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxhQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxrQkFBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksU0FBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssbUJBQUEsR0FBQUMsdUJBQUEsQ0FBQU4sT0FBQTtBQUNBLElBQUFPLGtCQUFBLEdB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