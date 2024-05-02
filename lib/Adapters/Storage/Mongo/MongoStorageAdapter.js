"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;
var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));
var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));
var _StorageAdapter = require("../StorageAdapter");
var _mongodbUrl = require("../../../vendor/mongodbUrl");
var _MongoTransform = require("./MongoTransform");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireDefault(require("../../../defaults"));
var _logger = _interopRequireDefault(require("../../../logger"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); } // -disable-next
// -disable-next
// -disable-next
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;
const MongoSchemaCollectionName = '_SCHEMA';
const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect().then(() => mongoAdapter.database.collections()).then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};
const convertParseSchemaToMongoSchema = _ref => {
  let schema = _extends({}, _ref);
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }
  return schema;
};

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions, indexes) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined
  };
  for (const fieldName in fields) {
    const _fields$fieldName = fields[fieldName],
      {
        type,
        targetClass
      } = _fields$fieldName,
      fieldOptions = _objectWithoutProperties(_fields$fieldName, ["type", "targetClass"]);
    mongoObject[fieldName] = _MongoSchemaCollection.default.parseFieldTypeToMongoFieldType({
      type,
      targetClass
    });
    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }
  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }
  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }
  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }
  return mongoObject;
};
function validateExplainValue(explain) {
  if (explain) {
    // The list of allowed explain values is from node-mongodb-native/lib/explain.js
    const explainAllowedValues = ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution', false, true];
    if (!explainAllowedValues.includes(explain)) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid value for explain');
    }
  }
}
class MongoStorageAdapter {
  // Private

  // Public

  constructor({
    uri = _defaults.default.DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {}
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = _objectSpread({}, mongoOptions);
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.schemaCacheTtl = mongoOptions.schemaCacheTtl;
    this.disableIndexFieldValidation = !!mongoOptions.disableIndexFieldValidation;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'maxTimeMS', 'disableIndexFieldValidation']) {
      delete this._mongoOptions[key];
    }
  }
  watch(callback) {
    this._onchange = callback;
  }
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));
    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(client => {
      // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
      // Fortunately, we can get back the options and use them to select the proper DB.
      // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
      const options = client.s.options;
      const database = client.db(options.dbName);
      if (!database) {
        delete this.connectionPromise;
        return;
      }
      client.on('error', () => {
        delete this.connectionPromise;
      });
      client.on('close', () => {
        delete this.connectionPromise;
      });
      this.client = client;
      this.database = database;
    }).catch(err => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });
    return this.connectionPromise;
  }
  handleError(error) {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;
      _logger.default.error('Received unauthorized error', {
        error: error
      });
    }
    throw error;
  }
  async handleShutdown() {
    if (!this.client) {
      return;
    }
    await this.client.close(false);
    delete this.connectionPromise;
  }
  _adaptiveCollection(name) {
    return this.connect().then(() => this.database.collection(this._collectionPrefix + name)).then(rawCollection => new _MongoCollection.default(rawCollection)).catch(err => this.handleError(err));
  }
  _schemaCollection() {
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => {
      if (!this._stream && this.enableSchemaHooks) {
        this._stream = collection._mongoCollection.watch();
        this._stream.on('change', () => this._onchange());
      }
      return new _MongoSchemaCollection.default(collection);
    });
  }
  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({
        name: this._collectionPrefix + name
      }).toArray();
    }).then(collections => {
      return collections.length > 0;
    }).catch(err => this.handleError(err));
  }
  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.class_permissions': CLPs
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields) {
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletePromises = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!this.disableIndexFieldValidation && !Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    let insertPromise = Promise.resolve();
    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }
    return Promise.all(deletePromises).then(() => insertPromise).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.indexes': existingIndexes
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesFromMongo(className) {
    return this.getIndexes(className).then(indexes => {
      indexes = indexes.reduce((obj, index) => {
        if (index.key._fts) {
          delete index.key._fts;
          delete index.key._ftsx;
          for (const field in index.weights) {
            index.key[field] = 'text';
          }
        }
        obj[index.name] = index.key;
        return obj;
      }, {});
      return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
        $set: {
          '_metadata.indexes': indexes
        }
      }));
    }).catch(err => this.handleError(err)).catch(() => {
      // Ignore if collection not found
      return Promise.resolve();
    });
  }
  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions, schema.indexes);
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.insertSchema(mongoObject)).catch(err => this.handleError(err));
  }
  async updateFieldOptions(className, fieldName, type) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }
  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type)).then(() => this.createIndexesIfNeeded(className, fieldName, type)).catch(err => this.handleError(err));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }
  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = {
      $unset: {}
    };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });
    const collectionFilter = {
      $or: []
    };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({
        [name]: {
          $exists: true
        }
      });
    });
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany(collectionFilter, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.
  createObject(className, schema, object, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).then(() => ({
      ops: [mongoObject]
    })).catch(error => {
      if (error.code === 11000) {
        // Duplicate value
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        throw err;
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className).then(collection => {
      const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return collection.deleteMany(mongoWhere, transactionalSession);
    }).catch(err => this.handleError(err)).then(({
      deletedCount
    }) => {
      if (deletedCount === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, () => {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
      returnDocument: 'after',
      session: transactionalSession || undefined
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result.value, schema)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    readPreference,
    hint,
    caseInsensitive,
    explain,
    comment
  }) {
    validateExplainValue(explain);
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    const mongoSort = _lodash.default.mapKeys(sort, (value, fieldName) => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    const mongoKeys = _lodash.default.reduce(keys, (memo, key) => {
      if (key === 'ACL') {
        memo['_rperm'] = 1;
        memo['_wperm'] = 1;
      } else {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
      }
      return memo;
    }, {});

    // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.
    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }
    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment
    })).then(objects => {
      if (explain) {
        return objects;
      }
      return objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema));
    }).catch(err => this.handleError(err));
  }
  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const ttlOptions = options.ttl !== undefined ? {
      expireAfterSeconds: options.ttl
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};
    const indexOptions = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, defaultOptions), caseInsensitiveOptions), indexNameOptions), ttlOptions);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions)).catch(err => this.handleError(err));
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className).then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Used in tests
  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  }

  // Executes a count.
  count(className, schema, query, readPreference, _estimate, hint, comment) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      comment
    })).catch(err => this.handleError(err));
  }
  distinct(className, schema, query, fieldName) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = (0, _MongoTransform.transformKey)(className, fieldName, schema);
    return this._adaptiveCollection(className).then(collection => collection.distinct(transformField, (0, _MongoTransform.transformWhere)(className, query, schema))).then(objects => {
      objects = objects.filter(obj => obj != null);
      return objects.map(object => {
        if (isPointerField) {
          return (0, _MongoTransform.transformPointerString)(schema, fieldName, object);
        }
        return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
      });
    }).catch(err => this.handleError(err));
  }
  aggregate(className, schema, pipeline, readPreference, hint, explain, comment) {
    validateExplainValue(explain);
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);
        if (stage.$group._id && typeof stage.$group._id === 'string' && stage.$group._id.indexOf('$_p_') >= 0) {
          isPointerField = true;
        }
      }
      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }
      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }
      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }
      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS,
      hint,
      explain,
      comment
    })).then(results => {
      results.forEach(result => {
        if (Object.prototype.hasOwnProperty.call(result, '_id')) {
          if (isPointerField && result._id) {
            result._id = result._id.split('$')[1];
          }
          if (result._id == null || result._id == undefined || ['object', 'string'].includes(typeof result._id) && _lodash.default.isEmpty(result._id)) {
            result._id = null;
          }
          result.objectId = result._id;
          delete result._id;
        }
      });
      return results;
    }).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
  }

  // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.
  _parseAggregateArgs(schema, pipeline) {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }
        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }
      return returnValue;
    }
    return pipeline;
  }

  // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.
  _parseAggregateProjectArgs(schema, pipeline) {
    const returnValue = {};
    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }
      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }
    return returnValue;
  }

  // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.
  _parseAggregateGroupArgs(schema, pipeline) {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }
      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }
    return pipeline;
  }

  // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.
  _convertToDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    const returnValue = {};
    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }
    return returnValue;
  }
  _parseReadPreference(readPreference) {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }
    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;
      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;
      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;
      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;
      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;
      case undefined:
      case null:
      case '':
        break;
      default:
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Not supported read preference.');
    }
    return readPreference;
  }
  performInitialization() {
    return Promise.resolve();
  }
  createIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(index)).catch(err => this.handleError(err));
  }
  createIndexes(className, indexes) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndexes(indexes)).catch(err => this.handleError(err));
  }
  createIndexesIfNeeded(className, fieldName, type) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere'
      };
      return this.createIndex(className, index);
    }
    return Promise.resolve();
  }
  createTextIndexesIfNeeded(className, query, schema) {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }
      const existingIndexes = schema.indexes;
      for (const key in existingIndexes) {
        const index = existingIndexes[key];
        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }
      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: {
          [fieldName]: 'text'
        }
      };
      return this.setIndexesWithSchemaFormat(className, textIndex, existingIndexes, schema.fields).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }
        throw error;
      });
    }
    return Promise.resolve();
  }
  getIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.indexes()).catch(err => this.handleError(err));
  }
  dropIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndex(index)).catch(err => this.handleError(err));
  }
  dropAllIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndexes()).catch(err => this.handleError(err));
  }
  updateSchemaWithIndexes() {
    return this.getAllClasses().then(classes => {
      const promises = classes.map(schema => {
        return this.setIndexesFromMongo(schema.className);
      });
      return Promise.all(promises);
    }).catch(err => this.handleError(err));
  }
  createTransactionalSession() {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }
  commitTransactionalSession(transactionalSection) {
    const commit = retries => {
      return transactionalSection.commitTransaction().catch(error => {
        if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
          return commit(retries - 1);
        }
        throw error;
      }).then(() => {
        transactionalSection.endSession();
      });
    };
    return commit(5);
  }
  abortTransactionalSession(transactionalSection) {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }
}
exports.MongoStorageAdapter = MongoStorageAdapter;
var _default = exports.default = MongoStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIlN0cmluZyIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsInNvdXJjZSIsImV4Y2x1ZGVkIiwidGFyZ2V0IiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3RvdHlwZSIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsImhhc093blByb3BlcnR5IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hIiwiX3JlZiIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsInVuZGVmaW5lZCIsImZpZWxkTmFtZSIsIl9maWVsZHMkZmllbGROYW1lIiwidHlwZSIsInRhcmdldENsYXNzIiwiZmllbGRPcHRpb25zIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwicGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsInZhbGlkYXRlRXhwbGFpblZhbHVlIiwiZXhwbGFpbiIsImV4cGxhaW5BbGxvd2VkVmFsdWVzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9RVUVSWSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsInNjaGVtYUNhY2hlVHRsIiwiZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uIiwid2F0Y2giLCJjYWxsYmFjayIsImNvbm5lY3Rpb25Qcm9taXNlIiwiZW5jb2RlZFVyaSIsImZvcm1hdFVybCIsInBhcnNlVXJsIiwiY2xpZW50Iiwib3B0aW9ucyIsInMiLCJkYiIsImRiTmFtZSIsIm9uIiwiY2F0Y2giLCJlcnIiLCJQcm9taXNlIiwicmVqZWN0IiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsImNvZGUiLCJsb2dnZXIiLCJoYW5kbGVTaHV0ZG93biIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJfc3RyZWFtIiwiX21vbmdvQ29sbGVjdGlvbiIsImNsYXNzRXhpc3RzIiwibGlzdENvbGxlY3Rpb25zIiwidG9BcnJheSIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJzY2hlbWFDb2xsZWN0aW9uIiwidXBkYXRlU2NoZW1hIiwiJHNldCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsInJlc29sdmUiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicmVwbGFjZSIsImluc2VydFByb21pc2UiLCJjcmVhdGVJbmRleGVzIiwiYWxsIiwic2V0SW5kZXhlc0Zyb21Nb25nbyIsImdldEluZGV4ZXMiLCJyZWR1Y2UiLCJpbmRleCIsIl9mdHMiLCJfZnRzeCIsIndlaWdodHMiLCJjcmVhdGVDbGFzcyIsImluc2VydFNjaGVtYSIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJkZWxldGVDbGFzcyIsImRyb3AiLCJtZXNzYWdlIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsImRlbGV0ZUFsbENsYXNzZXMiLCJmYXN0IiwibWFwIiwiZGVsZXRlTWFueSIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJtb25nb0Zvcm1hdE5hbWVzIiwiY29sbGVjdGlvblVwZGF0ZSIsIiR1bnNldCIsImNvbGxlY3Rpb25GaWx0ZXIiLCIkb3IiLCIkZXhpc3RzIiwic2NoZW1hVXBkYXRlIiwidXBkYXRlTWFueSIsImdldEFsbENsYXNzZXMiLCJzY2hlbWFzQ29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsImdldENsYXNzIiwiX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEiLCJjcmVhdGVPYmplY3QiLCJvYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsImluc2VydE9uZSIsIm9wcyIsIkRVUExJQ0FURV9WQUxVRSIsInVuZGVybHlpbmdFcnJvciIsIm1hdGNoZXMiLCJBcnJheSIsImlzQXJyYXkiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInF1ZXJ5IiwibW9uZ29XaGVyZSIsInRyYW5zZm9ybVdoZXJlIiwiZGVsZXRlZENvdW50IiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwicmV0dXJuRG9jdW1lbnQiLCJzZXNzaW9uIiwicmVzdWx0IiwibW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0IiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJjb21tZW50IiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJ0cmFuc2Zvcm1LZXkiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiX2VzdGltYXRlIiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwic3RhZ2UiLCIkZ3JvdXAiLCJfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3MiLCIkbWF0Y2giLCJfcGFyc2VBZ2dyZWdhdGVBcmdzIiwiJHByb2plY3QiLCJfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyIsIiRnZW9OZWFyIiwicmVzdWx0cyIsInNwbGl0IiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdCIsInJldHJpZXMiLCJjb21taXRUcmFuc2FjdGlvbiIsImhhc0Vycm9yTGFiZWwiLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuICBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb246IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgbW9uZ29PcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fdXJpID0gdXJpO1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucyA9IHsgLi4ubW9uZ29PcHRpb25zIH07XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zLnVzZU5ld1VybFBhcnNlciA9IHRydWU7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zLnVzZVVuaWZpZWRUb3BvbG9neSA9IHRydWU7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSAoKSA9PiB7fTtcblxuICAgIC8vIE1heFRpbWVNUyBpcyBub3QgYSBnbG9iYWwgTW9uZ29EQiBjbGllbnQgb3B0aW9uLCBpdCBpcyBhcHBsaWVkIHBlciBvcGVyYXRpb24uXG4gICAgdGhpcy5fbWF4VGltZU1TID0gbW9uZ29PcHRpb25zLm1heFRpbWVNUztcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSB0cnVlO1xuICAgIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MgPSAhIW1vbmdvT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICB0aGlzLnNjaGVtYUNhY2hlVHRsID0gbW9uZ29PcHRpb25zLnNjaGVtYUNhY2hlVHRsO1xuICAgIHRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uID0gISFtb25nb09wdGlvbnMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFtcbiAgICAgICdlbmFibGVTY2hlbWFIb29rcycsXG4gICAgICAnc2NoZW1hQ2FjaGVUdGwnLFxuICAgICAgJ21heFRpbWVNUycsXG4gICAgICAnZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uJyxcbiAgICBdKSB7XG4gICAgICBkZWxldGUgdGhpcy5fbW9uZ29PcHRpb25zW2tleV07XG4gICAgfVxuICB9XG5cbiAgd2F0Y2goY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLl9vbmNoYW5nZSA9IGNhbGxiYWNrO1xuICB9XG5cbiAgY29ubmVjdCgpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uUHJvbWlzZSkge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgfVxuXG4gICAgLy8gcGFyc2luZyBhbmQgcmUtZm9ybWF0dGluZyBjYXVzZXMgdGhlIGF1dGggdmFsdWUgKGlmIHRoZXJlKSB0byBnZXQgVVJJXG4gICAgLy8gZW5jb2RlZFxuICAgIGNvbnN0IGVuY29kZWRVcmkgPSBmb3JtYXRVcmwocGFyc2VVcmwodGhpcy5fdXJpKSk7XG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oY2xpZW50ID0+IHtcbiAgICAgICAgLy8gU3RhcnRpbmcgbW9uZ29EQiAzLjAsIHRoZSBNb25nb0NsaWVudC5jb25uZWN0IGRvbid0IHJldHVybiBhIERCIGFueW1vcmUgYnV0IGEgY2xpZW50XG4gICAgICAgIC8vIEZvcnR1bmF0ZWx5LCB3ZSBjYW4gZ2V0IGJhY2sgdGhlIG9wdGlvbnMgYW5kIHVzZSB0aGVtIHRvIHNlbGVjdCB0aGUgcHJvcGVyIERCLlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbW9uZ29kYi9ub2RlLW1vbmdvZGItbmF0aXZlL2Jsb2IvMmMzNWQ3NmYwODU3NDIyNWI4ZGIwMmQ3YmVmNjg3MTIzZTZiYjAxOC9saWIvbW9uZ29fY2xpZW50LmpzI0w4ODVcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGNsaWVudC5zLm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRhdGFiYXNlID0gY2xpZW50LmRiKG9wdGlvbnMuZGJOYW1lKTtcbiAgICAgICAgaWYgKCFkYXRhYmFzZSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgY2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBoYW5kbGVFcnJvcjxUPihlcnJvcjogPyhFcnJvciB8IFBhcnNlLkVycm9yKSk6IFByb21pc2U8VD4ge1xuICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAxMykge1xuICAgICAgLy8gVW5hdXRob3JpemVkIGVycm9yXG4gICAgICBkZWxldGUgdGhpcy5jbGllbnQ7XG4gICAgICBkZWxldGUgdGhpcy5kYXRhYmFzZTtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgbG9nZ2VyLmVycm9yKCdSZWNlaXZlZCB1bmF1dGhvcml6ZWQgZXJyb3InLCB7IGVycm9yOiBlcnJvciB9KTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBhc3luYyBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmNsb3NlKGZhbHNlKTtcbiAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIF9hZGFwdGl2ZUNvbGxlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmRhdGFiYXNlLmNvbGxlY3Rpb24odGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUpKVxuICAgICAgLnRoZW4ocmF3Q29sbGVjdGlvbiA9PiBuZXcgTW9uZ29Db2xsZWN0aW9uKHJhd0NvbGxlY3Rpb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgX3NjaGVtYUNvbGxlY3Rpb24oKTogUHJvbWlzZTxNb25nb1NjaGVtYUNvbGxlY3Rpb24+IHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBpZiAoIXRoaXMuX3N0cmVhbSAmJiB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICAgICAgdGhpcy5fc3RyZWFtID0gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLndhdGNoKCk7XG4gICAgICAgICAgdGhpcy5fc3RyZWFtLm9uKCdjaGFuZ2UnLCAoKSA9PiB0aGlzLl9vbmNoYW5nZSgpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE1vbmdvU2NoZW1hQ29sbGVjdGlvbihjb2xsZWN0aW9uKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmxpc3RDb2xsZWN0aW9ucyh7IG5hbWU6IHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lIH0pLnRvQXJyYXkoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihjb2xsZWN0aW9ucyA9PiB7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5sZW5ndGggPiAwO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMnOiBDTFBzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZVByb21pc2VzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBjb25zdCBwcm9taXNlID0gdGhpcy5kcm9wSW5kZXgoY2xhc3NOYW1lLCBuYW1lKTtcbiAgICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChwcm9taXNlKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uICYmXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKFxuICAgICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICAgIGtleS5pbmRleE9mKCdfcF8nKSA9PT0gMCA/IGtleS5yZXBsYWNlKCdfcF8nLCAnJykgOiBrZXlcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogZXhpc3RpbmdJbmRleGVzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SW5kZXhlcyhjbGFzc05hbWUpXG4gICAgICAudGhlbihpbmRleGVzID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGluZGV4ZXMgfSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgLy8gSWdub3JlIGlmIGNvbGxlY3Rpb24gbm90IGZvdW5kXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUChcbiAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgc2NoZW1hLmluZGV4ZXNcbiAgICApO1xuICAgIG1vbmdvT2JqZWN0Ll9pZCA9IGNsYXNzTmFtZTtcbiAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcylcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5pbnNlcnRTY2hlbWEobW9uZ29PYmplY3QpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgY29uc3Qgc2NoZW1hQ29sbGVjdGlvbiA9IGF3YWl0IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKTtcbiAgICBhd2FpdCBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gIH1cblxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5jcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmRyb3AoKSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyAnbnMgbm90IGZvdW5kJyBtZWFucyBjb2xsZWN0aW9uIHdhcyBhbHJlYWR5IGdvbmUuIElnbm9yZSBkZWxldGlvbiBhdHRlbXB0LlxuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlID09ICducyBub3QgZm91bmQnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAvLyBXZSd2ZSBkcm9wcGVkIHRoZSBjb2xsZWN0aW9uLCBub3cgcmVtb3ZlIHRoZSBfU0NIRU1BIGRvY3VtZW50XG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZUFsbENsYXNzZXMoZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zKHRoaXMpLnRoZW4oY29sbGVjdGlvbnMgPT5cbiAgICAgIFByb21pc2UuYWxsKFxuICAgICAgICBjb2xsZWN0aW9ucy5tYXAoY29sbGVjdGlvbiA9PiAoZmFzdCA/IGNvbGxlY3Rpb24uZGVsZXRlTWFueSh7fSkgOiBjb2xsZWN0aW9uLmRyb3AoKSkpXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFBvaW50ZXIgZmllbGQgbmFtZXMgYXJlIHBhc3NlZCBmb3IgbGVnYWN5IHJlYXNvbnM6IHRoZSBvcmlnaW5hbCBtb25nb1xuICAvLyBmb3JtYXQgc3RvcmVkIHBvaW50ZXIgZmllbGQgbmFtZXMgZGlmZmVyZW50bHkgaW4gdGhlIGRhdGFiYXNlLCBhbmQgdGhlcmVmb3JlXG4gIC8vIG5lZWRlZCB0byBrbm93IHRoZSB0eXBlIG9mIHRoZSBmaWVsZCBiZWZvcmUgaXQgY291bGQgZGVsZXRlIGl0LiBGdXR1cmUgZGF0YWJhc2VcbiAgLy8gYWRhcHRlcnMgc2hvdWxkIGlnbm9yZSB0aGUgcG9pbnRlckZpZWxkTmFtZXMgYXJndW1lbnQuIEFsbCB0aGUgZmllbGQgbmFtZXMgYXJlIGluXG4gIC8vIGZpZWxkTmFtZXMsIHRoZXkgc2hvdyB1cCBhZGRpdGlvbmFsbHkgaW4gdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGRhdGFiYXNlIGZvciB1c2VcbiAgLy8gYnkgdGhlIG1vbmdvIGFkYXB0ZXIsIHdoaWNoIGRlYWxzIHdpdGggdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgbW9uZ29Gb3JtYXROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYF9wXyR7ZmllbGROYW1lfWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGROYW1lO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGNvbGxlY3Rpb25VcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9uRmlsdGVyID0geyAkb3I6IFtdIH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvbkZpbHRlclsnJG9yJ10ucHVzaCh7IFtuYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlbWFVcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBmaWVsZE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke25hbWV9YF0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShjb2xsZWN0aW9uRmlsdGVyLCBjb2xsZWN0aW9uVXBkYXRlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCBzY2hlbWFVcGRhdGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGdldEFsbENsYXNzZXMoKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3NbXT4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFN0b3JhZ2VDbGFzcz4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUT0RPOiBBcyB5ZXQgbm90IHBhcnRpY3VsYXJseSB3ZWxsIHNwZWNpZmllZC4gQ3JlYXRlcyBhbiBvYmplY3QuIE1heWJlIHNob3VsZG4ndCBldmVuIG5lZWQgdGhlIHNjaGVtYSxcbiAgLy8gYW5kIHNob3VsZCBpbmZlciBmcm9tIHRoZSB0eXBlLiBPciBtYXliZSBkb2VzIG5lZWQgdGhlIHNjaGVtYSBmb3IgdmFsaWRhdGlvbnMuIE9yIG1heWJlIG5lZWRzXG4gIC8vIHRoZSBzY2hlbWEgb25seSBmb3IgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuIFdlJ2xsIGZpZ3VyZSB0aGF0IG91dCBsYXRlci5cbiAgY3JlYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIG9iamVjdDogYW55LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5pbnNlcnRPbmUobW9uZ29PYmplY3QsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW21vbmdvT2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vIER1cGxpY2F0ZSB2YWx1ZVxuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvaW5kZXg6W1xcc2EtekEtWjAtOV9cXC1cXC5dK1xcJD8oW2EtekEtWl8tXSspXzEvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uZGVsZXRlTWFueShtb25nb1doZXJlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAudGhlbihcbiAgICAgICAgKHsgZGVsZXRlZENvdW50IH0pID0+IHtcbiAgICAgICAgICBpZiAoZGVsZXRlZENvdW50ID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yJyk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kcyBhbmQgdXBkYXRlcyBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmZpbmRPbmVBbmRVcGRhdGUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHtcbiAgICAgICAgICByZXR1cm5Eb2N1bWVudDogJ2FmdGVyJyxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgcmVzdWx0LnZhbHVlLCBzY2hlbWEpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHkgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBzZXJ0T25lKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGZpbmQuIEFjY2VwdHM6IGNsYXNzTmFtZSwgcXVlcnkgaW4gUGFyc2UgZm9ybWF0LCBhbmQgeyBza2lwLCBsaW1pdCwgc29ydCB9LlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIHNvcnQsXG4gICAgICBrZXlzLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgZXhwbGFpbixcbiAgICAgIGNvbW1lbnQsXG4gICAgfTogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbik7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvU29ydCA9IF8ubWFwS2V5cyhzb3J0LCAodmFsdWUsIGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgY29uc3QgbW9uZ29LZXlzID0gXy5yZWR1Y2UoXG4gICAgICBrZXlzLFxuICAgICAgKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW9bJ19ycGVybSddID0gMTtcbiAgICAgICAgICBtZW1vWydfd3Blcm0nXSA9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWVtb1t0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBrZXksIHNjaGVtYSldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBhcmVuJ3QgcmVxdWVzdGluZyB0aGUgYF9pZGAgZmllbGQsIHdlIG5lZWQgdG8gZXhwbGljaXRseSBvcHQgb3V0XG4gICAgLy8gb2YgaXQuIERvaW5nIHNvIGluIHBhcnNlLXNlcnZlciBpcyB1bnVzdWFsLCBidXQgaXQgY2FuIGFsbG93IHVzIHRvXG4gICAgLy8gb3B0aW1pemUgc29tZSBxdWVyaWVzIHdpdGggY292ZXJpbmcgaW5kZXhlcy5cbiAgICBpZiAoa2V5cyAmJiAhbW9uZ29LZXlzLl9pZCkge1xuICAgICAgbW9uZ29LZXlzLl9pZCA9IDA7XG4gICAgfVxuXG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQobW9uZ29XaGVyZSwge1xuICAgICAgICAgIHNraXAsXG4gICAgICAgICAgbGltaXQsXG4gICAgICAgICAgc29ydDogbW9uZ29Tb3J0LFxuICAgICAgICAgIGtleXM6IG1vbmdvS2V5cyxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IG9wdGlvbnMuaW5kZXhUeXBlICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmluZGV4VHlwZSA6IDE7XG4gICAgfSk7XG5cbiAgICBjb25zdCBkZWZhdWx0T3B0aW9uczogT2JqZWN0ID0geyBiYWNrZ3JvdW5kOiB0cnVlLCBzcGFyc2U6IHRydWUgfTtcbiAgICBjb25zdCBpbmRleE5hbWVPcHRpb25zOiBPYmplY3QgPSBpbmRleE5hbWUgPyB7IG5hbWU6IGluZGV4TmFtZSB9IDoge307XG4gICAgY29uc3QgdHRsT3B0aW9uczogT2JqZWN0ID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IHsgZXhwaXJlQWZ0ZXJTZWNvbmRzOiBvcHRpb25zLnR0bCB9IDoge307XG4gICAgY29uc3QgY2FzZUluc2Vuc2l0aXZlT3B0aW9uczogT2JqZWN0ID0gY2FzZUluc2Vuc2l0aXZlXG4gICAgICA/IHsgY29sbGF0aW9uOiBNb25nb0NvbGxlY3Rpb24uY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uKCkgfVxuICAgICAgOiB7fTtcbiAgICBjb25zdCBpbmRleE9wdGlvbnM6IE9iamVjdCA9IHtcbiAgICAgIC4uLmRlZmF1bHRPcHRpb25zLFxuICAgICAgLi4uY2FzZUluc2Vuc2l0aXZlT3B0aW9ucyxcbiAgICAgIC4uLmluZGV4TmFtZU9wdGlvbnMsXG4gICAgICAuLi50dGxPcHRpb25zLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4Q3JlYXRpb25SZXF1ZXN0LCBpbmRleE9wdGlvbnMpXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGVuc3VyZVVuaXF1ZW5lc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaW5kZXhDcmVhdGlvblJlcXVlc3QgPSB7fTtcbiAgICBjb25zdCBtb25nb0ZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpKTtcbiAgICBtb25nb0ZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaW5kZXhDcmVhdGlvblJlcXVlc3RbZmllbGROYW1lXSA9IDE7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX2Vuc3VyZVNwYXJzZVVuaXF1ZUluZGV4SW5CYWNrZ3JvdW5kKGluZGV4Q3JlYXRpb25SZXF1ZXN0KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdUcmllZCB0byBlbnN1cmUgZmllbGQgdW5pcXVlbmVzcyBmb3IgYSBjbGFzcyB0aGF0IGFscmVhZHkgaGFzIGR1cGxpY2F0ZXMuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVXNlZCBpbiB0ZXN0c1xuICBfcmF3RmluZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQocXVlcnksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIF9lc3RpbWF0ZTogP2Jvb2xlYW4sXG4gICAgaGludDogP21peGVkLFxuICAgIGNvbW1lbnQ6ID9zdHJpbmdcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uY291bnQodHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hLCB0cnVlKSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgY29tbWVudCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRpc3RpbmN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIHF1ZXJ5OiBRdWVyeVR5cGUsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcic7XG4gICAgY29uc3QgdHJhbnNmb3JtRmllbGQgPSB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5kaXN0aW5jdCh0cmFuc2Zvcm1GaWVsZCwgdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKSlcbiAgICAgIClcbiAgICAgIC50aGVuKG9iamVjdHMgPT4ge1xuICAgICAgICBvYmplY3RzID0gb2JqZWN0cy5maWx0ZXIob2JqID0+IG9iaiAhPSBudWxsKTtcbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtUG9pbnRlclN0cmluZyhzY2hlbWEsIGZpZWxkTmFtZSwgb2JqZWN0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYWdncmVnYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogYW55LFxuICAgIHBpcGVsaW5lOiBhbnksXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkLFxuICAgIGV4cGxhaW4/OiBib29sZWFuLFxuICAgIGNvbW1lbnQ6ID9zdHJpbmdcbiAgKSB7XG4gICAgdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbik7XG4gICAgbGV0IGlzUG9pbnRlckZpZWxkID0gZmFsc2U7XG4gICAgcGlwZWxpbmUgPSBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBzdGFnZS4kZ3JvdXAgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHN0YWdlLiRncm91cCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkICYmXG4gICAgICAgICAgdHlwZW9mIHN0YWdlLiRncm91cC5faWQgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZC5pbmRleE9mKCckX3BfJykgPj0gMFxuICAgICAgICApIHtcbiAgICAgICAgICBpc1BvaW50ZXJGaWVsZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgc3RhZ2UuJG1hdGNoID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJG1hdGNoKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBzdGFnZS4kcHJvamVjdCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hLCBzdGFnZS4kcHJvamVjdCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJGdlb05lYXIgJiYgc3RhZ2UuJGdlb05lYXIucXVlcnkpIHtcbiAgICAgICAgc3RhZ2UuJGdlb05lYXIucXVlcnkgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kZ2VvTmVhci5xdWVyeSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhZ2U7XG4gICAgfSk7XG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5hZ2dyZWdhdGUocGlwZWxpbmUsIHtcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgY29tbWVudCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ19pZCcpKSB7XG4gICAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQgJiYgcmVzdWx0Ll9pZCkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gcmVzdWx0Ll9pZC5zcGxpdCgnJCcpWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IG51bGwgfHxcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKFsnb2JqZWN0JywgJ3N0cmluZyddLmluY2x1ZGVzKHR5cGVvZiByZXN1bHQuX2lkKSAmJiBfLmlzRW1wdHkocmVzdWx0Ll9pZCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSByZXN1bHQuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCByZWN1cnNpdmVseSB0cmF2ZXJzZSB0aGUgcGlwZWxpbmUgYW5kIGNvbnZlcnQgYW55IFBvaW50ZXIgb3IgRGF0ZSBjb2x1bW5zLlxuICAvLyBJZiB3ZSBkZXRlY3QgYSBwb2ludGVyIGNvbHVtbiB3ZSB3aWxsIHJlbmFtZSB0aGUgY29sdW1uIGJlaW5nIHF1ZXJpZWQgZm9yIHRvIG1hdGNoIHRoZSBjb2x1bW5cbiAgLy8gaW4gdGhlIGRhdGFiYXNlLiBXZSBhbHNvIG1vZGlmeSB0aGUgdmFsdWUgdG8gd2hhdCB3ZSBleHBlY3QgdGhlIHZhbHVlIHRvIGJlIGluIHRoZSBkYXRhYmFzZVxuICAvLyBhcyB3ZWxsLlxuICAvLyBGb3IgZGF0ZXMsIHRoZSBkcml2ZXIgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBidXQgd2UgaGF2ZSBhIHN0cmluZyBjb21pbmcgaW4uIFNvIHdlJ2xsIGNvbnZlcnRcbiAgLy8gdGhlIHN0cmluZyB0byBhIERhdGUgc28gdGhlIGRyaXZlciBjYW4gcGVyZm9ybSB0aGUgbmVjZXNzYXJ5IGNvbXBhcmlzb24uXG4gIC8vXG4gIC8vIFRoZSBnb2FsIG9mIHRoaXMgbWV0aG9kIGlzIHRvIGxvb2sgZm9yIHRoZSBcImxlYXZlc1wiIG9mIHRoZSBwaXBlbGluZSBhbmQgZGV0ZXJtaW5lIGlmIGl0IG5lZWRzXG4gIC8vIHRvIGJlIGNvbnZlcnRlZC4gVGhlIHBpcGVsaW5lIGNhbiBoYXZlIGEgZmV3IGRpZmZlcmVudCBmb3Jtcy4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICAvLyAgICAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvYWdncmVnYXRpb24vXG4gIC8vXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBhcnJheSwgaXQgbWVhbnMgd2UgYXJlIHByb2JhYmx5IHBhcnNpbmcgYW4gJyRhbmQnIG9yICckb3InIG9wZXJhdG9yLiBJblxuICAvLyB0aGF0IGNhc2Ugd2UgbmVlZCB0byBsb29wIHRocm91Z2ggYWxsIG9mIGl0J3MgY2hpbGRyZW4gdG8gZmluZCB0aGUgY29sdW1ucyBiZWluZyBvcGVyYXRlZCBvbi5cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIG9iamVjdCwgdGhlbiB3ZSdsbCBsb29wIHRocm91Z2ggdGhlIGtleXMgY2hlY2tpbmcgdG8gc2VlIGlmIHRoZSBrZXkgbmFtZVxuICAvLyBtYXRjaGVzIG9uZSBvZiB0aGUgc2NoZW1hIGNvbHVtbnMuIElmIGl0IGRvZXMgbWF0Y2ggYSBjb2x1bW4gYW5kIHRoZSBjb2x1bW4gaXMgYSBQb2ludGVyIG9yXG4gIC8vIGEgRGF0ZSwgdGhlbiB3ZSdsbCBjb252ZXJ0IHRoZSB2YWx1ZSBhcyBkZXNjcmliZWQgYWJvdmUuXG4gIC8vXG4gIC8vIEFzIG11Y2ggYXMgSSBoYXRlIHJlY3Vyc2lvbi4uLnRoaXMgc2VlbWVkIGxpa2UgYSBnb29kIGZpdCBmb3IgaXQuIFdlJ3JlIGVzc2VudGlhbGx5IHRyYXZlcnNpbmdcbiAgLy8gZG93biBhIHRyZWUgdG8gZmluZCBhIFwibGVhZiBub2RlXCIgYW5kIGNoZWNraW5nIHRvIHNlZSBpZiBpdCBuZWVkcyB0byBiZSBjb252ZXJ0ZWQuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChwaXBlbGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGlwZWxpbmVbZmllbGRdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8gUGFzcyBvYmplY3RzIGRvd24gdG8gTW9uZ29EQi4uLnRoaXMgaXMgbW9yZSB0aGFuIGxpa2VseSBhbiAkZXhpc3RzIG9wZXJhdG9yLlxuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gYCR7c2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3N9JCR7cGlwZWxpbmVbZmllbGRdfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUocGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBhYm92ZS4gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNvbWJpbmUgdGhlc2VcbiAgLy8gdHdvIGZ1bmN0aW9ucyBhbmQgbWFraW5nIHRoZSBjb2RlIGV2ZW4gaGFyZGVyIHRvIHVuZGVyc3RhbmQsIEkgZGVjaWRlZCB0byBzcGxpdCBpdCB1cC4gVGhlXG4gIC8vIGRpZmZlcmVuY2Ugd2l0aCB0aGlzIGZ1bmN0aW9uIGlzIHdlIGFyZSBub3QgdHJhbnNmb3JtaW5nIHRoZSB2YWx1ZXMsIG9ubHkgdGhlIGtleXMgb2YgdGhlXG4gIC8vIHBpcGVsaW5lLlxuICBfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIHR3byBhYm92ZS4gTW9uZ29EQiAkZ3JvdXAgYWdncmVnYXRlIGxvb2tzIGxpa2U6XG4gIC8vICAgICB7ICRncm91cDogeyBfaWQ6IDxleHByZXNzaW9uPiwgPGZpZWxkMT46IHsgPGFjY3VtdWxhdG9yMT4gOiA8ZXhwcmVzc2lvbjE+IH0sIC4uLiB9IH1cbiAgLy8gVGhlIDxleHByZXNzaW9uPiBjb3VsZCBiZSBhIGNvbHVtbiBuYW1lLCBwcmVmaXhlZCB3aXRoIHRoZSAnJCcgY2hhcmFjdGVyLiBXZSdsbCBsb29rIGZvclxuICAvLyB0aGVzZSA8ZXhwcmVzc2lvbj4gYW5kIGNoZWNrIHRvIHNlZSBpZiBpdCBpcyBhICdQb2ludGVyJyBvciBpZiBpdCdzIG9uZSBvZiBjcmVhdGVkQXQsXG4gIC8vIHVwZGF0ZWRBdCBvciBvYmplY3RJZCBhbmQgY2hhbmdlIGl0IGFjY29yZGluZ2x5LlxuICBfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHBpcGVsaW5lLnN1YnN0cmluZygxKTtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAkX3BfJHtmaWVsZH1gO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfY3JlYXRlZF9hdCc7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF91cGRhdGVkX2F0JztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIGF0dGVtcHQgdG8gY29udmVydCB0aGUgcHJvdmlkZWQgdmFsdWUgdG8gYSBEYXRlIG9iamVjdC4gU2luY2UgdGhpcyBpcyBwYXJ0XG4gIC8vIG9mIGFuIGFnZ3JlZ2F0aW9uIHBpcGVsaW5lLCB0aGUgdmFsdWUgY2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBpdCBjYW4gYmUgYW5vdGhlciBvYmplY3Qgd2l0aFxuICAvLyBhbiBvcGVyYXRvciBpbiBpdCAobGlrZSAkZ3QsICRsdCwgZXRjKS4gQmVjYXVzZSBvZiB0aGlzIEkgZmVsdCBpdCB3YXMgZWFzaWVyIHRvIG1ha2UgdGhpcyBhXG4gIC8vIHJlY3Vyc2l2ZSBtZXRob2QgdG8gdHJhdmVyc2UgZG93biB0byB0aGUgXCJsZWFmIG5vZGVcIiB3aGljaCBpcyBnb2luZyB0byBiZSB0aGUgc3RyaW5nLlxuICBfY29udmVydFRvRGF0ZSh2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiB2YWx1ZSkge1xuICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZSh2YWx1ZVtmaWVsZF0pO1xuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICBfcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZTogP3N0cmluZyk6ID9zdHJpbmcge1xuICAgIGlmIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgcmVhZFByZWZlcmVuY2UgPSByZWFkUHJlZmVyZW5jZS50b1VwcGVyQ2FzZSgpO1xuICAgIH1cbiAgICBzd2l0Y2ggKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICBjYXNlICdQUklNQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BSSU1BUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ05FQVJFU1QnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLk5FQVJFU1Q7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICBjYXNlIG51bGw6XG4gICAgICBjYXNlICcnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnTm90IHN1cHBvcnRlZCByZWFkIHByZWZlcmVuY2UuJyk7XG4gICAgfVxuICAgIHJldHVybiByZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleGVzKGluZGV4ZXMpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0ge1xuICAgICAgICBbZmllbGROYW1lXTogJzJkc3BoZXJlJyxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleChjbGFzc05hbWUsIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgICAgaWYgKCFxdWVyeVtmaWVsZE5hbWVdIHx8ICFxdWVyeVtmaWVsZE5hbWVdLiR0ZXh0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhpc3RpbmdJbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBleGlzdGluZ0luZGV4ZXMpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBleGlzdGluZ0luZGV4ZXNba2V5XTtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpbmRleCwgZmllbGROYW1lKSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgaW5kZXhOYW1lID0gYCR7ZmllbGROYW1lfV90ZXh0YDtcbiAgICAgIGNvbnN0IHRleHRJbmRleCA9IHtcbiAgICAgICAgW2luZGV4TmFtZV06IHsgW2ZpZWxkTmFtZV06ICd0ZXh0JyB9LFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHRleHRJbmRleCxcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzLFxuICAgICAgICBzY2hlbWEuZmllbGRzXG4gICAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDg1KSB7XG4gICAgICAgICAgLy8gSW5kZXggZXhpc3Qgd2l0aCBkaWZmZXJlbnQgb3B0aW9uc1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5pbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleChpbmRleCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wQWxsSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihjbGFzc2VzID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBjbGFzc2VzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oc2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbFNlY3Rpb24gPSB0aGlzLmNsaWVudC5zdGFydFNlc3Npb24oKTtcbiAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5zdGFydFRyYW5zYWN0aW9uKCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2VjdGlvbik7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY29tbWl0ID0gcmV0cmllcyA9PiB7XG4gICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb25cbiAgICAgICAgLmNvbW1pdFRyYW5zYWN0aW9uKClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuaGFzRXJyb3JMYWJlbCgnVHJhbnNpZW50VHJhbnNhY3Rpb25FcnJvcicpICYmIHJldHJpZXMgPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY29tbWl0KHJldHJpZXMgLSAxKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgcmV0dXJuIGNvbW1pdCg1KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5hYm9ydFRyYW5zYWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsZ0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLHNCQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxlQUFBLEdBQUFGLE9BQUE7QUFFQSxJQUFBRyxXQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxlQUFBLEdBQUFKLE9BQUE7QUFTQSxJQUFBSyxLQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFFQSxJQUFBTSxPQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxTQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUSxPQUFBLEdBQUFULHNCQUFBLENBQUFDLE9BQUE7QUFBcUMsU0FBQUQsdUJBQUFVLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxDQUFBLEVBQUFDLENBQUEs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