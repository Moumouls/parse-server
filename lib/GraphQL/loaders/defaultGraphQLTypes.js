"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GLOBAL_OR_OBJECT_ID_ATT = exports.GEO_WITHIN_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.GEO_POINT = exports.GEO_INTERSECTS_INPUT = exports.FILE_WHERE_INPUT = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.ELEMENT = exports.DATE_WHERE_INPUT = exports.DATE = exports.CREATE_RESULT_FIELDS = exports.CREATED_AT_ATT = exports.COUNT_ATT = exports.CLASS_NAME_ATT = exports.CENTER_SPHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.BYTES = exports.BOX_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = exports.ARRAY_RESULT = exports.ANY = exports.ACL_INPUT = exports.ACL = void 0;
Object.defineProperty(exports, "GraphQLUpload", {
  enumerable: true,
  get: function () {
    return _GraphQLUpload.default;
  }
});
exports.serializeDateIso = exports.parseValue = exports.parseStringValue = exports.parseObjectFields = exports.parseListValues = exports.parseIntValue = exports.parseFloatValue = exports.parseFileValue = exports.parseDateIsoValue = exports.parseBooleanValue = exports.options = exports.notInQueryKey = exports.notIn = exports.notEqualTo = exports.matchesRegex = exports.loadArrayResult = exports.load = exports.lessThanOrEqualTo = exports.lessThan = exports.inQueryKey = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.exists = exports.equalTo = exports.WITHIN_INPUT = exports.WHERE_ATT = exports.USER_ACL_INPUT = exports.USER_ACL = exports.UPDATE_RESULT_FIELDS = exports.UPDATED_AT_ATT = exports.TypeValidationError = exports.TEXT_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_INPUT = exports.STRING_WHERE_INPUT = exports.SKIP_ATT = exports.SESSION_TOKEN_ATT = exports.SELECT_INPUT = exports.SEARCH_INPUT = exports.ROLE_ACL_INPUT = exports.ROLE_ACL = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.READ_OPTIONS_INPUT = exports.READ_OPTIONS_ATT = exports.PUBLIC_ACL_INPUT = exports.PUBLIC_ACL = exports.POLYGON_WHERE_INPUT = exports.POLYGON_INPUT = exports.POLYGON = exports.PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT = exports.OBJECT_WHERE_INPUT = exports.OBJECT_ID_ATT = exports.OBJECT_ID = exports.OBJECT = exports.NUMBER_WHERE_INPUT = exports.LIMIT_ATT = exports.KEY_VALUE_INPUT = exports.INPUT_FIELDS = exports.INCLUDE_READ_PREFERENCE_ATT = exports.ID_WHERE_INPUT = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _GraphQLUpload = _interopRequireDefault(require("graphql-upload/GraphQLUpload.js"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
class TypeValidationError extends Error {
  constructor(value, type) {
    super(`${value} is not a valid ${type}`);
  }
}
exports.TypeValidationError = TypeValidationError;
const parseStringValue = value => {
  if (typeof value === 'string') {
    return value;
  }
  throw new TypeValidationError(value, 'String');
};
exports.parseStringValue = parseStringValue;
const parseIntValue = value => {
  if (typeof value === 'string') {
    const int = Number(value);
    if (Number.isInteger(int)) {
      return int;
    }
  }
  throw new TypeValidationError(value, 'Int');
};
exports.parseIntValue = parseIntValue;
const parseFloatValue = value => {
  if (typeof value === 'string') {
    const float = Number(value);
    if (!isNaN(float)) {
      return float;
    }
  }
  throw new TypeValidationError(value, 'Float');
};
exports.parseFloatValue = parseFloatValue;
const parseBooleanValue = value => {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new TypeValidationError(value, 'Boolean');
};
exports.parseBooleanValue = parseBooleanValue;
const parseValue = value => {
  switch (value.kind) {
    case _graphql.Kind.STRING:
      return parseStringValue(value.value);
    case _graphql.Kind.INT:
      return parseIntValue(value.value);
    case _graphql.Kind.FLOAT:
      return parseFloatValue(value.value);
    case _graphql.Kind.BOOLEAN:
      return parseBooleanValue(value.value);
    case _graphql.Kind.LIST:
      return parseListValues(value.values);
    case _graphql.Kind.OBJECT:
      return parseObjectFields(value.fields);
    default:
      return value.value;
  }
};
exports.parseValue = parseValue;
const parseListValues = values => {
  if (Array.isArray(values)) {
    return values.map(value => parseValue(value));
  }
  throw new TypeValidationError(values, 'List');
};
exports.parseListValues = parseListValues;
const parseObjectFields = fields => {
  if (Array.isArray(fields)) {
    return fields.reduce((object, field) => _objectSpread(_objectSpread({}, object), {}, {
      [field.name.value]: parseValue(field.value)
    }), {});
  }
  throw new TypeValidationError(fields, 'Object');
};
exports.parseObjectFields = parseObjectFields;
const ANY = exports.ANY = new _graphql.GraphQLScalarType({
  name: 'Any',
  description: 'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast)
});
const OBJECT = exports.OBJECT = new _graphql.GraphQLScalarType({
  name: 'Object',
  description: 'The Object scalar type is used in operations and types that involve objects.',
  parseValue(value) {
    if (typeof value === 'object') {
      return value;
    }
    throw new TypeValidationError(value, 'Object');
  },
  serialize(value) {
    if (typeof value === 'object') {
      return value;
    }
    throw new TypeValidationError(value, 'Object');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.OBJECT) {
      return parseObjectFields(ast.fields);
    }
    throw new TypeValidationError(ast.kind, 'Object');
  }
});
const parseDateIsoValue = value => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date)) {
      return date;
    }
  } else if (value instanceof Date) {
    return value;
  }
  throw new TypeValidationError(value, 'Date');
};
exports.parseDateIsoValue = parseDateIsoValue;
const serializeDateIso = value => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new TypeValidationError(value, 'Date');
};
exports.serializeDateIso = serializeDateIso;
const parseDateIsoLiteral = ast => {
  if (ast.kind === _graphql.Kind.STRING) {
    return parseDateIsoValue(ast.value);
  }
  throw new TypeValidationError(ast.kind, 'Date');
};
const DATE = exports.DATE = new _graphql.GraphQLScalarType({
  name: 'Date',
  description: 'The Date scalar type is used in operations and types that involve dates.',
  parseValue(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return {
        __type: 'Date',
        iso: parseDateIsoValue(value)
      };
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return {
        __type: value.__type,
        iso: parseDateIsoValue(value.iso)
      };
    }
    throw new TypeValidationError(value, 'Date');
  },
  serialize(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return serializeDateIso(value);
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return serializeDateIso(value.iso);
    }
    throw new TypeValidationError(value, 'Date');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Date',
        iso: parseDateIsoLiteral(ast)
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const iso = ast.fields.find(field => field.name.value === 'iso');
      if (__type && __type.value && __type.value.value === 'Date' && iso) {
        return {
          __type: __type.value.value,
          iso: parseDateIsoLiteral(iso.value)
        };
      }
    }
    throw new TypeValidationError(ast.kind, 'Date');
  }
});
const BYTES = exports.BYTES = new _graphql.GraphQLScalarType({
  name: 'Bytes',
  description: 'The Bytes scalar type is used in operations and types that involve base 64 binary data.',
  parseValue(value) {
    if (typeof value === 'string') {
      return {
        __type: 'Bytes',
        base64: value
      };
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value;
    }
    throw new TypeValidationError(value, 'Bytes');
  },
  serialize(value) {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value.base64;
    }
    throw new TypeValidationError(value, 'Bytes');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Bytes',
        base64: ast.value
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const base64 = ast.fields.find(field => field.name.value === 'base64');
      if (__type && __type.value && __type.value.value === 'Bytes' && base64 && base64.value && typeof base64.value.value === 'string') {
        return {
          __type: __type.value.value,
          base64: base64.value.value
        };
      }
    }
    throw new TypeValidationError(ast.kind, 'Bytes');
  }
});
const parseFileValue = value => {
  if (typeof value === 'string') {
    return {
      __type: 'File',
      name: value
    };
  } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
    return value;
  }
  throw new TypeValidationError(value, 'File');
};
exports.parseFileValue = parseFileValue;
const FILE = exports.FILE = new _graphql.GraphQLScalarType({
  name: 'File',
  description: 'The File scalar type is used in operations and types that involve files.',
  parseValue: parseFileValue,
  serialize: value => {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
      return value.name;
    }
    throw new TypeValidationError(value, 'File');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return parseFileValue(ast.value);
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const name = ast.fields.find(field => field.name.value === 'name');
      const url = ast.fields.find(field => field.name.value === 'url');
      if (__type && __type.value && name && name.value) {
        return parseFileValue({
          __type: __type.value.value,
          name: name.value.value,
          url: url && url.value ? url.value.value : undefined
        });
      }
    }
    throw new TypeValidationError(ast.kind, 'File');
  }
});
const FILE_INFO = exports.FILE_INFO = new _graphql.GraphQLObjectType({
  name: 'FileInfo',
  description: 'The FileInfo object type is used to return the information about files.',
  fields: {
    name: {
      description: 'This is the file name.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    url: {
      description: 'This is the url in which the file can be downloaded.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
const FILE_INPUT = exports.FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  description: 'If this field is set to null the file will be unlinked (the file will not be deleted on cloud storage).',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: _GraphQLUpload.default
    }
  }
});
const GEO_POINT_FIELDS = exports.GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  },
  longitude: {
    description: 'This is the longitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  }
};
const GEO_POINT_INPUT = exports.GEO_POINT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointInput',
  description: 'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
const GEO_POINT = exports.GEO_POINT = new _graphql.GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS
});
const POLYGON_INPUT = exports.POLYGON_INPUT = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INPUT));
const POLYGON = exports.POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
const USER_ACL_INPUT = exports.USER_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'UserACLInput',
  description: 'Allow to manage users in ACL.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
const ROLE_ACL_INPUT = exports.ROLE_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'RoleACLInput',
  description: 'Allow to manage roles in ACL.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
const PUBLIC_ACL_INPUT = exports.PUBLIC_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PublicACLInput',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
const ACL_INPUT = exports.ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ACLInput',
  description: 'Allow to manage access rights. If not provided object will be publicly readable and writable',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL_INPUT))
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL_INPUT))
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL_INPUT
    }
  }
});
const USER_ACL = exports.USER_ACL = new _graphql.GraphQLObjectType({
  name: 'UserACL',
  description: 'Allow to manage users in ACL. If read and write are null the users have read and write rights.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
const ROLE_ACL = exports.ROLE_ACL = new _graphql.GraphQLObjectType({
  name: 'RoleACL',
  description: 'Allow to manage roles in ACL. If read and write are null the role have read and write rights.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
const PUBLIC_ACL = exports.PUBLIC_ACL = new _graphql.GraphQLObjectType({
  name: 'PublicACL',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: _graphql.GraphQLBoolean
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: _graphql.GraphQLBoolean
    }
  }
});
const ACL = exports.ACL = new _graphql.GraphQLObjectType({
  name: 'ACL',
  description: 'Current access control list of the current object.',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL)),
      resolve(p) {
        const users = [];
        Object.keys(p).forEach(rule => {
          if (rule !== '*' && rule.indexOf('role:') !== 0) {
            users.push({
              userId: (0, _graphqlRelay.toGlobalId)('_User', rule),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return users.length ? users : null;
      }
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL)),
      resolve(p) {
        const roles = [];
        Object.keys(p).forEach(rule => {
          if (rule.indexOf('role:') === 0) {
            roles.push({
              roleName: rule.replace('role:', ''),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return roles.length ? roles : null;
      }
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL,
      resolve(p) {
        /* eslint-disable */
        return p['*'] ? {
          read: p['*'].read ? true : false,
          write: p['*'].write ? true : false
        } : null;
      }
    }
  }
});
const OBJECT_ID = exports.OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
const CLASS_NAME_ATT = exports.CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
const GLOBAL_OR_OBJECT_ID_ATT = exports.GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID
};
const OBJECT_ID_ATT = exports.OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID
};
const CREATED_AT_ATT = exports.CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new _graphql.GraphQLNonNull(DATE)
};
const UPDATED_AT_ATT = exports.UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new _graphql.GraphQLNonNull(DATE)
};
const INPUT_FIELDS = exports.INPUT_FIELDS = {
  ACL: {
    type: ACL
  }
};
const CREATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
const UPDATE_RESULT_FIELDS = exports.UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
const PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT_FIELDS = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, CREATE_RESULT_FIELDS), UPDATE_RESULT_FIELDS), INPUT_FIELDS), {}, {
  ACL: {
    type: new _graphql.GraphQLNonNull(ACL),
    resolve: ({
      ACL
    }) => ACL ? ACL : {
      '*': {
        read: true,
        write: true
      }
    }
  }
});
const PARSE_OBJECT = exports.PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
const SESSION_TOKEN_ATT = exports.SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
const READ_PREFERENCE = exports.READ_PREFERENCE = new _graphql.GraphQLEnumType({
  name: 'ReadPreference',
  description: 'The ReadPreference enum type is used in queries in order to select in which database replica the operation must run.',
  values: {
    PRIMARY: {
      value: 'PRIMARY'
    },
    PRIMARY_PREFERRED: {
      value: 'PRIMARY_PREFERRED'
    },
    SECONDARY: {
      value: 'SECONDARY'
    },
    SECONDARY_PREFERRED: {
      value: 'SECONDARY_PREFERRED'
    },
    NEAREST: {
      value: 'NEAREST'
    }
  }
});
const READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE
};
const INCLUDE_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE
};
const SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE
};
const READ_OPTIONS_INPUT = exports.READ_OPTIONS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description: 'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT
  }
});
const READ_OPTIONS_ATT = exports.READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT
};
const WHERE_ATT = exports.WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT
};
const SKIP_ATT = exports.SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: _graphql.GraphQLInt
};
const LIMIT_ATT = exports.LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: _graphql.GraphQLInt
};
const COUNT_ATT = exports.COUNT_ATT = {
  description: 'This is the total matched objecs count that is returned when the count flag is set.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
};
const SEARCH_INPUT = exports.SEARCH_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SearchInput',
  description: 'The SearchInput type is used to specifiy a search operation on a full text search.',
  fields: {
    term: {
      description: 'This is the term to be searched.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    language: {
      description: 'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: _graphql.GraphQLString
    },
    caseSensitive: {
      description: 'This is the flag to enable or disable case sensitive search.',
      type: _graphql.GraphQLBoolean
    },
    diacriticSensitive: {
      description: 'This is the flag to enable or disable diacritic sensitive search.',
      type: _graphql.GraphQLBoolean
    }
  }
});
const TEXT_INPUT = exports.TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
const BOX_INPUT = exports.BOX_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BoxInput',
  description: 'The BoxInput type is used to specifiy a box operation on a within geo query.',
  fields: {
    bottomLeft: {
      description: 'This is the bottom left coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    upperRight: {
      description: 'This is the upper right coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    }
  }
});
const WITHIN_INPUT = exports.WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
const CENTER_SPHERE_INPUT = exports.CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description: 'The CenterSphereInput type is used to specifiy a centerSphere operation on a geoWithin query.',
  fields: {
    center: {
      description: 'This is the center of the sphere.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    distance: {
      description: 'This is the radius of the sphere.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
    }
  }
});
const GEO_WITHIN_INPUT = exports.GEO_WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoWithinInput',
  description: 'The GeoWithinInput type is used to specify a geoWithin operation on a constraint.',
  fields: {
    polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT
    },
    centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT
    }
  }
});
const GEO_INTERSECTS_INPUT = exports.GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
const equalTo = type => ({
  description: 'This is the equalTo operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type
});
exports.equalTo = equalTo;
const notEqualTo = type => ({
  description: 'This is the notEqualTo operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type
});
exports.notEqualTo = notEqualTo;
const lessThan = type => ({
  description: 'This is the lessThan operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type
});
exports.lessThan = lessThan;
const lessThanOrEqualTo = type => ({
  description: 'This is the lessThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type
});
exports.lessThanOrEqualTo = lessThanOrEqualTo;
const greaterThan = type => ({
  description: 'This is the greaterThan operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type
});
exports.greaterThan = greaterThan;
const greaterThanOrEqualTo = type => ({
  description: 'This is the greaterThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type
});
exports.greaterThanOrEqualTo = greaterThanOrEqualTo;
const inOp = type => ({
  description: 'This is the in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});
exports.inOp = inOp;
const notIn = type => ({
  description: 'This is the notIn operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});
exports.notIn = notIn;
const exists = exports.exists = {
  description: 'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
const matchesRegex = exports.matchesRegex = {
  description: 'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
const options = exports.options = {
  description: 'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
const SUBQUERY_INPUT = exports.SUBQUERY_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
const SELECT_INPUT = exports.SELECT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SelectInput',
  description: 'The SelectInput type is used to specify an inQueryKey or a notInQueryKey operation on a constraint.',
  fields: {
    query: {
      description: 'This is the subquery to be executed.',
      type: new _graphql.GraphQLNonNull(SUBQUERY_INPUT)
    },
    key: {
      description: 'This is the key in the result of the subquery that must match (not match) the field.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
const inQueryKey = exports.inQueryKey = {
  description: 'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT
};
const notInQueryKey = exports.notInQueryKey = {
  description: 'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
};
const ID_WHERE_INPUT = exports.ID_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'IdWhereInput',
  description: 'The IdWhereInput input type is used in operations that involve filtering objects by an id.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLID),
    notEqualTo: notEqualTo(_graphql.GraphQLID),
    lessThan: lessThan(_graphql.GraphQLID),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLID),
    greaterThan: greaterThan(_graphql.GraphQLID),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLID),
    in: inOp(_graphql.GraphQLID),
    notIn: notIn(_graphql.GraphQLID),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
const STRING_WHERE_INPUT = exports.STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'StringWhereInput',
  description: 'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLString),
    notEqualTo: notEqualTo(_graphql.GraphQLString),
    lessThan: lessThan(_graphql.GraphQLString),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLString),
    greaterThan: greaterThan(_graphql.GraphQLString),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLString),
    in: inOp(_graphql.GraphQLString),
    notIn: notIn(_graphql.GraphQLString),
    exists,
    matchesRegex,
    options,
    text: {
      description: 'This is the $text operator to specify a full text search constraint.',
      type: TEXT_INPUT
    },
    inQueryKey,
    notInQueryKey
  }
});
const NUMBER_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'NumberWhereInput',
  description: 'The NumberWhereInput input type is used in operations that involve filtering objects by a field of type Number.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLFloat),
    notEqualTo: notEqualTo(_graphql.GraphQLFloat),
    lessThan: lessThan(_graphql.GraphQLFloat),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLFloat),
    greaterThan: greaterThan(_graphql.GraphQLFloat),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLFloat),
    in: inOp(_graphql.GraphQLFloat),
    notIn: notIn(_graphql.GraphQLFloat),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
const BOOLEAN_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description: 'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLBoolean),
    notEqualTo: notEqualTo(_graphql.GraphQLBoolean),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
const ARRAY_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description: 'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
  fields: {
    equalTo: equalTo(ANY),
    notEqualTo: notEqualTo(ANY),
    lessThan: lessThan(ANY),
    lessThanOrEqualTo: lessThanOrEqualTo(ANY),
    greaterThan: greaterThan(ANY),
    greaterThanOrEqualTo: greaterThanOrEqualTo(ANY),
    in: inOp(ANY),
    notIn: notIn(ANY),
    exists,
    containedBy: {
      description: 'This is the containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    contains: {
      description: 'This is the contains operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    inQueryKey,
    notInQueryKey
  }
});
const KEY_VALUE_INPUT = exports.KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    value: {
      description: 'The value of the entry. Could be any type of scalar data.',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});
const OBJECT_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ObjectWhereInput',
  description: 'The ObjectWhereInput input type is used in operations that involve filtering result by a field of type Object.',
  fields: {
    equalTo: equalTo(KEY_VALUE_INPUT),
    notEqualTo: notEqualTo(KEY_VALUE_INPUT),
    in: inOp(KEY_VALUE_INPUT),
    notIn: notIn(KEY_VALUE_INPUT),
    lessThan: lessThan(KEY_VALUE_INPUT),
    lessThanOrEqualTo: lessThanOrEqualTo(KEY_VALUE_INPUT),
    greaterThan: greaterThan(KEY_VALUE_INPUT),
    greaterThanOrEqualTo: greaterThanOrEqualTo(KEY_VALUE_INPUT),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
const DATE_WHERE_INPUT = exports.DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'DateWhereInput',
  description: 'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
  fields: {
    equalTo: equalTo(DATE),
    notEqualTo: notEqualTo(DATE),
    lessThan: lessThan(DATE),
    lessThanOrEqualTo: lessThanOrEqualTo(DATE),
    greaterThan: greaterThan(DATE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(DATE),
    in: inOp(DATE),
    notIn: notIn(DATE),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
const BYTES_WHERE_INPUT = exports.BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description: 'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
  fields: {
    equalTo: equalTo(BYTES),
    notEqualTo: notEqualTo(BYTES),
    lessThan: lessThan(BYTES),
    lessThanOrEqualTo: lessThanOrEqualTo(BYTES),
    greaterThan: greaterThan(BYTES),
    greaterThanOrEqualTo: greaterThanOrEqualTo(BYTES),
    in: inOp(BYTES),
    notIn: notIn(BYTES),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
const FILE_WHERE_INPUT = exports.FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileWhereInput',
  description: 'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
  fields: {
    equalTo: equalTo(FILE),
    notEqualTo: notEqualTo(FILE),
    lessThan: lessThan(FILE),
    lessThanOrEqualTo: lessThanOrEqualTo(FILE),
    greaterThan: greaterThan(FILE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(FILE),
    in: inOp(FILE),
    notIn: notIn(FILE),
    exists,
    matchesRegex,
    options,
    inQueryKey,
    notInQueryKey
  }
});
const GEO_POINT_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description: 'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    exists,
    nearSphere: {
      description: 'This is the nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT
    },
    maxDistance: {
      description: 'This is the maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInRadians: {
      description: 'This is the maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInMiles: {
      description: 'This is the maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInKilometers: {
      description: 'This is the maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    within: {
      description: 'This is the within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_INPUT
    },
    geoWithin: {
      description: 'This is the geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT
    }
  }
});
const POLYGON_WHERE_INPUT = exports.POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description: 'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    exists,
    geoIntersects: {
      description: 'This is the geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS_INPUT
    }
  }
});
const ELEMENT = exports.ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});

// Default static union type, we update types and resolveType function later
let ARRAY_RESULT = exports.ARRAY_RESULT = void 0;
const loadArrayResult = (parseGraphQLSchema, parseClassesArray) => {
  const classTypes = parseClassesArray.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType.name;
        } else {
          return ELEMENT.name;
        }
      } else {
        return ELEMENT.name;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};
exports.loadArrayResult = loadArrayResult;
const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(_GraphQLUpload.default, true);
  parseGraphQLSchema.addGraphQLType(ANY, true);
  parseGraphQLSchema.addGraphQLType(OBJECT, true);
  parseGraphQLSchema.addGraphQLType(DATE, true);
  parseGraphQLSchema.addGraphQLType(BYTES, true);
  parseGraphQLSchema.addGraphQLType(FILE, true);
  parseGraphQLSchema.addGraphQLType(FILE_INFO, true);
  parseGraphQLSchema.addGraphQLType(FILE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT, true);
  parseGraphQLSchema.addGraphQLType(PARSE_OBJECT, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(READ_OPTIONS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SEARCH_INPUT, true);
  parseGraphQLSchema.addGraphQLType(TEXT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOX_INPUT, true);
  parseGraphQLSchema.addGraphQLType(WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CENTER_SPHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_INTERSECTS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ID_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(STRING_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(NUMBER_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOOLEAN_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ARRAY_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(KEY_VALUE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(OBJECT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(DATE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BYTES_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(FILE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(POLYGON_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ACL, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL, true);
  parseGraphQLSchema.addGraphQLType(SUBQUERY_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SELECT_INPUT, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX0dyYXBoUUxVcGxvYWQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIlR5cGVWYWxpZGF0aW9uRXJyb3IiLCJFcnJvciIsImNvbnN0cnVjdG9yIiwidHlwZSIsImV4cG9ydHMiLCJwYXJzZVN0cmluZ1ZhbHVlIiwicGFyc2VJbnRWYWx1ZSIsImludCIsImlzSW50ZWdlciIsInBhcnNlRmxvYXRWYWx1ZSIsImZsb2F0IiwiaXNOYU4iLCJwYXJzZUJvb2xlYW5WYWx1ZSIsInBhcnNlVmFsdWUiLCJraW5kIiwiS2luZCIsIlNUUklORyIsIklOVCIsIkZMT0FUIiwiQk9PTEVBTiIsIkxJU1QiLCJwYXJzZUxpc3RWYWx1ZXMiLCJ2YWx1ZXMiLCJPQkpFQ1QiLCJwYXJzZU9iamVjdEZpZWxkcyIsImZpZWxkcyIsIkFycmF5IiwiaXNBcnJheSIsIm1hcCIsInJlZHVjZSIsIm9iamVjdCIsImZpZWxkIiwibmFtZSIsIkFOWSIsIkdyYXBoUUxTY2FsYXJUeXBlIiwiZGVzY3JpcHRpb24iLCJzZXJpYWxpemUiLCJwYXJzZUxpdGVyYWwiLCJhc3QiLCJwYXJzZURhdGVJc29WYWx1ZSIsImRhdGUiLCJEYXRlIiwic2VyaWFsaXplRGF0ZUlzbyIsInRvSVNPU3RyaW5nIiwicGFyc2VEYXRlSXNvTGl0ZXJhbCIsIkRBVEUiLCJfX3R5cGUiLCJpc28iLCJmaW5kIiwiQllURVMiLCJiYXNlNjQiLCJwYXJzZUZpbGVWYWx1ZSIsInVybCIsInVuZGVmaW5lZCIsIkZJTEUiLCJGSUxFX0lORk8iLCJHcmFwaFFMT2JqZWN0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTFN0cmluZyIsIkZJTEVfSU5QVVQiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiZmlsZSIsInVwbG9hZCIsIkdyYXBoUUxVcGxvYWQiLCJHRU9fUE9JTlRfRklFTERTIiwibGF0aXR1ZGUiLCJHcmFwaFFMRmxvYXQiLCJsb25naXR1ZGUiLCJHRU9fUE9JTlRfSU5QVVQiLCJHRU9fUE9JTlQiLCJQT0xZR09OX0lOUFVUIiwiR3JhcGhRTExpc3QiLCJQT0xZR09OIiwiVVNFUl9BQ0xfSU5QVVQiLCJ1c2VySWQiLCJHcmFwaFFMSUQiLCJyZWFkIiwiR3JhcGhRTEJvb2xlYW4iLCJ3cml0ZSIsIlJPTEVfQUNMX0lOUFVUIiwicm9sZU5hbWUiLCJQVUJMSUNfQUNMX0lOUFVUIiwiQUNMX0lOUFVUIiwidXNlcnMiLCJyb2xlcyIsInB1YmxpYyIsIlVTRVJfQUNMIiwiUk9MRV9BQ0wiLCJQVUJMSUNfQUNMIiwiQUNMIiwicmVzb2x2ZSIsInAiLCJydWxlIiwiaW5kZXhPZiIsInRvR2xvYmFsSWQiLCJyZXBsYWNlIiwiT0JKRUNUX0lEIiwiQ0xBU1NfTkFNRV9BVFQiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIk9CSkVDVF9JRF9BVFQiLCJDUkVBVEVEX0FUX0FUVCIsIlVQREFURURfQVRfQVRUIiwiSU5QVVRfRklFTERTIiwiQ1JFQVRFX1JFU1VMVF9GSUVMRFMiLCJvYmplY3RJZCIsImNyZWF0ZWRBdCIsIlVQREFURV9SRVNVTFRfRklFTERTIiwidXBkYXRlZEF0IiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsIlBBUlNFX09CSkVDVCIsIkdyYXBoUUxJbnRlcmZhY2VUeXBlIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJSRUFEX1BSRUZFUkVOQ0UiLCJHcmFwaFFMRW51bVR5cGUiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsIlJFQURfUFJFRkVSRU5DRV9BVFQiLCJJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiUkVBRF9PUFRJT05TX0lOUFVUIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiUkVBRF9PUFRJT05TX0FUVCIsIldIRVJFX0FUVCIsIlNLSVBfQVRUIiwiR3JhcGhRTEludCIsIkxJTUlUX0FUVCIsIkNPVU5UX0FUVCIsIlNFQVJDSF9JTlBVVCIsInRlcm0iLCJsYW5ndWFnZSIsImNhc2VTZW5zaXRpdmUiLCJkaWFjcml0aWNTZW5zaXRpdmUiLCJURVhUX0lOUFVUIiwic2VhcmNoIiwiQk9YX0lOUFVUIiwiYm90dG9tTGVmdCIsInVwcGVyUmlnaHQiLCJXSVRISU5fSU5QVVQiLCJib3giLCJDRU5URVJfU1BIRVJFX0lOUFVUIiwiY2VudGVyIiwiZGlzdGFuY2UiLCJHRU9fV0lUSElOX0lOUFVUIiwicG9seWdvbiIsImNlbnRlclNwaGVyZSIsIkdFT19JTlRFUlNFQ1RTX0lOUFVUIiwicG9pbnQiLCJlcXVhbFRvIiwibm90RXF1YWxUbyIsImxlc3NUaGFuIiwibGVzc1RoYW5PckVxdWFsVG8iLCJncmVhdGVyVGhhbiIsImdyZWF0ZXJUaGFuT3JFcXVhbFRvIiwiaW5PcCIsIm5vdEluIiwiZXhpc3RzIiwibWF0Y2hlc1JlZ2V4Iiwib3B0aW9ucyIsIlNVQlFVRVJZX0lOUFVUIiwiY2xhc3NOYW1lIiwid2hlcmUiLCJhc3NpZ24iLCJTRUxFQ1RfSU5QVVQiLCJxdWVyeSIsImluUXVlcnlLZXkiLCJub3RJblF1ZXJ5S2V5IiwiSURfV0hFUkVfSU5QVVQiLCJpbiIsIlNUUklOR19XSEVSRV9JTlBVVCIsInRleHQiLCJOVU1CRVJfV0hFUkVfSU5QVVQiLCJCT09MRUFOX1dIRVJFX0lOUFVUIiwiQVJSQVlfV0hFUkVfSU5QVVQiLCJjb250YWluZWRCeSIsImNvbnRhaW5zIiwiS0VZX1ZBTFVFX0lOUFVUIiwiT0JKRUNUX1dIRVJFX0lOUFVUIiwiREFURV9XSEVSRV9JTlBVVCIsIkJZVEVTX1dIRVJFX0lOUFVUIiwiRklMRV9XSEVSRV9JTlBVVCIsIkdFT19QT0lOVF9XSEVSRV9JTlBVVCIsIm5lYXJTcGhlcmUiLCJtYXhEaXN0YW5jZSIsIm1heERpc3RhbmNlSW5SYWRpYW5zIiwibWF4RGlzdGFuY2VJbk1pbGVzIiwibWF4RGlzdGFuY2VJbktpbG9tZXRlcnMiLCJ3aXRoaW4iLCJnZW9XaXRoaW4iLCJQT0xZR09OX1dIRVJFX0lOUFVUIiwiZ2VvSW50ZXJzZWN0cyIsIkVMRU1FTlQiLCJBUlJBWV9SRVNVTFQiLCJsb2FkQXJyYXlSZXN1bHQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJwYXJzZUNsYXNzZXNBcnJheSIsImNsYXNzVHlwZXMiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxVbmlvblR5cGUiLCJ0eXBlcyIsInJlc29sdmVUeXBlIiwiZ3JhcGhRTFR5cGVzIiwibG9hZCIsImFkZEdyYXBoUUxUeXBlIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEtpbmQsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTEludGVyZmFjZVR5cGUsXG4gIEdyYXBoUUxFbnVtVHlwZSxcbiAgR3JhcGhRTEludCxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxVbmlvblR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgdG9HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IEdyYXBoUUxVcGxvYWQgZnJvbSAnZ3JhcGhxbC11cGxvYWQvR3JhcGhRTFVwbG9hZC5qcyc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIE9iamVjdCBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBvYmplY3RzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyhhc3QuZmllbGRzKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ09iamVjdCcpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihkYXRlKSkge1xuICAgICAgcmV0dXJuIGRhdGU7XG4gICAgfVxuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3Qgc2VyaWFsaXplRGF0ZUlzbyA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZS50b0lTT1N0cmluZygpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBwYXJzZURhdGVJc29MaXRlcmFsID0gYXN0ID0+IHtcbiAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgIHJldHVybiBwYXJzZURhdGVJc29WYWx1ZShhc3QudmFsdWUpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG59O1xuXG5jb25zdCBEQVRFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0RhdGUnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBEYXRlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGRhdGVzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmIHZhbHVlLmlzbykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiB2YWx1ZS5fX3R5cGUsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUuaXNvKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJiB2YWx1ZS5pc28pIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBGaWxlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGZpbGVzLicsXG4gIHBhcnNlVmFsdWU6IHBhcnNlRmlsZVZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZShhc3QudmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgbmFtZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnbmFtZScpO1xuICAgICAgY29uc3QgdXJsID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICd1cmwnKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIG5hbWUgJiYgbmFtZS52YWx1ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoe1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIG5hbWU6IG5hbWUudmFsdWUudmFsdWUsXG4gICAgICAgICAgdXJsOiB1cmwgJiYgdXJsLnZhbHVlID8gdXJsLnZhbHVlLnZhbHVlIDogdW5kZWZpbmVkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0ZpbGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lORk8gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUluZm8nLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBGaWxlSW5mbyBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZmlsZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgbmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmaWxlIG5hbWUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHVybDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cmwgaW4gd2hpY2ggdGhlIGZpbGUgY2FuIGJlIGRvd25sb2FkZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnSWYgdGhpcyBmaWVsZCBpcyBzZXQgdG8gbnVsbCB0aGUgZmlsZSB3aWxsIGJlIHVubGlua2VkICh0aGUgZmlsZSB3aWxsIG5vdCBiZSBkZWxldGVkIG9uIGNsb3VkIHN0b3JhZ2UpLicsXG4gIGZpZWxkczoge1xuICAgIGZpbGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQSBGaWxlIFNjYWxhciBjYW4gYmUgYW4gdXJsIG9yIGEgRmlsZUluZm8gb2JqZWN0LicsXG4gICAgICB0eXBlOiBGSUxFLFxuICAgIH0sXG4gICAgdXBsb2FkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZSB0aGlzIGZpZWxkIGlmIHlvdSB3YW50IHRvIGNyZWF0ZSBhIG5ldyBmaWxlLicsXG4gICAgICB0eXBlOiBHcmFwaFFMVXBsb2FkLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX0ZJRUxEUyA9IHtcbiAgbGF0aXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxhdGl0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG4gIGxvbmdpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbG9uZ2l0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG59O1xuXG5jb25zdCBHRU9fUE9JTlRfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludElucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBpbnB1dHRpbmcgZmllbGRzIG9mIHR5cGUgZ2VvIHBvaW50LicsXG4gIGZpZWxkczogR0VPX1BPSU5UX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBHZW9Qb2ludCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZ2VvIHBvaW50IGZpZWxkcy4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgUE9MWUdPTl9JTlBVVCA9IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSk7XG5cbmNvbnN0IFBPTFlHT04gPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCkpO1xuXG5jb25zdCBVU0VSX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2VySWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIHRhcmdldHRlZCBVc2VyLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBST0xFX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgcHVibGljIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgYWNjZXNzIHJpZ2h0cy4gSWYgbm90IHByb3ZpZGVkIG9iamVjdCB3aWxsIGJlIHB1YmxpY2x5IHJlYWRhYmxlIGFuZCB3cml0YWJsZScsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMX0lOUFVUKSksXG4gICAgfSxcbiAgICByb2xlczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciByb2xlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChST0xFX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVVNFUl9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXNlckFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgdXNlcnMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgdXNlcnMgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUm9sZUFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2Ugcm9sZXMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgcm9sZSBoYXZlIHJlYWQgYW5kIHdyaXRlIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQVUJMSUNfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMJyxcbiAgZGVzY3JpcHRpb246ICdDdXJyZW50IGFjY2VzcyBjb250cm9sIGxpc3Qgb2YgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3QgdXNlcnMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZSAhPT0gJyonICYmIHJ1bGUuaW5kZXhPZigncm9sZTonKSAhPT0gMCkge1xuICAgICAgICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgICAgICAgIHVzZXJJZDogdG9HbG9iYWxJZCgnX1VzZXInLCBydWxlKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB1c2Vycy5sZW5ndGggPyB1c2VycyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCByb2xlcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgIGlmIChydWxlLmluZGV4T2YoJ3JvbGU6JykgPT09IDApIHtcbiAgICAgICAgICAgIHJvbGVzLnB1c2goe1xuICAgICAgICAgICAgICByb2xlTmFtZTogcnVsZS5yZXBsYWNlKCdyb2xlOicsICcnKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByb2xlcy5sZW5ndGggPyByb2xlcyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlICovXG4gICAgICAgIHJldHVybiBwWycqJ11cbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgcmVhZDogcFsnKiddLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwWycqJ10ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9JRCA9IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpO1xuXG5jb25zdCBDTEFTU19OQU1FX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjbGFzcyBuYW1lIG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgR0xPQkFMX09SX09CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IE9CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IENSRUFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgY3JlYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBVUERBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGxhcyB1cGRhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IElOUFVUX0ZJRUxEUyA9IHtcbiAgQUNMOiB7XG4gICAgdHlwZTogQUNMLFxuICB9LFxufTtcblxuY29uc3QgQ1JFQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIG9iamVjdElkOiBPQkpFQ1RfSURfQVRULFxuICBjcmVhdGVkQXQ6IENSRUFURURfQVRfQVRULFxufTtcblxuY29uc3QgVVBEQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIHVwZGF0ZWRBdDogVVBEQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1RfRklFTERTID0ge1xuICAuLi5DUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLklOUFVUX0ZJRUxEUyxcbiAgQUNMOiB7XG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFDTCksXG4gICAgcmVzb2x2ZTogKHsgQUNMIH0pID0+IChBQ0wgPyBBQ0wgOiB7ICcqJzogeyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9IH0pLFxuICB9LFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ1BhcnNlT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQYXJzZU9iamVjdCBpbnRlcmZhY2UgdHlwZSBpcyB1c2VkIGFzIGEgYmFzZSB0eXBlIGZvciB0aGUgYXV0byBnZW5lcmF0ZWQgb2JqZWN0IHR5cGVzLicsXG4gIGZpZWxkczogUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBTRVNTSU9OX1RPS0VOX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgY3VycmVudCB1c2VyIHNlc3Npb24gdG9rZW4uJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWFkUHJlZmVyZW5jZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZFByZWZlcmVuY2UgZW51bSB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZWxlY3QgaW4gd2hpY2ggZGF0YWJhc2UgcmVwbGljYSB0aGUgb3BlcmF0aW9uIG11c3QgcnVuLicsXG4gIHZhbHVlczoge1xuICAgIFBSSU1BUlk6IHsgdmFsdWU6ICdQUklNQVJZJyB9LFxuICAgIFBSSU1BUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnUFJJTUFSWV9QUkVGRVJSRUQnIH0sXG4gICAgU0VDT05EQVJZOiB7IHZhbHVlOiAnU0VDT05EQVJZJyB9LFxuICAgIFNFQ09OREFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdTRUNPTkRBUllfUFJFRkVSUkVEJyB9LFxuICAgIE5FQVJFU1Q6IHsgdmFsdWU6ICdORUFSRVNUJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIG1haW4gcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBxdWVyaWVzIHRvIGJlIGV4ZWN1dGVkIHRvIGluY2x1ZGUgZmllbGRzLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHN1YnF1ZXJpZXMgdGhhdCBtYXkgYmUgcmVxdWlyZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUmVhZE9wdGlvbnNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZE9wdGlvbnNJbnB1dHQgdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2V0IHRoZSByZWFkIHByZWZlcmVuY2VzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWRQcmVmZXJlbmNlOiBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZTogSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBvcHRpb25zIGZvciB0aGUgcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9PUFRJT05TX0lOUFVULFxufTtcblxuY29uc3QgV0hFUkVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQnLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBTS0lQX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgc2tpcHBlZCB0byByZXR1cm4uJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IExJTUlUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsaW1pdCBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IENPVU5UX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIHRvdGFsIG1hdGNoZWQgb2JqZWNzIGNvdW50IHRoYXQgaXMgcmV0dXJuZWQgd2hlbiB0aGUgY291bnQgZmxhZyBpcyBzZXQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJbnQpLFxufTtcblxuY29uc3QgU0VBUkNIX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VhcmNoSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBTZWFyY2hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBzZWFyY2ggb3BlcmF0aW9uIG9uIGEgZnVsbCB0ZXh0IHNlYXJjaC4nLFxuICBmaWVsZHM6IHtcbiAgICB0ZXJtOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRlcm0gdG8gYmUgc2VhcmNoZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIGxhbmd1YWdlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGxhbmd1YWdlIHRvIHRldGVybWluZSB0aGUgbGlzdCBvZiBzdG9wIHdvcmRzIGFuZCB0aGUgcnVsZXMgZm9yIHRva2VuaXplci4nLFxuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIGNhc2VTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBjYXNlIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgZGlhY3JpdGljU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgZGlhY3JpdGljIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVEVYVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1RleHRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFRleHRJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHRleHQgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBzZWFyY2g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc2VhcmNoIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU0VBUkNIX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPWF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0JveElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgQm94SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgYm94IG9wZXJhdGlvbiBvbiBhIHdpdGhpbiBnZW8gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgYm90dG9tTGVmdDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3R0b20gbGVmdCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIHVwcGVyUmlnaHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBwZXIgcmlnaHQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBXSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdXaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFdpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgd2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgYm94OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJveCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChCT1hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQ0VOVEVSX1NQSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0NlbnRlclNwaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBDZW50ZXJTcGhlcmVJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBjZW50ZXJTcGhlcmUgb3BlcmF0aW9uIG9uIGEgZ2VvV2l0aGluIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGNlbnRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjZW50ZXIgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICBkaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBHZW9XaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb1dpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvbHlnb246IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9seWdvbiB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IFBPTFlHT05fSU5QVVQsXG4gICAgfSxcbiAgICBjZW50ZXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3BoZXJlIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19JTlRFUlNFQ1RTX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvSW50ZXJzZWN0c0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9JbnRlcnNlY3RzSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9JbnRlcnNlY3RzIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9pbnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9pbnQgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBlcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3Qgbm90RXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuT3JFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGdyZWF0ZXJUaGFuID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGdyZWF0ZXJUaGFuT3JFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGluT3AgPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBub3RJbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IGV4aXN0cyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGV4aXN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBleGlzdHMgKG9yIGRvIG5vdCBleGlzdCkuJyxcbiAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG59O1xuXG5jb25zdCBtYXRjaGVzUmVnZXggPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBtYXRjaGVzUmVnZXggb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIG1hdGNoZXMgYSBzcGVjaWZpZWQgcmVndWxhciBleHByZXNzaW9uLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBvcHRpb25zID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgb3B0aW9ucyBvcGVyYXRvciB0byBzcGVjaWZ5IG9wdGlvbmFsIGZsYWdzIChzdWNoIGFzIFwiaVwiIGFuZCBcIm1cIikgdG8gYmUgYWRkZWQgdG8gYSBtYXRjaGVzUmVnZXggb3BlcmF0aW9uIGluIHRoZSBzYW1lIHNldCBvZiBjb25zdHJhaW50cy4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgU1VCUVVFUllfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdWJxdWVyeUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgU3VicXVlcnlJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHN1YiBxdWVyeSB0byBhbm90aGVyIGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYW4gaW5RdWVyeUtleSBvciBhIG5vdEluUXVlcnlLZXkgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBxdWVyeToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzdWJxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNVQlFVRVJZX0lOUFVUKSxcbiAgICB9LFxuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBrZXkgaW4gdGhlIHJlc3VsdCBvZiB0aGUgc3VicXVlcnkgdGhhdCBtdXN0IG1hdGNoIChub3QgbWF0Y2gpIHRoZSBmaWVsZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgaW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXF1YWxzIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3Qgbm90SW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3QgSURfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdJZFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIElkV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYW4gaWQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBpbjogaW5PcChHcmFwaFFMSUQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMSUQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgU1RSSU5HX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3RyaW5nV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3RyaW5nV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFN0cmluZy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMU3RyaW5nKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgdGV4dDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkdGV4dCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgZnVsbCB0ZXh0IHNlYXJjaCBjb25zdHJhaW50LicsXG4gICAgICB0eXBlOiBURVhUX0lOUFVULFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IE5VTUJFUl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ051bWJlcldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE51bWJlcldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBOdW1iZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBpbjogaW5PcChHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMRmxvYXQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQk9PTEVBTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0Jvb2xlYW5XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb29sZWFuV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJvb2xlYW4uJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBUlJBWV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQXJyYXlXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQXJyYXkuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhBTlkpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQU5ZKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQU5ZKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQU5ZKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBpbjogaW5PcChBTlkpLFxuICAgIG5vdEluOiBub3RJbihBTlkpLFxuICAgIGV4aXN0cyxcbiAgICBjb250YWluZWRCeToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWluZWRCeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBpcyBjb250YWluZWQgYnkgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgY29udGFpbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgY29udGFpbiBhbGwgZWxlbWVudHMgb2YgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEtFWV9WQUxVRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0tleVZhbHVlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FuIGVudHJ5IGZyb20gYW4gb2JqZWN0LCBpLmUuLCBhIHBhaXIgb2Yga2V5IGFuZCB2YWx1ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGtleSB1c2VkIHRvIHJldHJpZXZlIHRoZSB2YWx1ZSBvZiB0aGlzIGVudHJ5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgdmFsdWUgb2YgdGhlIGVudHJ5LiBDb3VsZCBiZSBhbnkgdHlwZSBvZiBzY2FsYXIgZGF0YS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgcmVzdWx0IGJ5IGEgZmllbGQgb2YgdHlwZSBPYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBpbjogaW5PcChLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEluOiBub3RJbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgREFURV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0RhdGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIERhdGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhEQVRFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKERBVEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihEQVRFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oREFURSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBpbjogaW5PcChEQVRFKSxcbiAgICBub3RJbjogbm90SW4oREFURSksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFU19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0J5dGVzV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXNXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQnl0ZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhCWVRFUyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhCWVRFUyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEJZVEVTKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihCWVRFUyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBpbjogaW5PcChCWVRFUyksXG4gICAgbm90SW46IG5vdEluKEJZVEVTKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oRklMRSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhGSUxFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oRklMRSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihGSUxFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oRklMRSksXG4gICAgaW46IGluT3AoRklMRSksXG4gICAgbm90SW46IG5vdEluKEZJTEUpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBHZW9Qb2ludC4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgbmVhclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBuZWFyU3BoZXJlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIG5lYXIgdG8gYW5vdGhlciBnZW8gcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJblJhZGlhbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJblJhZGlhbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluTWlsZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbk1pbGVzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBtaWxlcykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBraWxvbWV0ZXJzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgd2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIHdpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgYm94LicsXG4gICAgICB0eXBlOiBXSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgICBnZW9XaXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvV2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBwb2x5Z29uIG9yIHNwaGVyZS4nLFxuICAgICAgdHlwZTogR0VPX1dJVEhJTl9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBPTFlHT05fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBnZW9JbnRlcnNlY3RzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBFTEVNRU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0VsZW1lbnQnLFxuICBkZXNjcmlwdGlvbjogXCJUaGUgRWxlbWVudCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiBhcnJheSBpdGVtcycgdmFsdWUuXCIsXG4gIGZpZWxkczoge1xuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1JldHVybiB0aGUgdmFsdWUgb2YgdGhlIGVsZW1lbnQgaW4gdGhlIGFycmF5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuLy8gRGVmYXVsdCBzdGF0aWMgdW5pb24gdHlwZSwgd2UgdXBkYXRlIHR5cGVzIGFuZCByZXNvbHZlVHlwZSBmdW5jdGlvbiBsYXRlclxubGV0IEFSUkFZX1JFU1VMVDtcblxuY29uc3QgbG9hZEFycmF5UmVzdWx0ID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzc2VzQXJyYXkpID0+IHtcbiAgY29uc3QgY2xhc3NUeXBlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5XG4gICAgLmZpbHRlcihwYXJzZUNsYXNzID0+XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlID8gdHJ1ZSA6IGZhbHNlXG4gICAgKVxuICAgIC5tYXAoXG4gICAgICBwYXJzZUNsYXNzID0+IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICApO1xuICBBUlJBWV9SRVNVTFQgPSBuZXcgR3JhcGhRTFVuaW9uVHlwZSh7XG4gICAgbmFtZTogJ0FycmF5UmVzdWx0JyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHMnLFxuICAgIHR5cGVzOiAoKSA9PiBbRUxFTUVOVCwgLi4uY2xhc3NUeXBlc10sXG4gICAgcmVzb2x2ZVR5cGU6IHZhbHVlID0+IHtcbiAgICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdPYmplY3QnICYmIHZhbHVlLmNsYXNzTmFtZSAmJiB2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlLm5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIEVMRU1FTlQubmFtZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIEVMRU1FTlQubmFtZTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX1JFU1VMVCk7XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdyYXBoUUxVcGxvYWQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQU5ZLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTkZPLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQQVJTRV9PQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9QUkVGRVJFTkNFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfT1BUSU9OU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShJRF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgR3JhcGhRTFVwbG9hZCxcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIFNVQlFVRVJZX0lOUFVULFxuICBTRUxFQ1RfSU5QVVQsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgRklMRV9JTlBVVCxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBQQVJTRV9PQkpFQ1RfRklFTERTLFxuICBQQVJTRV9PQkpFQ1QsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgUkVBRF9PUFRJT05TX0lOUFVULFxuICBSRUFEX09QVElPTlNfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIGVxdWFsVG8sXG4gIG5vdEVxdWFsVG8sXG4gIGxlc3NUaGFuLFxuICBsZXNzVGhhbk9yRXF1YWxUbyxcbiAgZ3JlYXRlclRoYW4sXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvLFxuICBpbk9wLFxuICBub3RJbixcbiAgZXhpc3RzLFxuICBtYXRjaGVzUmVnZXgsXG4gIG9wdGlvbnMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIElEX1dIRVJFX0lOUFVULFxuICBTVFJJTkdfV0hFUkVfSU5QVVQsXG4gIE5VTUJFUl9XSEVSRV9JTlBVVCxcbiAgQk9PTEVBTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfV0hFUkVfSU5QVVQsXG4gIEtFWV9WQUxVRV9JTlBVVCxcbiAgT0JKRUNUX1dIRVJFX0lOUFVULFxuICBEQVRFX1dIRVJFX0lOUFVULFxuICBCWVRFU19XSEVSRV9JTlBVVCxcbiAgRklMRV9XSEVSRV9JTlBVVCxcbiAgR0VPX1BPSU5UX1dIRVJFX0lOUFVULFxuICBQT0xZR09OX1dIRVJFX0lOUFVULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIEFDTF9JTlBVVCxcbiAgVVNFUl9BQ0xfSU5QVVQsXG4gIFJPTEVfQUNMX0lOUFVULFxuICBQVUJMSUNfQUNMX0lOUFVULFxuICBBQ0wsXG4gIFVTRVJfQUNMLFxuICBST0xFX0FDTCxcbiAgUFVCTElDX0FDTCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLFFBQUEsR0FBQUMsT0FBQTtBQWdCQSxJQUFBQyxhQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxjQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFBNEQsU0FBQUcsdUJBQUFDLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxDQUFBLEVBQUFDLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQUosQ0FBQSxPQUFBRyxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgsTUFBQSxDQUFBRSxxQkFBQSxDQUFBTCxDQUFBLEdBQUFDLENBQUEsS0FBQUssQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQU4s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