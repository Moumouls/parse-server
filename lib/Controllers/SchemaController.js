"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VolatileClassesSchemas = exports.SchemaController = void 0;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.classNameIsValid = classNameIsValid;
exports.defaultColumns = exports.default = exports.convertSchemaToAdapterSchema = void 0;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.systemClasses = exports.requiredColumns = exports.load = void 0;
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _Config = _interopRequireDefault(require("../Config"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _objectDestructuringEmpty(t) { if (null == t) throw new TypeError("Cannot destructure " + t); }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.
// -disable-next
const Parse = require('parse/node').Parse;

// -disable-next

const defaultColumns = exports.defaultColumns = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: {
      type: 'String'
    },
    createdAt: {
      type: 'Date'
    },
    updatedAt: {
      type: 'Date'
    },
    ACL: {
      type: 'ACL'
    }
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: {
      type: 'String'
    },
    password: {
      type: 'String'
    },
    email: {
      type: 'String'
    },
    emailVerified: {
      type: 'Boolean'
    },
    authData: {
      type: 'Object'
    }
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: {
      type: 'String'
    },
    deviceToken: {
      type: 'String'
    },
    channels: {
      type: 'Array'
    },
    deviceType: {
      type: 'String'
    },
    pushType: {
      type: 'String'
    },
    GCMSenderId: {
      type: 'String'
    },
    timeZone: {
      type: 'String'
    },
    localeIdentifier: {
      type: 'String'
    },
    badge: {
      type: 'Number'
    },
    appVersion: {
      type: 'String'
    },
    appName: {
      type: 'String'
    },
    appIdentifier: {
      type: 'String'
    },
    parseVersion: {
      type: 'String'
    }
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: {
      type: 'String'
    },
    users: {
      type: 'Relation',
      targetClass: '_User'
    },
    roles: {
      type: 'Relation',
      targetClass: '_Role'
    }
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    user: {
      type: 'Pointer',
      targetClass: '_User'
    },
    installationId: {
      type: 'String'
    },
    sessionToken: {
      type: 'String'
    },
    expiresAt: {
      type: 'Date'
    },
    createdWith: {
      type: 'Object'
    }
  },
  _Product: {
    productIdentifier: {
      type: 'String'
    },
    download: {
      type: 'File'
    },
    downloadName: {
      type: 'String'
    },
    icon: {
      type: 'File'
    },
    order: {
      type: 'Number'
    },
    title: {
      type: 'String'
    },
    subtitle: {
      type: 'String'
    }
  },
  _PushStatus: {
    pushTime: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    // rest or webui
    query: {
      type: 'String'
    },
    // the stringified JSON query
    payload: {
      type: 'String'
    },
    // the stringified JSON payload,
    title: {
      type: 'String'
    },
    expiry: {
      type: 'Number'
    },
    expiration_interval: {
      type: 'Number'
    },
    status: {
      type: 'String'
    },
    numSent: {
      type: 'Number'
    },
    numFailed: {
      type: 'Number'
    },
    pushHash: {
      type: 'String'
    },
    errorMessage: {
      type: 'Object'
    },
    sentPerType: {
      type: 'Object'
    },
    failedPerType: {
      type: 'Object'
    },
    sentPerUTCOffset: {
      type: 'Object'
    },
    failedPerUTCOffset: {
      type: 'Object'
    },
    count: {
      type: 'Number'
    } // tracks # of batches queued and pending
  },
  _JobStatus: {
    jobName: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    status: {
      type: 'String'
    },
    message: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    // params received when calling the job
    finishedAt: {
      type: 'Date'
    }
  },
  _JobSchedule: {
    jobName: {
      type: 'String'
    },
    description: {
      type: 'String'
    },
    params: {
      type: 'String'
    },
    startAfter: {
      type: 'String'
    },
    daysOfWeek: {
      type: 'Array'
    },
    timeOfDay: {
      type: 'String'
    },
    lastRun: {
      type: 'Number'
    },
    repeatMinutes: {
      type: 'Number'
    }
  },
  _Hooks: {
    functionName: {
      type: 'String'
    },
    className: {
      type: 'String'
    },
    triggerName: {
      type: 'String'
    },
    url: {
      type: 'String'
    }
  },
  _GlobalConfig: {
    objectId: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    masterKeyOnly: {
      type: 'Object'
    }
  },
  _GraphQLConfig: {
    objectId: {
      type: 'String'
    },
    config: {
      type: 'Object'
    }
  },
  _Audience: {
    objectId: {
      type: 'String'
    },
    name: {
      type: 'String'
    },
    query: {
      type: 'String'
    },
    //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: {
      type: 'Date'
    },
    timesUsed: {
      type: 'Number'
    }
  },
  _Idempotency: {
    reqId: {
      type: 'String'
    },
    expire: {
      type: 'Date'
    }
  }
});

// fields required for read or write operations on their respective classes.
const requiredColumns = exports.requiredColumns = Object.freeze({
  read: {
    _User: ['username']
  },
  write: {
    _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
    _Role: ['name', 'ACL']
  }
});
const invalidColumns = ['length'];
const systemClasses = exports.systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency']);
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency']);

// Anything that start with role
const roleRegex = /^role:.*/;
// Anything that starts with userField (allowed for protected fields only)
const protectedFieldsPointerRegex = /^userField:.*/;
// * permission
const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/;

// regex for validating entities in protectedFields object
const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]);

// clp regex
const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);
function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId depends on startup options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
function validateProtectedFieldsKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of protectedFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId regex depends on launch options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

// validation before setting class-level permissions on collection
function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }
  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }
    const operation = perms[operationKey];
    // proceed with next operationKey

    // throws when root fields are of wrong type
    validateCLPjson(operation, operationKey);
    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      }
      // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey
      continue;
    }

    // validate protected fields
    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];
        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        }

        // if the field is in form of array
        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          }
          // field should exist on collection
          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      }
      // proceed with next operationKey
      continue;
    }

    // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users
    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp);

      // entity can be either:
      // "pointerFields": string[]
      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];
        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        }
        // proceed with next entity key
        continue;
      }

      // or [entity]: boolean
      const permit = operation[entity];
      if (permit !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions ${operationKey}:${entity}:${permit}`);
      }
    }
  }
}
function validateCLPjson(operation, operationKey) {
  if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
    if (!Array.isArray(operation)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an array`);
    }
  } else {
    if (typeof operation === 'object' && operation !== null) {
      // ok to proceed
      return;
    } else {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an object`);
    }
  }
}
function validatePointerPermission(fieldName, fields, operation) {
  // Uses collection schema to ensure the field is of type:
  // - Pointer<_User> (pointers)
  // - Array
  //
  //    It's not possible to enforce type on Array's items in schema
  //  so we accept any Array field, and later when applying permissions
  //  only items that are pointers to _User are considered.
  if (!(fields[fieldName] && (fields[fieldName].type == 'Pointer' && fields[fieldName].targetClass == '_User' || fields[fieldName].type == 'Array'))) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${fieldName}' is not a valid column for class level pointer permissions ${operation}`);
  }
}
const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  // Valid classes must:
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key
function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }
  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName, className)) {
    return false;
  }
  if (defaultColumns._Default[fieldName]) {
    return false;
  }
  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }
  return true;
}
function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}
const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, 'invalid JSON');
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon'];
// Returns an error suitable for throwing if the type is invalid
const fieldTypeIsInvalid = ({
  type,
  targetClass
}) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }
  if (typeof type !== 'string') {
    return invalidJsonError;
  }
  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }
  return undefined;
};
const convertSchemaToAdapterSchema = schema => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = {
    type: 'Array'
  };
  schema.fields._wperm = {
    type: 'Array'
  };
  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = {
      type: 'String'
    };
  }
  return schema;
};
exports.convertSchemaToAdapterSchema = convertSchemaToAdapterSchema;
const convertAdapterSchemaToParseSchema = _ref => {
  let schema = _extends({}, (_objectDestructuringEmpty(_ref), _ref));
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  schema.fields.ACL = {
    type: 'ACL'
  };
  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit
    delete schema.fields._hashed_password;
    schema.fields.password = {
      type: 'String'
    };
  }
  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }
  return schema;
};
class SchemaData {
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }
      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = (0, _deepcopy.default)(schema.classLevelPermissions);
            data.indexes = schema.indexes;
            const classProtectedFields = this.__protectedFields[schema.className];
            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([...(data.classLevelPermissions.protectedFields[key] || []), ...classProtectedFields[key]]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }
            this.__data[schema.className] = data;
          }
          return this.__data[schema.className];
        }
      });
    });

    // Inject the in-memory classes
    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {}
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }
          return this.__data[className];
        }
      });
    });
  }
}
const injectDefaultSchema = ({
  className,
  fields,
  classLevelPermissions,
  indexes
}) => {
  const defaultSchema = {
    className,
    fields: _objectSpread(_objectSpread(_objectSpread({}, defaultColumns._Default), defaultColumns[className] || {}), fields),
    classLevelPermissions
  };
  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }
  return defaultSchema;
};
const _HooksSchema = {
  className: '_Hooks',
  fields: defaultColumns._Hooks
};
const _GlobalConfigSchema = {
  className: '_GlobalConfig',
  fields: defaultColumns._GlobalConfig
};
const _GraphQLConfigSchema = {
  className: '_GraphQLConfig',
  fields: defaultColumns._GraphQLConfig
};
const _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_PushStatus',
  fields: {},
  classLevelPermissions: {}
}));
const _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobStatus',
  fields: {},
  classLevelPermissions: {}
}));
const _JobScheduleSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobSchedule',
  fields: {},
  classLevelPermissions: {}
}));
const _AudienceSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Audience',
  fields: defaultColumns._Audience,
  classLevelPermissions: {}
}));
const _IdempotencySchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Idempotency',
  fields: defaultColumns._Idempotency,
  classLevelPermissions: {}
}));
const VolatileClassesSchemas = exports.VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
const dbTypeMatchesObjectType = (dbType, objectType) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};
const typeToString = type => {
  if (typeof type === 'string') {
    return type;
  }
  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }
  return `${type.type}`;
};
const ttl = {
  date: Date.now(),
  duration: undefined
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    const config = _Config.default.get(Parse.applicationId);
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = config.protectedFields;
    const customIds = config.allowCustomObjectId;
    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
  }
  async reloadDataIfNeeded() {
    if (this._dbAdapter.enableSchemaHooks) {
      return;
    }
    const {
      date,
      duration
    } = ttl || {};
    if (!duration) {
      return;
    }
    const now = Date.now();
    if (now - date > duration) {
      ttl.date = now;
      await this.reloadData({
        clearCache: true
      });
    }
  }
  reloadData(options = {
    clearCache: false
  }) {
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }
    this.reloadDataPromise = this.getAllClasses(options).then(allSchemas => {
      this.schemaData = new SchemaData(allSchemas, this.protectedFields);
      delete this.reloadDataPromise;
    }, err => {
      this.schemaData = new SchemaData();
      delete this.reloadDataPromise;
      throw err;
    }).then(() => {});
    return this.reloadDataPromise;
  }
  async getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }
    await this.reloadDataIfNeeded();
    const cached = _SchemaCache.default.all();
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses();
  }
  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      _SchemaCache.default.put(allSchemas);
      return allSchemas;
    });
  }
  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      _SchemaCache.default.clear();
    }
    if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
      const data = this.schemaData[className];
      return Promise.resolve({
        className,
        fields: data.fields,
        classLevelPermissions: data.classLevelPermissions,
        indexes: data.indexes
      });
    }
    const cached = _SchemaCache.default.get(className);
    if (cached && !options.clearCache) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses().then(allSchemas => {
      const oneSchema = allSchemas.find(schema => schema.className === className);
      if (!oneSchema) {
        return Promise.reject(undefined);
      }
      return oneSchema;
    });
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  async addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }
      return Promise.reject(validationError);
    }
    try {
      const adapterSchema = await this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
        fields,
        classLevelPermissions,
        indexes,
        className
      }));
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
      const parseSchema = convertAdapterSchemaToParseSchema(adapterSchema);
      return parseSchema;
    } catch (error) {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    }
  }
  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];
        if (existingFields[name] && existingFields[name].type !== field.type && field.__op !== 'Delete') {
          throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
        }
        if (!existingFields[name] && field.__op === 'Delete') {
          throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
        }
      });
      delete existingFields._rperm;
      delete existingFields._wperm;
      const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
      const defaultFields = defaultColumns[className] || defaultColumns._Default;
      const fullNewSchema = Object.assign({}, newSchema, defaultFields);
      const validationError = this.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));
      if (validationError) {
        throw new Parse.Error(validationError.code, validationError.error);
      }

      // Finally we have checked to make sure the request is valid and we can start deleting fields.
      // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
      const deletedFields = [];
      const insertedFields = [];
      Object.keys(submittedFields).forEach(fieldName => {
        if (submittedFields[fieldName].__op === 'Delete') {
          deletedFields.push(fieldName);
        } else {
          insertedFields.push(fieldName);
        }
      });
      let deletePromise = Promise.resolve();
      if (deletedFields.length > 0) {
        deletePromise = this.deleteFields(deletedFields, className, database);
      }
      let enforceFields = [];
      return deletePromise // Delete Everything
      .then(() => this.reloadData({
        clearCache: true
      })) // Reload our Schema, so we have all the new values
      .then(() => {
        const promises = insertedFields.map(fieldName => {
          const type = submittedFields[fieldName];
          return this.enforceFieldExists(className, fieldName, type);
        });
        return Promise.all(promises);
      }).then(results => {
        enforceFields = results.filter(result => !!result);
        return this.setPermissions(className, classLevelPermissions, newSchema);
      }).then(() => this._dbAdapter.setIndexesWithSchemaFormat(className, indexes, schema.indexes, fullNewSchema)).then(() => this.reloadData({
        clearCache: true
      }))
      //TODO: Move this logic into the database adapter
      .then(() => {
        this.ensureFields(enforceFields);
        const schema = this.schemaData[className];
        const reloadedSchema = {
          className: className,
          fields: schema.fields,
          classLevelPermissions: schema.classLevelPermissions
        };
        if (schema.indexes && Object.keys(schema.indexes).length !== 0) {
          reloadedSchema.indexes = schema.indexes;
        }
        return reloadedSchema;
      });
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    });
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return (
      // The schema update succeeded. Reload the schema
      this.addClassIfNotExists(className).catch(() => {
        // The schema update failed. This can be okay - it might
        // have failed because there's a race condition and a different
        // client is making the exact same schema update that we want.
        // So just reload the schema.
        return this.reloadData({
          clearCache: true
        });
      }).then(() => {
        // Ensure that the schema now validates
        if (this.schemaData[className]) {
          return this;
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
        }
      }).catch(() => {
        // The schema still doesn't validate. Give up
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
      })
    );
  }
  validateNewClass(className, fields = {}, classLevelPermissions) {
    if (this.schemaData[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }
    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className)
      };
    }
    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }
  validateSchemaData(className, fields, classLevelPermissions, existingFieldNames) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
        if (!fieldNameIsValid(fieldName, className)) {
          return {
            code: Parse.Error.INVALID_KEY_NAME,
            error: 'invalid field name: ' + fieldName
          };
        }
        if (!fieldNameIsValidForClass(fieldName, className)) {
          return {
            code: 136,
            error: 'field ' + fieldName + ' cannot be added'
          };
        }
        const fieldType = fields[fieldName];
        const error = fieldTypeIsInvalid(fieldType);
        if (error) return {
          code: error.code,
          error: error.message
        };
        if (fieldType.defaultValue !== undefined) {
          let defaultValueType = getType(fieldType.defaultValue);
          if (typeof defaultValueType === 'string') {
            defaultValueType = {
              type: defaultValueType
            };
          } else if (typeof defaultValueType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'default value' option is not applicable for ${typeToString(fieldType)}`
            };
          }
          if (!dbTypeMatchesObjectType(fieldType, defaultValueType)) {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(fieldType)} but got ${typeToString(defaultValueType)}`
            };
          }
        } else if (fieldType.required) {
          if (typeof fieldType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'required' option is not applicable for ${typeToString(fieldType)}`
            };
          }
        }
      }
    }
    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }
    const geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');
    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.'
      };
    }
    validateCLP(classLevelPermissions, fields, this.userIdRegEx);
  }

  // Sets the Class-level permissions for a given className, which must exist.
  async setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms, newSchema, this.userIdRegEx);
    await this._dbAdapter.setClassLevelPermissions(className, perms);
    const cached = _SchemaCache.default.get(className);
    if (cached) {
      cached.classLevelPermissions = perms;
    }
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  enforceFieldExists(className, fieldName, type, isValidation, maintenance) {
    if (fieldName.indexOf('.') > 0) {
      // "<array>.<index>" for Nested Arrays
      // "<embedded document>.<field>" for Nested Objects
      // JSON Arrays are treated as Nested Objects
      const [x, y] = fieldName.split('.');
      fieldName = x;
      const isArrayIndex = Array.from(y).every(c => c >= '0' && c <= '9');
      if (isArrayIndex && !['sentPerUTCOffset', 'failedPerUTCOffset'].includes(fieldName)) {
        type = 'Array';
      } else {
        type = 'Object';
      }
    }
    let fieldNameToValidate = `${fieldName}`;
    if (maintenance && fieldNameToValidate.charAt(0) === '_') {
      fieldNameToValidate = fieldNameToValidate.substring(1);
    }
    if (!fieldNameIsValid(fieldNameToValidate, className)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }

    // If someone tries to create a new field with null/undefined as the value, return;
    if (!type) {
      return undefined;
    }
    const expectedType = this.getExpectedType(className, fieldName);
    if (typeof type === 'string') {
      type = {
        type
      };
    }
    if (type.defaultValue !== undefined) {
      let defaultValueType = getType(type.defaultValue);
      if (typeof defaultValueType === 'string') {
        defaultValueType = {
          type: defaultValueType
        };
      }
      if (!dbTypeMatchesObjectType(type, defaultValueType)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(type)} but got ${typeToString(defaultValueType)}`);
      }
    }
    if (expectedType) {
      if (!dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName}; expected ${typeToString(expectedType)} but got ${typeToString(type)}`);
      }
      // If type options do not change
      // we can safely return
      if (isValidation || JSON.stringify(expectedType) === JSON.stringify(type)) {
        return undefined;
      }
      // Field options are may be changed
      // ensure to have an update to date schema field
      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
    }
    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      }
      // The update failed. This can be okay - it might have been a race
      // condition where another client updated the schema in the same
      // way that we wanted to. So, just reload the schema
      return Promise.resolve();
    }).then(() => {
      return {
        className,
        fieldName,
        type
      };
    });
  }
  ensureFields(fields) {
    for (let i = 0; i < fields.length; i += 1) {
      const {
        className,
        fieldName
      } = fields[i];
      let {
        type
      } = fields[i];
      const expectedType = this.getExpectedType(className, fieldName);
      if (typeof type === 'string') {
        type = {
          type: type
        };
      }
      if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
      }
    }
  }

  // maintain compatibility
  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.
  deleteFields(fieldNames, className, database) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }
    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName, className)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      }
      //Don't allow deleting the default fields.
      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });
    return this.getOneSchema(className, false, {
      clearCache: true
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    }).then(schema => {
      fieldNames.forEach(fieldName => {
        if (!schema.fields[fieldName]) {
          throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
        }
      });
      const schemaFields = _objectSpread({}, schema.fields);
      return database.adapter.deleteFields(className, schema, fieldNames).then(() => {
        return Promise.all(fieldNames.map(fieldName => {
          const field = schemaFields[fieldName];
          if (field && field.type === 'Relation') {
            //For relations, drop the _Join table
            return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
          }
          return Promise.resolve();
        }));
      });
    }).then(() => {
      _SchemaCache.default.clear();
    });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  async validateObject(className, object, query, maintenance) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];
    for (const fieldName in object) {
      if (object[fieldName] && getType(object[fieldName]) === 'GeoPoint') {
        geocount++;
      }
      if (geocount > 1) {
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }
    }
    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      const expected = getType(object[fieldName]);
      if (!expected) {
        continue;
      }
      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }
      promises.push(schema.enforceFieldExists(className, fieldName, expected, true, maintenance));
    }
    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);
    if (enforceFields.length !== 0) {
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
    }
    this.ensureFields(enforceFields);
    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns.write[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }
    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        }
        // Not trying to do anything there
        return false;
      }
      return !object[column];
    });
    if (missingColumns.length > 0) {
      throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
    }
    return Promise.resolve(this);
  }
  testPermissionsForClassName(className, aclGroup, operation) {
    return SchemaController.testPermissions(this.getClassLevelPermissions(className), aclGroup, operation);
  }

  // Tests that the class level permission let pass the operation for a given aclGroup
  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    }

    // Process the readUserFields later
    if (Array.isArray(classPermissions[permissionField]) && classPermissions[permissionField].length > 0) {
      return Promise.resolve();
    }
    const pointerFields = classPermissions[operation].pointerFields;
    if (Array.isArray(pointerFields) && pointerFields.length > 0) {
      // any op except 'addField as part of create' is ok.
      if (operation !== 'addField' || action === 'update') {
        // We can allow adding field on update flow only.
        return Promise.resolve();
      }
    }
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }
  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }
    return this.reloadData().then(() => !!this.schemaData[className]);
  }
}

// Returns a promise for a new Schema.
exports.SchemaController = exports.default = SchemaController;
const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
  ttl.duration = dbAdapter.schemaCacheTtl;
  return schema.reloadData(options).then(() => schema);
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
exports.load = load;
function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {};
  // -disable-next
  const sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);
  for (const oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' && oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (const newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }
      newSchema[newField] = putRequest[newField];
    }
  }
  return newSchema;
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB
function getType(obj) {
  const type = typeof obj;
  switch (type) {
    case 'boolean':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }
      return getObjectType(obj);
    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
}

// This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.
function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'Array';
  }
  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          };
        }
        break;
      case 'Relation':
        if (obj.className) {
          return {
            type: 'Relation',
            targetClass: obj.className
          };
        }
        break;
      case 'File':
        if (obj.name) {
          return 'File';
        }
        break;
      case 'Date':
        if (obj.iso) {
          return 'Date';
        }
        break;
      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }
        break;
      case 'Bytes':
        if (obj.base64) {
          return 'Bytes';
        }
        break;
      case 'Polygon':
        if (obj.coordinates) {
          return 'Polygon';
        }
        break;
    }
    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid ' + obj.__type);
  }
  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }
  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';
      case 'Delete':
        return null;
      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';
      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        };
      case 'Batch':
        return getObjectType(obj.ops[0]);
      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'Object';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIl9vYmplY3REZXN0cnVjdHVyaW5nRW1wdHkiLCJfZXh0ZW5kcyIsImFzc2lnbiIsImJpbmQiLCJuIiwiaGFzT3duUHJvcGVydHkiLCJQYXJzZSIsImRlZmF1bHRDb2x1bW5zIiwiZXhwb3J0cyIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJzb3VyY2UiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJyZXF1aXJlZENvbHVtbnMiLCJyZWFkIiwid3JpdGUiLCJpbnZhbGlkQ29sdW1ucyIsInN5c3RlbUNsYXNzZXMiLCJ2b2xhdGlsZUNsYXNzZXMiLCJyb2xlUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXgiLCJwdWJsaWNSZWdleCIsImF1dGhlbnRpY2F0ZWRSZWdleCIsInJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCIsImNscFBvaW50ZXJSZWdleCIsInByb3RlY3RlZEZpZWxkc1JlZ2V4IiwiY2xwRmllbGRzUmVnZXgiLCJ2YWxpZGF0ZVBlcm1pc3Npb25LZXkiLCJrZXkiLCJ1c2VySWRSZWdFeHAiLCJtYXRjaGVzU29tZSIsInJlZ0V4IiwibWF0Y2giLCJ2YWxpZCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwidmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkiLCJDTFBWYWxpZEtleXMiLCJ2YWxpZGF0ZUNMUCIsInBlcm1zIiwiZmllbGRzIiwib3BlcmF0aW9uS2V5IiwiaW5kZXhPZiIsIm9wZXJhdGlvbiIsInZhbGlkYXRlQ0xQanNvbiIsImZpZWxkTmFtZSIsInZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24iLCJlbnRpdHkiLCJwcm90ZWN0ZWRGaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJmaWVsZCIsInByb3RvdHlwZSIsInBvaW50ZXJGaWVsZHMiLCJwb2ludGVyRmllbGQiLCJwZXJtaXQiLCJqb2luQ2xhc3NSZWdleCIsImNsYXNzQW5kRmllbGRSZWdleCIsImNsYXNzTmFtZUlzVmFsaWQiLCJ0ZXN0IiwiZmllbGROYW1lSXNWYWxpZCIsImluY2x1ZGVzIiwiZmllbGROYW1lSXNWYWxpZEZvckNsYXNzIiwiaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UiLCJpbnZhbGlkSnNvbkVycm9yIiwidmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzIiwiZmllbGRUeXBlSXNJbnZhbGlkIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwidW5kZWZpbmVkIiwiSU5DT1JSRUNUX1RZUEUiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwic2NoZW1hIiwiaW5qZWN0RGVmYXVsdFNjaGVtYSIsIl9ycGVybSIsIl93cGVybSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEiLCJfcmVmIiwiaW5kZXhlcyIsIlNjaGVtYURhdGEiLCJjb25zdHJ1Y3RvciIsImFsbFNjaGVtYXMiLCJfX2RhdGEiLCJfX3Byb3RlY3RlZEZpZWxkcyIsImdldCIsImRhdGEiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJkZWVwY29weSIsImNsYXNzUHJvdGVjdGVkRmllbGRzIiwidW5xIiwiU2V0IiwiZnJvbSIsImRlZmF1bHRTY2hlbWEiLCJfSG9va3NTY2hlbWEiLCJfR2xvYmFsQ29uZmlnU2NoZW1hIiwiX0dyYXBoUUxDb25maWdTY2hlbWEiLCJfUHVzaFN0YXR1c1NjaGVtYSIsIl9Kb2JTdGF0dXNTY2hlbWEiLCJfSm9iU2NoZWR1bGVTY2hlbWEiLCJfQXVkaWVuY2VTY2hlbWEiLCJfSWRlbXBvdGVuY3lTY2hlbWEiLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwiZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUiLCJkYlR5cGUiLCJvYmplY3RUeXBlIiwidHlwZVRvU3RyaW5nIiwidHRsIiwiZGF0ZSIsIkRhdGUiLCJub3ciLCJkdXJhdGlvbiIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJfZGJBZGFwdGVyIiwiQ29uZmlnIiwiYXBwbGljYXRpb25JZCIsInNjaGVtYURhdGEiLCJTY2hlbWFDYWNoZSIsImFsbCIsImN1c3RvbUlkcyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJjdXN0b21JZFJlZ0V4IiwiYXV0b0lkUmVnRXgiLCJ1c2VySWRSZWdFeCIsIndhdGNoIiwicmVsb2FkRGF0YSIsImNsZWFyQ2FjaGUiLCJyZWxvYWREYXRhSWZOZWVkZWQiLCJlbmFibGVTY2hlbWFIb29rcyIsIm9wdGlvbnMiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImNhY2hlZCIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwicHV0IiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJjbGVhciIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJlcnJvciIsImFkYXB0ZXJTY2hlbWEiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlQ2xhc3MiLCJzdWJtaXR0ZWRGaWVsZHMiLCJkYXRhYmFzZSIsImV4aXN0aW5nRmllbGRzIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwicmVzdWx0cyIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImNhdGNoIiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiZXhpc3RpbmdGaWVsZE5hbWVzIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpZWxkVHlwZSIsImRlZmF1bHRWYWx1ZSIsImRlZmF1bHRWYWx1ZVR5cGUiLCJnZXRUeXBlIiwicmVxdWlyZWQiLCJnZW9Qb2ludHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1ZhbGlkYXRpb24iLCJtYWludGVuYW5jZSIsIngiLCJ5Iiwic3BsaXQiLCJpc0FycmF5SW5kZXgiLCJldmVyeSIsImMiLCJmaWVsZE5hbWVUb1ZhbGlkYXRlIiwiY2hhckF0Iiwic3Vic3RyaW5nIiwiZXhwZWN0ZWRUeXBlIiwiZ2V0RXhwZWN0ZWRUeXBlIiwiSlNPTiIsInN0cmluZ2lmeSIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJkZWxldGVGaWVsZCIsImZpZWxkTmFtZXMiLCJzY2hlbWFGaWVsZHMiLCJhZGFwdGVyIiwiZGVsZXRlQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsIm9iamVjdCIsImdlb2NvdW50IiwiZXhwZWN0ZWQiLCJwcm9taXNlIiwidGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwidmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJjb2x1bW5zIiwibWlzc2luZ0NvbHVtbnMiLCJjb2x1bW4iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJhY2xHcm91cCIsInRlc3RQZXJtaXNzaW9ucyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUGVybWlzc2lvbnMiLCJzb21lIiwiYWNsIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiYWN0aW9uIiwiT0JKRUNUX05PVF9GT1VORCIsInBlcm1pc3Npb25GaWVsZCIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJoYXNDbGFzcyIsImxvYWQiLCJkYkFkYXB0ZXIiLCJzY2hlbWFDYWNoZVR0bCIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJvYmoiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHNjaGVtYSB2YWxpZGF0aW9uLCBwZXJzaXN0ZW5jZSwgYW5kIG1vZGlmaWNhdGlvbi5cbi8vXG4vLyBFYWNoIGluZGl2aWR1YWwgU2NoZW1hIG9iamVjdCBzaG91bGQgYmUgaW1tdXRhYmxlLiBUaGUgaGVscGVycyB0b1xuLy8gZG8gdGhpbmdzIHdpdGggdGhlIFNjaGVtYSBqdXN0IHJldHVybiBhIG5ldyBzY2hlbWEgd2hlbiB0aGUgc2NoZW1hXG4vLyBpcyBjaGFuZ2VkLlxuLy9cbi8vIFRoZSBjYW5vbmljYWwgcGxhY2UgdG8gc3RvcmUgdGhpcyBTY2hlbWEgaXMgaW4gdGhlIGRhdGFiYXNlIGl0c2VsZixcbi8vIGluIGEgX1NDSEVNQSBjb2xsZWN0aW9uLiBUaGlzIGlzIG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIGl0IGZvciBhblxuLy8gb3BlbiBzb3VyY2UgZnJhbWV3b3JrLCBidXQgaXQncyBiYWNrd2FyZCBjb21wYXRpYmxlLCBzbyB3ZSdyZVxuLy8ga2VlcGluZyBpdCB0aGlzIHdheSBmb3Igbm93LlxuLy9cbi8vIEluIEFQSS1oYW5kbGluZyBjb2RlLCB5b3Ugc2hvdWxkIG9ubHkgdXNlIHRoZSBTY2hlbWEgY2xhc3MgdmlhIHRoZVxuLy8gRGF0YWJhc2VDb250cm9sbGVyLiBUaGlzIHdpbGwgbGV0IHVzIHJlcGxhY2UgdGhlIHNjaGVtYSBsb2dpYyBmb3Jcbi8vIGRpZmZlcmVudCBkYXRhYmFzZXMuXG4vLyBUT0RPOiBoaWRlIGFsbCBzY2hlbWEgbG9naWMgaW5zaWRlIHRoZSBkYXRhYmFzZSBhZGFwdGVyLlxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbn0pO1xuXG4vLyBmaWVsZHMgcmVxdWlyZWQgZm9yIHJlYWQgb3Igd3JpdGUgb3BlcmF0aW9ucyBvbiB0aGVpciByZXNwZWN0aXZlIGNsYXNzZXMuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgcmVhZDoge1xuICAgIF9Vc2VyOiBbJ3VzZXJuYW1lJ10sXG4gIH0sXG4gIHdyaXRlOiB7XG4gICAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICAgIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG4gIH0sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuXSk7XG5cbmNvbnN0IHZvbGF0aWxlQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX0pvYlN0YXR1cycsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSG9va3MnLFxuICAnX0dsb2JhbENvbmZpZycsXG4gICdfR3JhcGhRTENvbmZpZycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuLy8gQW55dGhpbmcgdGhhdCBzdGFydCB3aXRoIHJvbGVcbmNvbnN0IHJvbGVSZWdleCA9IC9ecm9sZTouKi87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0cyB3aXRoIHVzZXJGaWVsZCAoYWxsb3dlZCBmb3IgcHJvdGVjdGVkIGZpZWxkcyBvbmx5KVxuY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4ID0gL151c2VyRmllbGQ6LiovO1xuLy8gKiBwZXJtaXNzaW9uXG5jb25zdCBwdWJsaWNSZWdleCA9IC9eXFwqJC87XG5cbmNvbnN0IGF1dGhlbnRpY2F0ZWRSZWdleCA9IC9eYXV0aGVudGljYXRlZCQvO1xuXG5jb25zdCByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXggPSAvXnJlcXVpcmVzQXV0aGVudGljYXRpb24kLztcblxuY29uc3QgY2xwUG9pbnRlclJlZ2V4ID0gL15wb2ludGVyRmllbGRzJC87XG5cbi8vIHJlZ2V4IGZvciB2YWxpZGF0aW5nIGVudGl0aWVzIGluIHByb3RlY3RlZEZpZWxkcyBvYmplY3RcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIGF1dGhlbnRpY2F0ZWRSZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbi8vIGNscCByZWdleFxuY29uc3QgY2xwRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgY2xwUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIGNscEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCBkZXBlbmRzIG9uIHN0YXJ0dXAgb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgcHJvdGVjdGVkRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIHJlZ2V4IGRlcGVuZHMgb24gbGF1bmNoIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IENMUFZhbGlkS2V5cyA9IE9iamVjdC5mcmVlemUoW1xuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcblxuLy8gdmFsaWRhdGlvbiBiZWZvcmUgc2V0dGluZyBjbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBvbiBjb2xsZWN0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUChwZXJtczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHM6IFNjaGVtYUZpZWxkcywgdXNlcklkUmVnRXhwOiBSZWdFeHApIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IG9wZXJhdGlvbktleSBpbiBwZXJtcykge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb25LZXkpID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9uS2V5fSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVyYXRpb24gPSBwZXJtc1tvcGVyYXRpb25LZXldO1xuICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuXG4gICAgLy8gdGhyb3dzIHdoZW4gcm9vdCBmaWVsZHMgYXJlIG9mIHdyb25nIHR5cGVcbiAgICB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uLCBvcGVyYXRpb25LZXkpO1xuXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICAvLyB2YWxpZGF0ZSBncm91cGVkIHBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAgIC8vIG11c3QgYmUgYW4gYXJyYXkgd2l0aCBmaWVsZCBuYW1lc1xuICAgICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2Ygb3BlcmF0aW9uKSB7XG4gICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lLCBmaWVsZHMsIG9wZXJhdGlvbktleSk7XG4gICAgICB9XG4gICAgICAvLyByZWFkVXNlckZpZWxkcyBhbmQgd3JpdGVyVXNlckZpZWxkcyBkbyBub3QgaGF2ZSBuZXNkdGVkIGZpZWxkc1xuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBwcm90ZWN0ZWQgZmllbGRzXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3Byb3RlY3RlZEZpZWxkcycpIHtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgICAgdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3Byb3RlY3RlZEZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBwcm90ZWN0ZWRGaWVsZHNbJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGZpZWxkIGlzIGluIGZvcm0gb2YgYXJyYXlcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAvLyBkbyBub3QgYWxsb293IHRvIHByb3RlY3QgZGVmYXVsdCBmaWVsZHNcbiAgICAgICAgICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGRdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYERlZmF1bHQgZmllbGQgJyR7ZmllbGR9JyBjYW4gbm90IGJlIHByb3RlY3RlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGZpZWxkIHNob3VsZCBleGlzdCBvbiBjb2xsZWN0aW9uXG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBmaWVsZCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmllbGQgJyR7ZmllbGR9JyBpbiBwcm90ZWN0ZWRGaWVsZHM6JHtlbnRpdHl9IGRvZXMgbm90IGV4aXN0YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgb3RoZXIgZmllbGRzXG4gICAgLy8gRW50aXR5IGNhbiBiZTpcbiAgICAvLyBcIipcIiAtIFB1YmxpYyxcbiAgICAvLyBcInJlcXVpcmVzQXV0aGVudGljYXRpb25cIiAtIGF1dGhlbnRpY2F0ZWQgdXNlcnMsXG4gICAgLy8gXCJvYmplY3RJZFwiIC0gX1VzZXIgaWQsXG4gICAgLy8gXCJyb2xlOnJvbGVuYW1lXCIsXG4gICAgLy8gXCJwb2ludGVyRmllbGRzXCIgLSBhcnJheSBvZiBmaWVsZCBuYW1lcyBjb250YWluaW5nIHBvaW50ZXJzIHRvIHVzZXJzXG4gICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgIHZhbGlkYXRlUGVybWlzc2lvbktleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgIC8vIGVudGl0eSBjYW4gYmUgZWl0aGVyOlxuICAgICAgLy8gXCJwb2ludGVyRmllbGRzXCI6IHN0cmluZ1tdXG4gICAgICBpZiAoZW50aXR5ID09PSAncG9pbnRlckZpZWxkcycpIHtcbiAgICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBwb2ludGVyRmllbGQgb2YgcG9pbnRlckZpZWxkcykge1xuICAgICAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihwb2ludGVyRmllbGQsIGZpZWxkcywgb3BlcmF0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3BvaW50ZXJGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgJHtvcGVyYXRpb25LZXl9WyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBlbnRpdHkga2V5XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBvciBbZW50aXR5XTogYm9vbGVhblxuICAgICAgY29uc3QgcGVybWl0ID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgIGlmIChwZXJtaXQgIT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgJyR7cGVybWl0fScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fToke2VudGl0eX06JHtwZXJtaXR9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uOiBhbnksIG9wZXJhdGlvbktleTogc3RyaW5nKSB7XG4gIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShvcGVyYXRpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIGFycmF5YFxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRpb24gPT09ICdvYmplY3QnICYmIG9wZXJhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgLy8gb2sgdG8gcHJvY2VlZFxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIG9iamVjdGBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkczogT2JqZWN0LCBvcGVyYXRpb246IHN0cmluZykge1xuICAvLyBVc2VzIGNvbGxlY3Rpb24gc2NoZW1hIHRvIGVuc3VyZSB0aGUgZmllbGQgaXMgb2YgdHlwZTpcbiAgLy8gLSBQb2ludGVyPF9Vc2VyPiAocG9pbnRlcnMpXG4gIC8vIC0gQXJyYXlcbiAgLy9cbiAgLy8gICAgSXQncyBub3QgcG9zc2libGUgdG8gZW5mb3JjZSB0eXBlIG9uIEFycmF5J3MgaXRlbXMgaW4gc2NoZW1hXG4gIC8vICBzbyB3ZSBhY2NlcHQgYW55IEFycmF5IGZpZWxkLCBhbmQgbGF0ZXIgd2hlbiBhcHBseWluZyBwZXJtaXNzaW9uc1xuICAvLyAgb25seSBpdGVtcyB0aGF0IGFyZSBwb2ludGVycyB0byBfVXNlciBhcmUgY29uc2lkZXJlZC5cbiAgaWYgKFxuICAgICEoXG4gICAgICBmaWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgKChmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJyAmJiBmaWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyA9PSAnX1VzZXInKSB8fFxuICAgICAgICBmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdBcnJheScpXG4gICAgKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7ZmllbGROYW1lfScgaXMgbm90IGEgdmFsaWQgY29sdW1uIGZvciBjbGFzcyBsZXZlbCBwb2ludGVyIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IGpvaW5DbGFzc1JlZ2V4ID0gL15fSm9pbjpbQS1aYS16MC05X10rOltBLVphLXowLTlfXSsvO1xuY29uc3QgY2xhc3NBbmRGaWVsZFJlZ2V4ID0gL15bQS1aYS16XVtBLVphLXowLTlfXSokLztcbmZ1bmN0aW9uIGNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgLy8gVmFsaWQgY2xhc3NlcyBtdXN0OlxuICByZXR1cm4gKFxuICAgIC8vIEJlIG9uZSBvZiBfVXNlciwgX0luc3RhbGxhdGlvbiwgX1JvbGUsIF9TZXNzaW9uIE9SXG4gICAgc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSB8fFxuICAgIC8vIEJlIGEgam9pbiB0YWJsZSBPUlxuICAgIGpvaW5DbGFzc1JlZ2V4LnRlc3QoY2xhc3NOYW1lKSB8fFxuICAgIC8vIEluY2x1ZGUgb25seSBhbHBoYS1udW1lcmljIGFuZCB1bmRlcnNjb3JlcywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4gICAgZmllbGROYW1lSXNWYWxpZChjbGFzc05hbWUsIGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4vLyBtdXN0IG5vdCBiZSBhIHJlc2VydmVkIGtleVxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKGNsYXNzTmFtZSAmJiBjbGFzc05hbWUgIT09ICdfSG9va3MnKSB7XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2NsYXNzTmFtZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNsYXNzQW5kRmllbGRSZWdleC50ZXN0KGZpZWxkTmFtZSkgJiYgIWludmFsaWRDb2x1bW5zLmluY2x1ZGVzKGZpZWxkTmFtZSk7XG59XG5cbi8vIENoZWNrcyB0aGF0IGl0J3Mgbm90IHRyeWluZyB0byBjbG9iYmVyIG9uZSBvZiB0aGUgZGVmYXVsdCBmaWVsZHMgb2YgdGhlIGNsYXNzLlxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICdJbnZhbGlkIGNsYXNzbmFtZTogJyArXG4gICAgY2xhc3NOYW1lICtcbiAgICAnLCBjbGFzc25hbWVzIGNhbiBvbmx5IGhhdmUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMgYW5kIF8sIGFuZCBtdXN0IHN0YXJ0IHdpdGggYW4gYWxwaGEgY2hhcmFjdGVyICdcbiAgKTtcbn1cblxuY29uc3QgaW52YWxpZEpzb25FcnJvciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbnZhbGlkIEpTT04nKTtcbmNvbnN0IHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyA9IFtcbiAgJ051bWJlcicsXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdEYXRlJyxcbiAgJ09iamVjdCcsXG4gICdBcnJheScsXG4gICdHZW9Qb2ludCcsXG4gICdGaWxlJyxcbiAgJ0J5dGVzJyxcbiAgJ1BvbHlnb24nLFxuXTtcbi8vIFJldHVybnMgYW4gZXJyb3Igc3VpdGFibGUgZm9yIHRocm93aW5nIGlmIHRoZSB0eXBlIGlzIGludmFsaWRcbmNvbnN0IGZpZWxkVHlwZUlzSW52YWxpZCA9ICh7IHR5cGUsIHRhcmdldENsYXNzIH0pID0+IHtcbiAgaWYgKFsnUG9pbnRlcicsICdSZWxhdGlvbiddLmluZGV4T2YodHlwZSkgPj0gMCkge1xuICAgIGlmICghdGFyZ2V0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgdHlwZSAke3R5cGV9IG5lZWRzIGEgY2xhc3MgbmFtZWApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRhcmdldENsYXNzICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gICAgfSBlbHNlIGlmICghY2xhc3NOYW1lSXNWYWxpZCh0YXJnZXRDbGFzcykpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSh0YXJnZXRDbGFzcykpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gIH1cbiAgaWYgKHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcy5pbmRleE9mKHR5cGUpIDwgMCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIGBpbnZhbGlkIGZpZWxkIHR5cGU6ICR7dHlwZX1gKTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSA9IChzY2hlbWE6IGFueSkgPT4ge1xuICBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSk7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLkFDTDtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLnBhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBzY2hlbWEuZmllbGRzLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLmF1dGhEYXRhOyAvL0F1dGggZGF0YSBpcyBpbXBsaWNpdFxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5pbmRleGVzO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNsYXNzIFNjaGVtYURhdGEge1xuICBfX2RhdGE6IGFueTtcbiAgX19wcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgY29uc3RydWN0b3IoYWxsU2NoZW1hcyA9IFtdLCBwcm90ZWN0ZWRGaWVsZHMgPSB7fSkge1xuICAgIHRoaXMuX19kYXRhID0ge307XG4gICAgdGhpcy5fX3Byb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcztcbiAgICBhbGxTY2hlbWFzLmZvckVhY2goc2NoZW1hID0+IHtcbiAgICAgIGlmICh2b2xhdGlsZUNsYXNzZXMuaW5jbHVkZXMoc2NoZW1hLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHNjaGVtYS5jbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSkuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBkZWVwY29weShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBJbmplY3QgdGhlIGluLW1lbW9yeSBjbGFzc2VzXG4gICAgdm9sYXRpbGVDbGFzc2VzLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBjbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgIHRoaXMuX19kYXRhW2NsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGluamVjdERlZmF1bHRTY2hlbWEgPSAoeyBjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBpbmRleGVzIH06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9JZGVtcG90ZW5jeVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19JZGVtcG90ZW5jeScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG4gIF9JZGVtcG90ZW5jeVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKGRiVHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcsIG9iamVjdFR5cGU6IFNjaGVtYUZpZWxkKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUudGFyZ2V0Q2xhc3MgIT09IG9iamVjdFR5cGUudGFyZ2V0Q2xhc3MpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59O1xuXG5jb25zdCB0eXBlVG9TdHJpbmcgPSAodHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cbiAgaWYgKHR5cGUudGFyZ2V0Q2xhc3MpIHtcbiAgICByZXR1cm4gYCR7dHlwZS50eXBlfTwke3R5cGUudGFyZ2V0Q2xhc3N9PmA7XG4gIH1cbiAgcmV0dXJuIGAke3R5cGUudHlwZX1gO1xufTtcbmNvbnN0IHR0bCA9IHtcbiAgZGF0ZTogRGF0ZS5ub3coKSxcbiAgZHVyYXRpb246IHVuZGVmaW5lZCxcbn07XG5cbi8vIFN0b3JlcyB0aGUgZW50aXJlIHNjaGVtYSBvZiB0aGUgYXBwIGluIGEgd2VpcmQgaHlicmlkIGZvcm1hdCBzb21ld2hlcmUgYmV0d2VlblxuLy8gdGhlIG1vbmdvIGZvcm1hdCBhbmQgdGhlIFBhcnNlIGZvcm1hdC4gU29vbiwgdGhpcyB3aWxsIGFsbCBiZSBQYXJzZSBmb3JtYXQuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY2hlbWFDb250cm9sbGVyIHtcbiAgX2RiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICByZWxvYWREYXRhUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIHVzZXJJZFJlZ0V4OiBSZWdFeHA7XG5cbiAgY29uc3RydWN0b3IoZGF0YWJhc2VBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcikge1xuICAgIHRoaXMuX2RiQWRhcHRlciA9IGRhdGFiYXNlQWRhcHRlcjtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKFNjaGVtYUNhY2hlLmFsbCgpLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgdGhpcy5wcm90ZWN0ZWRGaWVsZHMgPSBjb25maWcucHJvdGVjdGVkRmllbGRzO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQ7XG5cbiAgICBjb25zdCBjdXN0b21JZFJlZ0V4ID0gL14uezEsfSQvdTsgLy8gMSsgY2hhcnNcbiAgICBjb25zdCBhdXRvSWRSZWdFeCA9IC9eW2EtekEtWjAtOV17MSx9JC87XG5cbiAgICB0aGlzLnVzZXJJZFJlZ0V4ID0gY3VzdG9tSWRzID8gY3VzdG9tSWRSZWdFeCA6IGF1dG9JZFJlZ0V4O1xuXG4gICAgdGhpcy5fZGJBZGFwdGVyLndhdGNoKCgpID0+IHtcbiAgICAgIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyByZWxvYWREYXRhSWZOZWVkZWQoKSB7XG4gICAgaWYgKHRoaXMuX2RiQWRhcHRlci5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IGRhdGUsIGR1cmF0aW9uIH0gPSB0dGwgfHwge307XG4gICAgaWYgKCFkdXJhdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGlmIChub3cgLSBkYXRlID4gZHVyYXRpb24pIHtcbiAgICAgIHR0bC5kYXRlID0gbm93O1xuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgZ2V0QWxsQ2xhc3NlcyhvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhSWZOZWVkZWQoKTtcbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5hbGwoKTtcbiAgICBpZiAoY2FjaGVkICYmIGNhY2hlZC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLnB1dChhbGxTY2hlbWFzKTtcbiAgICAgICAgcmV0dXJuIGFsbFNjaGVtYXM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldE9uZVNjaGVtYShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhbGxvd1ZvbGF0aWxlQ2xhc3NlczogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hPiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gICAgaWYgKGFsbG93Vm9sYXRpbGVDbGFzc2VzICYmIHZvbGF0aWxlQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSkge1xuICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgaW5kZXhlczogZGF0YS5pbmRleGVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCkudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgIGNvbnN0IG9uZVNjaGVtYSA9IGFsbFNjaGVtYXMuZmluZChzY2hlbWEgPT4gc2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFzeW5jIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBhZGFwdGVyU2NoZW1hID0gYXdhaXQgdGhpcy5fZGJBZGFwdGVyLmNyZWF0ZUNsYXNzKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoe1xuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hKGFkYXB0ZXJTY2hlbWEpO1xuICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1cGRhdGVDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRGaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlclxuICApIHtcbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdGaWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRGaWVsZHNbbmFtZV07XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiZcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdLnR5cGUgIT09IGZpZWxkLnR5cGUgJiZcbiAgICAgICAgICAgIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl9ycGVybTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl93cGVybTtcbiAgICAgICAgY29uc3QgbmV3U2NoZW1hID0gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHMsIHN1Ym1pdHRlZEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRGaWVsZHMgPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhjbGFzc05hbWUsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbmV3U2NoZW1hKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0XG4gICAgICAgICAgLy8gaGF2ZSBmYWlsZWQgYmVjYXVzZSB0aGVyZSdzIGEgcmFjZSBjb25kaXRpb24gYW5kIGEgZGlmZmVyZW50XG4gICAgICAgICAgLy8gY2xpZW50IGlzIG1ha2luZyB0aGUgZXhhY3Qgc2FtZSBzY2hlbWEgdXBkYXRlIHRoYXQgd2Ugd2FudC5cbiAgICAgICAgICAvLyBTbyBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hLlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNjaGVtYSBub3cgdmFsaWRhdGVzXG4gICAgICAgICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYEZhaWxlZCB0byBhZGQgJHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgc3RpbGwgZG9lc24ndCB2YWxpZGF0ZS4gR2l2ZSB1cFxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdzY2hlbWEgY2xhc3MgbmFtZSBkb2VzIG5vdCByZXZhbGlkYXRlJyk7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55KTogYW55IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgfVxuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgIGVycm9yOiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIFtdKTtcbiAgfVxuXG4gIHZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICBleGlzdGluZ0ZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz5cbiAgKSB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZE5hbWVzLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgaWYgKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZShmaWVsZFR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAnZGVmYXVsdCB2YWx1ZScgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGZpZWxkVHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlLnJlcXVpcmVkKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ3JlcXVpcmVkJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSkge1xuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV07XG4gICAgfVxuXG4gICAgY29uc3QgZ2VvUG9pbnRzID0gT2JqZWN0LmtleXMoZmllbGRzKS5maWx0ZXIoXG4gICAgICBrZXkgPT4gZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gICAgaWYgKGdlb1BvaW50cy5sZW5ndGggPiAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgZXJyb3I6XG4gICAgICAgICAgJ2N1cnJlbnRseSwgb25seSBvbmUgR2VvUG9pbnQgZmllbGQgbWF5IGV4aXN0IGluIGFuIG9iamVjdC4gQWRkaW5nICcgK1xuICAgICAgICAgIGdlb1BvaW50c1sxXSArXG4gICAgICAgICAgJyB3aGVuICcgK1xuICAgICAgICAgIGdlb1BvaW50c1swXSArXG4gICAgICAgICAgJyBhbHJlYWR5IGV4aXN0cy4nLFxuICAgICAgfTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHMsIHRoaXMudXNlcklkUmVnRXgpO1xuICB9XG5cbiAgLy8gU2V0cyB0aGUgQ2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIGEgZ2l2ZW4gY2xhc3NOYW1lLCB3aGljaCBtdXN0IGV4aXN0LlxuICBhc3luYyBzZXRQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgcGVybXM6IGFueSwgbmV3U2NoZW1hOiBTY2hlbWFGaWVsZHMpIHtcbiAgICBpZiAodHlwZW9mIHBlcm1zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChwZXJtcywgbmV3U2NoZW1hLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgICBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgcGVybXMpO1xuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIGNhY2hlZC5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBwZXJtcztcbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3QgaWYgdGhlIHByb3ZpZGVkIGNsYXNzTmFtZS1maWVsZE5hbWUtdHlwZSB0dXBsZSBpcyB2YWxpZC5cbiAgLy8gVGhlIGNsYXNzTmFtZSBtdXN0IGFscmVhZHkgYmUgdmFsaWRhdGVkLlxuICAvLyBJZiAnZnJlZXplJyBpcyB0cnVlLCByZWZ1c2UgdG8gdXBkYXRlIHRoZSBzY2hlbWEgZm9yIHRoaXMgZmllbGQuXG4gIGVuZm9yY2VGaWVsZEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcgfCBTY2hlbWFGaWVsZCxcbiAgICBpc1ZhbGlkYXRpb24/OiBib29sZWFuLFxuICAgIG1haW50ZW5hbmNlPzogYm9vbGVhblxuICApIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIFwiPGFycmF5Pi48aW5kZXg+XCIgZm9yIE5lc3RlZCBBcnJheXNcbiAgICAgIC8vIFwiPGVtYmVkZGVkIGRvY3VtZW50Pi48ZmllbGQ+XCIgZm9yIE5lc3RlZCBPYmplY3RzXG4gICAgICAvLyBKU09OIEFycmF5cyBhcmUgdHJlYXRlZCBhcyBOZXN0ZWQgT2JqZWN0c1xuICAgICAgY29uc3QgW3gsIHldID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICBmaWVsZE5hbWUgPSB4O1xuICAgICAgY29uc3QgaXNBcnJheUluZGV4ID0gQXJyYXkuZnJvbSh5KS5ldmVyeShjID0+IGMgPj0gJzAnICYmIGMgPD0gJzknKTtcbiAgICAgIGlmIChpc0FycmF5SW5kZXggJiYgIVsnc2VudFBlclVUQ09mZnNldCcsICdmYWlsZWRQZXJVVENPZmZzZXQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgIHR5cGUgPSAnQXJyYXknO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgICAgfVxuICAgIH1cbiAgICBsZXQgZmllbGROYW1lVG9WYWxpZGF0ZSA9IGAke2ZpZWxkTmFtZX1gO1xuICAgIGlmIChtYWludGVuYW5jZSAmJiBmaWVsZE5hbWVUb1ZhbGlkYXRlLmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBmaWVsZE5hbWVUb1ZhbGlkYXRlID0gZmllbGROYW1lVG9WYWxpZGF0ZS5zdWJzdHJpbmcoMSk7XG4gICAgfVxuICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWVUb1ZhbGlkYXRlLCBjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSWYgdHlwZSBvcHRpb25zIGRvIG5vdCBjaGFuZ2VcbiAgICAgIC8vIHdlIGNhbiBzYWZlbHkgcmV0dXJuXG4gICAgICBpZiAoaXNWYWxpZGF0aW9uIHx8IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVHlwZSkgPT09IEpTT04uc3RyaW5naWZ5KHR5cGUpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvLyBGaWVsZCBvcHRpb25zIGFyZSBtYXkgYmUgY2hhbmdlZFxuICAgICAgLy8gZW5zdXJlIHRvIGhhdmUgYW4gdXBkYXRlIHRvIGRhdGUgc2NoZW1hIGZpZWxkXG4gICAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke2ZpZWxkTmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgIC8vRm9yIHJlbGF0aW9ucywgZHJvcCB0aGUgX0pvaW4gdGFibGVcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb2JqZWN0IHByb3ZpZGVkIGluIFJFU1QgZm9ybWF0LlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hIGlmIHRoaXMgb2JqZWN0IGlzXG4gIC8vIHZhbGlkLlxuICBhc3luYyB2YWxpZGF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnksIG1haW50ZW5hbmNlOiBib29sZWFuKSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmICghZXhwZWN0ZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnQUNMJykge1xuICAgICAgICAvLyBFdmVyeSBvYmplY3QgaGFzIEFDTCBpbXBsaWNpdGx5LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHByb21pc2VzLnB1c2goc2NoZW1hLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgZXhwZWN0ZWQsIHRydWUsIG1haW50ZW5hbmNlKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgY29uc3QgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG5cbiAgICBpZiAoZW5mb3JjZUZpZWxkcy5sZW5ndGggIT09IDApIHtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuXG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzY2hlbWEpO1xuICAgIHJldHVybiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMocHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyB0aGF0IGFsbCB0aGUgcHJvcGVydGllcyBhcmUgc2V0IGZvciB0aGUgb2JqZWN0XG4gIHZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXF1aXJlZENvbHVtbnMud3JpdGVbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNvbHVtbnMgfHwgY29sdW1ucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaXNzaW5nQ29sdW1ucyA9IGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgIGlmIChxdWVyeSAmJiBxdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAob2JqZWN0W2NvbHVtbl0gJiYgdHlwZW9mIG9iamVjdFtjb2x1bW5dID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBkZWxldGUgYSByZXF1aXJlZCBjb2x1bW5cbiAgICAgICAgICByZXR1cm4gb2JqZWN0W2NvbHVtbl0uX19vcCA9PSAnRGVsZXRlJztcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3QgdHJ5aW5nIHRvIGRvIGFueXRoaW5nIHRoZXJlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhb2JqZWN0W2NvbHVtbl07XG4gICAgfSk7XG5cbiAgICBpZiAobWlzc2luZ0NvbHVtbnMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBtaXNzaW5nQ29sdW1uc1swXSArICcgaXMgcmVxdWlyZWQuJyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gIH1cblxuICB0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gVGVzdHMgdGhhdCB0aGUgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbiBsZXQgcGFzcyB0aGUgb3BlcmF0aW9uIGZvciBhIGdpdmVuIGFjbEdyb3VwXG4gIHN0YXRpYyB0ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9uczogP2FueSwgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgaWYgKHBlcm1zWycqJ10pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBwZXJtaXNzaW9ucyBhZ2FpbnN0IHRoZSBhY2xHcm91cCBwcm92aWRlZCAoYXJyYXkgb2YgdXNlcklkL3JvbGVzKVxuICAgIGlmIChcbiAgICAgIGFjbEdyb3VwLnNvbWUoYWNsID0+IHtcbiAgICAgICAgcmV0dXJuIHBlcm1zW2FjbF0gPT09IHRydWU7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHN0YXRpYyB2YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgY2xhc3NQZXJtaXNzaW9uczogP2FueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgYWN0aW9uPzogc3RyaW5nXG4gICkge1xuICAgIGlmIChTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgLy8gSWYgb25seSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIC8vIG1ha2Ugc3VyZSB3ZSBoYXZlIGFuIGFjbEdyb3VwXG4gICAgaWYgKHBlcm1zWydyZXF1aXJlc0F1dGhlbnRpY2F0aW9uJ10pIHtcbiAgICAgIC8vIElmIGFjbEdyb3VwIGhhcyAqIChwdWJsaWMpXG4gICAgICBpZiAoIWFjbEdyb3VwIHx8IGFjbEdyb3VwLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoYWNsR3JvdXAuaW5kZXhPZignKicpID4gLTEgJiYgYWNsR3JvdXAubGVuZ3RoID09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gcmVxdWlyZXNBdXRoZW50aWNhdGlvbiBwYXNzZWQsIGp1c3QgbW92ZSBmb3J3YXJkXG4gICAgICAvLyBwcm9iYWJseSB3b3VsZCBiZSB3aXNlIGF0IHNvbWUgcG9pbnQgdG8gcmVuYW1lIHRvICdhdXRoZW50aWNhdGVkVXNlcidcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICAvLyBObyBtYXRjaGluZyBDTFAsIGxldCdzIGNoZWNrIHRoZSBQb2ludGVyIHBlcm1pc3Npb25zXG4gICAgLy8gQW5kIGhhbmRsZSB0aG9zZSBsYXRlclxuICAgIGNvbnN0IHBlcm1pc3Npb25GaWVsZCA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICAvLyBSZWplY3QgY3JlYXRlIHdoZW4gd3JpdGUgbG9ja2Rvd25cbiAgICBpZiAocGVybWlzc2lvbkZpZWxkID09ICd3cml0ZVVzZXJGaWVsZHMnICYmIG9wZXJhdGlvbiA9PSAnY3JlYXRlJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyB0aGUgcmVhZFVzZXJGaWVsZHMgbGF0ZXJcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkgJiZcbiAgICAgIGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXS5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpICYmIHBvaW50ZXJGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYW55IG9wIGV4Y2VwdCAnYWRkRmllbGQgYXMgcGFydCBvZiBjcmVhdGUnIGlzIG9rLlxuICAgICAgaWYgKG9wZXJhdGlvbiAhPT0gJ2FkZEZpZWxkJyB8fCBhY3Rpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgIC8vIFdlIGNhbiBhbGxvdyBhZGRpbmcgZmllbGQgb24gdXBkYXRlIGZsb3cgb25seS5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICApO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgdmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nLCBhY3Rpb24/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb24sXG4gICAgICBhY3Rpb25cbiAgICApO1xuICB9XG5cbiAgZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0gJiYgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZXhwZWN0ZWQgdHlwZSBmb3IgYSBjbGFzc05hbWUra2V5IGNvbWJpbmF0aW9uXG4gIC8vIG9yIHVuZGVmaW5lZCBpZiB0aGUgc2NoZW1hIGlzIG5vdCBzZXRcbiAgZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZyk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGV4cGVjdGVkVHlwZSA9PT0gJ21hcCcgPyAnT2JqZWN0JyA6IGV4cGVjdGVkVHlwZTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIENoZWNrcyBpZiBhIGdpdmVuIGNsYXNzIGlzIGluIHRoZSBzY2hlbWEuXG4gIGhhc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKCkudGhlbigoKSA9PiAhIXRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKTtcbiAgfVxufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBuZXcgU2NoZW1hLlxuY29uc3QgbG9hZCA9IChkYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBhbnkpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+ID0+IHtcbiAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYUNvbnRyb2xsZXIoZGJBZGFwdGVyKTtcbiAgdHRsLmR1cmF0aW9uID0gZGJBZGFwdGVyLnNjaGVtYUNhY2hlVHRsO1xuICByZXR1cm4gc2NoZW1hLnJlbG9hZERhdGEob3B0aW9ucykudGhlbigoKSA9PiBzY2hlbWEpO1xufTtcblxuLy8gQnVpbGRzIGEgbmV3IHNjaGVtYSAoaW4gc2NoZW1hIEFQSSByZXNwb25zZSBmb3JtYXQpIG91dCBvZiBhblxuLy8gZXhpc3RpbmcgbW9uZ28gc2NoZW1hICsgYSBzY2hlbWFzIEFQSSBwdXQgcmVxdWVzdC4gVGhpcyByZXNwb25zZVxuLy8gZG9lcyBub3QgaW5jbHVkZSB0aGUgZGVmYXVsdCBmaWVsZHMsIGFzIGl0IGlzIGludGVuZGVkIHRvIGJlIHBhc3NlZFxuLy8gdG8gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLiBObyB2YWxpZGF0aW9uIGlzIGRvbmUgaGVyZSwgaXRcbi8vIGlzIGRvbmUgaW4gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLlxuZnVuY3Rpb24gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHM6IFNjaGVtYUZpZWxkcywgcHV0UmVxdWVzdDogYW55KTogU2NoZW1hRmllbGRzIHtcbiAgY29uc3QgbmV3U2NoZW1hID0ge307XG4gIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICBjb25zdCBzeXNTY2hlbWFGaWVsZCA9XG4gICAgT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnMpLmluZGV4T2YoZXhpc3RpbmdGaWVsZHMuX2lkKSA9PT0gLTFcbiAgICAgID8gW11cbiAgICAgIDogT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnNbZXhpc3RpbmdGaWVsZHMuX2lkXSk7XG4gIGZvciAoY29uc3Qgb2xkRmllbGQgaW4gZXhpc3RpbmdGaWVsZHMpIHtcbiAgICBpZiAoXG4gICAgICBvbGRGaWVsZCAhPT0gJ19pZCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnQUNMJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICd1cGRhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ2NyZWF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnb2JqZWN0SWQnXG4gICAgKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG9sZEZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZElzRGVsZXRlZCA9IHB1dFJlcXVlc3Rbb2xkRmllbGRdICYmIHB1dFJlcXVlc3Rbb2xkRmllbGRdLl9fb3AgPT09ICdEZWxldGUnO1xuICAgICAgaWYgKCFmaWVsZElzRGVsZXRlZCkge1xuICAgICAgICBuZXdTY2hlbWFbb2xkRmllbGRdID0gZXhpc3RpbmdGaWVsZHNbb2xkRmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IG5ld0ZpZWxkIGluIHB1dFJlcXVlc3QpIHtcbiAgICBpZiAobmV3RmllbGQgIT09ICdvYmplY3RJZCcgJiYgcHV0UmVxdWVzdFtuZXdGaWVsZF0uX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2YobmV3RmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIG5ld1NjaGVtYVtuZXdGaWVsZF0gPSBwdXRSZXF1ZXN0W25ld0ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld1NjaGVtYTtcbn1cblxuLy8gR2l2ZW4gYSBzY2hlbWEgcHJvbWlzZSwgY29uc3RydWN0IGFub3RoZXIgc2NoZW1hIHByb21pc2UgdGhhdFxuLy8gdmFsaWRhdGVzIHRoaXMgZmllbGQgb25jZSB0aGUgc2NoZW1hIGxvYWRzLlxuZnVuY3Rpb24gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHNjaGVtYVByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSkge1xuICByZXR1cm4gc2NoZW1hUHJvbWlzZS50aGVuKHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9KTtcbn1cblxuLy8gR2V0cyB0aGUgdHlwZSBmcm9tIGEgUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdCwgd2hlcmUgJ3R5cGUnIGlzXG4vLyBleHRlbmRlZCBwYXN0IGphdmFzY3JpcHQgdHlwZXMgdG8gaW5jbHVkZSB0aGUgcmVzdCBvZiB0aGUgUGFyc2Vcbi8vIHR5cGUgc3lzdGVtLlxuLy8gVGhlIG91dHB1dCBzaG91bGQgYmUgYSB2YWxpZCBzY2hlbWEgdmFsdWUuXG4vLyBUT0RPOiBlbnN1cmUgdGhhdCB0aGlzIGlzIGNvbXBhdGlibGUgd2l0aCB0aGUgZm9ybWF0IHVzZWQgaW4gT3BlbiBEQlxuZnVuY3Rpb24gZ2V0VHlwZShvYmo6IGFueSk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBvYmo7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdCb29sZWFuJztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuICdTdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iaik7XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ2JhZCBvYmo6ICcgKyBvYmo7XG4gIH1cbn1cblxuLy8gVGhpcyBnZXRzIHRoZSB0eXBlIGZvciBub24tSlNPTiB0eXBlcyBsaWtlIHBvaW50ZXJzIGFuZCBmaWxlcywgYnV0XG4vLyBhbHNvIGdldHMgdGhlIGFwcHJvcHJpYXRlIHR5cGUgZm9yICQgb3BlcmF0b3JzLlxuLy8gUmV0dXJucyBudWxsIGlmIHRoZSB0eXBlIGlzIHVua25vd24uXG5mdW5jdGlvbiBnZXRPYmplY3RUeXBlKG9iaik6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuICdBcnJheSc7XG4gIH1cbiAgaWYgKG9iai5fX3R5cGUpIHtcbiAgICBzd2l0Y2ggKG9iai5fX3R5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICBpZiAob2JqLm5hbWUpIHtcbiAgICAgICAgICByZXR1cm4gJ0ZpbGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgIGlmIChvYmouaXNvKSB7XG4gICAgICAgICAgcmV0dXJuICdEYXRlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgaWYgKG9iai5sYXRpdHVkZSAhPSBudWxsICYmIG9iai5sb25naXR1ZGUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBpZiAob2JqLmJhc2U2NCkge1xuICAgICAgICAgIHJldHVybiAnQnl0ZXMnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgIGlmIChvYmouY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICByZXR1cm4gJ1BvbHlnb24nO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsICdUaGlzIGlzIG5vdCBhIHZhbGlkICcgKyBvYmouX190eXBlKTtcbiAgfVxuICBpZiAob2JqWyckbmUnXSkge1xuICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9ialsnJG5lJ10pO1xuICB9XG4gIGlmIChvYmouX19vcCkge1xuICAgIHN3aXRjaCAob2JqLl9fb3ApIHtcbiAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgY2FzZSAnQWRkJzpcbiAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICByZXR1cm4gJ0FycmF5JztcbiAgICAgIGNhc2UgJ0FkZFJlbGF0aW9uJzpcbiAgICAgIGNhc2UgJ1JlbW92ZVJlbGF0aW9uJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBvYmoub2JqZWN0c1swXS5jbGFzc05hbWUsXG4gICAgICAgIH07XG4gICAgICBjYXNlICdCYXRjaCc6XG4gICAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iai5vcHNbMF0pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgJ3VuZXhwZWN0ZWQgb3A6ICcgKyBvYmouX19vcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICdPYmplY3QnO1xufVxuXG5leHBvcnQge1xuICBsb2FkLFxuICBjbGFzc05hbWVJc1ZhbGlkLFxuICBmaWVsZE5hbWVJc1ZhbGlkLFxuICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSxcbiAgYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QsXG4gIHN5c3RlbUNsYXNzZXMsXG4gIGRlZmF1bHRDb2x1bW5zLFxuICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hLFxuICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICBTY2hlbWFDb250cm9sbGVyLFxuICByZXF1aXJlZENvbHVtbnMsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFrQkEsSUFBQUEsZUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsWUFBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsbUJBQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFJLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFLLFNBQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUFnQyxTQUFBRSx1QkFBQUksQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUFBLFNBQUFHLFFBQUFILENBQUEsRUFBQUksQ0FBQSxRQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsSUFBQSxDQUFBUCxDQUFBLE9BQUFNLE1BQUEsQ0FBQUUscUJBQUEsUUFBQUMsQ0FBQSxHQUFBSCxNQUFBLENBQUFFLHFCQUFBLENBQUFSLENBQUEsR0FBQUksQ0FBQSxLQUFBSyxDQUFBLEdBQUFBLENBQUEsQ0FBQUMsTUFBQSxXQUFBTixDQUFBLFdBQUFFLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVgsQ0FBQSxFQUFBSSxDQUFBLEVBQUFRLFVBQUEsT0FBQVAsQ0FBQSxDQUFBUSxJQUFBLENBQUFDLEtBQUEsQ0FBQVQsQ0FBQSxFQUFBSSxDQUFBLFlBQUFKLENBQUE7QUFBQSxTQUFBVSxj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