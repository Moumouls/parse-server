"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "extractKeysAndInclude", {
  enumerable: true,
  get: function () {
    return _parseGraphQLUtils.extractKeysAndInclude;
  }
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));
var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");
var _className = require("../transformers/className");
var _inputType = require("../transformers/inputType");
var _outputType = require("../transformers/outputType");
var _constraintType = require("../transformers/constraintType");
var _parseGraphQLUtils = require("../parseGraphQLUtils");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/* eslint-disable indent */

const getParseClassTypeConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.type || {};
};
const getInputFieldsAndConstraints = function (parseClass, parseClassConfig) {
  const classFields = Object.keys(parseClass.fields).concat('id');
  const {
    inputFields: allowedInputFields,
    outputFields: allowedOutputFields,
    constraintFields: allowedConstraintFields,
    sortFields: allowedSortFields
  } = getParseClassTypeConfig(parseClassConfig);
  let classOutputFields;
  let classCreateFields;
  let classUpdateFields;
  let classConstraintFields;
  let classSortFields;

  // All allowed customs fields
  const classCustomFields = classFields.filter(field => {
    return !Object.keys(defaultGraphQLTypes.PARSE_OBJECT_FIELDS).includes(field) && field !== 'id';
  });
  if (allowedInputFields && allowedInputFields.create) {
    classCreateFields = classCustomFields.filter(field => {
      return allowedInputFields.create.includes(field);
    });
  } else {
    classCreateFields = classCustomFields;
  }
  if (allowedInputFields && allowedInputFields.update) {
    classUpdateFields = classCustomFields.filter(field => {
      return allowedInputFields.update.includes(field);
    });
  } else {
    classUpdateFields = classCustomFields;
  }
  if (allowedOutputFields) {
    classOutputFields = classCustomFields.filter(field => {
      return allowedOutputFields.includes(field);
    });
  } else {
    classOutputFields = classCustomFields;
  }
  // Filters the "password" field from class _User
  if (parseClass.className === '_User') {
    classOutputFields = classOutputFields.filter(outputField => outputField !== 'password');
  }
  if (allowedConstraintFields) {
    classConstraintFields = classCustomFields.filter(field => {
      return allowedConstraintFields.includes(field);
    });
  } else {
    classConstraintFields = classFields;
  }
  if (allowedSortFields) {
    classSortFields = allowedSortFields;
    if (!classSortFields.length) {
      // must have at least 1 order field
      // otherwise the FindArgs Input Type will throw.
      classSortFields.push({
        field: 'id',
        asc: true,
        desc: true
      });
    }
  } else {
    classSortFields = classFields.map(field => {
      return {
        field,
        asc: true,
        desc: true
      };
    });
  }
  return {
    classCreateFields,
    classUpdateFields,
    classConstraintFields,
    classOutputFields,
    classSortFields
  };
};
const load = (parseGraphQLSchema, parseClass, parseClassConfig) => {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const classGraphQLCreateTypeName = `Create${graphQLClassName}FieldsInput`;
  let classGraphQLCreateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classCreateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (type) {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        };
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
    })
  });
  classGraphQLCreateType = parseGraphQLSchema.addGraphQLType(classGraphQLCreateType);
  const classGraphQLUpdateTypeName = `Update${graphQLClassName}FieldsInput`;
  let classGraphQLUpdateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classUpdateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (type) {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        };
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
    })
  });
  classGraphQLUpdateType = parseGraphQLSchema.addGraphQLType(classGraphQLUpdateType);
  const classGraphQLPointerTypeName = `${graphQLClassName}PointerInput`;
  let classGraphQLPointerType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLPointerTypeName,
    description: `Allow to link OR add and link an object of the ${graphQLClassName} class.`,
    fields: () => {
      const fields = {
        link: {
          description: `Link an existing object from ${graphQLClassName} class. You can use either the global or the object id.`,
          type: _graphql.GraphQLID
        }
      };
      if (isCreateEnabled) {
        fields['createAndLink'] = {
          description: `Create and link an object from ${graphQLClassName} class.`,
          type: classGraphQLCreateType
        };
      }
      return fields;
    }
  });
  classGraphQLPointerType = parseGraphQLSchema.addGraphQLType(classGraphQLPointerType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationTypeName = `${graphQLClassName}RelationInput`;
  let classGraphQLRelationType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationTypeName,
    description: `Allow to add, remove, createAndAdd objects of the ${graphQLClassName} class into a relation field.`,
    fields: () => {
      const fields = {
        add: {
          description: `Add existing objects from the ${graphQLClassName} class into the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        },
        remove: {
          description: `Remove existing objects from the ${graphQLClassName} class out of the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        }
      };
      if (isCreateEnabled) {
        fields['createAndAdd'] = {
          description: `Create and add objects of the ${graphQLClassName} class into the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLCreateType))
        };
      }
      return fields;
    }
  });
  classGraphQLRelationType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLConstraintsTypeName = `${graphQLClassName}WhereInput`;
  let classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => ({
      ...classConstraintFields.reduce((fields, field) => {
        if (['OR', 'AND', 'NOR'].includes(field)) {
          parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
          return fields;
        }
        const parseField = field === 'id' ? 'objectId' : field;
        const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);
        if (type) {
          return {
            ...fields,
            [field]: {
              description: `This is the object ${field}.`,
              type
            }
          };
        } else {
          return fields;
        }
      }, {}),
      OR: {
        description: 'This is the OR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      AND: {
        description: 'This is the AND operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      NOR: {
        description: 'This is the NOR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      }
    })
  });
  classGraphQLConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationConstraintsTypeName = `${graphQLClassName}RelationWhereInput`;
  let classGraphQLRelationConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationConstraintsTypeName,
    description: `The ${classGraphQLRelationConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => ({
      have: {
        description: 'Run a relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      haveNot: {
        description: 'Run an inverted relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      exists: {
        description: 'Check if the relation/pointer contains objects.',
        type: _graphql.GraphQLBoolean
      }
    })
  });
  classGraphQLRelationConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLOrderTypeName = `${graphQLClassName}Order`;
  let classGraphQLOrderType = new _graphql.GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${graphQLClassName} class.`,
    values: classSortFields.reduce((sortFields, fieldConfig) => {
      const {
        field,
        asc,
        desc
      } = fieldConfig;
      const updatedSortFields = {
        ...sortFields
      };
      const value = field === 'id' ? 'objectId' : field;
      if (asc) {
        updatedSortFields[`${field}_ASC`] = {
          value
        };
      }
      if (desc) {
        updatedSortFields[`${field}_DESC`] = {
          value: `-${value}`
        };
      }
      return updatedSortFields;
    }, {})
  });
  classGraphQLOrderType = parseGraphQLSchema.addGraphQLType(classGraphQLOrderType);
  const classGraphQLFindArgs = {
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT,
    ..._graphqlRelay.connectionArgs,
    options: defaultGraphQLTypes.READ_OPTIONS_ATT
  };
  const classGraphQLOutputTypeName = `${graphQLClassName}`;
  const interfaces = [defaultGraphQLTypes.PARSE_OBJECT, parseGraphQLSchema.relayNodeInterface];
  const parseObjectFields = {
    id: (0, _graphqlRelay.globalIdField)(className, obj => obj.objectId),
    ...defaultGraphQLTypes.PARSE_OBJECT_FIELDS,
    ...(className === '_User' ? {
      authDataResponse: {
        description: `auth provider response when triggered on signUp/logIn.`,
        type: defaultGraphQLTypes.OBJECT
      }
    } : {})
  };
  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = (0, _outputType.transformOutputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source, args, context, queryInfo) {
              try {
                const {
                  where,
                  order,
                  skip,
                  first,
                  after,
                  last,
                  before,
                  options
                } = args;
                const {
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference
                } = options || {};
                const {
                  config,
                  auth,
                  info
                } = context;
                const selectedFields = (0, _graphqlListFields.default)(queryInfo);
                const {
                  keys,
                  include
                } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')).filter(field => field.indexOf('edges.node') < 0));
                const parseOrder = order && order.join(',');
                return objectsQueries.findObjects(source[field].className, {
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  },
                  ...(where || {})
                }, parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }
          }
        };
      } else if (parseClass.fields[field].type === 'Polygon') {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1]
                }));
              } else {
                return null;
              }
            }
          }
        };
      } else if (parseClass.fields[field].type === 'Array') {
        return {
          ...fields,
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source) {
              if (!source[field]) {
                return null;
              }
              return source[field].map(async elem => {
                if (elem.className && elem.objectId && elem.__type === 'Object') {
                  return elem;
                } else {
                  return {
                    value: elem
                  };
                }
              });
            }
          }
        };
      } else if (type) {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        };
      } else {
        return fields;
      }
    }, parseObjectFields);
  };
  let classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces,
    fields: outputFields
  });
  classGraphQLOutputType = parseGraphQLSchema.addGraphQLType(classGraphQLOutputType);
  const {
    connectionType,
    edgeType
  } = (0, _graphqlRelay.connectionDefinitions)({
    name: graphQLClassName,
    connectionFields: {
      count: defaultGraphQLTypes.COUNT_ATT
    },
    nodeType: classGraphQLOutputType || defaultGraphQLTypes.OBJECT
  });
  let classGraphQLFindResultType = undefined;
  if (parseGraphQLSchema.addGraphQLType(edgeType) && parseGraphQLSchema.addGraphQLType(connectionType, false, false, true)) {
    classGraphQLFindResultType = connectionType;
  }
  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLPointerType,
    classGraphQLRelationType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintsType,
    classGraphQLRelationConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType,
    config: {
      parseClassConfig,
      isCreateEnabled,
      isUpdateEnabled
    }
  };
  if (className === '_User') {
    const viewerType = new _graphql.GraphQLObjectType({
      name: 'Viewer',
      description: `The Viewer object type is used in operations that involve outputting the current user data.`,
      fields: () => ({
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT,
        user: {
          description: 'This is the current user.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType)
        }
      })
    });
    parseGraphQLSchema.addGraphQLType(viewerType, true, true);
    parseGraphQLSchema.viewerType = viewerType;
  }
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIm9iamVjdHNRdWVyaWVzIiwiX1BhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJfY2xhc3NOYW1lIiwiX2lucHV0VHlwZSIsIl9vdXRwdXRUeXBlIiwiX2NvbnN0cmFpbnRUeXBlIiwiX3BhcnNlR3JhcGhRTFV0aWxzIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwiZSIsIldlYWtNYXAiLCJyIiwidCIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0IiwiZ2V0UGFyc2VDbGFzc1R5cGVDb25maWciLCJwYXJzZUNsYXNzQ29uZmlnIiwidHlwZSIsImdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMiLCJwYXJzZUNsYXNzIiwiY2xhc3NGaWVsZHMiLCJrZXlzIiwiZmllbGRzIiwiY29uY2F0IiwiaW5wdXRGaWVsZHMiLCJhbGxvd2VkSW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJhbGxvd2VkT3V0cHV0RmllbGRzIiwiY29uc3RyYWludEZpZWxkcyIsImFsbG93ZWRDb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImFsbG93ZWRTb3J0RmllbGRzIiwiY2xhc3NPdXRwdXRGaWVsZHMiLCJjbGFzc0NyZWF0ZUZpZWxkcyIsImNsYXNzVXBkYXRlRmllbGRzIiwiY2xhc3NDb25zdHJhaW50RmllbGRzIiwiY2xhc3NTb3J0RmllbGRzIiwiY2xhc3NDdXN0b21GaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJpbmNsdWRlcyIsImNyZWF0ZSIsInVwZGF0ZSIsImNsYXNzTmFtZSIsIm91dHB1dEZpZWxkIiwibGVuZ3RoIiwicHVzaCIsImFzYyIsImRlc2MiLCJtYXAiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImlzQ3JlYXRlRW5hYmxlZCIsImlzVXBkYXRlRW5hYmxlZCIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJyZWR1Y2UiLCJ0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsInJlcXVpcmVkIiwiR3JhcGhRTE5vbk51bGwiLCJBQ0wiLCJBQ0xfSU5QVVQiLCJhZGRHcmFwaFFMVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwibGluayIsIkdyYXBoUUxJRCIsIk9CSkVDVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJhZGQiLCJHcmFwaFFMTGlzdCIsIk9CSkVDVF9JRCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJsb2ciLCJ3YXJuIiwicGFyc2VGaWVsZCIsInRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwiZ2xvYmFsSWRGaWVsZCIsIm9iaiIsIm9iamVjdElkIiwiYXV0aERhdGFSZXNwb25zZSIsInRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnZXRGaWVsZE5hbWVzIiwiaW5jbHVkZSIsImV4dHJhY3RLZXlzQW5kSW5jbHVkZSIsInN0YXJ0c1dpdGgiLCJyZXBsYWNlIiwiaW5kZXhPZiIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwia2V5IiwicGFyc2VDbGFzc2VzIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJjb25uZWN0aW9uVHlwZSIsImVkZ2VUeXBlIiwiY29ubmVjdGlvbkRlZmluaXRpb25zIiwiY29ubmVjdGlvbkZpZWxkcyIsImNvdW50IiwiQ09VTlRfQVRUIiwibm9kZVR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInZpZXdlclR5cGUiLCJzZXNzaW9uVG9rZW4iLCJTRVNTSU9OX1RPS0VOX0FUVCIsInVzZXIiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgaW5kZW50ICovXG5pbXBvcnQge1xuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMRW51bVR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZ2xvYmFsSWRGaWVsZCwgY29ubmVjdGlvbkFyZ3MsIGNvbm5lY3Rpb25EZWZpbml0aW9ucyB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9pbnB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NvbnN0cmFpbnRUeXBlJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgcmV0dXJuIChwYXJzZUNsYXNzQ29uZmlnICYmIHBhcnNlQ2xhc3NDb25maWcudHlwZSkgfHwge307XG59O1xuXG5jb25zdCBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzID0gZnVuY3Rpb24gKFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5jb25jYXQoJ2lkJyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhmaWVsZCkgJiYgZmllbGQgIT09ICdpZCc7XG4gIH0pO1xuXG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZSkge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLnVwZGF0ZSkge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRPdXRwdXRGaWVsZHMpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZE91dHB1dEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICAvLyBGaWx0ZXJzIHRoZSBcInBhc3N3b3JkXCIgZmllbGQgZnJvbSBjbGFzcyBfVXNlclxuICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzT3V0cHV0RmllbGRzLmZpbHRlcihvdXRwdXRGaWVsZCA9PiBvdXRwdXRGaWVsZCAhPT0gJ3Bhc3N3b3JkJyk7XG4gIH1cblxuICBpZiAoYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMpIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRDb25zdHJhaW50RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0ZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkU29ydEZpZWxkcykge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGFsbG93ZWRTb3J0RmllbGRzO1xuICAgIGlmICghY2xhc3NTb3J0RmllbGRzLmxlbmd0aCkge1xuICAgICAgLy8gbXVzdCBoYXZlIGF0IGxlYXN0IDEgb3JkZXIgZmllbGRcbiAgICAgIC8vIG90aGVyd2lzZSB0aGUgRmluZEFyZ3MgSW5wdXQgVHlwZSB3aWxsIHRocm93LlxuICAgICAgY2xhc3NTb3J0RmllbGRzLnB1c2goe1xuICAgICAgICBmaWVsZDogJ2lkJyxcbiAgICAgICAgYXNjOiB0cnVlLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGNsYXNzRmllbGRzLm1hcChmaWVsZCA9PiB7XG4gICAgICByZXR1cm4geyBmaWVsZCwgYXNjOiB0cnVlLCBkZXNjOiB0cnVlIH07XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH07XG59O1xuXG5jb25zdCBsb2FkID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9ID0gZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyhwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSA9IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3JlYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGxpbmsgT1IgYWRkIGFuZCBsaW5rIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBsaW5rOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBMaW5rIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuYCxcbiAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZExpbmsnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgbGluayBhbiBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9V2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NDb25zdHJhaW50RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICBpZiAoWydPUicsICdBTkQnLCAnTk9SJ10uaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmxvZy53YXJuKFxuICAgICAgICAgICAgYEZpZWxkICR7ZmllbGR9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3Rpbmcgb25lLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZCA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzLFxuICAgICAgICAgIGZpZWxkXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBPUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgQU5EOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgQU5EIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgTk9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgTk9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uV2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgaGF2ZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgIGlmIChhc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0FTQ2BdID0geyB2YWx1ZSB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHt2YWx1ZX1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgICAgICAgPyBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpXG4gICAgICAgIDogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIHNraXA6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0tJUF9BVFQsXG4gICAgLi4uY29ubmVjdGlvbkFyZ3MsXG4gICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICB9O1xuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgY29uc3QgaW50ZXJmYWNlcyA9IFtkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVCwgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZV07XG4gIGNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0ge1xuICAgIGlkOiBnbG9iYWxJZEZpZWxkKGNsYXNzTmFtZSwgb2JqID0+IG9iai5vYmplY3RJZCksXG4gICAgLi4uZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTLFxuICAgIC4uLihjbGFzc05hbWUgPT09ICdfVXNlcidcbiAgICAgID8ge1xuICAgICAgICAgIGF1dGhEYXRhUmVzcG9uc2U6IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgYXV0aCBwcm92aWRlciByZXNwb25zZSB3aGVuIHRyaWdnZXJlZCBvbiBzaWduVXAvbG9nSW4uYCxcbiAgICAgICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgIDoge30pLFxuICB9O1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzT3V0cHV0RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc107XG4gICAgICAgIGNvbnN0IGFyZ3MgPSB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3MgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLCBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIH0gPVxuICAgICAgICAgICAgICAgICAgb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluZGV4T2YoJ2VkZ2VzLm5vZGUnKSA8IDApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICRyZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RJZDogc291cmNlLm9iamVjdElkLFxuICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLi4uKHdoZXJlIHx8IHt9KSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZVtmaWVsZF0gJiYgc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzLm1hcChjb29yZGluYXRlID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHNgLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmICghc291cmNlW2ZpZWxkXSkgeyByZXR1cm4gbnVsbDsgfVxuICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5tYXAoYXN5bmMgZWxlbSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVsZW0uY2xhc3NOYW1lICYmIGVsZW0ub2JqZWN0SWQgJiYgZWxlbS5fX3R5cGUgPT09ICdPYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZWxlbTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgdmFsdWU6IGVsZW0gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfVxuICAgIH0sIHBhcnNlT2JqZWN0RmllbGRzKTtcbiAgfTtcbiAgbGV0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWV9IG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBpbnRlcmZhY2VzLFxuICAgIGZpZWxkczogb3V0cHV0RmllbGRzLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKTtcblxuICBjb25zdCB7IGNvbm5lY3Rpb25UeXBlLCBlZGdlVHlwZSB9ID0gY29ubmVjdGlvbkRlZmluaXRpb25zKHtcbiAgICBuYW1lOiBncmFwaFFMQ2xhc3NOYW1lLFxuICAgIGNvbm5lY3Rpb25GaWVsZHM6IHtcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICAgIG5vZGVUeXBlOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICB9KTtcbiAgbGV0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gdW5kZWZpbmVkO1xuICBpZiAoXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGVkZ2VUeXBlKSAmJlxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25uZWN0aW9uVHlwZSwgZmFsc2UsIGZhbHNlLCB0cnVlKVxuICApIHtcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IGNvbm5lY3Rpb25UeXBlO1xuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdID0ge1xuICAgIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gICAgY29uZmlnOiB7XG4gICAgICBwYXJzZUNsYXNzQ29uZmlnLFxuICAgICAgaXNDcmVhdGVFbmFibGVkLFxuICAgICAgaXNVcGRhdGVFbmFibGVkLFxuICAgIH0sXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHZpZXdlclR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogJ1ZpZXdlcicsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSBWaWV3ZXIgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICBzZXNzaW9uVG9rZW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0VTU0lPTl9UT0tFTl9BVFQsXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGN1cnJlbnQgdXNlci4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh2aWV3ZXJUeXBlLCB0cnVlLCB0cnVlKTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSA9IHZpZXdlclR5cGU7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFDQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFVQSxJQUFBQyxhQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxrQkFBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksbUJBQUEsR0FBQUMsdUJBQUEsQ0FBQUwsT0FBQTtBQUNBLElBQUFNLGNBQUEsR0FBQUQsdUJBQUEsQ0FBQUwsT0FBQTtBQUNBLElBQUFPLHVCQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxVQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxVQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxXQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxlQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxrQkFBQSxHQUFBWixPQUFBO0FBQTBGLFNBQUFhLHlCQUFBQyxDQUFBLDZCQUFBQyxPQUFBLG1CQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLENBQUEsV0FBQUEsQ0FBQSxHQUFBRyxDQUFBLEdBQUFELENBQUEsS0FBQUYsQ0FBQTtBQUFBLFNBQUFULHdCQUFBUyxDQUFBLEVBQUFFLENBQUEsU0FBQUEsQ0FBQSxJQUFBRixDQUFBLElBQUFBLENBQUEsQ0FBQUksVUFBQSxTQUFBSixDQUFBLGVBQUFBLENBQUEsdUJBQUFBLENBQUEseUJBQUFBLENBQUEsV0FBQUssT0FBQSxFQUFBTCxDQUFBLFFBQUFHLENBQUEsR0FBQUosd0JBQUEsQ0FBQUcsQ0FBQSxPQUFBQyxDQUFBLElBQUFBLENBQUEsQ0FBQUcsR0FBQSxDQUFBTixDQUFBLFVBQUFHLENBQUEsQ0FBQUksR0FBQSxDQUFBUCxDQUFBLE9BQUFRLENBQUEsS0FBQUMsU0FBQSxVQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsY0FBQSxJQUFBRCxNQUFBLENBQUFFLHdCQUFBLFdBQUFDLENBQUEsSUFBQWQsQ0FBQSxvQkFBQWMsQ0FBQSxPQUFBQyxjQUFBLENBQUFDLElBQUEsQ0FBQWhCLENBQUEsRUFBQWMsQ0FBQSxTQUFBRyxDQUFBLEdBQUFQLENBQUEsR0FBQUMsTUFBQSxDQUFBRSx3QkFBQSxDQUFBYixDQUFBLEVBQUFjLENBQUEsVUFBQUcsQ0FBQSxLQUFBQSxDQUFBLENBQUFWLEdBQUEsSUFBQVUsQ0FBQSxDQUFBQyxHQUFBLElBQUFQLE1BQUEsQ0FBQUMsY0FBQSxDQUFBSixDQUFBLEVBQUFNLENBQUEsRUFBQUcsQ0FBQSxJQUFBVCxDQUFBLENBQUFNLENBQUEsSUFBQWQsQ0FBQSxDQUFBYyxDQUFBLFlBQUFOLENBQUEsQ0FBQUgsT0FBQSxHQUFBTCxDQUFBLEVBQUFHLENBQUEsSUFBQUEsQ0FBQSxDQUFBZSxHQUFBLENBQUFsQixDQUFBLEVBQUFRLENBQUEsR0FBQUEsQ0FBQTtBQUFBLFNBQUFuQix1QkFBQVcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUksVUFBQSxHQUFBSixDQUFBLEtBQUFLLE9BQUEsRUFBQUwsQ0FBQTtBQXBCMUY7O0FBc0JBLE1BQU1tQix1QkFBdUIsR0FBRyxTQUFBQSxDQUFVQyxnQkFBMEMsRUFBRTtFQUNwRixPQUFRQSxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLElBQUksSUFBSyxDQUFDLENBQUM7QUFDMUQsQ0FBQztBQUVELE1BQU1DLDRCQUE0QixHQUFHLFNBQUFBLENBQ25DQyxVQUFVLEVBQ1ZILGdCQUEwQyxFQUMxQztFQUNBLE1BQU1JLFdBQVcsR0FBR2IsTUFBTSxDQUFDYyxJQUFJLENBQUNGLFVBQVUsQ0FBQ0csTUFBTSxDQUFDLENBQUNDLE1BQU0sQ0FBQyxJQUFJLENBQUM7RUFDL0QsTUFBTTtJQUNKQyxXQUFXLEVBQUVDLGtCQUFrQjtJQUMvQkMsWUFBWSxFQUFFQyxtQkFBbUI7SUFDakNDLGdCQUFnQixFQUFFQyx1QkFBdUI7SUFDekNDLFVBQVUsRUFBRUM7RUFDZCxDQUFDLEdBQUdoQix1QkFBdUIsQ0FBQ0MsZ0JBQWdCLENBQUM7RUFFN0MsSUFBSWdCLGlCQUFpQjtFQUNyQixJQUFJQyxpQkFBaUI7RUFDckIsSUFBSUMsaUJBQWlCO0VBQ3JCLElBQUlDLHFCQUFxQjtFQUN6QixJQUFJQyxlQUFlOztFQUVuQjtFQUNBLE1BQU1DLGlCQUFpQixHQUFHakIsV0FBVyxDQUFDa0IsTUFBTSxDQUFDQyxLQUFLLElBQUk7SUFDcEQsT0FBTyxDQUFDaEMsTUFBTSxDQUFDYyxJQUFJLENBQUNuQyxtQkFBbUIsQ0FBQ3NELG1CQUFtQixDQUFDLENBQUNDLFFBQVEsQ0FBQ0YsS0FBSyxDQUFDLElBQUlBLEtBQUssS0FBSyxJQUFJO0VBQ2hHLENBQUMsQ0FBQztFQUVGLElBQUlkLGtCQUFrQixJQUFJQSxrQkFBa0IsQ0FBQ2lCLE1BQU0sRUFBRTtJQUNuRFQsaUJBQWlCLEdBQUdJLGlCQUFpQixDQUFDQyxNQUFNLENBQUNDLEtBQUssSUFBSTtNQUNwRCxPQUFPZCxrQkFBa0IsQ0FBQ2lCLE1BQU0sQ0FBQ0QsUUFBUSxDQUFDRixLQUFLLENBQUM7SUFDbEQsQ0FBQyxDQUFDO0VBQ0osQ0FBQyxNQUFNO0lBQ0xOLGlCQUFpQixHQUFHSSxpQkFBaUI7RUFDdkM7RUFDQSxJQUFJWixrQkFBa0IsSUFBSUEsa0JBQWtCLENBQUNrQixNQUFNLEVBQUU7SUFDbkRULGlCQUFpQixHQUFHRyxpQkFBaUIsQ0FBQ0MsTUFBTSxDQUFDQyxLQUFLLElBQUk7TUFDcEQsT0FBT2Qsa0JBQWtCLENBQUNrQixNQUFNLENBQUNGLFFBQVEsQ0FBQ0YsS0FBSyxDQUFDO0lBQ2xELENBQUMsQ0FBQztFQUNKLENBQUMsTUFBTTtJQUNMTCxpQkFBaUIsR0FBR0csaUJBQWlCO0VBQ3ZDO0VBRUEsSUFBSVYsbUJBQW1CLEVBQUU7SUFDdkJLLGlCQUFpQixHQUFHSyxpQkFBaUIsQ0FBQ0MsTUFBTSxDQUFDQyxLQUFLLElBQUk7TUFDcEQsT0FBT1osbUJBQW1CLENBQUNjLFFBQVEsQ0FBQ0YsS0FBSyxDQUFDO0lBQzVDLENBQUMsQ0FBQztFQUNKLENBQUMsTUFBTTtJQUNMUCxpQkFBaUIsR0FBR0ssaUJBQWlCO0VBQ3ZDO0VBQ0E7RUFDQSxJQUFJbEIsVUFBVSxDQUFDeUIsU0FBUyxLQUFLLE9BQU8sRUFBRTtJQUNwQ1osaUJBQWlCLEdBQUdBLGlCQUFpQixDQUFDTSxNQUFNLENBQUNPLFdBQVcsSUFBSUEsV0FBVyxLQUFLLFVBQVUsQ0FBQztFQUN6RjtFQUVBLElBQUloQix1QkFBdUIsRUFBRTtJQUMzQk0scUJBQXFCLEdBQUdFLGlCQUFpQixDQUFDQyxNQUFNLENBQUNDLEtBQUssSUFBSTtNQUN4RCxPQUFPVix1QkFBdUIsQ0FBQ1ksUUFBUSxDQUFDRixLQUFLLENBQUM7SUFDaEQsQ0FBQyxDQUFDO0VBQ0osQ0FBQyxNQUFNO0lBQ0xKLHFCQUFxQixHQUFHZixXQUFXO0VBQ3JDO0VBRUEsSUFBSVcsaUJBQWlCLEVBQUU7SUFDckJLLGVBQWUsR0FBR0wsaUJBQWlCO0lBQ25DLElBQUksQ0FBQ0ssZUFBZSxDQUFDVSxNQUFNLEVBQUU7TUFDM0I7TUFDQTtNQUNBVixlQUFlLENBQUNXLElBQUksQ0FBQztRQUNuQlIsS0FBSyxFQUFFLElBQUk7UUFDWFMsR0FBRyxFQUFFLElBQUk7UUFDVEMsSUFBSSxFQUFFO01BQ1IsQ0FBQyxDQUFDO0lBQ0o7RUFDRixDQUFDLE1BQU07SUFDTGIsZUFBZSxHQUFHaEIsV0FBVyxDQUFDOEIsR0FBRyxDQUFDWCxLQUFLLElBQUk7TUFDekMsT0FBTztRQUFFQSxLQUFLO1FBQUVTLEdBQUcsRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRTtNQUFLLENBQUM7SUFDekMsQ0FBQyxDQUFDO0VBQ0o7RUFFQSxPQUFPO0lBQ0xoQixpQkFBaUI7SUFDakJDLGlCQUFpQjtJQUNqQkMscUJBQXFCO0lBQ3JCSCxpQkFBaUI7SUFDakJJO0VBQ0YsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNZSxJQUFJLEdBQUdBLENBQUNDLGtCQUFrQixFQUFFakMsVUFBVSxFQUFFSCxnQkFBMEMsS0FBSztFQUMzRixNQUFNNEIsU0FBUyxHQUFHekIsVUFBVSxDQUFDeUIsU0FBUztFQUN0QyxNQUFNUyxnQkFBZ0IsR0FBRyxJQUFBQyxzQ0FBMkIsRUFBQ1YsU0FBUyxDQUFDO0VBQy9ELE1BQU07SUFDSlgsaUJBQWlCO0lBQ2pCQyxpQkFBaUI7SUFDakJGLGlCQUFpQjtJQUNqQkcscUJBQXFCO0lBQ3JCQztFQUNGLENBQUMsR0FBR2xCLDRCQUE0QixDQUFDQyxVQUFVLEVBQUVILGdCQUFnQixDQUFDO0VBRTlELE1BQU07SUFDSjBCLE1BQU0sRUFBRWEsZUFBZSxHQUFHLElBQUk7SUFDOUJaLE1BQU0sRUFBRWEsZUFBZSxHQUFHO0VBQzVCLENBQUMsR0FBRyxJQUFBQyw4Q0FBMkIsRUFBQ3pDLGdCQUFnQixDQUFDO0VBRWpELE1BQU0wQywwQkFBMEIsR0FBRyxTQUFTTCxnQkFBZ0IsYUFBYTtFQUN6RSxJQUFJTSxzQkFBc0IsR0FBRyxJQUFJQywrQkFBc0IsQ0FBQztJQUN0REMsSUFBSSxFQUFFSCwwQkFBMEI7SUFDaENJLFdBQVcsRUFBRSxPQUFPSiwwQkFBMEIsNkVBQTZFTCxnQkFBZ0IsU0FBUztJQUNwSi9CLE1BQU0sRUFBRUEsQ0FBQSxLQUNOVyxpQkFBaUIsQ0FBQzhCLE1BQU0sQ0FDdEIsQ0FBQ3pDLE1BQU0sRUFBRWlCLEtBQUssS0FBSztNQUNqQixNQUFNdEIsSUFBSSxHQUFHLElBQUErQyxzQ0FBMkIsRUFDdEM3QyxVQUFVLENBQUNHLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDdEIsSUFBSSxFQUM3QkUsVUFBVSxDQUFDRyxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQzBCLFdBQVcsRUFDcENiLGtCQUFrQixDQUFDYyxlQUNyQixDQUFDO01BQ0QsSUFBSWpELElBQUksRUFBRTtRQUNSLE9BQU87VUFDTCxHQUFHSyxNQUFNO1VBQ1QsQ0FBQ2lCLEtBQUssR0FBRztZQUNQdUIsV0FBVyxFQUFFLHNCQUFzQnZCLEtBQUssR0FBRztZQUMzQ3RCLElBQUksRUFBRUUsVUFBVSxDQUFDRyxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQzRCLFFBQVEsR0FBRyxJQUFJQyx1QkFBYyxDQUFDbkQsSUFBSSxDQUFDLEdBQUdBO1VBQ3ZFO1FBQ0YsQ0FBQztNQUNILENBQUMsTUFBTTtRQUNMLE9BQU9LLE1BQU07TUFDZjtJQUNGLENBQUMsRUFDRDtNQUNFK0MsR0FBRyxFQUFFO1FBQUVwRCxJQUFJLEVBQUUvQixtQkFBbUIsQ0FBQ29GO01BQVU7SUFDN0MsQ0FDRjtFQUNKLENBQUMsQ0FBQztFQUNGWCxzQkFBc0IsR0FBR1Asa0JBQWtCLENBQUNtQixjQUFjLENBQUNaLHNCQUFzQixDQUFDO0VBRWxGLE1BQU1hLDBCQUEwQixHQUFHLFNBQVNuQixnQkFBZ0IsYUFBYTtFQUN6RSxJQUFJb0Isc0JBQXNCLEdBQUcsSUFBSWIsK0JBQXNCLENBQUM7SUFDdERDLElBQUksRUFBRVcsMEJBQTBCO0lBQ2hDVixXQUFXLEVBQUUsT0FBT1UsMEJBQTBCLDZFQUE2RW5CLGdCQUFnQixTQUFTO0lBQ3BKL0IsTUFBTSxFQUFFQSxDQUFBLEtBQ05ZLGlCQUFpQixDQUFDNkIsTUFBTSxDQUN0QixDQUFDekMsTUFBTSxFQUFFaUIsS0FBSyxLQUFLO01BQ2pCLE1BQU10QixJQUFJLEdBQUcsSUFBQStDLHNDQUEyQixFQUN0QzdDLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUN0QixJQUFJLEVBQzdCRSxVQUFVLENBQUNHLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDMEIsV0FBVyxFQUNwQ2Isa0JBQWtCLENBQUNjLGVBQ3JCLENBQUM7TUFDRCxJQUFJakQsSUFBSSxFQUFFO1FBQ1IsT0FBTztVQUNMLEdBQUdLLE1BQU07VUFDVCxDQUFDaUIsS0FBSyxHQUFHO1lBQ1B1QixXQUFXLEVBQUUsc0JBQXNCdkIsS0FBSyxHQUFHO1lBQzNDdEI7VUFDRjtRQUNGLENBQUM7TUFDSCxDQUFDLE1BQU07UUFDTCxPQUFPSyxNQUFNO01BQ2Y7SUFDRixDQUFDLEVBQ0Q7TUFDRStDLEdBQUcsRUFBRTtRQUFFcEQsSUFBSSxFQUFFL0IsbUJBQW1CLENBQUNvRjtNQUFVO0lBQzdDLENBQ0Y7RUFDSixDQUFDLENBQUM7RUFDRkcsc0JBQXNCLEdBQUdyQixrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQ0Usc0JBQXNCLENBQUM7RUFFbEYsTUFBTUMsMkJBQTJCLEdBQUcsR0FBR3JCLGdCQUFnQixjQUFjO0VBQ3JFLElBQUlzQix1QkFBdUIsR0FBRyxJQUFJZiwrQkFBc0IsQ0FBQztJQUN2REMsSUFBSSxFQUFFYSwyQkFBMkI7SUFDakNaLFdBQVcsRUFBRSxrREFBa0RULGdCQUFnQixTQUFTO0lBQ3hGL0IsTUFBTSxFQUFFQSxDQUFBLEtBQU07TUFDWixNQUFNQSxNQUFNLEdBQUc7UUFDYnNELElBQUksRUFBRTtVQUNKZCxXQUFXLEVBQUUsZ0NBQWdDVCxnQkFBZ0IseURBQXlEO1VBQ3RIcEMsSUFBSSxFQUFFNEQ7UUFDUjtNQUNGLENBQUM7TUFDRCxJQUFJdEIsZUFBZSxFQUFFO1FBQ25CakMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHO1VBQ3hCd0MsV0FBVyxFQUFFLGtDQUFrQ1QsZ0JBQWdCLFNBQVM7VUFDeEVwQyxJQUFJLEVBQUUwQztRQUNSLENBQUM7TUFDSDtNQUNBLE9BQU9yQyxNQUFNO0lBQ2Y7RUFDRixDQUFDLENBQUM7RUFDRnFELHVCQUF1QixHQUNyQnZCLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDSSx1QkFBdUIsQ0FBQyxJQUFJekYsbUJBQW1CLENBQUM0RixNQUFNO0VBRTFGLE1BQU1DLDRCQUE0QixHQUFHLEdBQUcxQixnQkFBZ0IsZUFBZTtFQUN2RSxJQUFJMkIsd0JBQXdCLEdBQUcsSUFBSXBCLCtCQUFzQixDQUFDO0lBQ3hEQyxJQUFJLEVBQUVrQiw0QkFBNEI7SUFDbENqQixXQUFXLEVBQUUscURBQXFEVCxnQkFBZ0IsK0JBQStCO0lBQ2pIL0IsTUFBTSxFQUFFQSxDQUFBLEtBQU07TUFDWixNQUFNQSxNQUFNLEdBQUc7UUFDYjJELEdBQUcsRUFBRTtVQUNIbkIsV0FBVyxFQUFFLGlDQUFpQ1QsZ0JBQWdCLDRFQUE0RTtVQUMxSXBDLElBQUksRUFBRSxJQUFJaUUsb0JBQVcsQ0FBQ2hHLG1CQUFtQixDQUFDaUcsU0FBUztRQUNyRCxDQUFDO1FBQ0RDLE1BQU0sRUFBRTtVQUNOdEIsV0FBVyxFQUFFLG9DQUFvQ1QsZ0JBQWdCLDhFQUE4RTtVQUMvSXBDLElBQUksRUFBRSxJQUFJaUUsb0JBQVcsQ0FBQ2hHLG1CQUFtQixDQUFDaUcsU0FBUztRQUNyRDtNQUNGLENBQUM7TUFDRCxJQUFJNUIsZUFBZSxFQUFFO1FBQ25CakMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHO1VBQ3ZCd0MsV0FBVyxFQUFFLGlDQUFpQ1QsZ0JBQWdCLDJCQUEyQjtVQUN6RnBDLElBQUksRUFBRSxJQUFJaUUsb0JBQVcsQ0FBQyxJQUFJZCx1QkFBYyxDQUFDVCxzQkFBc0IsQ0FBQztRQUNsRSxDQUFDO01BQ0g7TUFDQSxPQUFPckMsTUFBTTtJQUNmO0VBQ0YsQ0FBQyxDQUFDO0VBQ0YwRCx3QkFBd0IsR0FDdEI1QixrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQ1Msd0JBQXdCLENBQUMsSUFBSTlGLG1CQUFtQixDQUFDNEYsTUFBTTtFQUUzRixNQUFNTywrQkFBK0IsR0FBRyxHQUFHaEMsZ0JBQWdCLFlBQVk7RUFDdkUsSUFBSWlDLDJCQUEyQixHQUFHLElBQUkxQiwrQkFBc0IsQ0FBQztJQUMzREMsSUFBSSxFQUFFd0IsK0JBQStCO0lBQ3JDdkIsV0FBVyxFQUFFLE9BQU91QiwrQkFBK0IsdUVBQXVFaEMsZ0JBQWdCLFNBQVM7SUFDbkovQixNQUFNLEVBQUVBLENBQUEsTUFBTztNQUNiLEdBQUdhLHFCQUFxQixDQUFDNEIsTUFBTSxDQUFDLENBQUN6QyxNQUFNLEVBQUVpQixLQUFLLEtBQUs7UUFDakQsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUNFLFFBQVEsQ0FBQ0YsS0FBSyxDQUFDLEVBQUU7VUFDeENhLGtCQUFrQixDQUFDbUMsR0FBRyxDQUFDQyxJQUFJLENBQ3pCLFNBQVNqRCxLQUFLLDBDQUEwQzhDLCtCQUErQiw0Q0FDekYsQ0FBQztVQUNELE9BQU8vRCxNQUFNO1FBQ2Y7UUFDQSxNQUFNbUUsVUFBVSxHQUFHbEQsS0FBSyxLQUFLLElBQUksR0FBRyxVQUFVLEdBQUdBLEtBQUs7UUFDdEQsTUFBTXRCLElBQUksR0FBRyxJQUFBeUUsZ0RBQWdDLEVBQzNDdkUsVUFBVSxDQUFDRyxNQUFNLENBQUNtRSxVQUFVLENBQUMsQ0FBQ3hFLElBQUksRUFDbENFLFVBQVUsQ0FBQ0csTUFBTSxDQUFDbUUsVUFBVSxDQUFDLENBQUN4QixXQUFXLEVBQ3pDYixrQkFBa0IsQ0FBQ2MsZUFBZSxFQUNsQzNCLEtBQ0YsQ0FBQztRQUNELElBQUl0QixJQUFJLEVBQUU7VUFDUixPQUFPO1lBQ0wsR0FBR0ssTUFBTTtZQUNULENBQUNpQixLQUFLLEdBQUc7Y0FDUHVCLFdBQVcsRUFBRSxzQkFBc0J2QixLQUFLLEdBQUc7Y0FDM0N0QjtZQUNGO1VBQ0YsQ0FBQztRQUNILENBQUMsTUFBTTtVQUNMLE9BQU9LLE1BQU07UUFDZjtNQUNGLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztNQUNOcUUsRUFBRSxFQUFFO1FBQ0Y3QixXQUFXLEVBQUUsa0RBQWtEO1FBQy9EN0MsSUFBSSxFQUFFLElBQUlpRSxvQkFBVyxDQUFDLElBQUlkLHVCQUFjLENBQUNrQiwyQkFBMkIsQ0FBQztNQUN2RSxDQUFDO01BQ0RNLEdBQUcsRUFBRTtRQUNIOUIsV0FBVyxFQUFFLG1EQUFtRDtRQUNoRTdDLElBQUksRUFBRSxJQUFJaUUsb0JBQVcsQ0FBQyxJQUFJZCx1QkFBYyxDQUFDa0IsMkJBQTJCLENBQUM7TUFDdkUsQ0FBQztNQUNETyxHQUFHLEVBQUU7UUFDSC9CLFdBQVcsRUFBRSxtREFBbUQ7UUFDaEU3QyxJQUFJLEVBQUUsSUFBSWlFLG9CQUFXLENBQUMsSUFBSWQsdUJBQWMsQ0FBQ2tCLDJCQUEyQixDQUFDO01BQ3ZFO0lBQ0YsQ0FBQztFQUNILENBQUMsQ0FBQztFQUNGQSwyQkFBMkIsR0FDekJsQyxrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQ2UsMkJBQTJCLENBQUMsSUFBSXBHLG1CQUFtQixDQUFDNEYsTUFBTTtFQUU5RixNQUFNZ0IsdUNBQXVDLEdBQUcsR0FBR3pDLGdCQUFnQixvQkFBb0I7RUFDdkYsSUFBSTBDLG1DQUFtQyxHQUFHLElBQUluQywrQkFBc0IsQ0FBQztJQUNuRUMsSUFBSSxFQUFFaUMsdUNBQXVDO0lBQzdDaEMsV0FBVyxFQUFFLE9BQU9nQyx1Q0FBdUMsdUVBQXVFekMsZ0JBQWdCLFNBQVM7SUFDM0ovQixNQUFNLEVBQUVBLENBQUEsTUFBTztNQUNiMEUsSUFBSSxFQUFFO1FBQ0psQyxXQUFXLEVBQUUsMkVBQTJFO1FBQ3hGN0MsSUFBSSxFQUFFcUU7TUFDUixDQUFDO01BQ0RXLE9BQU8sRUFBRTtRQUNQbkMsV0FBVyxFQUNULHFGQUFxRjtRQUN2RjdDLElBQUksRUFBRXFFO01BQ1IsQ0FBQztNQUNEWSxNQUFNLEVBQUU7UUFDTnBDLFdBQVcsRUFBRSxpREFBaUQ7UUFDOUQ3QyxJQUFJLEVBQUVrRjtNQUNSO0lBQ0YsQ0FBQztFQUNILENBQUMsQ0FBQztFQUNGSixtQ0FBbUMsR0FDakMzQyxrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQ3dCLG1DQUFtQyxDQUFDLElBQ3RFN0csbUJBQW1CLENBQUM0RixNQUFNO0VBRTVCLE1BQU1zQix5QkFBeUIsR0FBRyxHQUFHL0MsZ0JBQWdCLE9BQU87RUFDNUQsSUFBSWdELHFCQUFxQixHQUFHLElBQUlDLHdCQUFlLENBQUM7SUFDOUN6QyxJQUFJLEVBQUV1Qyx5QkFBeUI7SUFDL0J0QyxXQUFXLEVBQUUsT0FBT3NDLHlCQUF5QixtREFBbUQvQyxnQkFBZ0IsU0FBUztJQUN6SGtELE1BQU0sRUFBRW5FLGVBQWUsQ0FBQzJCLE1BQU0sQ0FBQyxDQUFDakMsVUFBVSxFQUFFMEUsV0FBVyxLQUFLO01BQzFELE1BQU07UUFBRWpFLEtBQUs7UUFBRVMsR0FBRztRQUFFQztNQUFLLENBQUMsR0FBR3VELFdBQVc7TUFDeEMsTUFBTUMsaUJBQWlCLEdBQUc7UUFDeEIsR0FBRzNFO01BQ0wsQ0FBQztNQUNELE1BQU00RSxLQUFLLEdBQUduRSxLQUFLLEtBQUssSUFBSSxHQUFHLFVBQVUsR0FBR0EsS0FBSztNQUNqRCxJQUFJUyxHQUFHLEVBQUU7UUFDUHlELGlCQUFpQixDQUFDLEdBQUdsRSxLQUFLLE1BQU0sQ0FBQyxHQUFHO1VBQUVtRTtRQUFNLENBQUM7TUFDL0M7TUFDQSxJQUFJekQsSUFBSSxFQUFFO1FBQ1J3RCxpQkFBaUIsQ0FBQyxHQUFHbEUsS0FBSyxPQUFPLENBQUMsR0FBRztVQUFFbUUsS0FBSyxFQUFFLElBQUlBLEtBQUs7UUFBRyxDQUFDO01BQzdEO01BQ0EsT0FBT0QsaUJBQWlCO0lBQzFCLENBQUMsRUFBRSxDQUFDLENBQUM7RUFDUCxDQUFDLENBQUM7RUFDRkoscUJBQXFCLEdBQUdqRCxrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQzhCLHFCQUFxQixDQUFDO0VBRWhGLE1BQU1NLG9CQUFvQixHQUFHO0lBQzNCQyxLQUFLLEVBQUU7TUFDTDlDLFdBQVcsRUFBRSwrRUFBK0U7TUFDNUY3QyxJQUFJLEVBQUVxRTtJQUNSLENBQUM7SUFDRHVCLEtBQUssRUFBRTtNQUNML0MsV0FBVyxFQUFFLHNEQUFzRDtNQUNuRTdDLElBQUksRUFBRW9GLHFCQUFxQixHQUN2QixJQUFJbkIsb0JBQVcsQ0FBQyxJQUFJZCx1QkFBYyxDQUFDaUMscUJBQXFCLENBQUMsQ0FBQyxHQUMxRFM7SUFDTixDQUFDO0lBQ0RDLElBQUksRUFBRTdILG1CQUFtQixDQUFDOEgsUUFBUTtJQUNsQyxHQUFHQyw0QkFBYztJQUNqQkMsT0FBTyxFQUFFaEksbUJBQW1CLENBQUNpSTtFQUMvQixDQUFDO0VBQ0QsTUFBTUMsMEJBQTBCLEdBQUcsR0FBRy9ELGdCQUFnQixFQUFFO0VBQ3hELE1BQU1nRSxVQUFVLEdBQUcsQ0FBQ25JLG1CQUFtQixDQUFDb0ksWUFBWSxFQUFFbEUsa0JBQWtCLENBQUNtRSxrQkFBa0IsQ0FBQztFQUM1RixNQUFNQyxpQkFBaUIsR0FBRztJQUN4QkMsRUFBRSxFQUFFLElBQUFDLDJCQUFhLEVBQUM5RSxTQUFTLEVBQUUrRSxHQUFHLElBQUlBLEdBQUcsQ0FBQ0MsUUFBUSxDQUFDO0lBQ2pELEdBQUcxSSxtQkFBbUIsQ0FBQ3NELG1CQUFtQjtJQUMxQyxJQUFJSSxTQUFTLEtBQUssT0FBTyxHQUNyQjtNQUNFaUYsZ0JBQWdCLEVBQUU7UUFDaEIvRCxXQUFXLEVBQUUsd0RBQXdEO1FBQ3JFN0MsSUFBSSxFQUFFL0IsbUJBQW1CLENBQUM0RjtNQUM1QjtJQUNGLENBQUMsR0FDRCxDQUFDLENBQUM7RUFDUixDQUFDO0VBQ0QsTUFBTXBELFlBQVksR0FBR0EsQ0FBQSxLQUFNO0lBQ3pCLE9BQU9NLGlCQUFpQixDQUFDK0IsTUFBTSxDQUFDLENBQUN6QyxNQUFNLEVBQUVpQixLQUFLLEtBQUs7TUFDakQsTUFBTXRCLElBQUksR0FBRyxJQUFBNkcsd0NBQTRCLEVBQ3ZDM0csVUFBVSxDQUFDRyxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQ3RCLElBQUksRUFDN0JFLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUMwQixXQUFXLEVBQ3BDYixrQkFBa0IsQ0FBQ2MsZUFDckIsQ0FBQztNQUNELElBQUkvQyxVQUFVLENBQUNHLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDdEIsSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUNoRCxNQUFNOEcscUJBQXFCLEdBQ3pCM0Usa0JBQWtCLENBQUNjLGVBQWUsQ0FBQy9DLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUMwQixXQUFXLENBQUM7UUFDMUUsTUFBTStELElBQUksR0FBR0QscUJBQXFCLEdBQUdBLHFCQUFxQixDQUFDcEIsb0JBQW9CLEdBQUdzQixTQUFTO1FBQzNGLE9BQU87VUFDTCxHQUFHM0csTUFBTTtVQUNULENBQUNpQixLQUFLLEdBQUc7WUFDUHVCLFdBQVcsRUFBRSxzQkFBc0J2QixLQUFLLEdBQUc7WUFDM0N5RixJQUFJO1lBQ0ovRyxJQUFJLEVBQUVFLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUM0QixRQUFRLEdBQUcsSUFBSUMsdUJBQWMsQ0FBQ25ELElBQUksQ0FBQyxHQUFHQSxJQUFJO1lBQ3pFLE1BQU1pSCxPQUFPQSxDQUFDQyxNQUFNLEVBQUVILElBQUksRUFBRUksT0FBTyxFQUFFQyxTQUFTLEVBQUU7Y0FDOUMsSUFBSTtnQkFDRixNQUFNO2tCQUFFekIsS0FBSztrQkFBRUMsS0FBSztrQkFBRUUsSUFBSTtrQkFBRXVCLEtBQUs7a0JBQUVDLEtBQUs7a0JBQUVDLElBQUk7a0JBQUVDLE1BQU07a0JBQUV2QjtnQkFBUSxDQUFDLEdBQUdjLElBQUk7Z0JBQ3hFLE1BQU07a0JBQUVVLGNBQWM7a0JBQUVDLHFCQUFxQjtrQkFBRUM7Z0JBQXVCLENBQUMsR0FDckUxQixPQUFPLElBQUksQ0FBQyxDQUFDO2dCQUNmLE1BQU07a0JBQUUyQixNQUFNO2tCQUFFQyxJQUFJO2tCQUFFQztnQkFBSyxDQUFDLEdBQUdYLE9BQU87Z0JBQ3RDLE1BQU1ZLGNBQWMsR0FBRyxJQUFBQywwQkFBYSxFQUFDWixTQUFTLENBQUM7Z0JBRS9DLE1BQU07a0JBQUVoSCxJQUFJO2tCQUFFNkg7Z0JBQVEsQ0FBQyxHQUFHLElBQUFDLHdDQUFxQixFQUM3Q0gsY0FBYyxDQUNYMUcsTUFBTSxDQUFDQyxLQUFLLElBQUlBLEtBQUssQ0FBQzZHLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUNoRGxHLEdBQUcsQ0FBQ1gsS0FBSyxJQUFJQSxLQUFLLENBQUM4RyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQzlDL0csTUFBTSxDQUFDQyxLQUFLLElBQUlBLEtBQUssQ0FBQytHLE9BQU8sQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQ3BELENBQUM7Z0JBQ0QsTUFBTUMsVUFBVSxHQUFHMUMsS0FBSyxJQUFJQSxLQUFLLENBQUMyQyxJQUFJLENBQUMsR0FBRyxDQUFDO2dCQUUzQyxPQUFPcEssY0FBYyxDQUFDcUssV0FBVyxDQUMvQnRCLE1BQU0sQ0FBQzVGLEtBQUssQ0FBQyxDQUFDSyxTQUFTLEVBQ3ZCO2tCQUNFOEcsVUFBVSxFQUFFO29CQUNWQyxNQUFNLEVBQUU7c0JBQ05DLE1BQU0sRUFBRSxTQUFTO3NCQUNqQmhILFNBQVMsRUFBRUEsU0FBUztzQkFDcEJnRixRQUFRLEVBQUVPLE1BQU0sQ0FBQ1A7b0JBQ25CLENBQUM7b0JBQ0RpQyxHQUFHLEVBQUV0SDtrQkFDUCxDQUFDO2tCQUNELElBQUlxRSxLQUFLLElBQUksQ0FBQyxDQUFDO2dCQUNqQixDQUFDLEVBQ0QyQyxVQUFVLEVBQ1Z4QyxJQUFJLEVBQ0p1QixLQUFLLEVBQ0xDLEtBQUssRUFDTEMsSUFBSSxFQUNKQyxNQUFNLEVBQ05wSCxJQUFJLEVBQ0o2SCxPQUFPLEVBQ1AsS0FBSyxFQUNMUixjQUFjLEVBQ2RDLHFCQUFxQixFQUNyQkMsc0JBQXNCLEVBQ3RCQyxNQUFNLEVBQ05DLElBQUksRUFDSkMsSUFBSSxFQUNKQyxjQUFjLEVBQ2Q1RixrQkFBa0IsQ0FBQzBHLFlBQ3JCLENBQUM7Y0FDSCxDQUFDLENBQUMsT0FBT2xLLENBQUMsRUFBRTtnQkFDVndELGtCQUFrQixDQUFDMkcsV0FBVyxDQUFDbkssQ0FBQyxDQUFDO2NBQ25DO1lBQ0Y7VUFDRjtRQUNGLENBQUM7TUFDSCxDQUFDLE1BQU0sSUFBSXVCLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUN0QixJQUFJLEtBQUssU0FBUyxFQUFFO1FBQ3RELE9BQU87VUFDTCxHQUFHSyxNQUFNO1VBQ1QsQ0FBQ2lCLEtBQUssR0FBRztZQUNQdUIsV0FBVyxFQUFFLHNCQUFzQnZCLEtBQUssR0FBRztZQUMzQ3RCLElBQUksRUFBRUUsVUFBVSxDQUFDRyxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQzRCLFFBQVEsR0FBRyxJQUFJQyx1QkFBYyxDQUFDbkQsSUFBSSxDQUFDLEdBQUdBLElBQUk7WUFDekUsTUFBTWlILE9BQU9BLENBQUNDLE1BQU0sRUFBRTtjQUNwQixJQUFJQSxNQUFNLENBQUM1RixLQUFLLENBQUMsSUFBSTRGLE1BQU0sQ0FBQzVGLEtBQUssQ0FBQyxDQUFDeUgsV0FBVyxFQUFFO2dCQUM5QyxPQUFPN0IsTUFBTSxDQUFDNUYsS0FBSyxDQUFDLENBQUN5SCxXQUFXLENBQUM5RyxHQUFHLENBQUMrRyxVQUFVLEtBQUs7a0JBQ2xEQyxRQUFRLEVBQUVELFVBQVUsQ0FBQyxDQUFDLENBQUM7a0JBQ3ZCRSxTQUFTLEVBQUVGLFVBQVUsQ0FBQyxDQUFDO2dCQUN6QixDQUFDLENBQUMsQ0FBQztjQUNMLENBQUMsTUFBTTtnQkFDTCxPQUFPLElBQUk7Y0FDYjtZQUNGO1VBQ0Y7UUFDRixDQUFDO01BQ0gsQ0FBQyxNQUFNLElBQUk5SSxVQUFVLENBQUNHLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDdEIsSUFBSSxLQUFLLE9BQU8sRUFBRTtRQUNwRCxPQUFPO1VBQ0wsR0FBR0ssTUFBTTtVQUNULENBQUNpQixLQUFLLEdBQUc7WUFDUHVCLFdBQVcsRUFBRSxrR0FBa0c7WUFDL0c3QyxJQUFJLEVBQUVFLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUM0QixRQUFRLEdBQUcsSUFBSUMsdUJBQWMsQ0FBQ25ELElBQUksQ0FBQyxHQUFHQSxJQUFJO1lBQ3pFLE1BQU1pSCxPQUFPQSxDQUFDQyxNQUFNLEVBQUU7Y0FDcEIsSUFBSSxDQUFDQSxNQUFNLENBQUM1RixLQUFLLENBQUMsRUFBRTtnQkFBRSxPQUFPLElBQUk7Y0FBRTtjQUNuQyxPQUFPNEYsTUFBTSxDQUFDNUYsS0FBSyxDQUFDLENBQUNXLEdBQUcsQ0FBQyxNQUFNa0gsSUFBSSxJQUFJO2dCQUNyQyxJQUFJQSxJQUFJLENBQUN4SCxTQUFTLElBQUl3SCxJQUFJLENBQUN4QyxRQUFRLElBQUl3QyxJQUFJLENBQUNSLE1BQU0sS0FBSyxRQUFRLEVBQUU7a0JBQy9ELE9BQU9RLElBQUk7Z0JBQ2IsQ0FBQyxNQUFNO2tCQUNMLE9BQU87b0JBQUUxRCxLQUFLLEVBQUUwRDtrQkFBSyxDQUFDO2dCQUN4QjtjQUNGLENBQUMsQ0FBQztZQUNKO1VBQ0Y7UUFDRixDQUFDO01BQ0gsQ0FBQyxNQUFNLElBQUluSixJQUFJLEVBQUU7UUFDZixPQUFPO1VBQ0wsR0FBR0ssTUFBTTtVQUNULENBQUNpQixLQUFLLEdBQUc7WUFDUHVCLFdBQVcsRUFBRSxzQkFBc0J2QixLQUFLLEdBQUc7WUFDM0N0QixJQUFJLEVBQUVFLFVBQVUsQ0FBQ0csTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUM0QixRQUFRLEdBQUcsSUFBSUMsdUJBQWMsQ0FBQ25ELElBQUksQ0FBQyxHQUFHQTtVQUN2RTtRQUNGLENBQUM7TUFDSCxDQUFDLE1BQU07UUFDTCxPQUFPSyxNQUFNO01BQ2Y7SUFDRixDQUFDLEVBQUVrRyxpQkFBaUIsQ0FBQztFQUN2QixDQUFDO0VBQ0QsSUFBSTZDLHNCQUFzQixHQUFHLElBQUlDLDBCQUFpQixDQUFDO0lBQ2pEekcsSUFBSSxFQUFFdUQsMEJBQTBCO0lBQ2hDdEQsV0FBVyxFQUFFLE9BQU9zRCwwQkFBMEIseUVBQXlFL0QsZ0JBQWdCLFNBQVM7SUFDaEpnRSxVQUFVO0lBQ1YvRixNQUFNLEVBQUVJO0VBQ1YsQ0FBQyxDQUFDO0VBQ0YySSxzQkFBc0IsR0FBR2pILGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDOEYsc0JBQXNCLENBQUM7RUFFbEYsTUFBTTtJQUFFRSxjQUFjO0lBQUVDO0VBQVMsQ0FBQyxHQUFHLElBQUFDLG1DQUFxQixFQUFDO0lBQ3pENUcsSUFBSSxFQUFFUixnQkFBZ0I7SUFDdEJxSCxnQkFBZ0IsRUFBRTtNQUNoQkMsS0FBSyxFQUFFekwsbUJBQW1CLENBQUMwTDtJQUM3QixDQUFDO0lBQ0RDLFFBQVEsRUFBRVIsc0JBQXNCLElBQUluTCxtQkFBbUIsQ0FBQzRGO0VBQzFELENBQUMsQ0FBQztFQUNGLElBQUlnRywwQkFBMEIsR0FBRzdDLFNBQVM7RUFDMUMsSUFDRTdFLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDaUcsUUFBUSxDQUFDLElBQzNDcEgsa0JBQWtCLENBQUNtQixjQUFjLENBQUNnRyxjQUFjLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsRUFDckU7SUFDQU8sMEJBQTBCLEdBQUdQLGNBQWM7RUFDN0M7RUFFQW5ILGtCQUFrQixDQUFDYyxlQUFlLENBQUN0QixTQUFTLENBQUMsR0FBRztJQUM5QytCLHVCQUF1QjtJQUN2Qkssd0JBQXdCO0lBQ3hCckIsc0JBQXNCO0lBQ3RCYyxzQkFBc0I7SUFDdEJhLDJCQUEyQjtJQUMzQlMsbUNBQW1DO0lBQ25DWSxvQkFBb0I7SUFDcEIwRCxzQkFBc0I7SUFDdEJTLDBCQUEwQjtJQUMxQmpDLE1BQU0sRUFBRTtNQUNON0gsZ0JBQWdCO01BQ2hCdUMsZUFBZTtNQUNmQztJQUNGO0VBQ0YsQ0FBQztFQUVELElBQUlaLFNBQVMsS0FBSyxPQUFPLEVBQUU7SUFDekIsTUFBTW1JLFVBQVUsR0FBRyxJQUFJVCwwQkFBaUIsQ0FBQztNQUN2Q3pHLElBQUksRUFBRSxRQUFRO01BQ2RDLFdBQVcsRUFBRSw2RkFBNkY7TUFDMUd4QyxNQUFNLEVBQUVBLENBQUEsTUFBTztRQUNiMEosWUFBWSxFQUFFOUwsbUJBQW1CLENBQUMrTCxpQkFBaUI7UUFDbkRDLElBQUksRUFBRTtVQUNKcEgsV0FBVyxFQUFFLDJCQUEyQjtVQUN4QzdDLElBQUksRUFBRSxJQUFJbUQsdUJBQWMsQ0FBQ2lHLHNCQUFzQjtRQUNqRDtNQUNGLENBQUM7SUFDSCxDQUFDLENBQUM7SUFDRmpILGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDd0csVUFBVSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7SUFDekQzSCxrQkFBa0IsQ0FBQzJILFVBQVUsR0FBR0EsVUFBVTtFQUM1QztBQUNGLENBQUM7QUFBQ0ksT0FBQSxDQUFBaEksSUFBQSxHQUFBQSxJQUFBIiwiaWdub3JlTGlzdCI6W119