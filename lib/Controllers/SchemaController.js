"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.classNameIsValid = classNameIsValid;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.VolatileClassesSchemas = exports.convertSchemaToAdapterSchema = exports.defaultColumns = exports.systemClasses = exports.load = exports.SchemaController = exports.default = void 0;

var _lodash = _interopRequireDefault(require("lodash"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _Config = _interopRequireDefault(require("../Config"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

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
const Parse = require('parse/node').Parse; // -disable-next


const defaultColumns = Object.freeze({
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
exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
  _Role: ['name', 'ACL']
});
const invalidColumns = ['length'];
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency']); // Anything that start with role

const roleRegex = /^role:.*/; // Anything that starts with userField (allowed for protected fields only)

const protectedFieldsPointerRegex = /^userField:.*/; // * permission

const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/; // regex for validating entities in protectedFields object

const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]); // clp regex

const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);

function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;

  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  } // userId depends on startup options so it's dynamic


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
  } // userId regex depends on launch options so it's dynamic


  const valid = matchesSome || key.match(userIdRegExp) !== null;

  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']); // validation before setting class-level permissions on collection

function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }

  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }

    const operation = perms[operationKey]; // proceed with next operationKey
    // throws when root fields are of wrong type

    validateCLPjson(operation, operationKey);

    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      } // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey


      continue;
    } // validate protected fields


    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];

        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        } // if the field is in form of array


        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          } // field should exist on collection


          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      } // proceed with next operationKey


      continue;
    } // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users


    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp); // entity can be either:
      // "pointerFields": string[]

      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];

        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        } // proceed with next entity key


        continue;
      } // or [entity]: boolean


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
  return (// Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 || // Be a join table OR
    joinClassRegex.test(className) || // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
} // Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key


function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }

  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
} // Checks that it's not trying to clobber one of the default fields of the class.


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
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon']; // Returns an error suitable for throwing if the type is invalid

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
  let schema = _extends({}, _ref);

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
    }); // Inject the in-memory classes

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

const VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
exports.VolatileClassesSchemas = VolatileClassesSchemas;

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
}; // Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.


class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = _Config.default.get(Parse.applicationId).protectedFields;

    const customIds = _Config.default.get(Parse.applicationId).allowCustomObjectId;

    const customIdRegEx = /^.{1,}$/u; // 1+ chars

    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;

    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
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

  getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }

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
  } // Create a new class that includes the three default fields.
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
      })); // TODO: Remove by updating schema cache directly

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
      } // Finally we have checked to make sure the request is valid and we can start deleting fields.
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
      })) //TODO: Move this logic into the database adapter
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
  } // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.


  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    } // We don't have this class. Update the schema


    return (// The schema update succeeded. Reload the schema
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
  } // Sets the Class-level permissions for a given className, which must exist.


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
  } // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.


  enforceFieldExists(className, fieldName, type, isValidation) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }

    if (!fieldNameIsValid(fieldName, className)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    } // If someone tries to create a new field with null/undefined as the value, return;


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
      } // If type options do not change
      // we can safely return


      if (isValidation || _lodash.default.isEqual(expectedType, type)) {
        return undefined;
      } // Field options are may be changed
      // ensure to have an update to date schema field


      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
    }

    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      } // The update failed. This can be okay - it might have been a race
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
  } // maintain compatibility


  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  } // Delete fields, and remove that data from all objects. This is intended
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
      } //Don't allow deleting the default fields.


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
  } // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.


  async validateObject(className, object, query) {
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

      promises.push(schema.enforceFieldExists(className, fieldName, expected, true));
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
  } // Validates that all the properties are set for the object


  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns[className];

    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        } // Not trying to do anything there


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
  } // Tests that the class level permission let pass the operation for a given aclGroup


  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }

    const perms = classPermissions[operation];

    if (perms['*']) {
      return true;
    } // Check permissions against the aclGroup provided (array of userId/roles)


    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }

    return false;
  } // Validates an operation passes class-level-permissions set in the schema


  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }

    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }

    const perms = classPermissions[operation]; // If only for authenticated users
    // make sure we have an aclGroup

    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'


      return Promise.resolve();
    } // No matching CLP, let's check the Pointer permissions
    // And handle those later


    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields'; // Reject create when write lockdown

    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    } // Process the readUserFields later


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
  } // Validates an operation passes class-level-permissions set in the schema


  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }

  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  } // Returns the expected type for a className+key combination
  // or undefined if the schema is not set


  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }

    return undefined;
  } // Checks if a given class is in the schema.


  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }

    return this.reloadData().then(() => !!this.schemaData[className]);
  }

} // Returns a promise for a new Schema.


exports.SchemaController = exports.default = SchemaController;

const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
  return schema.reloadData(options).then(() => schema);
}; // Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.


exports.load = load;

function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {}; // -disable-next

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
} // Given a schema promise, construct another schema promise that
// validates this field once the schema loads.


function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
} // Gets the type from a REST API formatted object, where 'type' is
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
} // This gets the type for non-JSON types like pointers and files, but
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsImRlZmF1bHRDb2x1bW5zIiwiT2JqZWN0IiwiZnJlZXplIiwiX0RlZmF1bHQiLCJvYmplY3RJZCIsInR5cGUiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiLCJfVXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJlbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJhdXRoRGF0YSIsIl9JbnN0YWxsYXRpb24iLCJpbnN0YWxsYXRpb25JZCIsImRldmljZVRva2VuIiwiY2hhbm5lbHMiLCJkZXZpY2VUeXBlIiwicHVzaFR5cGUiLCJHQ01TZW5kZXJJZCIsInRpbWVab25lIiwibG9jYWxlSWRlbnRpZmllciIsImJhZGdlIiwiYXBwVmVyc2lvbiIsImFwcE5hbWUiLCJhcHBJZGVudGlmaWVyIiwicGFyc2VWZXJzaW9uIiwiX1JvbGUiLCJuYW1lIiwidXNlcnMiLCJ0YXJnZXRDbGFzcyIsInJvbGVzIiwiX1Nlc3Npb24iLCJ1c2VyIiwic2Vzc2lvblRva2VuIiwiZXhwaXJlc0F0IiwiY3JlYXRlZFdpdGgiLCJfUHJvZHVjdCIsInByb2R1Y3RJZGVudGlmaWVyIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJpY29uIiwib3JkZXIiLCJ0aXRsZSIsInN1YnRpdGxlIiwiX1B1c2hTdGF0dXMiLCJwdXNoVGltZSIsInNvdXJjZSIsInF1ZXJ5IiwicGF5bG9hZCIsImV4cGlyeSIsImV4cGlyYXRpb25faW50ZXJ2YWwiLCJzdGF0dXMiLCJudW1TZW50IiwibnVtRmFpbGVkIiwicHVzaEhhc2giLCJlcnJvck1lc3NhZ2UiLCJzZW50UGVyVHlwZSIsImZhaWxlZFBlclR5cGUiLCJzZW50UGVyVVRDT2Zmc2V0IiwiZmFpbGVkUGVyVVRDT2Zmc2V0IiwiY291bnQiLCJfSm9iU3RhdHVzIiwiam9iTmFtZSIsIm1lc3NhZ2UiLCJwYXJhbXMiLCJmaW5pc2hlZEF0IiwiX0pvYlNjaGVkdWxlIiwiZGVzY3JpcHRpb24iLCJzdGFydEFmdGVyIiwiZGF5c09mV2VlayIsInRpbWVPZkRheSIsImxhc3RSdW4iLCJyZXBlYXRNaW51dGVzIiwiX0hvb2tzIiwiZnVuY3Rpb25OYW1lIiwiY2xhc3NOYW1lIiwidHJpZ2dlck5hbWUiLCJ1cmwiLCJfR2xvYmFsQ29uZmlnIiwibWFzdGVyS2V5T25seSIsIl9HcmFwaFFMQ29uZmlnIiwiY29uZmlnIiwiX0F1ZGllbmNlIiwibGFzdFVzZWQiLCJ0aW1lc1VzZWQiLCJfSWRlbXBvdGVuY3kiLCJyZXFJZCIsImV4cGlyZSIsInJlcXVpcmVkQ29sdW1ucyIsImludmFsaWRDb2x1bW5zIiwic3lzdGVtQ2xhc3NlcyIsInZvbGF0aWxlQ2xhc3NlcyIsInJvbGVSZWdleCIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCIsInB1YmxpY1JlZ2V4IiwiYXV0aGVudGljYXRlZFJlZ2V4IiwicmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4IiwiY2xwUG9pbnRlclJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUmVnZXgiLCJjbHBGaWVsZHNSZWdleCIsInZhbGlkYXRlUGVybWlzc2lvbktleSIsImtleSIsInVzZXJJZFJlZ0V4cCIsIm1hdGNoZXNTb21lIiwicmVnRXgiLCJtYXRjaCIsInZhbGlkIiwiRXJyb3IiLCJJTlZBTElEX0pTT04iLCJ2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleSIsIkNMUFZhbGlkS2V5cyIsInZhbGlkYXRlQ0xQIiwicGVybXMiLCJmaWVsZHMiLCJvcGVyYXRpb25LZXkiLCJpbmRleE9mIiwib3BlcmF0aW9uIiwidmFsaWRhdGVDTFBqc29uIiwiZmllbGROYW1lIiwidmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbiIsImVudGl0eSIsInByb3RlY3RlZEZpZWxkcyIsIkFycmF5IiwiaXNBcnJheSIsImZpZWxkIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicG9pbnRlckZpZWxkcyIsInBvaW50ZXJGaWVsZCIsInBlcm1pdCIsImpvaW5DbGFzc1JlZ2V4IiwiY2xhc3NBbmRGaWVsZFJlZ2V4IiwiY2xhc3NOYW1lSXNWYWxpZCIsInRlc3QiLCJmaWVsZE5hbWVJc1ZhbGlkIiwiaW5jbHVkZXMiLCJmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MiLCJpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSIsImludmFsaWRKc29uRXJyb3IiLCJ2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMiLCJmaWVsZFR5cGVJc0ludmFsaWQiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJ1bmRlZmluZWQiLCJJTkNPUlJFQ1RfVFlQRSIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJzY2hlbWEiLCJpbmplY3REZWZhdWx0U2NoZW1hIiwiX3JwZXJtIiwiX3dwZXJtIiwiX2hhc2hlZF9wYXNzd29yZCIsImNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSIsImluZGV4ZXMiLCJrZXlzIiwibGVuZ3RoIiwiU2NoZW1hRGF0YSIsImNvbnN0cnVjdG9yIiwiYWxsU2NoZW1hcyIsIl9fZGF0YSIsIl9fcHJvdGVjdGVkRmllbGRzIiwiZm9yRWFjaCIsImRlZmluZVByb3BlcnR5IiwiZ2V0IiwiZGF0YSIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUHJvdGVjdGVkRmllbGRzIiwidW5xIiwiU2V0IiwiZnJvbSIsImRlZmF1bHRTY2hlbWEiLCJfSG9va3NTY2hlbWEiLCJfR2xvYmFsQ29uZmlnU2NoZW1hIiwiX0dyYXBoUUxDb25maWdTY2hlbWEiLCJfUHVzaFN0YXR1c1NjaGVtYSIsIl9Kb2JTdGF0dXNTY2hlbWEiLCJfSm9iU2NoZWR1bGVTY2hlbWEiLCJfQXVkaWVuY2VTY2hlbWEiLCJfSWRlbXBvdGVuY3lTY2hlbWEiLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwiZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUiLCJkYlR5cGUiLCJvYmplY3RUeXBlIiwidHlwZVRvU3RyaW5nIiwiU2NoZW1hQ29udHJvbGxlciIsImRhdGFiYXNlQWRhcHRlciIsIl9kYkFkYXB0ZXIiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJDb25maWciLCJhcHBsaWNhdGlvbklkIiwiY3VzdG9tSWRzIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsImN1c3RvbUlkUmVnRXgiLCJhdXRvSWRSZWdFeCIsInVzZXJJZFJlZ0V4Iiwid2F0Y2giLCJyZWxvYWREYXRhIiwiY2xlYXJDYWNoZSIsIm9wdGlvbnMiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImNhY2hlZCIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwicHV0IiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJjbGVhciIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJlcnJvciIsImFkYXB0ZXJTY2hlbWEiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlQ2xhc3MiLCJzdWJtaXR0ZWRGaWVsZHMiLCJkYXRhYmFzZSIsImV4aXN0aW5nRmllbGRzIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJhc3NpZ24iLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJwdXNoIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJmaWx0ZXIiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwic3BsaXQiLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJfIiwiaXNFcXVhbCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJpIiwiZGVsZXRlRmllbGQiLCJmaWVsZE5hbWVzIiwic2NoZW1hRmllbGRzIiwiYWRhcHRlciIsImRlbGV0ZUNsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJvYmplY3QiLCJnZW9jb3VudCIsImV4cGVjdGVkIiwicHJvbWlzZSIsInRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsInZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwiY29sdW1ucyIsIm1pc3NpbmdDb2x1bW5zIiwiY29sdW1uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwiYWNsR3JvdXAiLCJ0ZXN0UGVybWlzc2lvbnMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJjbGFzc1Blcm1pc3Npb25zIiwic29tZSIsImFjbCIsInZhbGlkYXRlUGVybWlzc2lvbiIsImFjdGlvbiIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwZXJtaXNzaW9uRmllbGQiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiaGFzQ2xhc3MiLCJsb2FkIiwiZGJBZGFwdGVyIiwicHV0UmVxdWVzdCIsInN5c1NjaGVtYUZpZWxkIiwiX2lkIiwib2xkRmllbGQiLCJmaWVsZElzRGVsZXRlZCIsIm5ld0ZpZWxkIiwic2NoZW1hUHJvbWlzZSIsIm9iaiIsImdldE9iamVjdFR5cGUiLCJfX3R5cGUiLCJpc28iLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImJhc2U2NCIsImNvb3JkaW5hdGVzIiwib2JqZWN0cyIsIm9wcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFtQkE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7OztBQXhCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQUQsQ0FBUCxDQUFzQkQsS0FBcEMsQyxDQUNBOzs7QUFnQkEsTUFBTUUsY0FBMEMsR0FBR0MsTUFBTSxDQUFDQyxNQUFQLENBQWM7QUFDL0Q7QUFDQUMsRUFBQUEsUUFBUSxFQUFFO0FBQ1JDLElBQUFBLFFBQVEsRUFBRTtBQUFFQyxNQUFBQSxJQUFJLEVBQUU7QUFBUixLQURGO0FBRVJDLElBQUFBLFNBQVMsRUFBRTtBQUFFRCxNQUFBQSxJQUFJLEVBQUU7QUFBUixLQUZIO0FBR1JFLElBQUFBLFNBQVMsRUFBRTtBQUFFRixNQUFBQSxJQUFJLEVBQUU7QUFBUixLQUhIO0FBSVJHLElBQUFBLEdBQUcsRUFBRTtBQUFFSCxNQUFBQSxJQUFJLEVBQUU7QUFBUjtBQUpHLEdBRnFEO0FBUS9EO0FBQ0FJLEVBQUFBLEtBQUssRUFBRTtBQUNMQyxJQUFBQSxRQUFRLEVBQUU7QUFBRUwsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FETDtBQUVMTSxJQUFBQSxRQUFRLEVBQUU7QUFBRU4sTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FGTDtBQUdMTyxJQUFBQSxLQUFLLEVBQUU7QUFBRVAsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FIRjtBQUlMUSxJQUFBQSxhQUFhLEVBQUU7QUFBRVIsTUFBQUEsSUFBSSxFQUFFO0FBQVIsS0FKVjtBQUtMUyxJQUFBQSxRQUFRLEVBQUU7QUFBRVQsTUFBQUEsSUFBSSxFQUFFO0FBQVI7QUFMTCxHQVR3RDtBQWdCL0Q7QUFDQVUsRUFBQUEs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QUw7QUFDRSxlQUFPLFFBQVA7O0FBQ0YsV0FBSyxRQUFMO0FBQ0UsZUFBTyxJQUFQOztBQUNGLFdBQUssS0FBTDtBQUNBLFdBQUssV0FBTDtBQUNBLFdBQUssUUFBTDtBQUNFLGVBQU8sT0FBUDs7QUFDRixXQUFLLGFBQUw7QUFDQSxXQUFLLGdCQUFMO0FBQ0UsZUFBTztBQUNMbk8sVUFBQUEsSUFBSSxFQUFFLFVBREQ7QUFFTDJCLFVBQUFBLFdBQVcsRUFBRXVSLEdBQUcsQ0FBQ1EsT0FBSixDQUFZLENBQVosRUFBZWpQO0FBRnZCLFNBQVA7O0FBSUYsV0FBSyxPQUFMO0FBQ0UsZUFBTzBPLGFBQWEsQ0FBQ0QsR0FBRyxDQUFDUyxHQUFKLENBQVEsQ0FBUixDQUFELENBQXBCOztBQUNGO0FBQ0UsY0FBTSxvQkFBb0JULEdBQUcsQ0FBQy9FLElBQTlCO0FBbEJKO0FBb0JEOztBQUNELFNBQU8sUUFBUDtBQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIFRoaXMgY2xhc3MgaGFuZGxlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGVyc2lzdGVuY2UsIGFuZCBtb2RpZmljYXRpb24uXG4vL1xuLy8gRWFjaCBpbmRpdmlkdWFsIFNjaGVtYSBvYmplY3Qgc2hvdWxkIGJlIGltbXV0YWJsZS4gVGhlIGhlbHBlcnMgdG9cbi8vIGRvIHRoaW5ncyB3aXRoIHRoZSBTY2hlbWEganVzdCByZXR1cm4gYSBuZXcgc2NoZW1hIHdoZW4gdGhlIHNjaGVtYVxuLy8gaXMgY2hhbmdlZC5cbi8vXG4vLyBUaGUgY2Fub25pY2FsIHBsYWNlIHRvIHN0b3JlIHRoaXMgU2NoZW1hIGlzIGluIHRoZSBkYXRhYmFzZSBpdHNlbGYsXG4vLyBpbiBhIF9TQ0hFTUEgY29sbGVjdGlvbi4gVGhpcyBpcyBub3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdCBmb3IgYW5cbi8vIG9wZW4gc291cmNlIGZyYW1ld29yaywgYnV0IGl0J3MgYmFja3dhcmQgY29tcGF0aWJsZSwgc28gd2UncmVcbi8vIGtlZXBpbmcgaXQgdGhpcyB3YXkgZm9yIG5vdy5cbi8vXG4vLyBJbiBBUEktaGFuZGxpbmcgY29kZSwgeW91IHNob3VsZCBvbmx5IHVzZSB0aGUgU2NoZW1hIGNsYXNzIHZpYSB0aGVcbi8vIERhdGFiYXNlQ29udHJvbGxlci4gVGhpcyB3aWxsIGxldCB1cyByZXBsYWNlIHRoZSBzY2hlbWEgbG9naWMgZm9yXG4vLyBkaWZmZXJlbnQgZGF0YWJhc2VzLlxuLy8gVE9ETzogaGlkZSBhbGwgc2NoZW1hIGxvZ2ljIGluc2lkZSB0aGUgZGF0YWJhc2UgYWRhcHRlci5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHR5cGUge1xuICBTY2hlbWEsXG4gIFNjaGVtYUZpZWxkcyxcbiAgQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBTY2hlbWFGaWVsZCxcbiAgTG9hZFNjaGVtYU9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCBkZWZhdWx0Q29sdW1uczogeyBbc3RyaW5nXTogU2NoZW1hRmllbGRzIH0gPSBPYmplY3QuZnJlZXplKHtcbiAgLy8gQ29udGFpbiB0aGUgZGVmYXVsdCBjb2x1bW5zIGZvciBldmVyeSBwYXJzZSBvYmplY3QgdHlwZSAoZXhjZXB0IF9Kb2luIGNvbGxlY3Rpb24pXG4gIF9EZWZhdWx0OiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjcmVhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdXBkYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIEFDTDogeyB0eXBlOiAnQUNMJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfVXNlciBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1VzZXI6IHtcbiAgICB1c2VybmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhc3N3b3JkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbFZlcmlmaWVkOiB7IHR5cGU6ICdCb29sZWFuJyB9LFxuICAgIGF1dGhEYXRhOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9JbnN0YWxsYXRpb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9JbnN0YWxsYXRpb246IHtcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRldmljZVRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2hhbm5lbHM6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIGRldmljZVR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwdXNoVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIEdDTVNlbmRlcklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdGltZVpvbmU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsb2NhbGVJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYmFkZ2U6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBhcHBWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJzZVZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1JvbGUgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Sb2xlOiB7XG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVzZXJzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgcm9sZXM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfUm9sZScgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1Nlc3Npb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9TZXNzaW9uOiB7XG4gICAgdXNlcjogeyB0eXBlOiAnUG9pbnRlcicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzZXNzaW9uVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmVzQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgY3JlYXRlZFdpdGg6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX1Byb2R1Y3Q6IHtcbiAgICBwcm9kdWN0SWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRvd25sb2FkOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIGRvd25sb2FkTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGljb246IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgb3JkZXI6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN1YnRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9QdXNoU3RhdHVzOiB7XG4gICAgcHVzaFRpbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gcmVzdCBvciB3ZWJ1aVxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHF1ZXJ5XG4gICAgcGF5bG9hZDogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBwYXlsb2FkLFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJ5OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgZXhwaXJhdGlvbl9pbnRlcnZhbDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG51bVNlbnQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBudW1GYWlsZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBwdXNoSGFzaDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVycm9yTWVzc2FnZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBjb3VudDogeyB0eXBlOiAnTnVtYmVyJyB9LCAvLyB0cmFja3MgIyBvZiBiYXRjaGVzIHF1ZXVlZCBhbmQgcGVuZGluZ1xuICB9LFxuICBfSm9iU3RhdHVzOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1lc3NhZ2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSwgLy8gcGFyYW1zIHJlY2VpdmVkIHdoZW4gY2FsbGluZyB0aGUgam9iXG4gICAgZmluaXNoZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0pvYlNjaGVkdWxlOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhcnRBZnRlcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRheXNPZldlZWs6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIHRpbWVPZkRheTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxhc3RSdW46IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICByZXBlYXRNaW51dGVzOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9Ib29rczoge1xuICAgIGZ1bmN0aW9uTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNsYXNzTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRyaWdnZXJOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXJsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9HbG9iYWxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIG1hc3RlcktleU9ubHk6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0dyYXBoUUxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNvbmZpZzogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfQXVkaWVuY2U6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvL3N0b3JpbmcgcXVlcnkgYXMgSlNPTiBzdHJpbmcgdG8gcHJldmVudCBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCIgZXJyb3JcbiAgICBsYXN0VXNlZDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB0aW1lc1VzZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0lkZW1wb3RlbmN5OiB7XG4gICAgcmVxSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmU6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgcmVxdWlyZWRDb2x1bW5zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIF9Qcm9kdWN0OiBbJ3Byb2R1Y3RJZGVudGlmaWVyJywgJ2ljb24nLCAnb3JkZXInLCAndGl0bGUnLCAnc3VidGl0bGUnXSxcbiAgX1JvbGU6IFsnbmFtZScsICdBQ0wnXSxcbn0pO1xuXG5jb25zdCBpbnZhbGlkQ29sdW1ucyA9IFsnbGVuZ3RoJ107XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5Jyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuXG4vLyB2YWxpZGF0aW9uIGJlZm9yZSBzZXR0aW5nIGNsYXNzLWxldmVsIHBlcm1pc3Npb25zIG9uIGNvbGxlY3Rpb25cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzLCB1c2VySWRSZWdFeHA6IFJlZ0V4cCkge1xuICBpZiAoIXBlcm1zKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qgb3BlcmF0aW9uS2V5IGluIHBlcm1zKSB7XG4gICAgaWYgKENMUFZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbktleSkgPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJHtvcGVyYXRpb25LZXl9IGlzIG5vdCBhIHZhbGlkIG9wZXJhdGlvbiBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9wZXJhdGlvbiA9IHBlcm1zW29wZXJhdGlvbktleV07XG4gICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG5cbiAgICAvLyB0aHJvd3Mgd2hlbiByb290IGZpZWxkcyBhcmUgb2Ygd3JvbmcgdHlwZVxuICAgIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb24sIG9wZXJhdGlvbktleSk7XG5cbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICAgIC8vIHZhbGlkYXRlIGdyb3VwZWQgcG9pbnRlciBwZXJtaXNzaW9uc1xuICAgICAgLy8gbXVzdCBiZSBhbiBhcnJheSB3aXRoIGZpZWxkIG5hbWVzXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBvcGVyYXRpb24pIHtcbiAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWUsIGZpZWxkcywgb3BlcmF0aW9uS2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIHJlYWRVc2VyRmllbGRzIGFuZCB3cml0ZXJVc2VyRmllbGRzIGRvIG5vdCBoYXZlIG5lc2R0ZWQgZmllbGRzXG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIHByb3RlY3RlZCBmaWVsZHNcbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncHJvdGVjdGVkRmllbGRzJykge1xuICAgICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgICB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cHJvdGVjdGVkRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIHByb3RlY3RlZEZpZWxkc1ske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgZmllbGQgaXMgaW4gZm9ybSBvZiBhcnJheVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgIC8vIGRvIG5vdCBhbGxvb3cgdG8gcHJvdGVjdCBkZWZhdWx0IGZpZWxkc1xuICAgICAgICAgIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZF0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRGVmYXVsdCBmaWVsZCAnJHtmaWVsZH0nIGNhbiBub3QgYmUgcHJvdGVjdGVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZmllbGQgc2hvdWxkIGV4aXN0IG9uIGNvbGxlY3Rpb25cbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGZpZWxkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBGaWVsZCAnJHtmaWVsZH0nIGluIHByb3RlY3RlZEZpZWxkczoke2VudGl0eX0gZG9lcyBub3QgZXhpc3RgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBvdGhlciBmaWVsZHNcbiAgICAvLyBFbnRpdHkgY2FuIGJlOlxuICAgIC8vIFwiKlwiIC0gUHVibGljLFxuICAgIC8vIFwicmVxdWlyZXNBdXRoZW50aWNhdGlvblwiIC0gYXV0aGVudGljYXRlZCB1c2VycyxcbiAgICAvLyBcIm9iamVjdElkXCIgLSBfVXNlciBpZCxcbiAgICAvLyBcInJvbGU6cm9sZW5hbWVcIixcbiAgICAvLyBcInBvaW50ZXJGaWVsZHNcIiAtIGFycmF5IG9mIGZpZWxkIG5hbWVzIGNvbnRhaW5pbmcgcG9pbnRlcnMgdG8gdXNlcnNcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgLy8gZW50aXR5IGNhbiBiZSBlaXRoZXI6XG4gICAgICAvLyBcInBvaW50ZXJGaWVsZHNcIjogc3RyaW5nW11cbiAgICAgIGlmIChlbnRpdHkgPT09ICdwb2ludGVyRmllbGRzJykge1xuICAgICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBvaW50ZXJGaWVsZCBvZiBwb2ludGVyRmllbGRzKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKHBvaW50ZXJGaWVsZCwgZmllbGRzLCBvcGVyYXRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cG9pbnRlckZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciAke29wZXJhdGlvbktleX1bJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IGVudGl0eSBrZXlcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIG9yIFtlbnRpdHldOiBib29sZWFuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9OiR7ZW50aXR5fToke3Blcm1pdH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSwgY2xhc3NOYW1lKVxuICApO1xufVxuXG4vLyBWYWxpZCBmaWVsZHMgbXVzdCBiZSBhbHBoYS1udW1lcmljLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbi8vIG11c3Qgbm90IGJlIGEgcmVzZXJ2ZWQga2V5XG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoY2xhc3NOYW1lICYmIGNsYXNzTmFtZSAhPT0gJ19Ib29rcycpIHtcbiAgICBpZiAoZmllbGROYW1lID09PSAnY2xhc3NOYW1lJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKSAmJiAhaW52YWxpZENvbHVtbnMuaW5jbHVkZXMoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7IGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIGluZGV4ZXMgfTogU2NoZW1hKSA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICBjbGFzc05hbWUsXG4gICAgZmllbGRzOiB7XG4gICAgICAuLi5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgIC4uLihkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IHt9KSxcbiAgICAgIC4uLmZpZWxkcyxcbiAgICB9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgfTtcbiAgaWYgKGluZGV4ZXMgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgZGVmYXVsdFNjaGVtYS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuICByZXR1cm4gZGVmYXVsdFNjaGVtYTtcbn07XG5cbmNvbnN0IF9Ib29rc1NjaGVtYSA9IHsgY2xhc3NOYW1lOiAnX0hvb2tzJywgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSG9va3MgfTtcbmNvbnN0IF9HbG9iYWxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HbG9iYWxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HbG9iYWxDb25maWcsXG59O1xuY29uc3QgX0dyYXBoUUxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HcmFwaFFMQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR3JhcGhRTENvbmZpZyxcbn07XG5jb25zdCBfUHVzaFN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19QdXNoU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU2NoZWR1bGVTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU2NoZWR1bGUnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfQXVkaWVuY2VTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfQXVkaWVuY2UnLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0F1ZGllbmNlLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0lkZW1wb3RlbmN5U2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0lkZW1wb3RlbmN5JyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbiAgX0lkZW1wb3RlbmN5U2NoZW1hLFxuXTtcblxuY29uc3QgZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUgPSAoZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZywgb2JqZWN0VHlwZTogU2NoZW1hRmllbGQpID0+IHtcbiAgaWYgKGRiVHlwZS50eXBlICE9PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZS50YXJnZXRDbGFzcyAhPT0gb2JqZWN0VHlwZS50YXJnZXRDbGFzcykgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICBpZiAoZGJUeXBlLnR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmNvbnN0IHR5cGVUb1N0cmluZyA9ICh0eXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuICBpZiAodHlwZS50YXJnZXRDbGFzcykge1xuICAgIHJldHVybiBgJHt0eXBlLnR5cGV9PCR7dHlwZS50YXJnZXRDbGFzc30+YDtcbiAgfVxuICByZXR1cm4gYCR7dHlwZS50eXBlfWA7XG59O1xuXG4vLyBTdG9yZXMgdGhlIGVudGlyZSBzY2hlbWEgb2YgdGhlIGFwcCBpbiBhIHdlaXJkIGh5YnJpZCBmb3JtYXQgc29tZXdoZXJlIGJldHdlZW5cbi8vIHRoZSBtb25nbyBmb3JtYXQgYW5kIHRoZSBQYXJzZSBmb3JtYXQuIFNvb24sIHRoaXMgd2lsbCBhbGwgYmUgUGFyc2UgZm9ybWF0LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2NoZW1hQ29udHJvbGxlciB7XG4gIF9kYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFEYXRhOiB7IFtzdHJpbmddOiBTY2hlbWEgfTtcbiAgcmVsb2FkRGF0YVByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIHByb3RlY3RlZEZpZWxkczogYW55O1xuICB1c2VySWRSZWdFeDogUmVnRXhwO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGFiYXNlQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIpIHtcbiAgICB0aGlzLl9kYkFkYXB0ZXIgPSBkYXRhYmFzZUFkYXB0ZXI7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoU2NoZW1hQ2FjaGUuYWxsKCksIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkucHJvdGVjdGVkRmllbGRzO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5hbGxvd0N1c3RvbU9iamVjdElkO1xuXG4gICAgY29uc3QgY3VzdG9tSWRSZWdFeCA9IC9eLnsxLH0kL3U7IC8vIDErIGNoYXJzXG4gICAgY29uc3QgYXV0b0lkUmVnRXggPSAvXlthLXpBLVowLTldezEsfSQvO1xuXG4gICAgdGhpcy51c2VySWRSZWdFeCA9IGN1c3RvbUlkcyA/IGN1c3RvbUlkUmVnRXggOiBhdXRvSWRSZWdFeDtcblxuICAgIHRoaXMuX2RiQWRhcHRlci53YXRjaCgoKSA9PiB7XG4gICAgICB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVsb2FkRGF0YShvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKHRoaXMucmVsb2FkRGF0YVByb21pc2UgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMucmVsb2FkRGF0YVByb21pc2UgPSB0aGlzLmdldEFsbENsYXNzZXMob3B0aW9ucylcbiAgICAgIC50aGVuKFxuICAgICAgICBhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShhbGxTY2hlbWFzLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgfVxuXG4gIGdldEFsbENsYXNzZXMob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmFsbCgpO1xuICAgIGlmIChjYWNoZWQgJiYgY2FjaGVkLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gIH1cblxuICBzZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4gYWxsU2NoZW1hcy5tYXAoaW5qZWN0RGVmYXVsdFNjaGVtYSkpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUucHV0KGFsbFNjaGVtYXMpO1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICBpZiAoYWxsb3dWb2xhdGlsZUNsYXNzZXMgJiYgdm9sYXRpbGVDbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSB7XG4gICAgICBjb25zdCBkYXRhID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBmaWVsZHM6IGRhdGEuZmllbGRzLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBpbmRleGVzOiBkYXRhLmluZGV4ZXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKS50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpO1xuICAgICAgaWYgKCFvbmVTY2hlbWEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb25lU2NoZW1hO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbmV3IGNsYXNzIHRoYXQgaW5jbHVkZXMgdGhlIHRocmVlIGRlZmF1bHQgZmllbGRzLlxuICAvLyBBQ0wgaXMgYW4gaW1wbGljaXQgY29sdW1uIHRoYXQgZG9lcyBub3QgZ2V0IGFuIGVudHJ5IGluIHRoZVxuICAvLyBfU0NIRU1BUyBkYXRhYmFzZS4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZVxuICAvLyBjcmVhdGVkIHNjaGVtYSwgaW4gbW9uZ28gZm9ybWF0LlxuICAvLyBvbiBzdWNjZXNzLCBhbmQgcmVqZWN0cyB3aXRoIGFuIGVycm9yIG9uIGZhaWwuIEVuc3VyZSB5b3VcbiAgLy8gaGF2ZSBhdXRob3JpemF0aW9uIChtYXN0ZXIga2V5LCBvciBjbGllbnQgY2xhc3MgY3JlYXRpb25cbiAgLy8gZW5hYmxlZCkgYmVmb3JlIGNhbGxpbmcgdGhpcyBmdW5jdGlvbi5cbiAgYXN5bmMgYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSA9IHt9XG4gICk6IFByb21pc2U8dm9pZCB8IFNjaGVtYT4ge1xuICAgIHZhciB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgaWYgKHZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZGF0aW9uRXJyb3IuY29kZSAmJiB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJTY2hlbWEgPSBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuY3JlYXRlQ2xhc3MoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSh7XG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEoYWRhcHRlclNjaGVtYSk7XG4gICAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUNsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEZpZWxkc1tuYW1lXTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJlxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0udHlwZSAhPT0gZmllbGQudHlwZSAmJlxuICAgICAgICAgICAgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZSdcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3JwZXJtO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3dwZXJtO1xuICAgICAgICBjb25zdCBuZXdTY2hlbWEgPSBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkcywgc3VibWl0dGVkRmllbGRzKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdEZpZWxkcyA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwgZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQ7XG4gICAgICAgIGNvbnN0IGZ1bGxOZXdTY2hlbWEgPSBPYmplY3QuYXNzaWduKHt9LCBuZXdTY2hlbWEsIGRlZmF1bHRGaWVsZHMpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgbmV3U2NoZW1hLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGlzdGluZ0ZpZWxkcylcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHkgd2UgaGF2ZSBjaGVja2VkIHRvIG1ha2Ugc3VyZSB0aGUgcmVxdWVzdCBpcyB2YWxpZCBhbmQgd2UgY2FuIHN0YXJ0IGRlbGV0aW5nIGZpZWxkcy5cbiAgICAgICAgLy8gRG8gYWxsIGRlbGV0aW9ucyBmaXJzdCwgdGhlbiBhIHNpbmdsZSBzYXZlIHRvIF9TQ0hFTUEgY29sbGVjdGlvbiB0byBoYW5kbGUgYWxsIGFkZGl0aW9ucy5cbiAgICAgICAgY29uc3QgZGVsZXRlZEZpZWxkczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3QgaW5zZXJ0ZWRGaWVsZHMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICBkZWxldGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5zZXJ0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGRlbGV0ZVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgaWYgKGRlbGV0ZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGRlbGV0ZVByb21pc2UgPSB0aGlzLmRlbGV0ZUZpZWxkcyhkZWxldGVkRmllbGRzLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgZW5mb3JjZUZpZWxkcyA9IFtdO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIGRlbGV0ZVByb21pc2UgLy8gRGVsZXRlIEV2ZXJ5dGhpbmdcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpIC8vIFJlbG9hZCBvdXIgU2NoZW1hLCBzbyB3ZSBoYXZlIGFsbCB0aGUgbmV3IHZhbHVlc1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGluc2VydGVkRmllbGRzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgICAgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBuZXdTY2hlbWEpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMuX2RiQWRhcHRlci5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBmdWxsTmV3U2NoZW1hXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgICAgICAvL1RPRE86IE1vdmUgdGhpcyBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuICAgICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgICAgICAgY29uc3QgcmVsb2FkZWRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlbG9hZGVkU2NoZW1hLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gcmVsb2FkZWRTY2hlbWE7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3Qgb3IgZmFpbHMgd2l0aCBhIHJlYXNvbi5cbiAgZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCBoYXZlIHRoaXMgY2xhc3MuIFVwZGF0ZSB0aGUgc2NoZW1hXG4gICAgcmV0dXJuIChcbiAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIHN1Y2NlZWRlZC4gUmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgIHRoaXMuYWRkQ2xhc3NJZk5vdEV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnkpOiBhbnkge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICB9XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgZXJyb3I6IGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSksXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgW10pO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBlcnJvcjogJ2ludmFsaWQgZmllbGQgbmFtZTogJyArIGZpZWxkTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiAxMzYsXG4gICAgICAgICAgICBlcnJvcjogJ2ZpZWxkICcgKyBmaWVsZE5hbWUgKyAnIGNhbm5vdCBiZSBhZGRlZCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSBmaWVsZFR5cGVJc0ludmFsaWQoZmllbGRUeXBlKTtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4geyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICBpZiAoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdkZWZhdWx0IHZhbHVlJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcywgdGhpcy51c2VySWRSZWdFeCk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIGFzeW5jIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEsIHRoaXMudXNlcklkUmVnRXgpO1xuICAgIGF3YWl0IHRoaXMuX2RiQWRhcHRlci5zZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lLCBwZXJtcyk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgY2FjaGVkLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHBlcm1zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkLFxuICAgIGlzVmFsaWRhdGlvbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICAvLyBzdWJkb2N1bWVudCBrZXkgKHgueSkgPT4gb2sgaWYgeCBpcyBvZiB0eXBlICdvYmplY3QnXG4gICAgICBmaWVsZE5hbWUgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVswXTtcbiAgICAgIHR5cGUgPSAnT2JqZWN0JztcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gKTtcbiAgICB9XG5cbiAgICAvLyBJZiBzb21lb25lIHRyaWVzIHRvIGNyZWF0ZSBhIG5ldyBmaWVsZCB3aXRoIG51bGwvdW5kZWZpbmVkIGFzIHRoZSB2YWx1ZSwgcmV0dXJuO1xuICAgIGlmICghdHlwZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgdHlwZSA9ICh7IHR5cGUgfTogU2NoZW1hRmllbGQpO1xuICAgIH1cblxuICAgIGlmICh0eXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUodHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKHR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgdHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHBlY3RlZFR5cGUpIHtcbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICBleHBlY3RlZFR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKHR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIElmIHR5cGUgb3B0aW9ucyBkbyBub3QgY2hhbmdlXG4gICAgICAvLyB3ZSBjYW4gc2FmZWx5IHJldHVyblxuICAgICAgaWYgKGlzVmFsaWRhdGlvbiB8fCBfLmlzRXF1YWwoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLy8gRmllbGQgb3B0aW9ucyBhcmUgbWF5IGJlIGNoYW5nZWRcbiAgICAgIC8vIGVuc3VyZSB0byBoYXZlIGFuIHVwZGF0ZSB0byBkYXRlIHNjaGVtYSBmaWVsZFxuICAgICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlci51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUpIHtcbiAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSB0aHJvdyBlcnJvcnMgd2hlbiBpdCBpcyBhcHByb3ByaWF0ZSB0byBkbyBzby5cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0IGhhdmUgYmVlbiBhIHJhY2VcbiAgICAgICAgLy8gY29uZGl0aW9uIHdoZXJlIGFub3RoZXIgY2xpZW50IHVwZGF0ZWQgdGhlIHNjaGVtYSBpbiB0aGUgc2FtZVxuICAgICAgICAvLyB3YXkgdGhhdCB3ZSB3YW50ZWQgdG8uIFNvLCBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICB0eXBlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICBlbnN1cmVGaWVsZHMoZmllbGRzOiBhbnkpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9ID0gZmllbGRzW2ldO1xuICAgICAgbGV0IHsgdHlwZSB9ID0gZmllbGRzW2ldO1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0geyB0eXBlOiB0eXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkVHlwZSB8fCAhZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgQ291bGQgbm90IGFkZCBmaWVsZCAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBtYWludGFpbiBjb21wYXRpYmlsaXR5XG4gIGRlbGV0ZUZpZWxkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIHJldHVybiB0aGlzLmRlbGV0ZUZpZWxkcyhbZmllbGROYW1lXSwgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gIH1cblxuICAvLyBEZWxldGUgZmllbGRzLCBhbmQgcmVtb3ZlIHRoYXQgZGF0YSBmcm9tIGFsbCBvYmplY3RzLiBUaGlzIGlzIGludGVuZGVkXG4gIC8vIHRvIHJlbW92ZSB1bnVzZWQgZmllbGRzLCBpZiBvdGhlciB3cml0ZXJzIGFyZSB3cml0aW5nIG9iamVjdHMgdGhhdCBpbmNsdWRlXG4gIC8vIHRoaXMgZmllbGQsIHRoZSBmaWVsZCBtYXkgcmVhcHBlYXIuIFJldHVybnMgYSBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aFxuICAvLyBubyBvYmplY3Qgb24gc3VjY2Vzcywgb3IgcmVqZWN0cyB3aXRoIHsgY29kZSwgZXJyb3IgfSBvbiBmYWlsdXJlLlxuICAvLyBQYXNzaW5nIHRoZSBkYXRhYmFzZSBhbmQgcHJlZml4IGlzIG5lY2Vzc2FyeSBpbiBvcmRlciB0byBkcm9wIHJlbGF0aW9uIGNvbGxlY3Rpb25zXG4gIC8vIGFuZCByZW1vdmUgZmllbGRzIGZyb20gb2JqZWN0cy4gSWRlYWxseSB0aGUgZGF0YWJhc2Ugd291bGQgYmVsb25nIHRvXG4gIC8vIGEgZGF0YWJhc2UgYWRhcHRlciBhbmQgdGhpcyBmdW5jdGlvbiB3b3VsZCBjbG9zZSBvdmVyIGl0IG9yIGFjY2VzcyBpdCB2aWEgbWVtYmVyLlxuICBkZWxldGVGaWVsZHMoZmllbGROYW1lczogQXJyYXk8c3RyaW5nPiwgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSk7XG4gICAgfVxuXG4gICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgaW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIC8vRG9uJ3QgYWxsb3cgZGVsZXRpbmcgdGhlIGRlZmF1bHQgZmllbGRzLlxuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsIGBmaWVsZCAke2ZpZWxkTmFtZX0gY2Fubm90IGJlIGNoYW5nZWRgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGZhbHNlLCB7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtmaWVsZE5hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hRmllbGRzID0geyAuLi5zY2hlbWEuZmllbGRzIH07XG4gICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUZpZWxkcyhjbGFzc05hbWUsIHNjaGVtYSwgZmllbGROYW1lcykudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWFGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgICAgICAvL0ZvciByZWxhdGlvbnMsIGRyb3AgdGhlIF9Kb2luIHRhYmxlXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9iamVjdCBwcm92aWRlZCBpbiBSRVNUIGZvcm1hdC5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYSBpZiB0aGlzIG9iamVjdCBpc1xuICAvLyB2YWxpZC5cbiAgYXN5bmMgdmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmICghZXhwZWN0ZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnQUNMJykge1xuICAgICAgICAvLyBFdmVyeSBvYmplY3QgaGFzIEFDTCBpbXBsaWNpdGx5LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHByb21pc2VzLnB1c2goc2NoZW1hLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgZXhwZWN0ZWQsIHRydWUpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25zdCBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcblxuICAgIGlmIChlbmZvcmNlRmllbGRzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG5cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhwcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIHRoYXQgYWxsIHRoZSBwcm9wZXJ0aWVzIGFyZSBzZXQgZm9yIHRoZSBvYmplY3RcbiAgdmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlcXVpcmVkQ29sdW1uc1tjbGFzc05hbWVdO1xuICAgIGlmICghY29sdW1ucyB8fCBjb2x1bW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbmdDb2x1bW5zID0gY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIG1pc3NpbmdDb2x1bW5zWzBdICsgJyBpcyByZXF1aXJlZC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zOiA/YW55LCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICBpZiAocGVybXNbJyonXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHBlcm1pc3Npb25zIGFnYWluc3QgdGhlIGFjbEdyb3VwIHByb3ZpZGVkIChhcnJheSBvZiB1c2VySWQvcm9sZXMpXG4gICAgaWYgKFxuICAgICAgYWNsR3JvdXAuc29tZShhY2wgPT4ge1xuICAgICAgICByZXR1cm4gcGVybXNbYWNsXSA9PT0gdHJ1ZTtcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgc3RhdGljIHZhbGlkYXRlUGVybWlzc2lvbihcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBhY3Rpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb2ludGVyRmllbGRzID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHM7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykgJiYgcG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhbnkgb3AgZXhjZXB0ICdhZGRGaWVsZCBhcyBwYXJ0IG9mIGNyZWF0ZScgaXMgb2suXG4gICAgICBpZiAob3BlcmF0aW9uICE9PSAnYWRkRmllbGQnIHx8IGFjdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgICAgLy8gV2UgY2FuIGFsbG93IGFkZGluZyBmaWVsZCBvbiB1cGRhdGUgZmxvdyBvbmx5LlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IGFueSk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIpO1xuICByZXR1cm4gc2NoZW1hLnJlbG9hZERhdGEob3B0aW9ucykudGhlbigoKSA9PiBzY2hlbWEpO1xufTtcblxuLy8gQnVpbGRzIGEgbmV3IHNjaGVtYSAoaW4gc2NoZW1hIEFQSSByZXNwb25zZSBmb3JtYXQpIG91dCBvZiBhblxuLy8gZXhpc3RpbmcgbW9uZ28gc2NoZW1hICsgYSBzY2hlbWFzIEFQSSBwdXQgcmVxdWVzdC4gVGhpcyByZXNwb25zZVxuLy8gZG9lcyBub3QgaW5jbHVkZSB0aGUgZGVmYXVsdCBmaWVsZHMsIGFzIGl0IGlzIGludGVuZGVkIHRvIGJlIHBhc3NlZFxuLy8gdG8gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLiBObyB2YWxpZGF0aW9uIGlzIGRvbmUgaGVyZSwgaXRcbi8vIGlzIGRvbmUgaW4gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lLlxuZnVuY3Rpb24gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHM6IFNjaGVtYUZpZWxkcywgcHV0UmVxdWVzdDogYW55KTogU2NoZW1hRmllbGRzIHtcbiAgY29uc3QgbmV3U2NoZW1hID0ge307XG4gIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICBjb25zdCBzeXNTY2hlbWFGaWVsZCA9XG4gICAgT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnMpLmluZGV4T2YoZXhpc3RpbmdGaWVsZHMuX2lkKSA9PT0gLTFcbiAgICAgID8gW11cbiAgICAgIDogT2JqZWN0LmtleXMoZGVmYXVsdENvbHVtbnNbZXhpc3RpbmdGaWVsZHMuX2lkXSk7XG4gIGZvciAoY29uc3Qgb2xkRmllbGQgaW4gZXhpc3RpbmdGaWVsZHMpIHtcbiAgICBpZiAoXG4gICAgICBvbGRGaWVsZCAhPT0gJ19pZCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnQUNMJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICd1cGRhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ2NyZWF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnb2JqZWN0SWQnXG4gICAgKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG9sZEZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWVsZElzRGVsZXRlZCA9IHB1dFJlcXVlc3Rbb2xkRmllbGRdICYmIHB1dFJlcXVlc3Rbb2xkRmllbGRdLl9fb3AgPT09ICdEZWxldGUnO1xuICAgICAgaWYgKCFmaWVsZElzRGVsZXRlZCkge1xuICAgICAgICBuZXdTY2hlbWFbb2xkRmllbGRdID0gZXhpc3RpbmdGaWVsZHNbb2xkRmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IG5ld0ZpZWxkIGluIHB1dFJlcXVlc3QpIHtcbiAgICBpZiAobmV3RmllbGQgIT09ICdvYmplY3RJZCcgJiYgcHV0UmVxdWVzdFtuZXdGaWVsZF0uX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2YobmV3RmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIG5ld1NjaGVtYVtuZXdGaWVsZF0gPSBwdXRSZXF1ZXN0W25ld0ZpZWxkXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld1NjaGVtYTtcbn1cblxuLy8gR2l2ZW4gYSBzY2hlbWEgcHJvbWlzZSwgY29uc3RydWN0IGFub3RoZXIgc2NoZW1hIHByb21pc2UgdGhhdFxuLy8gdmFsaWRhdGVzIHRoaXMgZmllbGQgb25jZSB0aGUgc2NoZW1hIGxvYWRzLlxuZnVuY3Rpb24gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHNjaGVtYVByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSkge1xuICByZXR1cm4gc2NoZW1hUHJvbWlzZS50aGVuKHNjaGVtYSA9PiB7XG4gICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9KTtcbn1cblxuLy8gR2V0cyB0aGUgdHlwZSBmcm9tIGEgUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdCwgd2hlcmUgJ3R5cGUnIGlzXG4vLyBleHRlbmRlZCBwYXN0IGphdmFzY3JpcHQgdHlwZXMgdG8gaW5jbHVkZSB0aGUgcmVzdCBvZiB0aGUgUGFyc2Vcbi8vIHR5cGUgc3lzdGVtLlxuLy8gVGhlIG91dHB1dCBzaG91bGQgYmUgYSB2YWxpZCBzY2hlbWEgdmFsdWUuXG4vLyBUT0RPOiBlbnN1cmUgdGhhdCB0aGlzIGlzIGNvbXBhdGlibGUgd2l0aCB0aGUgZm9ybWF0IHVzZWQgaW4gT3BlbiBEQlxuZnVuY3Rpb24gZ2V0VHlwZShvYmo6IGFueSk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgY29uc3QgdHlwZSA9IHR5cGVvZiBvYmo7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdCb29sZWFuJztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuICdTdHJpbmcnO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iaik7XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ2JhZCBvYmo6ICcgKyBvYmo7XG4gIH1cbn1cblxuLy8gVGhpcyBnZXRzIHRoZSB0eXBlIGZvciBub24tSlNPTiB0eXBlcyBsaWtlIHBvaW50ZXJzIGFuZCBmaWxlcywgYnV0XG4vLyBhbHNvIGdldHMgdGhlIGFwcHJvcHJpYXRlIHR5cGUgZm9yICQgb3BlcmF0b3JzLlxuLy8gUmV0dXJucyBudWxsIGlmIHRoZSB0eXBlIGlzIHVua25vd24uXG5mdW5jdGlvbiBnZXRPYmplY3RUeXBlKG9iaik6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuICdBcnJheSc7XG4gIH1cbiAgaWYgKG9iai5fX3R5cGUpIHtcbiAgICBzd2l0Y2ggKG9iai5fX3R5cGUpIHtcbiAgICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgICBpZiAob2JqLmNsYXNzTmFtZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICBpZiAob2JqLm5hbWUpIHtcbiAgICAgICAgICByZXR1cm4gJ0ZpbGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgIGlmIChvYmouaXNvKSB7XG4gICAgICAgICAgcmV0dXJuICdEYXRlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgICAgaWYgKG9iai5sYXRpdHVkZSAhPSBudWxsICYmIG9iai5sb25naXR1ZGUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiAnR2VvUG9pbnQnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgICBpZiAob2JqLmJhc2U2NCkge1xuICAgICAgICAgIHJldHVybiAnQnl0ZXMnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUG9seWdvbic6XG4gICAgICAgIGlmIChvYmouY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICByZXR1cm4gJ1BvbHlnb24nO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsICdUaGlzIGlzIG5vdCBhIHZhbGlkICcgKyBvYmouX190eXBlKTtcbiAgfVxuICBpZiAob2JqWyckbmUnXSkge1xuICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9ialsnJG5lJ10pO1xuICB9XG4gIGlmIChvYmouX19vcCkge1xuICAgIHN3aXRjaCAob2JqLl9fb3ApIHtcbiAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgY2FzZSAnQWRkJzpcbiAgICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgICByZXR1cm4gJ0FycmF5JztcbiAgICAgIGNhc2UgJ0FkZFJlbGF0aW9uJzpcbiAgICAgIGNhc2UgJ1JlbW92ZVJlbGF0aW9uJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIHRhcmdldENsYXNzOiBvYmoub2JqZWN0c1swXS5jbGFzc05hbWUsXG4gICAgICAgIH07XG4gICAgICBjYXNlICdCYXRjaCc6XG4gICAgICAgIHJldHVybiBnZXRPYmplY3RUeXBlKG9iai5vcHNbMF0pO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgJ3VuZXhwZWN0ZWQgb3A6ICcgKyBvYmouX19vcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICdPYmplY3QnO1xufVxuXG5leHBvcnQge1xuICBsb2FkLFxuICBjbGFzc05hbWVJc1ZhbGlkLFxuICBmaWVsZE5hbWVJc1ZhbGlkLFxuICBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSxcbiAgYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QsXG4gIHN5c3RlbUNsYXNzZXMsXG4gIGRlZmF1bHRDb2x1bW5zLFxuICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hLFxuICBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICBTY2hlbWFDb250cm9sbGVyLFxufTtcbiJdfQ==