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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9kZWVwY29weSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9wYXJzZUdyYXBoUUxVdGlscyIsIm9iamVjdHNNdXRhdGlvbnMiLCJvYmplY3RzUXVlcmllcyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX2NsYXNzTmFtZSIsIl9tdXRhdGlvbiIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsImZpbHRlckRlbGV0ZWRGaWVsZHMiLCJmaWVsZHMiLCJrZXlzIiwicmVkdWNlIiwiYWNjIiwia2V5IiwiX19vcCIsImdldE9ubHlSZXF1aXJlZEZpZWxkcyIsInVwZGF0ZWRGaWVsZHMiLCJzZWxlY3RlZEZpZWxkc1N0cmluZyIsImluY2x1ZGVkRmllbGRzU3RyaW5nIiwibmF0aXZlT2JqZWN0RmllbGRzIiwiaW5jbHVkZWRGaWVsZHMiLCJzcGxpdCIsInNlbGVjdGVkRmllbGRzIiwibWlzc2luZ0ZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJqb2luIiwibGVuZ3RoIiwibmVlZEdldCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsImNsYXNzTmFtZSIsImdyYXBoUUxDbGFzc05hbWUiLCJ0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwiLCJnZXRHcmFwaFFMUXVlcnlOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImNyZWF0ZSIsImlzQ3JlYXRlRW5hYmxlZCIsInVwZGF0ZSIsImlzVXBkYXRlRW5hYmxlZCIsImRlc3Ryb3kiLCJpc0Rlc3Ryb3lFbmFibGVkIiwiY3JlYXRlQWxpYXMiLCJ1cGRhdGVBbGlhcyIsImRlc3Ryb3lBbGlhcyIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiT0JKRUNUIiwib3V0cHV0RmllbGRzIiwiR3JhcGhRTE5vbk51bGwiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJkZWVwY29weSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJ0cmFuc2Zvcm1UeXBlcyIsIm9yaWdpbmFsRmllbGRzIiwicmVxIiwiY3JlYXRlZE9iamVjdCIsImNyZWF0ZU9iamVjdCIsImdldEZpZWxkTmFtZXMiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJyZXF1aXJlZEtleXMiLCJuZWVkVG9HZXRBbGxLZXlzIiwicGFyc2VDbGFzc2VzIiwib3B0aW1pemVkT2JqZWN0IiwiZ2V0T2JqZWN0Iiwib2JqZWN0SWQiLCJ1bmRlZmluZWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uIiwiaWQiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidXBkYXRlZE9iamVjdCIsInVwZGF0ZU9iamVjdCIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJkZWxldGVHcmFwaFFMTXV0YXRpb24iLCJkZWxldGVPYmplY3QiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQsIG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5cbmNvbnN0IGZpbHRlckRlbGV0ZWRGaWVsZHMgPSBmaWVsZHMgPT5cbiAgT2JqZWN0LmtleXMoZmllbGRzKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiBmaWVsZHNba2V5XSA9PT0gJ29iamVjdCcgJiYgZmllbGRzW2tleV0/Ll9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICBhY2Nba2V5XSA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIGZpZWxkcyk7XG5cbmNvbnN0IGdldE9ubHlSZXF1aXJlZEZpZWxkcyA9IChcbiAgdXBkYXRlZEZpZWxkcyxcbiAgc2VsZWN0ZWRGaWVsZHNTdHJpbmcsXG4gIGluY2x1ZGVkRmllbGRzU3RyaW5nLFxuICBuYXRpdmVPYmplY3RGaWVsZHNcbikgPT4ge1xuICBjb25zdCBpbmNsdWRlZEZpZWxkcyA9IGluY2x1ZGVkRmllbGRzU3RyaW5nID8gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzU3RyaW5nID8gc2VsZWN0ZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKGZpZWxkID0+ICFuYXRpdmVPYmplY3RGaWVsZHMuaW5jbHVkZXMoZmllbGQpIHx8IGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKSlcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IGdldEdyYXBoUUxRdWVyeU5hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgICBjcmVhdGVBbGlhczogY3JlYXRlQWxpYXMgPSAnJyxcbiAgICB1cGRhdGVBbGlhczogdXBkYXRlQWxpYXMgPSAnJyxcbiAgICBkZXN0cm95QWxpYXM6IGRlc3Ryb3lBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGNyZWF0ZUFsaWFzIHx8IGBjcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byBjcmVhdGUgdGhlIG5ldyBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSB7IGZpZWxkcyA9IHt9OyB9XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgICAndXBkYXRlZEF0JyxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgY3JlYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNVcGRhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IHVwZGF0ZUFsaWFzIHx8IGB1cGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7dXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCwgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgeyBmaWVsZHMgPSB7fTsgfVxuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgdXBkYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBkZXN0cm95QWxpYXMgfHwgYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAoa2V5cyAmJiBrZXlzLnNwbGl0KCcsJykuZmlsdGVyKGtleSA9PiAhWydpZCcsICdvYmplY3RJZCddLmluY2x1ZGVzKGtleSkpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoY2xhc3NOYW1lLCBpZCwgY29uZmlnLCBhdXRoLCBpbmZvKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lLCBkZWxldGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxhQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxrQkFBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksU0FBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssbUJBQUEsR0FBQUMsdUJBQUEsQ0FB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