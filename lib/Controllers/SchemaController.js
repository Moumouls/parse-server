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
const convertAdapterSchemaToParseSchema = ({
  ...schema
}) => {
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
    fields: {
      ...defaultColumns._Default,
      ...(defaultColumns[className] || {}),
      ...fields
    },
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
  if (dbType.type !== objectType.type) {
    return false;
  }
  if (dbType.targetClass !== objectType.targetClass) {
    return false;
  }
  if (dbType === objectType.type) {
    return true;
  }
  if (dbType.type === objectType.type) {
    return true;
  }
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
        if (error) {
          return {
            code: error.code,
            error: error.message
          };
        }
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
      const schemaFields = {
        ...schema.fields
      };
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5IiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImV4cG9ydHMiLCJPYmplY3QiLCJmcmVlemUiLCJfRGVmYXVsdCIsIm9iamVjdElkIiwidHlwZSIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIkFDTCIsIl9Vc2VyIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImVtYWlsIiwiZW1haWxWZXJpZmllZCIsImF1dGhEYXRhIiwiX0luc3RhbGxhdGlvbiIsImluc3RhbGxhdGlvbklkIiwiZGV2aWNlVG9rZW4iLCJjaGFubmVscyIsImRldmljZVR5cGUiLCJwdXNoVHlwZSIsIkdDTVNlbmRlcklkIiwidGltZVpvbmUiLCJsb2NhbGVJZGVudGlmaWVyIiwiYmFkZ2UiLCJhcHBWZXJzaW9uIiwiYXBwTmFtZSIsImFwcElkZW50aWZpZXIiLCJwYXJzZVZlcnNpb24iLCJfUm9sZSIsIm5hbWUiLCJ1c2VycyIsInRhcmdldENsYXNzIiwicm9sZXMiLCJfU2Vzc2lvbiIsInVzZXIiLCJzZXNzaW9uVG9rZW4iLCJleHBpcmVzQXQiLCJjcmVhdGVkV2l0aCIsIl9Qcm9kdWN0IiwicHJvZHVjdElkZW50aWZpZXIiLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsImljb24iLCJvcmRlciIsInRpdGxlIiwic3VidGl0bGUiLCJfUHVzaFN0YXR1cyIsInB1c2hUaW1lIiwic291cmNlIiwicXVlcnkiLCJwYXlsb2FkIiwiZXhwaXJ5IiwiZXhwaXJhdGlvbl9pbnRlcnZhbCIsInN0YXR1cyIsIm51bVNlbnQiLCJudW1GYWlsZWQiLCJwdXNoSGFzaCIsImVycm9yTWVzc2FnZSIsInNlbnRQZXJUeXBlIiwiZmFpbGVkUGVyVHlwZSIsInNlbnRQZXJVVENPZmZzZXQiLCJmYWlsZWRQZXJVVENPZmZzZXQiLCJjb3VudCIsIl9Kb2JTdGF0dXMiLCJqb2JOYW1lIiwibWVzc2FnZSIsInBhcmFtcyIsImZpbmlzaGVkQXQiLCJfSm9iU2NoZWR1bGUiLCJkZXNjcmlwdGlvbiIsInN0YXJ0QWZ0ZXIiLCJkYXlzT2ZXZWVrIiwidGltZU9mRGF5IiwibGFzdFJ1biIsInJlcGVhdE1pbnV0ZXMiLCJfSG9va3MiLCJmdW5jdGlvbk5hbWUiLCJjbGFzc05hbWUiLCJ0cmlnZ2VyTmFtZSIsInVybCIsIl9HbG9iYWxDb25maWciLCJtYXN0ZXJLZXlPbmx5IiwiX0dyYXBoUUxDb25maWciLCJjb25maWciLCJfQXVkaWVuY2UiLCJsYXN0VXNlZCIsInRpbWVzVXNlZCIsIl9JZGVtcG90ZW5jeSIsInJlcUlkIiwiZXhwaXJlIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5Iiwia2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInVuZGVmaW5lZCIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiaW5kZXhlcyIsImtleXMiLCJsZW5ndGgiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJmb3JFYWNoIiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsInR0bCIsImRhdGUiLCJEYXRlIiwibm93IiwiZHVyYXRpb24iLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiX2RiQWRhcHRlciIsIkNvbmZpZyIsImFwcGxpY2F0aW9uSWQiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJ3YXRjaCIsInJlbG9hZERhdGEiLCJjbGVhckNhY2hlIiwicmVsb2FkRGF0YUlmTmVlZGVkIiwiZW5hYmxlU2NoZW1hSG9va3MiLCJvcHRpb25zIiwicmVsb2FkRGF0YVByb21pc2UiLCJnZXRBbGxDbGFzc2VzIiwidGhlbiIsImVyciIsInNldEFsbENsYXNzZXMiLCJjYWNoZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsInB1dCIsImdldE9uZVNjaGVtYSIsImFsbG93Vm9sYXRpbGVDbGFzc2VzIiwiY2xlYXIiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiZXJyb3IiLCJhZGFwdGVyU2NoZW1hIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZUNsYXNzIiwic3VibWl0dGVkRmllbGRzIiwiZGF0YWJhc2UiLCJleGlzdGluZ0ZpZWxkcyIsIl9fb3AiLCJuZXdTY2hlbWEiLCJidWlsZE1lcmdlZFNjaGVtYU9iamVjdCIsImRlZmF1bHRGaWVsZHMiLCJmdWxsTmV3U2NoZW1hIiwiYXNzaWduIiwidmFsaWRhdGVTY2hlbWFEYXRhIiwiZGVsZXRlZEZpZWxkcyIsImluc2VydGVkRmllbGRzIiwicHVzaCIsImRlbGV0ZVByb21pc2UiLCJkZWxldGVGaWVsZHMiLCJlbmZvcmNlRmllbGRzIiwicHJvbWlzZXMiLCJlbmZvcmNlRmllbGRFeGlzdHMiLCJyZXN1bHRzIiwiZmlsdGVyIiwicmVzdWx0Iiwic2V0UGVybWlzc2lvbnMiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsImVuc3VyZUZpZWxkcyIsInJlbG9hZGVkU2NoZW1hIiwiY2F0Y2giLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJleGlzdGluZ0ZpZWxkTmFtZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmllbGRUeXBlIiwiZGVmYXVsdFZhbHVlIiwiZGVmYXVsdFZhbHVlVHlwZSIsImdldFR5cGUiLCJyZXF1aXJlZCIsImdlb1BvaW50cyIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImlzVmFsaWRhdGlvbiIsIm1haW50ZW5hbmNlIiwieCIsInkiLCJzcGxpdCIsImlzQXJyYXlJbmRleCIsImV2ZXJ5IiwiYyIsImZpZWxkTmFtZVRvVmFsaWRhdGUiLCJjaGFyQXQiLCJzdWJzdHJpbmciLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImkiLCJkZWxldGVGaWVsZCIsImZpZWxkTmFtZXMiLCJzY2hlbWFGaWVsZHMiLCJhZGFwdGVyIiwiZGVsZXRlQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsIm9iamVjdCIsImdlb2NvdW50IiwiZXhwZWN0ZWQiLCJwcm9taXNlIiwidGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwidmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJjb2x1bW5zIiwibWlzc2luZ0NvbHVtbnMiLCJjb2x1bW4iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJhY2xHcm91cCIsInRlc3RQZXJtaXNzaW9ucyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUGVybWlzc2lvbnMiLCJzb21lIiwiYWNsIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiYWN0aW9uIiwiT0JKRUNUX05PVF9GT1VORCIsInBlcm1pc3Npb25GaWVsZCIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJoYXNDbGFzcyIsImxvYWQiLCJkYkFkYXB0ZXIiLCJzY2hlbWFDYWNoZVR0bCIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJvYmoiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHNjaGVtYSB2YWxpZGF0aW9uLCBwZXJzaXN0ZW5jZSwgYW5kIG1vZGlmaWNhdGlvbi5cbi8vXG4vLyBFYWNoIGluZGl2aWR1YWwgU2NoZW1hIG9iamVjdCBzaG91bGQgYmUgaW1tdXRhYmxlLiBUaGUgaGVscGVycyB0b1xuLy8gZG8gdGhpbmdzIHdpdGggdGhlIFNjaGVtYSBqdXN0IHJldHVybiBhIG5ldyBzY2hlbWEgd2hlbiB0aGUgc2NoZW1hXG4vLyBpcyBjaGFuZ2VkLlxuLy9cbi8vIFRoZSBjYW5vbmljYWwgcGxhY2UgdG8gc3RvcmUgdGhpcyBTY2hlbWEgaXMgaW4gdGhlIGRhdGFiYXNlIGl0c2VsZixcbi8vIGluIGEgX1NDSEVNQSBjb2xsZWN0aW9uLiBUaGlzIGlzIG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIGl0IGZvciBhblxuLy8gb3BlbiBzb3VyY2UgZnJhbWV3b3JrLCBidXQgaXQncyBiYWNrd2FyZCBjb21wYXRpYmxlLCBzbyB3ZSdyZVxuLy8ga2VlcGluZyBpdCB0aGlzIHdheSBmb3Igbm93LlxuLy9cbi8vIEluIEFQSS1oYW5kbGluZyBjb2RlLCB5b3Ugc2hvdWxkIG9ubHkgdXNlIHRoZSBTY2hlbWEgY2xhc3MgdmlhIHRoZVxuLy8gRGF0YWJhc2VDb250cm9sbGVyLiBUaGlzIHdpbGwgbGV0IHVzIHJlcGxhY2UgdGhlIHNjaGVtYSBsb2dpYyBmb3Jcbi8vIGRpZmZlcmVudCBkYXRhYmFzZXMuXG4vLyBUT0RPOiBoaWRlIGFsbCBzY2hlbWEgbG9naWMgaW5zaWRlIHRoZSBkYXRhYmFzZSBhZGFwdGVyLlxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbn0pO1xuXG4vLyBmaWVsZHMgcmVxdWlyZWQgZm9yIHJlYWQgb3Igd3JpdGUgb3BlcmF0aW9ucyBvbiB0aGVpciByZXNwZWN0aXZlIGNsYXNzZXMuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgcmVhZDoge1xuICAgIF9Vc2VyOiBbJ3VzZXJuYW1lJ10sXG4gIH0sXG4gIHdyaXRlOiB7XG4gICAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICAgIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG4gIH0sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuXSk7XG5cbmNvbnN0IHZvbGF0aWxlQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX0pvYlN0YXR1cycsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSG9va3MnLFxuICAnX0dsb2JhbENvbmZpZycsXG4gICdfR3JhcGhRTENvbmZpZycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuLy8gQW55dGhpbmcgdGhhdCBzdGFydCB3aXRoIHJvbGVcbmNvbnN0IHJvbGVSZWdleCA9IC9ecm9sZTouKi87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0cyB3aXRoIHVzZXJGaWVsZCAoYWxsb3dlZCBmb3IgcHJvdGVjdGVkIGZpZWxkcyBvbmx5KVxuY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4ID0gL151c2VyRmllbGQ6LiovO1xuLy8gKiBwZXJtaXNzaW9uXG5jb25zdCBwdWJsaWNSZWdleCA9IC9eXFwqJC87XG5cbmNvbnN0IGF1dGhlbnRpY2F0ZWRSZWdleCA9IC9eYXV0aGVudGljYXRlZCQvO1xuXG5jb25zdCByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXggPSAvXnJlcXVpcmVzQXV0aGVudGljYXRpb24kLztcblxuY29uc3QgY2xwUG9pbnRlclJlZ2V4ID0gL15wb2ludGVyRmllbGRzJC87XG5cbi8vIHJlZ2V4IGZvciB2YWxpZGF0aW5nIGVudGl0aWVzIGluIHByb3RlY3RlZEZpZWxkcyBvYmplY3RcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIGF1dGhlbnRpY2F0ZWRSZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbi8vIGNscCByZWdleFxuY29uc3QgY2xwRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgY2xwUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIGNscEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCBkZXBlbmRzIG9uIHN0YXJ0dXAgb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgcHJvdGVjdGVkRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIHJlZ2V4IGRlcGVuZHMgb24gbGF1bmNoIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IENMUFZhbGlkS2V5cyA9IE9iamVjdC5mcmVlemUoW1xuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcblxuLy8gdmFsaWRhdGlvbiBiZWZvcmUgc2V0dGluZyBjbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBvbiBjb2xsZWN0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUChwZXJtczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHM6IFNjaGVtYUZpZWxkcywgdXNlcklkUmVnRXhwOiBSZWdFeHApIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IG9wZXJhdGlvbktleSBpbiBwZXJtcykge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb25LZXkpID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9uS2V5fSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVyYXRpb24gPSBwZXJtc1tvcGVyYXRpb25LZXldO1xuICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuXG4gICAgLy8gdGhyb3dzIHdoZW4gcm9vdCBmaWVsZHMgYXJlIG9mIHdyb25nIHR5cGVcbiAgICB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uLCBvcGVyYXRpb25LZXkpO1xuXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICAvLyB2YWxpZGF0ZSBncm91cGVkIHBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAgIC8vIG11c3QgYmUgYW4gYXJyYXkgd2l0aCBmaWVsZCBuYW1lc1xuICAgICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2Ygb3BlcmF0aW9uKSB7XG4gICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lLCBmaWVsZHMsIG9wZXJhdGlvbktleSk7XG4gICAgICB9XG4gICAgICAvLyByZWFkVXNlckZpZWxkcyBhbmQgd3JpdGVyVXNlckZpZWxkcyBkbyBub3QgaGF2ZSBuZXNkdGVkIGZpZWxkc1xuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBwcm90ZWN0ZWQgZmllbGRzXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3Byb3RlY3RlZEZpZWxkcycpIHtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgICAgdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3Byb3RlY3RlZEZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBwcm90ZWN0ZWRGaWVsZHNbJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGZpZWxkIGlzIGluIGZvcm0gb2YgYXJyYXlcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAvLyBkbyBub3QgYWxsb293IHRvIHByb3RlY3QgZGVmYXVsdCBmaWVsZHNcbiAgICAgICAgICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGRdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYERlZmF1bHQgZmllbGQgJyR7ZmllbGR9JyBjYW4gbm90IGJlIHByb3RlY3RlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGZpZWxkIHNob3VsZCBleGlzdCBvbiBjb2xsZWN0aW9uXG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBmaWVsZCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmllbGQgJyR7ZmllbGR9JyBpbiBwcm90ZWN0ZWRGaWVsZHM6JHtlbnRpdHl9IGRvZXMgbm90IGV4aXN0YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgb3RoZXIgZmllbGRzXG4gICAgLy8gRW50aXR5IGNhbiBiZTpcbiAgICAvLyBcIipcIiAtIFB1YmxpYyxcbiAgICAvLyBcInJlcXVpcmVzQXV0aGVudGljYXRpb25cIiAtIGF1dGhlbnRpY2F0ZWQgdXNlcnMsXG4gICAgLy8gXCJvYmplY3RJZFwiIC0gX1VzZXIgaWQsXG4gICAgLy8gXCJyb2xlOnJvbGVuYW1lXCIsXG4gICAgLy8gXCJwb2ludGVyRmllbGRzXCIgLSBhcnJheSBvZiBmaWVsZCBuYW1lcyBjb250YWluaW5nIHBvaW50ZXJzIHRvIHVzZXJzXG4gICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgIHZhbGlkYXRlUGVybWlzc2lvbktleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgIC8vIGVudGl0eSBjYW4gYmUgZWl0aGVyOlxuICAgICAgLy8gXCJwb2ludGVyRmllbGRzXCI6IHN0cmluZ1tdXG4gICAgICBpZiAoZW50aXR5ID09PSAncG9pbnRlckZpZWxkcycpIHtcbiAgICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBwb2ludGVyRmllbGQgb2YgcG9pbnRlckZpZWxkcykge1xuICAgICAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihwb2ludGVyRmllbGQsIGZpZWxkcywgb3BlcmF0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3BvaW50ZXJGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgJHtvcGVyYXRpb25LZXl9WyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBlbnRpdHkga2V5XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBvciBbZW50aXR5XTogYm9vbGVhblxuICAgICAgY29uc3QgcGVybWl0ID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgIGlmIChwZXJtaXQgIT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgJyR7cGVybWl0fScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fToke2VudGl0eX06JHtwZXJtaXR9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uOiBhbnksIG9wZXJhdGlvbktleTogc3RyaW5nKSB7XG4gIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShvcGVyYXRpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIGFycmF5YFxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRpb24gPT09ICdvYmplY3QnICYmIG9wZXJhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgLy8gb2sgdG8gcHJvY2VlZFxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIG9iamVjdGBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkczogT2JqZWN0LCBvcGVyYXRpb246IHN0cmluZykge1xuICAvLyBVc2VzIGNvbGxlY3Rpb24gc2NoZW1hIHRvIGVuc3VyZSB0aGUgZmllbGQgaXMgb2YgdHlwZTpcbiAgLy8gLSBQb2ludGVyPF9Vc2VyPiAocG9pbnRlcnMpXG4gIC8vIC0gQXJyYXlcbiAgLy9cbiAgLy8gICAgSXQncyBub3QgcG9zc2libGUgdG8gZW5mb3JjZSB0eXBlIG9uIEFycmF5J3MgaXRlbXMgaW4gc2NoZW1hXG4gIC8vICBzbyB3ZSBhY2NlcHQgYW55IEFycmF5IGZpZWxkLCBhbmQgbGF0ZXIgd2hlbiBhcHBseWluZyBwZXJtaXNzaW9uc1xuICAvLyAgb25seSBpdGVtcyB0aGF0IGFyZSBwb2ludGVycyB0byBfVXNlciBhcmUgY29uc2lkZXJlZC5cbiAgaWYgKFxuICAgICEoXG4gICAgICBmaWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgKChmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJyAmJiBmaWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyA9PSAnX1VzZXInKSB8fFxuICAgICAgICBmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdBcnJheScpXG4gICAgKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7ZmllbGROYW1lfScgaXMgbm90IGEgdmFsaWQgY29sdW1uIGZvciBjbGFzcyBsZXZlbCBwb2ludGVyIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IGpvaW5DbGFzc1JlZ2V4ID0gL15fSm9pbjpbQS1aYS16MC05X10rOltBLVphLXowLTlfXSsvO1xuY29uc3QgY2xhc3NBbmRGaWVsZFJlZ2V4ID0gL15bQS1aYS16XVtBLVphLXowLTlfXSokLztcbmZ1bmN0aW9uIGNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgLy8gVmFsaWQgY2xhc3NlcyBtdXN0OlxuICByZXR1cm4gKFxuICAgIC8vIEJlIG9uZSBvZiBfVXNlciwgX0luc3RhbGxhdGlvbiwgX1JvbGUsIF9TZXNzaW9uIE9SXG4gICAgc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSB8fFxuICAgIC8vIEJlIGEgam9pbiB0YWJsZSBPUlxuICAgIGpvaW5DbGFzc1JlZ2V4LnRlc3QoY2xhc3NOYW1lKSB8fFxuICAgIC8vIEluY2x1ZGUgb25seSBhbHBoYS1udW1lcmljIGFuZCB1bmRlcnNjb3JlcywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4gICAgZmllbGROYW1lSXNWYWxpZChjbGFzc05hbWUsIGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4vLyBtdXN0IG5vdCBiZSBhIHJlc2VydmVkIGtleVxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKGNsYXNzTmFtZSAmJiBjbGFzc05hbWUgIT09ICdfSG9va3MnKSB7XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2NsYXNzTmFtZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNsYXNzQW5kRmllbGRSZWdleC50ZXN0KGZpZWxkTmFtZSkgJiYgIWludmFsaWRDb2x1bW5zLmluY2x1ZGVzKGZpZWxkTmFtZSk7XG59XG5cbi8vIENoZWNrcyB0aGF0IGl0J3Mgbm90IHRyeWluZyB0byBjbG9iYmVyIG9uZSBvZiB0aGUgZGVmYXVsdCBmaWVsZHMgb2YgdGhlIGNsYXNzLlxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICdJbnZhbGlkIGNsYXNzbmFtZTogJyArXG4gICAgY2xhc3NOYW1lICtcbiAgICAnLCBjbGFzc25hbWVzIGNhbiBvbmx5IGhhdmUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMgYW5kIF8sIGFuZCBtdXN0IHN0YXJ0IHdpdGggYW4gYWxwaGEgY2hhcmFjdGVyICdcbiAgKTtcbn1cblxuY29uc3QgaW52YWxpZEpzb25FcnJvciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbnZhbGlkIEpTT04nKTtcbmNvbnN0IHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyA9IFtcbiAgJ051bWJlcicsXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdEYXRlJyxcbiAgJ09iamVjdCcsXG4gICdBcnJheScsXG4gICdHZW9Qb2ludCcsXG4gICdGaWxlJyxcbiAgJ0J5dGVzJyxcbiAgJ1BvbHlnb24nLFxuXTtcbi8vIFJldHVybnMgYW4gZXJyb3Igc3VpdGFibGUgZm9yIHRocm93aW5nIGlmIHRoZSB0eXBlIGlzIGludmFsaWRcbmNvbnN0IGZpZWxkVHlwZUlzSW52YWxpZCA9ICh7IHR5cGUsIHRhcmdldENsYXNzIH0pID0+IHtcbiAgaWYgKFsnUG9pbnRlcicsICdSZWxhdGlvbiddLmluZGV4T2YodHlwZSkgPj0gMCkge1xuICAgIGlmICghdGFyZ2V0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgdHlwZSAke3R5cGV9IG5lZWRzIGEgY2xhc3MgbmFtZWApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRhcmdldENsYXNzICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gICAgfSBlbHNlIGlmICghY2xhc3NOYW1lSXNWYWxpZCh0YXJnZXRDbGFzcykpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSh0YXJnZXRDbGFzcykpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gIH1cbiAgaWYgKHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcy5pbmRleE9mKHR5cGUpIDwgMCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIGBpbnZhbGlkIGZpZWxkIHR5cGU6ICR7dHlwZX1gKTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSA9IChzY2hlbWE6IGFueSkgPT4ge1xuICBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSk7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLkFDTDtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLnBhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBzY2hlbWEuZmllbGRzLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLmF1dGhEYXRhOyAvL0F1dGggZGF0YSBpcyBpbXBsaWNpdFxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5pbmRleGVzO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNsYXNzIFNjaGVtYURhdGEge1xuICBfX2RhdGE6IGFueTtcbiAgX19wcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgY29uc3RydWN0b3IoYWxsU2NoZW1hcyA9IFtdLCBwcm90ZWN0ZWRGaWVsZHMgPSB7fSkge1xuICAgIHRoaXMuX19kYXRhID0ge307XG4gICAgdGhpcy5fX3Byb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcztcbiAgICBhbGxTY2hlbWFzLmZvckVhY2goc2NoZW1hID0+IHtcbiAgICAgIGlmICh2b2xhdGlsZUNsYXNzZXMuaW5jbHVkZXMoc2NoZW1hLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHNjaGVtYS5jbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSkuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBkZWVwY29weShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBJbmplY3QgdGhlIGluLW1lbW9yeSBjbGFzc2VzXG4gICAgdm9sYXRpbGVDbGFzc2VzLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBjbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgIHRoaXMuX19kYXRhW2NsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGluamVjdERlZmF1bHRTY2hlbWEgPSAoeyBjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBpbmRleGVzIH06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9JZGVtcG90ZW5jeVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19JZGVtcG90ZW5jeScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG4gIF9JZGVtcG90ZW5jeVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKGRiVHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcsIG9iamVjdFR5cGU6IFNjaGVtYUZpZWxkKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAoZGJUeXBlLnRhcmdldENsYXNzICE9PSBvYmplY3RUeXBlLnRhcmdldENsYXNzKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHsgcmV0dXJuIHRydWU7IH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuY29uc3QgdHlwZVRvU3RyaW5nID0gKHR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0eXBlO1xuICB9XG4gIGlmICh0eXBlLnRhcmdldENsYXNzKSB7XG4gICAgcmV0dXJuIGAke3R5cGUudHlwZX08JHt0eXBlLnRhcmdldENsYXNzfT5gO1xuICB9XG4gIHJldHVybiBgJHt0eXBlLnR5cGV9YDtcbn07XG5jb25zdCB0dGwgPSB7XG4gIGRhdGU6IERhdGUubm93KCksXG4gIGR1cmF0aW9uOiB1bmRlZmluZWQsXG59O1xuXG4vLyBTdG9yZXMgdGhlIGVudGlyZSBzY2hlbWEgb2YgdGhlIGFwcCBpbiBhIHdlaXJkIGh5YnJpZCBmb3JtYXQgc29tZXdoZXJlIGJldHdlZW5cbi8vIHRoZSBtb25nbyBmb3JtYXQgYW5kIHRoZSBQYXJzZSBmb3JtYXQuIFNvb24sIHRoaXMgd2lsbCBhbGwgYmUgUGFyc2UgZm9ybWF0LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2NoZW1hQ29udHJvbGxlciB7XG4gIF9kYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFEYXRhOiB7IFtzdHJpbmddOiBTY2hlbWEgfTtcbiAgcmVsb2FkRGF0YVByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIHByb3RlY3RlZEZpZWxkczogYW55O1xuICB1c2VySWRSZWdFeDogUmVnRXhwO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGFiYXNlQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIpIHtcbiAgICB0aGlzLl9kYkFkYXB0ZXIgPSBkYXRhYmFzZUFkYXB0ZXI7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShTY2hlbWFDYWNoZS5hbGwoKSwgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIHRoaXMucHJvdGVjdGVkRmllbGRzID0gY29uZmlnLnByb3RlY3RlZEZpZWxkcztcblxuICAgIGNvbnN0IGN1c3RvbUlkcyA9IGNvbmZpZy5hbGxvd0N1c3RvbU9iamVjdElkO1xuXG4gICAgY29uc3QgY3VzdG9tSWRSZWdFeCA9IC9eLnsxLH0kL3U7IC8vIDErIGNoYXJzXG4gICAgY29uc3QgYXV0b0lkUmVnRXggPSAvXlthLXpBLVowLTldezEsfSQvO1xuXG4gICAgdGhpcy51c2VySWRSZWdFeCA9IGN1c3RvbUlkcyA/IGN1c3RvbUlkUmVnRXggOiBhdXRvSWRSZWdFeDtcblxuICAgIHRoaXMuX2RiQWRhcHRlci53YXRjaCgoKSA9PiB7XG4gICAgICB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcmVsb2FkRGF0YUlmTmVlZGVkKCkge1xuICAgIGlmICh0aGlzLl9kYkFkYXB0ZXIuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBkYXRlLCBkdXJhdGlvbiB9ID0gdHRsIHx8IHt9O1xuICAgIGlmICghZHVyYXRpb24pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBpZiAobm93IC0gZGF0ZSA+IGR1cmF0aW9uKSB7XG4gICAgICB0dGwuZGF0ZSA9IG5vdztcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICB9XG5cbiAgcmVsb2FkRGF0YShvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKHRoaXMucmVsb2FkRGF0YVByb21pc2UgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMucmVsb2FkRGF0YVByb21pc2UgPSB0aGlzLmdldEFsbENsYXNzZXMob3B0aW9ucylcbiAgICAgIC50aGVuKFxuICAgICAgICBhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShhbGxTY2hlbWFzLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgfVxuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YUlmTmVlZGVkKCk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuYWxsKCk7XG4gICAgaWYgKGNhY2hlZCAmJiBjYWNoZWQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgfVxuXG4gIHNldEFsbENsYXNzZXMoKTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiBhbGxTY2hlbWFzLm1hcChpbmplY3REZWZhdWx0U2NoZW1hKSlcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5wdXQoYWxsU2NoZW1hcyk7XG4gICAgICAgIHJldHVybiBhbGxTY2hlbWFzO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRPbmVTY2hlbWEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWxsb3dWb2xhdGlsZUNsYXNzZXM6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYT4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgfVxuICAgIGlmIChhbGxvd1ZvbGF0aWxlQ2xhc3NlcyAmJiB2b2xhdGlsZUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGZpZWxkczogZGF0YS5maWVsZHMsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIGluZGV4ZXM6IGRhdGEuaW5kZXhlcyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICBjb25zdCBvbmVTY2hlbWEgPSBhbGxTY2hlbWFzLmZpbmQoc2NoZW1hID0+IHNjaGVtYS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSk7XG4gICAgICBpZiAoIW9uZVNjaGVtYSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvbmVTY2hlbWE7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBuZXcgY2xhc3MgdGhhdCBpbmNsdWRlcyB0aGUgdGhyZWUgZGVmYXVsdCBmaWVsZHMuXG4gIC8vIEFDTCBpcyBhbiBpbXBsaWNpdCBjb2x1bW4gdGhhdCBkb2VzIG5vdCBnZXQgYW4gZW50cnkgaW4gdGhlXG4gIC8vIF9TQ0hFTUFTIGRhdGFiYXNlLiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGggdGhlXG4gIC8vIGNyZWF0ZWQgc2NoZW1hLCBpbiBtb25nbyBmb3JtYXQuXG4gIC8vIG9uIHN1Y2Nlc3MsIGFuZCByZWplY3RzIHdpdGggYW4gZXJyb3Igb24gZmFpbC4gRW5zdXJlIHlvdVxuICAvLyBoYXZlIGF1dGhvcml6YXRpb24gKG1hc3RlciBrZXksIG9yIGNsaWVudCBjbGFzcyBjcmVhdGlvblxuICAvLyBlbmFibGVkKSBiZWZvcmUgY2FsbGluZyB0aGlzIGZ1bmN0aW9uLlxuICBhc3luYyBhZGRDbGFzc0lmTm90RXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55ID0ge31cbiAgKTogUHJvbWlzZTx2b2lkIHwgU2NoZW1hPiB7XG4gICAgdmFyIHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICBpZiAodmFsaWRhdGlvbkVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHZhbGlkYXRpb25FcnJvci5jb2RlICYmIHZhbGlkYXRpb25FcnJvci5lcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgYWRhcHRlclNjaGVtYSA9IGF3YWl0IHRoaXMuX2RiQWRhcHRlci5jcmVhdGVDbGFzcyhcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHtcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYShhZGFwdGVyU2NoZW1hKTtcbiAgICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlQ2xhc3MoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkRmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55LFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkRmllbGRzW25hbWVdO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdICYmXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXS50eXBlICE9PSBmaWVsZC50eXBlICYmXG4gICAgICAgICAgICBmaWVsZC5fX29wICE9PSAnRGVsZXRlJ1xuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWV4aXN0aW5nRmllbGRzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fd3Blcm07XG4gICAgICAgIGNvbnN0IG5ld1NjaGVtYSA9IGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KGV4aXN0aW5nRmllbGRzLCBzdWJtaXR0ZWRGaWVsZHMpO1xuICAgICAgICBjb25zdCBkZWZhdWx0RmllbGRzID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCBkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdDtcbiAgICAgICAgY29uc3QgZnVsbE5ld1NjaGVtYSA9IE9iamVjdC5hc3NpZ24oe30sIG5ld1NjaGVtYSwgZGVmYXVsdEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBuZXdTY2hlbWEsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIE9iamVjdC5rZXlzKGV4aXN0aW5nRmllbGRzKVxuICAgICAgICApO1xuICAgICAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmluYWxseSB3ZSBoYXZlIGNoZWNrZWQgdG8gbWFrZSBzdXJlIHRoZSByZXF1ZXN0IGlzIHZhbGlkIGFuZCB3ZSBjYW4gc3RhcnQgZGVsZXRpbmcgZmllbGRzLlxuICAgICAgICAvLyBEbyBhbGwgZGVsZXRpb25zIGZpcnN0LCB0aGVuIGEgc2luZ2xlIHNhdmUgdG8gX1NDSEVNQSBjb2xsZWN0aW9uIHRvIGhhbmRsZSBhbGwgYWRkaXRpb25zLlxuICAgICAgICBjb25zdCBkZWxldGVkRmllbGRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBpbnNlcnRlZEZpZWxkcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGRlbGV0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgZGVsZXRlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICBpZiAoZGVsZXRlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSA9IHRoaXMuZGVsZXRlRmllbGRzKGRlbGV0ZWRGaWVsZHMsIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICAgICAgICB9XG4gICAgICAgIGxldCBlbmZvcmNlRmllbGRzID0gW107XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSAvLyBEZWxldGUgRXZlcnl0aGluZ1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSkgLy8gUmVsb2FkIG91ciBTY2hlbWEsIHNvIHdlIGhhdmUgYWxsIHRoZSBuZXcgdmFsdWVzXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gaW5zZXJ0ZWRGaWVsZHMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZSA9IHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgICBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIG5ld1NjaGVtYSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgdGhpcy5fZGJBZGFwdGVyLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgICAgICAgIHNjaGVtYS5pbmRleGVzLFxuICAgICAgICAgICAgICAgIGZ1bGxOZXdTY2hlbWFcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSlcbiAgICAgICAgICAgIC8vVE9ETzogTW92ZSB0aGlzIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXJcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG4gICAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgICAgICAgICBjb25zdCByZWxvYWRlZFNjaGVtYTogU2NoZW1hID0ge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVsb2FkZWRTY2hlbWEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiByZWxvYWRlZFNjaGVtYTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBvciBmYWlscyB3aXRoIGEgcmVhc29uLlxuICBlbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuICAgIC8vIFdlIGRvbid0IGhhdmUgdGhpcyBjbGFzcy4gVXBkYXRlIHRoZSBzY2hlbWFcbiAgICByZXR1cm4gKFxuICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgc3VjY2VlZGVkLiBSZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgdGhpcy5hZGRDbGFzc0lmTm90RXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodFxuICAgICAgICAgIC8vIGhhdmUgZmFpbGVkIGJlY2F1c2UgdGhlcmUncyBhIHJhY2UgY29uZGl0aW9uIGFuZCBhIGRpZmZlcmVudFxuICAgICAgICAgIC8vIGNsaWVudCBpcyBtYWtpbmcgdGhlIGV4YWN0IHNhbWUgc2NoZW1hIHVwZGF0ZSB0aGF0IHdlIHdhbnQuXG4gICAgICAgICAgLy8gU28ganVzdCByZWxvYWQgdGhlIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBzY2hlbWEgbm93IHZhbGlkYXRlc1xuICAgICAgICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBGYWlsZWQgdG8gYWRkICR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHN0aWxsIGRvZXNuJ3QgdmFsaWRhdGUuIEdpdmUgdXBcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnc2NoZW1hIGNsYXNzIG5hbWUgZG9lcyBub3QgcmV2YWxpZGF0ZScpO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LCBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSk6IGFueSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgIH1cbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBlcnJvcjogaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBbXSk7XG4gIH1cblxuICB2YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgZXhpc3RpbmdGaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+XG4gICkge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgICAgaWYgKGV4aXN0aW5nRmllbGROYW1lcy5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGVycm9yOiAnaW52YWxpZCBmaWVsZCBuYW1lOiAnICsgZmllbGROYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IDEzNixcbiAgICAgICAgICAgIGVycm9yOiAnZmllbGQgJyArIGZpZWxkTmFtZSArICcgY2Fubm90IGJlIGFkZGVkJyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBjb25zdCBlcnJvciA9IGZpZWxkVHlwZUlzSW52YWxpZChmaWVsZFR5cGUpO1xuICAgICAgICBpZiAoZXJyb3IpIHsgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTsgfVxuICAgICAgICBpZiAoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdkZWZhdWx0IHZhbHVlJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcywgdGhpcy51c2VySWRSZWdFeCk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIGFzeW5jIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEsIHRoaXMudXNlcklkUmVnRXgpO1xuICAgIGF3YWl0IHRoaXMuX2RiQWRhcHRlci5zZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lLCBwZXJtcyk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgY2FjaGVkLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHBlcm1zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkLFxuICAgIGlzVmFsaWRhdGlvbj86IGJvb2xlYW4sXG4gICAgbWFpbnRlbmFuY2U/OiBib29sZWFuXG4gICkge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gXCI8YXJyYXk+LjxpbmRleD5cIiBmb3IgTmVzdGVkIEFycmF5c1xuICAgICAgLy8gXCI8ZW1iZWRkZWQgZG9jdW1lbnQ+LjxmaWVsZD5cIiBmb3IgTmVzdGVkIE9iamVjdHNcbiAgICAgIC8vIEpTT04gQXJyYXlzIGFyZSB0cmVhdGVkIGFzIE5lc3RlZCBPYmplY3RzXG4gICAgICBjb25zdCBbeCwgeV0gPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGZpZWxkTmFtZSA9IHg7XG4gICAgICBjb25zdCBpc0FycmF5SW5kZXggPSBBcnJheS5mcm9tKHkpLmV2ZXJ5KGMgPT4gYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuICAgICAgaWYgKGlzQXJyYXlJbmRleCAmJiAhWydzZW50UGVyVVRDT2Zmc2V0JywgJ2ZhaWxlZFBlclVUQ09mZnNldCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgICAgdHlwZSA9ICdBcnJheSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBlID0gJ09iamVjdCc7XG4gICAgICB9XG4gICAgfVxuICAgIGxldCBmaWVsZE5hbWVUb1ZhbGlkYXRlID0gYCR7ZmllbGROYW1lfWA7XG4gICAgaWYgKG1haW50ZW5hbmNlICYmIGZpZWxkTmFtZVRvVmFsaWRhdGUuY2hhckF0KDApID09PSAnXycpIHtcbiAgICAgIGZpZWxkTmFtZVRvVmFsaWRhdGUgPSBmaWVsZE5hbWVUb1ZhbGlkYXRlLnN1YnN0cmluZygxKTtcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZVRvVmFsaWRhdGUsIGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYCk7XG4gICAgfVxuXG4gICAgLy8gSWYgc29tZW9uZSB0cmllcyB0byBjcmVhdGUgYSBuZXcgZmllbGQgd2l0aCBudWxsL3VuZGVmaW5lZCBhcyB0aGUgdmFsdWUsIHJldHVybjtcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHR5cGUgPSAoeyB0eXBlIH06IFNjaGVtYUZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKHR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSh0eXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIHR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXhwZWN0ZWRUeXBlKSB7XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgZXhwZWN0ZWRUeXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyh0eXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJZiB0eXBlIG9wdGlvbnMgZG8gbm90IGNoYW5nZVxuICAgICAgLy8gd2UgY2FuIHNhZmVseSByZXR1cm5cbiAgICAgIGlmIChpc1ZhbGlkYXRpb24gfHwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRUeXBlKSA9PT0gSlNPTi5zdHJpbmdpZnkodHlwZSkpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8vIEZpZWxkIG9wdGlvbnMgYXJlIG1heSBiZSBjaGFuZ2VkXG4gICAgICAvLyBlbnN1cmUgdG8gaGF2ZSBhbiB1cGRhdGUgdG8gZGF0ZSBzY2hlbWEgZmllbGRcbiAgICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXIudXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFKSB7XG4gICAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgd2UgdGhyb3cgZXJyb3JzIHdoZW4gaXQgaXMgYXBwcm9wcmlhdGUgdG8gZG8gc28uXG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodCBoYXZlIGJlZW4gYSByYWNlXG4gICAgICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBhbm90aGVyIGNsaWVudCB1cGRhdGVkIHRoZSBzY2hlbWEgaW4gdGhlIHNhbWVcbiAgICAgICAgLy8gd2F5IHRoYXQgd2Ugd2FudGVkIHRvLiBTbywganVzdCByZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZW5zdXJlRmllbGRzKGZpZWxkczogYW55KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGxldCB7IHR5cGUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHlwZSA9IHsgdHlwZTogdHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFleHBlY3RlZFR5cGUgfHwgIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYENvdWxkIG5vdCBhZGQgZmllbGQgJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbWFpbnRhaW4gY29tcGF0aWJpbGl0eVxuICBkZWxldGVGaWVsZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVGaWVsZHMoW2ZpZWxkTmFtZV0sIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICB9XG5cbiAgLy8gRGVsZXRlIGZpZWxkcywgYW5kIHJlbW92ZSB0aGF0IGRhdGEgZnJvbSBhbGwgb2JqZWN0cy4gVGhpcyBpcyBpbnRlbmRlZFxuICAvLyB0byByZW1vdmUgdW51c2VkIGZpZWxkcywgaWYgb3RoZXIgd3JpdGVycyBhcmUgd3JpdGluZyBvYmplY3RzIHRoYXQgaW5jbHVkZVxuICAvLyB0aGlzIGZpZWxkLCB0aGUgZmllbGQgbWF5IHJlYXBwZWFyLiBSZXR1cm5zIGEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGhcbiAgLy8gbm8gb2JqZWN0IG9uIHN1Y2Nlc3MsIG9yIHJlamVjdHMgd2l0aCB7IGNvZGUsIGVycm9yIH0gb24gZmFpbHVyZS5cbiAgLy8gUGFzc2luZyB0aGUgZGF0YWJhc2UgYW5kIHByZWZpeCBpcyBuZWNlc3NhcnkgaW4gb3JkZXIgdG8gZHJvcCByZWxhdGlvbiBjb2xsZWN0aW9uc1xuICAvLyBhbmQgcmVtb3ZlIGZpZWxkcyBmcm9tIG9iamVjdHMuIElkZWFsbHkgdGhlIGRhdGFiYXNlIHdvdWxkIGJlbG9uZyB0b1xuICAvLyBhIGRhdGFiYXNlIGFkYXB0ZXIgYW5kIHRoaXMgZnVuY3Rpb24gd291bGQgY2xvc2Ugb3ZlciBpdCBvciBhY2Nlc3MgaXQgdmlhIG1lbWJlci5cbiAgZGVsZXRlRmllbGRzKGZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz4sIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSkpO1xuICAgIH1cblxuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYGludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgICAvL0Rvbid0IGFsbG93IGRlbGV0aW5nIHRoZSBkZWZhdWx0IGZpZWxkcy5cbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCBgZmllbGQgJHtmaWVsZE5hbWV9IGNhbm5vdCBiZSBjaGFuZ2VkYCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBmYWxzZSwgeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7ZmllbGROYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IHsgLi4uc2NoZW1hLmZpZWxkcyB9O1xuICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVGaWVsZHMoY2xhc3NOYW1lLCBzY2hlbWEsIGZpZWxkTmFtZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgIGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICAgICAgLy9Gb3IgcmVsYXRpb25zLCBkcm9wIHRoZSBfSm9pbiB0YWJsZVxuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUNsYXNzKGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvYmplY3QgcHJvdmlkZWQgaW4gUkVTVCBmb3JtYXQuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEgaWYgdGhpcyBvYmplY3QgaXNcbiAgLy8gdmFsaWQuXG4gIGFzeW5jIHZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSwgbWFpbnRlbmFuY2U6IGJvb2xlYW4pIHtcbiAgICBsZXQgZ2VvY291bnQgPSAwO1xuICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IHRoaXMuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGdlb2NvdW50Kys7XG4gICAgICB9XG4gICAgICBpZiAoZ2VvY291bnQgPiAxKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBlY3RlZCA9IGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCwgdHJ1ZSwgbWFpbnRlbmFuY2UpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25zdCBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcblxuICAgIGlmIChlbmZvcmNlRmllbGRzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG5cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhwcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIHRoYXQgYWxsIHRoZSBwcm9wZXJ0aWVzIGFyZSBzZXQgZm9yIHRoZSBvYmplY3RcbiAgdmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlcXVpcmVkQ29sdW1ucy53cml0ZVtjbGFzc05hbWVdO1xuICAgIGlmICghY29sdW1ucyB8fCBjb2x1bW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbmdDb2x1bW5zID0gY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIG1pc3NpbmdDb2x1bW5zWzBdICsgJyBpcyByZXF1aXJlZC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zOiA/YW55LCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICBpZiAocGVybXNbJyonXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHBlcm1pc3Npb25zIGFnYWluc3QgdGhlIGFjbEdyb3VwIHByb3ZpZGVkIChhcnJheSBvZiB1c2VySWQvcm9sZXMpXG4gICAgaWYgKFxuICAgICAgYWNsR3JvdXAuc29tZShhY2wgPT4ge1xuICAgICAgICByZXR1cm4gcGVybXNbYWNsXSA9PT0gdHJ1ZTtcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgc3RhdGljIHZhbGlkYXRlUGVybWlzc2lvbihcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBhY3Rpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb2ludGVyRmllbGRzID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHM7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykgJiYgcG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhbnkgb3AgZXhjZXB0ICdhZGRGaWVsZCBhcyBwYXJ0IG9mIGNyZWF0ZScgaXMgb2suXG4gICAgICBpZiAob3BlcmF0aW9uICE9PSAnYWRkRmllbGQnIHx8IGFjdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgICAgLy8gV2UgY2FuIGFsbG93IGFkZGluZyBmaWVsZCBvbiB1cGRhdGUgZmxvdyBvbmx5LlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IGFueSk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIpO1xuICB0dGwuZHVyYXRpb24gPSBkYkFkYXB0ZXIuc2NoZW1hQ2FjaGVUdGw7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG4gIHJlcXVpcmVkQ29sdW1ucyxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQWtCQSxJQUFBQSxlQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFDLHNC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