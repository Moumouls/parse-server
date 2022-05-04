"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadArrayResult = exports.load = exports.PUBLIC_ACL = exports.ROLE_ACL = exports.USER_ACL = exports.ACL = exports.PUBLIC_ACL_INPUT = exports.ROLE_ACL_INPUT = exports.USER_ACL_INPUT = exports.ACL_INPUT = exports.ELEMENT = exports.ARRAY_RESULT = exports.POLYGON_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.FILE_WHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.DATE_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = exports.KEY_VALUE_INPUT = exports.ARRAY_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = exports.STRING_WHERE_INPUT = exports.ID_WHERE_INPUT = exports.notInQueryKey = exports.inQueryKey = exports.options = exports.matchesRegex = exports.exists = exports.notIn = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.lessThanOrEqualTo = exports.lessThan = exports.notEqualTo = exports.equalTo = exports.GEO_INTERSECTS_INPUT = exports.GEO_WITHIN_INPUT = exports.CENTER_SPHERE_INPUT = exports.WITHIN_INPUT = exports.BOX_INPUT = exports.TEXT_INPUT = exports.SEARCH_INPUT = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.READ_OPTIONS_ATT = exports.READ_OPTIONS_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.SESSION_TOKEN_ATT = exports.PARSE_OBJECT = exports.PARSE_OBJECT_FIELDS = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.CLASS_NAME_ATT = exports.OBJECT_ID = exports.POLYGON = exports.POLYGON_INPUT = exports.GEO_POINT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.SELECT_INPUT = exports.SUBQUERY_INPUT = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = exports.GraphQLUpload = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
const ANY = new _graphql.GraphQLScalarType({
  name: 'Any',
  description: 'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast)
});
exports.ANY = ANY;
const OBJECT = new _graphql.GraphQLScalarType({
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
exports.OBJECT = OBJECT;

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

const DATE = new _graphql.GraphQLScalarType({
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
exports.DATE = DATE;
const GraphQLUpload = new _graphql.GraphQLScalarType({
  name: 'Upload',
  description: 'The Upload scalar type represents a file upload.'
});
exports.GraphQLUpload = GraphQLUpload;
const BYTES = new _graphql.GraphQLScalarType({
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
exports.BYTES = BYTES;

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
const FILE = new _graphql.GraphQLScalarType({
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
exports.FILE = FILE;
const FILE_INFO = new _graphql.GraphQLObjectType({
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
exports.FILE_INFO = FILE_INFO;
const FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  description: 'If this field is set to null the file will be unlinked (the file will not be deleted on cloud storage).',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: GraphQLUpload
    }
  }
});
exports.FILE_INPUT = FILE_INPUT;
const GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  },
  longitude: {
    description: 'This is the longitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  }
};
exports.GEO_POINT_FIELDS = GEO_POINT_FIELDS;
const GEO_POINT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointInput',
  description: 'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT_INPUT = GEO_POINT_INPUT;
const GEO_POINT = new _graphql.GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT = GEO_POINT;
const POLYGON_INPUT = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INPUT));
exports.POLYGON_INPUT = POLYGON_INPUT;
const POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
exports.POLYGON = POLYGON;
const USER_ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.USER_ACL_INPUT = USER_ACL_INPUT;
const ROLE_ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.ROLE_ACL_INPUT = ROLE_ACL_INPUT;
const PUBLIC_ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.PUBLIC_ACL_INPUT = PUBLIC_ACL_INPUT;
const ACL_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.ACL_INPUT = ACL_INPUT;
const USER_ACL = new _graphql.GraphQLObjectType({
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
exports.USER_ACL = USER_ACL;
const ROLE_ACL = new _graphql.GraphQLObjectType({
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
exports.ROLE_ACL = ROLE_ACL;
const PUBLIC_ACL = new _graphql.GraphQLObjectType({
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
exports.PUBLIC_ACL = PUBLIC_ACL;
const ACL = new _graphql.GraphQLObjectType({
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
exports.ACL = ACL;
const OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
exports.OBJECT_ID = OBJECT_ID;
const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.CLASS_NAME_ATT = CLASS_NAME_ATT;
const GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID
};
exports.GLOBAL_OR_OBJECT_ID_ATT = GLOBAL_OR_OBJECT_ID_ATT;
const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID
};
exports.OBJECT_ID_ATT = OBJECT_ID_ATT;
const CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.CREATED_AT_ATT = CREATED_AT_ATT;
const UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.UPDATED_AT_ATT = UPDATED_AT_ATT;
const INPUT_FIELDS = {
  ACL: {
    type: ACL
  }
};
exports.INPUT_FIELDS = INPUT_FIELDS;
const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
exports.CREATE_RESULT_FIELDS = CREATE_RESULT_FIELDS;
const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
exports.UPDATE_RESULT_FIELDS = UPDATE_RESULT_FIELDS;

const PARSE_OBJECT_FIELDS = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, CREATE_RESULT_FIELDS), UPDATE_RESULT_FIELDS), INPUT_FIELDS), {}, {
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

exports.PARSE_OBJECT_FIELDS = PARSE_OBJECT_FIELDS;
const PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
exports.PARSE_OBJECT = PARSE_OBJECT;
const SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.SESSION_TOKEN_ATT = SESSION_TOKEN_ATT;
const READ_PREFERENCE = new _graphql.GraphQLEnumType({
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
exports.READ_PREFERENCE = READ_PREFERENCE;
const READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE
};
exports.READ_PREFERENCE_ATT = READ_PREFERENCE_ATT;
const INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE
};
exports.INCLUDE_READ_PREFERENCE_ATT = INCLUDE_READ_PREFERENCE_ATT;
const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE
};
exports.SUBQUERY_READ_PREFERENCE_ATT = SUBQUERY_READ_PREFERENCE_ATT;
const READ_OPTIONS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description: 'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT
  }
});
exports.READ_OPTIONS_INPUT = READ_OPTIONS_INPUT;
const READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT
};
exports.READ_OPTIONS_ATT = READ_OPTIONS_ATT;
const WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT
};
exports.WHERE_ATT = WHERE_ATT;
const SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: _graphql.GraphQLInt
};
exports.SKIP_ATT = SKIP_ATT;
const LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: _graphql.GraphQLInt
};
exports.LIMIT_ATT = LIMIT_ATT;
const COUNT_ATT = {
  description: 'This is the total matched objecs count that is returned when the count flag is set.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
};
exports.COUNT_ATT = COUNT_ATT;
const SEARCH_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.SEARCH_INPUT = SEARCH_INPUT;
const TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
exports.TEXT_INPUT = TEXT_INPUT;
const BOX_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.BOX_INPUT = BOX_INPUT;
const WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
exports.WITHIN_INPUT = WITHIN_INPUT;
const CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.CENTER_SPHERE_INPUT = CENTER_SPHERE_INPUT;
const GEO_WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.GEO_WITHIN_INPUT = GEO_WITHIN_INPUT;
const GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
exports.GEO_INTERSECTS_INPUT = GEO_INTERSECTS_INPUT;

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
const exists = {
  description: 'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
exports.exists = exists;
const matchesRegex = {
  description: 'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
exports.matchesRegex = matchesRegex;
const options = {
  description: 'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
exports.options = options;
const SUBQUERY_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
exports.SUBQUERY_INPUT = SUBQUERY_INPUT;
const SELECT_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.SELECT_INPUT = SELECT_INPUT;
const inQueryKey = {
  description: 'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.inQueryKey = inQueryKey;
const notInQueryKey = {
  description: 'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.notInQueryKey = notInQueryKey;
const ID_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.ID_WHERE_INPUT = ID_WHERE_INPUT;
const STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.STRING_WHERE_INPUT = STRING_WHERE_INPUT;
const NUMBER_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.NUMBER_WHERE_INPUT = NUMBER_WHERE_INPUT;
const BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.BOOLEAN_WHERE_INPUT = BOOLEAN_WHERE_INPUT;
const ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.ARRAY_WHERE_INPUT = ARRAY_WHERE_INPUT;
const KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.KEY_VALUE_INPUT = KEY_VALUE_INPUT;
const OBJECT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.OBJECT_WHERE_INPUT = OBJECT_WHERE_INPUT;
const DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.DATE_WHERE_INPUT = DATE_WHERE_INPUT;
const BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.BYTES_WHERE_INPUT = BYTES_WHERE_INPUT;
const FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.FILE_WHERE_INPUT = FILE_WHERE_INPUT;
const GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.GEO_POINT_WHERE_INPUT = GEO_POINT_WHERE_INPUT;
const POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
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
exports.POLYGON_WHERE_INPUT = POLYGON_WHERE_INPUT;
const ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
}); // Default static union type, we update types and resolveType function later

exports.ELEMENT = ELEMENT;
let ARRAY_RESULT;
exports.ARRAY_RESULT = ARRAY_RESULT;

const loadArrayResult = (parseGraphQLSchema, parseClassesArray) => {
  const classTypes = parseClassesArray.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType;
        } else {
          return ELEMENT;
        }
      } else {
        return ELEMENT;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};

exports.loadArrayResult = loadArrayResult;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(GraphQLUpload, true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9JU09TdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJHcmFwaFFMVXBsb2FkIiwiQllURVMiLCJiYXNlNjQiLCJwYXJzZUZpbGVWYWx1ZSIsInVybCIsInVuZGVmaW5lZCIsIkZJTEUiLCJGSUxFX0lORk8iLCJHcmFwaFFMT2JqZWN0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTFN0cmluZyIsIkZJTEVfSU5QVVQiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiZmlsZSIsInVwbG9hZCIsIkdFT19QT0lOVF9GSUVMRFMiLCJsYXRpdHVkZSIsIkdyYXBoUUxGbG9hdCIsImxvbmdpdHVkZSIsIkdFT19QT0lOVF9JTlBVVCIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJVU0VSX0FDTF9JTlBVVCIsInVzZXJJZCIsIkdyYXBoUUxJRCIsInJlYWQiLCJHcmFwaFFMQm9vbGVhbiIsIndyaXRlIiwiUk9MRV9BQ0xfSU5QVVQiLCJyb2xlTmFtZSIsIlBVQkxJQ19BQ0xfSU5QVVQiLCJBQ0xfSU5QVVQiLCJ1c2VycyIsInJvbGVzIiwicHVibGljIiwiVVNFUl9BQ0wiLCJST0xFX0FDTCIsIlBVQkxJQ19BQ0wiLCJBQ0wiLCJyZXNvbHZlIiwicCIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicnVsZSIsImluZGV4T2YiLCJwdXNoIiwibGVuZ3RoIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJrZXkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzQXJyYXkiLCJjbGFzc1R5cGVzIiwiZmlsdGVyIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMVW5pb25UeXBlIiwidHlwZXMiLCJyZXNvbHZlVHlwZSIsImdyYXBoUUxUeXBlcyIsImxvYWQiLCJhZGRHcmFwaFFMVHlwZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQWdCQTs7Ozs7Ozs7QUFFQSxNQUFNQSxtQkFBTixTQUFrQ0MsS0FBbEMsQ0FBd0M7QUFDdENDLEVBQUFBLFdBQVcsQ0FBQ0MsS0FBRCxFQUFRQyxJQUFSLEVBQWM7QUFDdkIsVUFBTyxHQUFFRCxLQUFNLG1CQUFrQkMsSUFBSyxFQUF0QztBQUNEOztBQUhxQzs7OztBQU14QyxNQUFNQyxnQkFBZ0IsR0FBR0YsS0FBSyxJQUFJO0FBQ2hDLE1BQUksT0FBT0EsS0FBUCxLQUFpQixRQUFyQixFQUErQjtBQUM3QixXQUFPQSxLQUFQO0FBQ0Q7O0FBRUQsUUFBTSxJQUFJSCxtQkFBSixDQUF3QkcsS0FBeEIsRUFBK0IsUUFBL0IsQ0FBTjtBQUNELENBTkQ7Ozs7QUFRQSxNQUFNRyxhQUFhLEdBQUdILEtBQUssSUFBSTtBQUM3QixNQUFJLE9BQU9BLEtBQVAsS0FBaUIsUUFBckIsRUFBK0I7QUFDN0IsVUFBTUksR0FBRyxHQUFHQyxNQUFNLENBQUNMLEtBQUQsQ0FBbEI7O0FBQ0EsUUFBSUssTUFBTSxDQUFDQyxTQUFQLENBQWlCRixHQUFqQixDQUFKLEVBQTJCO0FBQ3pCLGFBQU9BLEdBQVA7QUFDRDtBQUNGOztBQUVELFFBQU0sSUFB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Q0FBQ1ksY0FBbkIsQ0FBa0NoSSxRQUFsQyxFQUE0QyxJQUE1QztBQUNBb0gsRUFBQUEsa0JBQWtCLENBQUNZLGNBQW5CLENBQWtDL0gsVUFBbEMsRUFBOEMsSUFBOUM7QUFDQW1ILEVBQUFBLGtCQUFrQixDQUFDWSxjQUFuQixDQUFrQ2hELGNBQWxDLEVBQWtELElBQWxEO0FBQ0FvQyxFQUFBQSxrQkFBa0IsQ0FBQ1ksY0FBbkIsQ0FBa0M1QyxZQUFsQyxFQUFnRCxJQUFoRDtBQUNELENBNUNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgS2luZCxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTY2FsYXJUeXBlLFxuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMSW50ZXJmYWNlVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxuICBHcmFwaFFMSW50LFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTFVuaW9uVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyB0b0dsb2JhbElkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIE9iamVjdCBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBvYmplY3RzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyhhc3QuZmllbGRzKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ09iamVjdCcpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihkYXRlKSkge1xuICAgICAgcmV0dXJuIGRhdGU7XG4gICAgfVxuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3Qgc2VyaWFsaXplRGF0ZUlzbyA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZS50b0lTT1N0cmluZygpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBwYXJzZURhdGVJc29MaXRlcmFsID0gYXN0ID0+IHtcbiAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgIHJldHVybiBwYXJzZURhdGVJc29WYWx1ZShhc3QudmFsdWUpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG59O1xuXG5jb25zdCBEQVRFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0RhdGUnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBEYXRlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGRhdGVzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmIHZhbHVlLmlzbykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiB2YWx1ZS5fX3R5cGUsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUuaXNvKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJiB2YWx1ZS5pc28pIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEdyYXBoUUxVcGxvYWQgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnVXBsb2FkJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgVXBsb2FkIHNjYWxhciB0eXBlIHJlcHJlc2VudHMgYSBmaWxlIHVwbG9hZC4nLFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBGaWxlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGZpbGVzLicsXG4gIHBhcnNlVmFsdWU6IHBhcnNlRmlsZVZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZShhc3QudmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgbmFtZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnbmFtZScpO1xuICAgICAgY29uc3QgdXJsID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICd1cmwnKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIG5hbWUgJiYgbmFtZS52YWx1ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoe1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIG5hbWU6IG5hbWUudmFsdWUudmFsdWUsXG4gICAgICAgICAgdXJsOiB1cmwgJiYgdXJsLnZhbHVlID8gdXJsLnZhbHVlLnZhbHVlIDogdW5kZWZpbmVkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0ZpbGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lORk8gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUluZm8nLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBGaWxlSW5mbyBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZmlsZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgbmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmaWxlIG5hbWUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHVybDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cmwgaW4gd2hpY2ggdGhlIGZpbGUgY2FuIGJlIGRvd25sb2FkZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnSWYgdGhpcyBmaWVsZCBpcyBzZXQgdG8gbnVsbCB0aGUgZmlsZSB3aWxsIGJlIHVubGlua2VkICh0aGUgZmlsZSB3aWxsIG5vdCBiZSBkZWxldGVkIG9uIGNsb3VkIHN0b3JhZ2UpLicsXG4gIGZpZWxkczoge1xuICAgIGZpbGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQSBGaWxlIFNjYWxhciBjYW4gYmUgYW4gdXJsIG9yIGEgRmlsZUluZm8gb2JqZWN0LicsXG4gICAgICB0eXBlOiBGSUxFLFxuICAgIH0sXG4gICAgdXBsb2FkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZSB0aGlzIGZpZWxkIGlmIHlvdSB3YW50IHRvIGNyZWF0ZSBhIG5ldyBmaWxlLicsXG4gICAgICB0eXBlOiBHcmFwaFFMVXBsb2FkLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX0ZJRUxEUyA9IHtcbiAgbGF0aXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxhdGl0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG4gIGxvbmdpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbG9uZ2l0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG59O1xuXG5jb25zdCBHRU9fUE9JTlRfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludElucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBpbnB1dHRpbmcgZmllbGRzIG9mIHR5cGUgZ2VvIHBvaW50LicsXG4gIGZpZWxkczogR0VPX1BPSU5UX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBHZW9Qb2ludCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZ2VvIHBvaW50IGZpZWxkcy4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgUE9MWUdPTl9JTlBVVCA9IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSk7XG5cbmNvbnN0IFBPTFlHT04gPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCkpO1xuXG5jb25zdCBVU0VSX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2VySWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIHRhcmdldHRlZCBVc2VyLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBST0xFX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgcHVibGljIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgYWNjZXNzIHJpZ2h0cy4gSWYgbm90IHByb3ZpZGVkIG9iamVjdCB3aWxsIGJlIHB1YmxpY2x5IHJlYWRhYmxlIGFuZCB3cml0YWJsZScsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMX0lOUFVUKSksXG4gICAgfSxcbiAgICByb2xlczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciByb2xlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChST0xFX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVVNFUl9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXNlckFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgdXNlcnMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgdXNlcnMgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUm9sZUFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2Ugcm9sZXMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgcm9sZSBoYXZlIHJlYWQgYW5kIHdyaXRlIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQVUJMSUNfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMJyxcbiAgZGVzY3JpcHRpb246ICdDdXJyZW50IGFjY2VzcyBjb250cm9sIGxpc3Qgb2YgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3QgdXNlcnMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZSAhPT0gJyonICYmIHJ1bGUuaW5kZXhPZigncm9sZTonKSAhPT0gMCkge1xuICAgICAgICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgICAgICAgIHVzZXJJZDogdG9HbG9iYWxJZCgnX1VzZXInLCBydWxlKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB1c2Vycy5sZW5ndGggPyB1c2VycyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCByb2xlcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgIGlmIChydWxlLmluZGV4T2YoJ3JvbGU6JykgPT09IDApIHtcbiAgICAgICAgICAgIHJvbGVzLnB1c2goe1xuICAgICAgICAgICAgICByb2xlTmFtZTogcnVsZS5yZXBsYWNlKCdyb2xlOicsICcnKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByb2xlcy5sZW5ndGggPyByb2xlcyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlICovXG4gICAgICAgIHJldHVybiBwWycqJ11cbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgcmVhZDogcFsnKiddLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwWycqJ10ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9JRCA9IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpO1xuXG5jb25zdCBDTEFTU19OQU1FX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjbGFzcyBuYW1lIG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgR0xPQkFMX09SX09CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IE9CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IENSRUFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgY3JlYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBVUERBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGxhcyB1cGRhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IElOUFVUX0ZJRUxEUyA9IHtcbiAgQUNMOiB7XG4gICAgdHlwZTogQUNMLFxuICB9LFxufTtcblxuY29uc3QgQ1JFQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIG9iamVjdElkOiBPQkpFQ1RfSURfQVRULFxuICBjcmVhdGVkQXQ6IENSRUFURURfQVRfQVRULFxufTtcblxuY29uc3QgVVBEQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIHVwZGF0ZWRBdDogVVBEQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1RfRklFTERTID0ge1xuICAuLi5DUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLklOUFVUX0ZJRUxEUyxcbiAgQUNMOiB7XG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFDTCksXG4gICAgcmVzb2x2ZTogKHsgQUNMIH0pID0+IChBQ0wgPyBBQ0wgOiB7ICcqJzogeyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9IH0pLFxuICB9LFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ1BhcnNlT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQYXJzZU9iamVjdCBpbnRlcmZhY2UgdHlwZSBpcyB1c2VkIGFzIGEgYmFzZSB0eXBlIGZvciB0aGUgYXV0byBnZW5lcmF0ZWQgb2JqZWN0IHR5cGVzLicsXG4gIGZpZWxkczogUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBTRVNTSU9OX1RPS0VOX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgY3VycmVudCB1c2VyIHNlc3Npb24gdG9rZW4uJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWFkUHJlZmVyZW5jZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZFByZWZlcmVuY2UgZW51bSB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZWxlY3QgaW4gd2hpY2ggZGF0YWJhc2UgcmVwbGljYSB0aGUgb3BlcmF0aW9uIG11c3QgcnVuLicsXG4gIHZhbHVlczoge1xuICAgIFBSSU1BUlk6IHsgdmFsdWU6ICdQUklNQVJZJyB9LFxuICAgIFBSSU1BUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnUFJJTUFSWV9QUkVGRVJSRUQnIH0sXG4gICAgU0VDT05EQVJZOiB7IHZhbHVlOiAnU0VDT05EQVJZJyB9LFxuICAgIFNFQ09OREFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdTRUNPTkRBUllfUFJFRkVSUkVEJyB9LFxuICAgIE5FQVJFU1Q6IHsgdmFsdWU6ICdORUFSRVNUJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIG1haW4gcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBxdWVyaWVzIHRvIGJlIGV4ZWN1dGVkIHRvIGluY2x1ZGUgZmllbGRzLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHN1YnF1ZXJpZXMgdGhhdCBtYXkgYmUgcmVxdWlyZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUmVhZE9wdGlvbnNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZE9wdGlvbnNJbnB1dHQgdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2V0IHRoZSByZWFkIHByZWZlcmVuY2VzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWRQcmVmZXJlbmNlOiBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZTogSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBvcHRpb25zIGZvciB0aGUgcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9PUFRJT05TX0lOUFVULFxufTtcblxuY29uc3QgV0hFUkVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQnLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBTS0lQX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgc2tpcHBlZCB0byByZXR1cm4uJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IExJTUlUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsaW1pdCBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IENPVU5UX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIHRvdGFsIG1hdGNoZWQgb2JqZWNzIGNvdW50IHRoYXQgaXMgcmV0dXJuZWQgd2hlbiB0aGUgY291bnQgZmxhZyBpcyBzZXQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJbnQpLFxufTtcblxuY29uc3QgU0VBUkNIX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VhcmNoSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBTZWFyY2hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBzZWFyY2ggb3BlcmF0aW9uIG9uIGEgZnVsbCB0ZXh0IHNlYXJjaC4nLFxuICBmaWVsZHM6IHtcbiAgICB0ZXJtOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRlcm0gdG8gYmUgc2VhcmNoZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIGxhbmd1YWdlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGxhbmd1YWdlIHRvIHRldGVybWluZSB0aGUgbGlzdCBvZiBzdG9wIHdvcmRzIGFuZCB0aGUgcnVsZXMgZm9yIHRva2VuaXplci4nLFxuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIGNhc2VTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBjYXNlIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgZGlhY3JpdGljU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgZGlhY3JpdGljIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVEVYVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1RleHRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFRleHRJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHRleHQgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBzZWFyY2g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc2VhcmNoIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU0VBUkNIX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPWF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0JveElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgQm94SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgYm94IG9wZXJhdGlvbiBvbiBhIHdpdGhpbiBnZW8gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgYm90dG9tTGVmdDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3R0b20gbGVmdCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIHVwcGVyUmlnaHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBwZXIgcmlnaHQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBXSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdXaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFdpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgd2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgYm94OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJveCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChCT1hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQ0VOVEVSX1NQSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0NlbnRlclNwaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBDZW50ZXJTcGhlcmVJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBjZW50ZXJTcGhlcmUgb3BlcmF0aW9uIG9uIGEgZ2VvV2l0aGluIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGNlbnRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjZW50ZXIgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICBkaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBHZW9XaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb1dpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvbHlnb246IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9seWdvbiB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IFBPTFlHT05fSU5QVVQsXG4gICAgfSxcbiAgICBjZW50ZXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3BoZXJlIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19JTlRFUlNFQ1RTX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvSW50ZXJzZWN0c0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9JbnRlcnNlY3RzSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9JbnRlcnNlY3RzIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9pbnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9pbnQgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBlcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3Qgbm90RXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuT3JFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGdyZWF0ZXJUaGFuID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGdyZWF0ZXJUaGFuT3JFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGluT3AgPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBub3RJbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IGV4aXN0cyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGV4aXN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBleGlzdHMgKG9yIGRvIG5vdCBleGlzdCkuJyxcbiAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG59O1xuXG5jb25zdCBtYXRjaGVzUmVnZXggPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBtYXRjaGVzUmVnZXggb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIG1hdGNoZXMgYSBzcGVjaWZpZWQgcmVndWxhciBleHByZXNzaW9uLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBvcHRpb25zID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgb3B0aW9ucyBvcGVyYXRvciB0byBzcGVjaWZ5IG9wdGlvbmFsIGZsYWdzIChzdWNoIGFzIFwiaVwiIGFuZCBcIm1cIikgdG8gYmUgYWRkZWQgdG8gYSBtYXRjaGVzUmVnZXggb3BlcmF0aW9uIGluIHRoZSBzYW1lIHNldCBvZiBjb25zdHJhaW50cy4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgU1VCUVVFUllfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdWJxdWVyeUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgU3VicXVlcnlJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHN1YiBxdWVyeSB0byBhbm90aGVyIGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYW4gaW5RdWVyeUtleSBvciBhIG5vdEluUXVlcnlLZXkgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBxdWVyeToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzdWJxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNVQlFVRVJZX0lOUFVUKSxcbiAgICB9LFxuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBrZXkgaW4gdGhlIHJlc3VsdCBvZiB0aGUgc3VicXVlcnkgdGhhdCBtdXN0IG1hdGNoIChub3QgbWF0Y2gpIHRoZSBmaWVsZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgaW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXF1YWxzIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3Qgbm90SW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3QgSURfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdJZFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIElkV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYW4gaWQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBpbjogaW5PcChHcmFwaFFMSUQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMSUQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgU1RSSU5HX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3RyaW5nV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3RyaW5nV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFN0cmluZy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMU3RyaW5nKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgdGV4dDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkdGV4dCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgZnVsbCB0ZXh0IHNlYXJjaCBjb25zdHJhaW50LicsXG4gICAgICB0eXBlOiBURVhUX0lOUFVULFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IE5VTUJFUl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ051bWJlcldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE51bWJlcldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBOdW1iZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBpbjogaW5PcChHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMRmxvYXQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQk9PTEVBTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0Jvb2xlYW5XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb29sZWFuV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJvb2xlYW4uJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBUlJBWV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQXJyYXlXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQXJyYXkuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhBTlkpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQU5ZKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQU5ZKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQU5ZKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBpbjogaW5PcChBTlkpLFxuICAgIG5vdEluOiBub3RJbihBTlkpLFxuICAgIGV4aXN0cyxcbiAgICBjb250YWluZWRCeToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWluZWRCeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBpcyBjb250YWluZWQgYnkgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgY29udGFpbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgY29udGFpbiBhbGwgZWxlbWVudHMgb2YgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEtFWV9WQUxVRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0tleVZhbHVlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FuIGVudHJ5IGZyb20gYW4gb2JqZWN0LCBpLmUuLCBhIHBhaXIgb2Yga2V5IGFuZCB2YWx1ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGtleSB1c2VkIHRvIHJldHJpZXZlIHRoZSB2YWx1ZSBvZiB0aGlzIGVudHJ5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgdmFsdWUgb2YgdGhlIGVudHJ5LiBDb3VsZCBiZSBhbnkgdHlwZSBvZiBzY2FsYXIgZGF0YS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgcmVzdWx0IGJ5IGEgZmllbGQgb2YgdHlwZSBPYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBpbjogaW5PcChLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEluOiBub3RJbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgREFURV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0RhdGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIERhdGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhEQVRFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKERBVEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihEQVRFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oREFURSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBpbjogaW5PcChEQVRFKSxcbiAgICBub3RJbjogbm90SW4oREFURSksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFU19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0J5dGVzV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXNXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQnl0ZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhCWVRFUyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhCWVRFUyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEJZVEVTKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihCWVRFUyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBpbjogaW5PcChCWVRFUyksXG4gICAgbm90SW46IG5vdEluKEJZVEVTKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oRklMRSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhGSUxFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oRklMRSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihGSUxFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oRklMRSksXG4gICAgaW46IGluT3AoRklMRSksXG4gICAgbm90SW46IG5vdEluKEZJTEUpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBHZW9Qb2ludC4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgbmVhclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBuZWFyU3BoZXJlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIG5lYXIgdG8gYW5vdGhlciBnZW8gcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJblJhZGlhbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJblJhZGlhbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluTWlsZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbk1pbGVzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBtaWxlcykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBraWxvbWV0ZXJzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgd2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIHdpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgYm94LicsXG4gICAgICB0eXBlOiBXSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgICBnZW9XaXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvV2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBwb2x5Z29uIG9yIHNwaGVyZS4nLFxuICAgICAgdHlwZTogR0VPX1dJVEhJTl9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBPTFlHT05fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBnZW9JbnRlcnNlY3RzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBFTEVNRU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0VsZW1lbnQnLFxuICBkZXNjcmlwdGlvbjogXCJUaGUgRWxlbWVudCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiBhcnJheSBpdGVtcycgdmFsdWUuXCIsXG4gIGZpZWxkczoge1xuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1JldHVybiB0aGUgdmFsdWUgb2YgdGhlIGVsZW1lbnQgaW4gdGhlIGFycmF5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuLy8gRGVmYXVsdCBzdGF0aWMgdW5pb24gdHlwZSwgd2UgdXBkYXRlIHR5cGVzIGFuZCByZXNvbHZlVHlwZSBmdW5jdGlvbiBsYXRlclxubGV0IEFSUkFZX1JFU1VMVDtcblxuY29uc3QgbG9hZEFycmF5UmVzdWx0ID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzc2VzQXJyYXkpID0+IHtcbiAgY29uc3QgY2xhc3NUeXBlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5XG4gICAgLmZpbHRlcihwYXJzZUNsYXNzID0+XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlID8gdHJ1ZSA6IGZhbHNlXG4gICAgKVxuICAgIC5tYXAoXG4gICAgICBwYXJzZUNsYXNzID0+IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICApO1xuICBBUlJBWV9SRVNVTFQgPSBuZXcgR3JhcGhRTFVuaW9uVHlwZSh7XG4gICAgbmFtZTogJ0FycmF5UmVzdWx0JyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHMnLFxuICAgIHR5cGVzOiAoKSA9PiBbRUxFTUVOVCwgLi4uY2xhc3NUeXBlc10sXG4gICAgcmVzb2x2ZVR5cGU6IHZhbHVlID0+IHtcbiAgICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdPYmplY3QnICYmIHZhbHVlLmNsYXNzTmFtZSAmJiB2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBFTEVNRU5UO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gRUxFTUVOVDtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX1JFU1VMVCk7XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdyYXBoUUxVcGxvYWQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQU5ZLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTkZPLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQQVJTRV9PQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9QUkVGRVJFTkNFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfT1BUSU9OU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShJRF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgR3JhcGhRTFVwbG9hZCxcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIFNVQlFVRVJZX0lOUFVULFxuICBTRUxFQ1RfSU5QVVQsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgRklMRV9JTlBVVCxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBQQVJTRV9PQkpFQ1RfRklFTERTLFxuICBQQVJTRV9PQkpFQ1QsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgUkVBRF9PUFRJT05TX0lOUFVULFxuICBSRUFEX09QVElPTlNfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIGVxdWFsVG8sXG4gIG5vdEVxdWFsVG8sXG4gIGxlc3NUaGFuLFxuICBsZXNzVGhhbk9yRXF1YWxUbyxcbiAgZ3JlYXRlclRoYW4sXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvLFxuICBpbk9wLFxuICBub3RJbixcbiAgZXhpc3RzLFxuICBtYXRjaGVzUmVnZXgsXG4gIG9wdGlvbnMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIElEX1dIRVJFX0lOUFVULFxuICBTVFJJTkdfV0hFUkVfSU5QVVQsXG4gIE5VTUJFUl9XSEVSRV9JTlBVVCxcbiAgQk9PTEVBTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfV0hFUkVfSU5QVVQsXG4gIEtFWV9WQUxVRV9JTlBVVCxcbiAgT0JKRUNUX1dIRVJFX0lOUFVULFxuICBEQVRFX1dIRVJFX0lOUFVULFxuICBCWVRFU19XSEVSRV9JTlBVVCxcbiAgRklMRV9XSEVSRV9JTlBVVCxcbiAgR0VPX1BPSU5UX1dIRVJFX0lOUFVULFxuICBQT0xZR09OX1dIRVJFX0lOUFVULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIEFDTF9JTlBVVCxcbiAgVVNFUl9BQ0xfSU5QVVQsXG4gIFJPTEVfQUNMX0lOUFVULFxuICBQVUJMSUNfQUNMX0lOUFVULFxuICBBQ0wsXG4gIFVTRVJfQUNMLFxuICBST0xFX0FDTCxcbiAgUFVCTElDX0FDTCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdfQ==