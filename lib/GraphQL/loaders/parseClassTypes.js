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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /* eslint-disable indent */
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
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
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
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
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
    fields: () => _objectSpread(_objectSpread({}, classConstraintFields.reduce((fields, field) => {
      if (['OR', 'AND', 'NOR'].includes(field)) {
        parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
        return fields;
      }
      const parseField = field === 'id' ? 'objectId' : field;
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);
      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {})), {}, {
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
      const updatedSortFields = _objectSpread({}, sortFields);
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
  const classGraphQLFindArgs = _objectSpread(_objectSpread({
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT
  }, _graphqlRelay.connectionArgs), {}, {
    options: defaultGraphQLTypes.READ_OPTIONS_ATT
  });
  const classGraphQLOutputTypeName = `${graphQLClassName}`;
  const interfaces = [defaultGraphQLTypes.PARSE_OBJECT, parseGraphQLSchema.relayNodeInterface];
  const parseObjectFields = _objectSpread(_objectSpread({
    id: (0, _graphqlRelay.globalIdField)(className, obj => obj.objectId)
  }, defaultGraphQLTypes.PARSE_OBJECT_FIELDS), className === '_User' ? {
    authDataResponse: {
      description: `auth provider response when triggered on signUp/logIn.`,
      type: defaultGraphQLTypes.OBJECT
    }
  } : {});
  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = (0, _outputType.transformOutputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return _objectSpread(_objectSpread({}, fields), {}, {
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
                return objectsQueries.findObjects(source[field].className, _objectSpread({
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }
          }
        });
      } else if (parseClass.fields[field].type === 'Polygon') {
        return _objectSpread(_objectSpread({}, fields), {}, {
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
        });
      } else if (parseClass.fields[field].type === 'Array') {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source) {
              if (!source[field]) return null;
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
        });
      } else if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIm9iamVjdHNRdWVyaWVzIiwiX1BhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJfY2xhc3NOYW1lIiwiX2lucHV0VHlwZSIsIl9vdXRwdXRUeXBlIiwiX2NvbnN0cmFpbnRUeXBlIiwiX3BhcnNlR3JhcGhRTFV0aWxzIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwiZSIsIldlYWtNYXAiLCJyIiwidCIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0Iiwib2JqIiwib3duS2V5cyIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJrZXkiLCJ2YWx1ZSIsIl90b1Byb3BlcnR5S2V5IiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiZmllbGRzIiwiY29uY2F0IiwiaW5wdXRGaWVsZHMiLCJhbGxvd2VkSW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJhbGxvd2VkT3V0cHV0RmllbGRzIiwiY29uc3RyYWludEZpZWxkcyIsImFsbG93ZWRDb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImFsbG93ZWRTb3J0RmllbGRzIiwiY2xhc3NPdXRwdXRGaWVsZHMiLCJjbGFzc0NyZWF0ZUZpZWxkcyIsImNsYXNzVXBkYXRlRmllbGRzIiwiY2xhc3NDb25zdHJhaW50RmllbGRzIiwiY2xhc3NTb3J0RmllbGRzIiwiY2xhc3NDdXN0b21GaWVsZHMiLCJmaWVsZCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJpbmNsdWRlcyIsImNyZWF0ZSIsInVwZGF0ZSIsImNsYXNzTmFtZSIsIm91dHB1dEZpZWxkIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwicmVxdWlyZWQiLCJHcmFwaFFMTm9uTnVsbCIsIkFDTCIsIkFDTF9JTlBVVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsImxvZyIsIndhcm4iLCJwYXJzZUZpZWxkIiwidHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwiLCJPUiIsIkFORCIsIk5PUiIsImNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlIiwiaGF2ZSIsImhhdmVOb3QiLCJleGlzdHMiLCJHcmFwaFFMQm9vbGVhbiIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxPcmRlclR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJ2YWx1ZXMiLCJmaWVsZENvbmZpZyIsInVwZGF0ZWRTb3J0RmllbGRzIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwiZ2xvYmFsSWRGaWVsZCIsIm9iamVjdElkIiwiYXV0aERhdGFSZXNwb25zZSIsInRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnZXRGaWVsZE5hbWVzIiwiaW5jbHVkZSIsImV4dHJhY3RLZXlzQW5kSW5jbHVkZSIsInN0YXJ0c1dpdGgiLCJyZXBsYWNlIiwiaW5kZXhPZiIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwicGFyc2VDbGFzc2VzIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJjb25uZWN0aW9uVHlwZSIsImVkZ2VUeXBlIiwiY29ubmVjdGlvbkRlZmluaXRpb25zIiwiY29ubmVjdGlvbkZpZWxkcyIsImNvdW50IiwiQ09VTlRfQVRUIiwibm9kZVR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInZpZXdlclR5cGUiLCJzZXNzaW9uVG9rZW4iLCJTRVNTSU9OX1RPS0VOX0FUVCIsInVzZXIiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9wYXJzZUNsYXNzVHlwZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgaW5kZW50ICovXG5pbXBvcnQge1xuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMRW51bVR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZ2xvYmFsSWRGaWVsZCwgY29ubmVjdGlvbkFyZ3MsIGNvbm5lY3Rpb25EZWZpbml0aW9ucyB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9pbnB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NvbnN0cmFpbnRUeXBlJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgcmV0dXJuIChwYXJzZUNsYXNzQ29uZmlnICYmIHBhcnNlQ2xhc3NDb25maWcudHlwZSkgfHwge307XG59O1xuXG5jb25zdCBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzID0gZnVuY3Rpb24gKFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5jb25jYXQoJ2lkJyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhmaWVsZCkgJiYgZmllbGQgIT09ICdpZCc7XG4gIH0pO1xuXG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZSkge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLnVwZGF0ZSkge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRPdXRwdXRGaWVsZHMpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZE91dHB1dEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICAvLyBGaWx0ZXJzIHRoZSBcInBhc3N3b3JkXCIgZmllbGQgZnJvbSBjbGFzcyBfVXNlclxuICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzT3V0cHV0RmllbGRzLmZpbHRlcihvdXRwdXRGaWVsZCA9PiBvdXRwdXRGaWVsZCAhPT0gJ3Bhc3N3b3JkJyk7XG4gIH1cblxuICBpZiAoYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMpIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRDb25zdHJhaW50RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0ZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkU29ydEZpZWxkcykge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGFsbG93ZWRTb3J0RmllbGRzO1xuICAgIGlmICghY2xhc3NTb3J0RmllbGRzLmxlbmd0aCkge1xuICAgICAgLy8gbXVzdCBoYXZlIGF0IGxlYXN0IDEgb3JkZXIgZmllbGRcbiAgICAgIC8vIG90aGVyd2lzZSB0aGUgRmluZEFyZ3MgSW5wdXQgVHlwZSB3aWxsIHRocm93LlxuICAgICAgY2xhc3NTb3J0RmllbGRzLnB1c2goe1xuICAgICAgICBmaWVsZDogJ2lkJyxcbiAgICAgICAgYXNjOiB0cnVlLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGNsYXNzRmllbGRzLm1hcChmaWVsZCA9PiB7XG4gICAgICByZXR1cm4geyBmaWVsZCwgYXNjOiB0cnVlLCBkZXNjOiB0cnVlIH07XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH07XG59O1xuXG5jb25zdCBsb2FkID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9ID0gZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyhwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSA9IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3JlYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGxpbmsgT1IgYWRkIGFuZCBsaW5rIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBsaW5rOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBMaW5rIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuYCxcbiAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZExpbmsnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgbGluayBhbiBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9V2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NDb25zdHJhaW50RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICBpZiAoWydPUicsICdBTkQnLCAnTk9SJ10uaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmxvZy53YXJuKFxuICAgICAgICAgICAgYEZpZWxkICR7ZmllbGR9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3Rpbmcgb25lLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZCA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzLFxuICAgICAgICAgIGZpZWxkXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBPUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgQU5EOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgQU5EIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgTk9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgTk9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uV2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgaGF2ZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgIGlmIChhc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0FTQ2BdID0geyB2YWx1ZSB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHt2YWx1ZX1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgICAgICAgPyBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpXG4gICAgICAgIDogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIHNraXA6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0tJUF9BVFQsXG4gICAgLi4uY29ubmVjdGlvbkFyZ3MsXG4gICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICB9O1xuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgY29uc3QgaW50ZXJmYWNlcyA9IFtkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVCwgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZV07XG4gIGNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0ge1xuICAgIGlkOiBnbG9iYWxJZEZpZWxkKGNsYXNzTmFtZSwgb2JqID0+IG9iai5vYmplY3RJZCksXG4gICAgLi4uZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTLFxuICAgIC4uLihjbGFzc05hbWUgPT09ICdfVXNlcidcbiAgICAgID8ge1xuICAgICAgICAgIGF1dGhEYXRhUmVzcG9uc2U6IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgYXV0aCBwcm92aWRlciByZXNwb25zZSB3aGVuIHRyaWdnZXJlZCBvbiBzaWduVXAvbG9nSW4uYCxcbiAgICAgICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgIDoge30pLFxuICB9O1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzT3V0cHV0RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc107XG4gICAgICAgIGNvbnN0IGFyZ3MgPSB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3MgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLCBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIH0gPVxuICAgICAgICAgICAgICAgICAgb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluZGV4T2YoJ2VkZ2VzLm5vZGUnKSA8IDApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICRyZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RJZDogc291cmNlLm9iamVjdElkLFxuICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLi4uKHdoZXJlIHx8IHt9KSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZVtmaWVsZF0gJiYgc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzLm1hcChjb29yZGluYXRlID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHNgLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmICghc291cmNlW2ZpZWxkXSkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLm1hcChhc3luYyBlbGVtID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbS5jbGFzc05hbWUgJiYgZWxlbS5vYmplY3RJZCAmJiBlbGVtLl9fdHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9XG4gICAgfSwgcGFyc2VPYmplY3RGaWVsZHMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXMsXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpO1xuXG4gIGNvbnN0IHsgY29ubmVjdGlvblR5cGUsIGVkZ2VUeXBlIH0gPSBjb25uZWN0aW9uRGVmaW5pdGlvbnMoe1xuICAgIG5hbWU6IGdyYXBoUUxDbGFzc05hbWUsXG4gICAgY29ubmVjdGlvbkZpZWxkczoge1xuICAgICAgY291bnQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ09VTlRfQVRULFxuICAgIH0sXG4gICAgbm9kZVR5cGU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gIH0pO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSB1bmRlZmluZWQ7XG4gIGlmIChcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZWRnZVR5cGUpICYmXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbm5lY3Rpb25UeXBlLCBmYWxzZSwgZmFsc2UsIHRydWUpXG4gICkge1xuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gY29ubmVjdGlvblR5cGU7XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgICBjb25maWc6IHtcbiAgICAgIHBhcnNlQ2xhc3NDb25maWcsXG4gICAgICBpc0NyZWF0ZUVuYWJsZWQsXG4gICAgICBpc1VwZGF0ZUVuYWJsZWQsXG4gICAgfSxcbiAgfTtcblxuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3Qgdmlld2VyVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnVmlld2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIFZpZXdlciBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgdGhlIGN1cnJlbnQgdXNlciBkYXRhLmAsXG4gICAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3VycmVudCB1c2VyLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHZpZXdlclR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlID0gdmlld2VyVHlwZTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXSwibWFwcGlu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