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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// -disable-next
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
const convertParseSchemaToMongoSchema = ({
  ...schema
}) => {
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
    const {
      type,
      targetClass,
      ...fieldOptions
    } = fields[fieldName];
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
    this._mongoOptions = {
      ...mongoOptions
    };
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
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result, schema)).catch(error => {
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
    const indexOptions = {
      ...defaultOptions,
      ...caseInsensitiveOptions,
      ...indexNameOptions,
      ...ttlOptions
    };
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImZpbHRlciIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiaW5kZXhPZiIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsInVuZGVmaW5lZCIsImZpZWxkTmFtZSIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZpZWxkT3B0aW9ucyIsIk1vbmdvU2NoZW1hQ29sbGVjdGlvbiIsInBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJmaWVsZHNfb3B0aW9ucyIsImNsYXNzX3Blcm1pc3Npb25zIiwidmFsaWRhdGVFeHBsYWluVmFsdWUiLCJleHBsYWluIiwiZXhwbGFpbkFsbG93ZWRWYWx1ZXMiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiZGVmYXVsdHMiLCJEZWZhdWx0TW9uZ29VUkkiLCJjb2xsZWN0aW9uUHJlZml4IiwibW9uZ29PcHRpb25zIiwiX3VyaSIsIl9tb25nb09wdGlvbnMiLCJfb25jaGFuZ2UiLCJfbWF4VGltZU1TIiwibWF4VGltZU1TIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24iLCJrZXkiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY29ubmVjdGlvblByb21pc2UiLCJlbmNvZGVkVXJpIiwiZm9ybWF0VXJsIiwicGFyc2VVcmwiLCJjbGllbnQiLCJvcHRpb25zIiwicyIsImRiIiwiZGJOYW1lIiwib24iLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImxvZ2dlciIsImhhbmRsZVNodXRkb3duIiwiY2xvc2UiLCJfYWRhcHRpdmVDb2xsZWN0aW9uIiwibmFtZSIsInJhd0NvbGxlY3Rpb24iLCJNb25nb0NvbGxlY3Rpb24iLCJfc2NoZW1hQ29sbGVjdGlvbiIsIl9zdHJlYW0iLCJfbW9uZ29Db2xsZWN0aW9uIiwiY2xhc3NFeGlzdHMiLCJsaXN0Q29sbGVjdGlvbnMiLCJ0b0FycmF5Iiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInNjaGVtYUNvbGxlY3Rpb24iLCJ1cGRhdGVTY2hlbWEiLCIkc2V0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwicmVzb2x2ZSIsIl9pZF8iLCJkZWxldGVQcm9taXNlcyIsImluc2VydGVkSW5kZXhlcyIsImZvckVhY2giLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicHVzaCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlcGxhY2UiLCJpbnNlcnRQcm9taXNlIiwiY3JlYXRlSW5kZXhlcyIsImFsbCIsInNldEluZGV4ZXNGcm9tTW9uZ28iLCJnZXRJbmRleGVzIiwicmVkdWNlIiwib2JqIiwiaW5kZXgiLCJfZnRzIiwiX2Z0c3giLCJ3ZWlnaHRzIiwiY3JlYXRlQ2xhc3MiLCJpbnNlcnRTY2hlbWEiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZGVsZXRlQ2xhc3MiLCJkcm9wIiwibWVzc2FnZSIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJkZWxldGVBbGxDbGFzc2VzIiwiZmFzdCIsIm1hcCIsImRlbGV0ZU1hbnkiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwibW9uZ29Gb3JtYXROYW1lcyIsImNvbGxlY3Rpb25VcGRhdGUiLCIkdW5zZXQiLCJjb2xsZWN0aW9uRmlsdGVyIiwiJG9yIiwiJGV4aXN0cyIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0Iiwib2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUiLCJpbnNlcnRPbmUiLCJvcHMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJ0cmFuc2Zvcm1XaGVyZSIsImRlbGV0ZWRDb3VudCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZSIsIm1vbmdvVXBkYXRlIiwidHJhbnNmb3JtVXBkYXRlIiwiZmluZE9uZUFuZFVwZGF0ZSIsInJldHVybkRvY3VtZW50Iiwic2Vzc2lvbiIsInJlc3VsdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsInVwc2VydE9uZU9iamVjdCIsInVwc2VydE9uZSIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiY29tbWVudCIsIm1vbmdvU29ydCIsIl8iLCJtYXBLZXlzIiwidmFsdWUiLCJ0cmFuc2Zvcm1LZXkiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiX2VzdGltYXRlIiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwic3RhZ2UiLCIkZ3JvdXAiLCJfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3MiLCIkbWF0Y2giLCJfcGFyc2VBZ2dyZWdhdGVBcmdzIiwiJHByb2plY3QiLCJfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyIsIiRnZW9OZWFyIiwicmVzdWx0cyIsInNwbGl0IiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdCIsInJldHJpZXMiLCJjb21taXRUcmFuc2FjdGlvbiIsImhhc0Vycm9yTGFiZWwiLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuICBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb246IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgbW9uZ29PcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fdXJpID0gdXJpO1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucyA9IHsgLi4ubW9uZ29PcHRpb25zIH07XG4gICAgdGhpcy5fb25jaGFuZ2UgPSAoKSA9PiB7IH07XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IG1vbmdvT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICB0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiA9ICEhbW9uZ29PcHRpb25zLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbXG4gICAgICAnZW5hYmxlU2NoZW1hSG9va3MnLFxuICAgICAgJ3NjaGVtYUNhY2hlVHRsJyxcbiAgICAgICdtYXhUaW1lTVMnLFxuICAgICAgJ2Rpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbicsXG4gICAgXSkge1xuICAgICAgZGVsZXRlIHRoaXMuX21vbmdvT3B0aW9uc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xpZW50Lm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG4gICAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICB9XG5cbiAgaGFuZGxlRXJyb3I8VD4oZXJyb3I6ID8oRXJyb3IgfCBQYXJzZS5FcnJvcikpOiBQcm9taXNlPFQ+IHtcbiAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gMTMpIHtcbiAgICAgIC8vIFVuYXV0aG9yaXplZCBlcnJvclxuICAgICAgZGVsZXRlIHRoaXMuY2xpZW50O1xuICAgICAgZGVsZXRlIHRoaXMuZGF0YWJhc2U7XG4gICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgIGxvZ2dlci5lcnJvcignUmVjZWl2ZWQgdW5hdXRob3JpemVkIGVycm9yJywgeyBlcnJvcjogZXJyb3IgfSk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmNsaWVudC5jbG9zZShmYWxzZSk7XG4gICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBfYWRhcHRpdmVDb2xsZWN0aW9uKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5kYXRhYmFzZS5jb2xsZWN0aW9uKHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lKSlcbiAgICAgIC50aGVuKHJhd0NvbGxlY3Rpb24gPT4gbmV3IE1vbmdvQ29sbGVjdGlvbihyYXdDb2xsZWN0aW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgICAgIHRoaXMuX3N0cmVhbSA9IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi53YXRjaCgpO1xuICAgICAgICAgIHRoaXMuX3N0cmVhbS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5fb25jaGFuZ2UoKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb25nb1NjaGVtYUNvbGxlY3Rpb24oY29sbGVjdGlvbik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5saXN0Q29sbGVjdGlvbnMoeyBuYW1lOiB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSB9KS50b0FycmF5KCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zJzogQ0xQcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuZHJvcEluZGV4KGNsYXNzTmFtZSwgbmFtZSk7XG4gICAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiAmJlxuICAgICAgICAgICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChcbiAgICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAgICBrZXkuaW5kZXhPZignX3BfJykgPT09IDAgPyBrZXkucmVwbGFjZSgnX3BfJywgJycpIDoga2V5XG4gICAgICAgICAgICApXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgbGV0IGluc2VydFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGluc2VydFByb21pc2UgPSB0aGlzLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoZGVsZXRlUHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiBpbnNlcnRQcm9taXNlKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGV4aXN0aW5nSW5kZXhlcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldEluZGV4ZXMoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oaW5kZXhlcyA9PiB7XG4gICAgICAgIGluZGV4ZXMgPSBpbmRleGVzLnJlZHVjZSgob2JqLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChpbmRleC5rZXkuX2Z0cykge1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzO1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzeDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gaW5kZXgud2VpZ2h0cykge1xuICAgICAgICAgICAgICBpbmRleC5rZXlbZmllbGRdID0gJ3RleHQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmpbaW5kZXgubmFtZV0gPSBpbmRleC5rZXk7XG4gICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfSwge30pO1xuICAgICAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBpbmRleGVzIH0sXG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIC8vIElnbm9yZSBpZiBjb2xsZWN0aW9uIG5vdCBmb3VuZFxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAoXG4gICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIHNjaGVtYS5pbmRleGVzXG4gICAgKTtcbiAgICBtb25nb09iamVjdC5faWQgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uaW5zZXJ0U2NoZW1hKG1vbmdvT2JqZWN0KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGNvbnN0IHNjaGVtYUNvbGxlY3Rpb24gPSBhd2FpdCB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCk7XG4gICAgYXdhaXQgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICB9XG5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5kcm9wKCkpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gJ25zIG5vdCBmb3VuZCcgbWVhbnMgY29sbGVjdGlvbiB3YXMgYWxyZWFkeSBnb25lLiBJZ25vcmUgZGVsZXRpb24gYXR0ZW1wdC5cbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSA9PSAnbnMgbm90IGZvdW5kJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLy8gV2UndmUgZHJvcHBlZCB0aGUgY29sbGVjdGlvbiwgbm93IHJlbW92ZSB0aGUgX1NDSEVNQSBkb2N1bWVudFxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5maW5kQW5kRGVsZXRlU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICk7XG4gIH1cblxuICBkZWxldGVBbGxDbGFzc2VzKGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyh0aGlzKS50aGVuKGNvbGxlY3Rpb25zID0+XG4gICAgICBQcm9taXNlLmFsbChcbiAgICAgICAgY29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb24gPT4gKGZhc3QgPyBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkoe30pIDogY29sbGVjdGlvbi5kcm9wKCkpKVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBQb2ludGVyIGZpZWxkIG5hbWVzIGFyZSBwYXNzZWQgZm9yIGxlZ2FjeSByZWFzb25zOiB0aGUgb3JpZ2luYWwgbW9uZ29cbiAgLy8gZm9ybWF0IHN0b3JlZCBwb2ludGVyIGZpZWxkIG5hbWVzIGRpZmZlcmVudGx5IGluIHRoZSBkYXRhYmFzZSwgYW5kIHRoZXJlZm9yZVxuICAvLyBuZWVkZWQgdG8ga25vdyB0aGUgdHlwZSBvZiB0aGUgZmllbGQgYmVmb3JlIGl0IGNvdWxkIGRlbGV0ZSBpdC4gRnV0dXJlIGRhdGFiYXNlXG4gIC8vIGFkYXB0ZXJzIHNob3VsZCBpZ25vcmUgdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGFyZ3VtZW50LiBBbGwgdGhlIGZpZWxkIG5hbWVzIGFyZSBpblxuICAvLyBmaWVsZE5hbWVzLCB0aGV5IHNob3cgdXAgYWRkaXRpb25hbGx5IGluIHRoZSBwb2ludGVyRmllbGROYW1lcyBkYXRhYmFzZSBmb3IgdXNlXG4gIC8vIGJ5IHRoZSBtb25nbyBhZGFwdGVyLCB3aGljaCBkZWFscyB3aXRoIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IG1vbmdvRm9ybWF0TmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGBfcF8ke2ZpZWxkTmFtZX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjb2xsZWN0aW9uVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvblVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sbGVjdGlvbkZpbHRlciA9IHsgJG9yOiBbXSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25GaWx0ZXJbJyRvciddLnB1c2goeyBbbmFtZV06IHsgJGV4aXN0czogdHJ1ZSB9IH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc2NoZW1hVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgZmllbGROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtuYW1lfWBdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkoY29sbGVjdGlvbkZpbHRlciwgY29sbGVjdGlvblVwZGF0ZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwgc2NoZW1hVXBkYXRlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBnZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8U3RvcmFnZUNsYXNzW10+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3M+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVE9ETzogQXMgeWV0IG5vdCBwYXJ0aWN1bGFybHkgd2VsbCBzcGVjaWZpZWQuIENyZWF0ZXMgYW4gb2JqZWN0LiBNYXliZSBzaG91bGRuJ3QgZXZlbiBuZWVkIHRoZSBzY2hlbWEsXG4gIC8vIGFuZCBzaG91bGQgaW5mZXIgZnJvbSB0aGUgdHlwZS4gT3IgbWF5YmUgZG9lcyBuZWVkIHRoZSBzY2hlbWEgZm9yIHZhbGlkYXRpb25zLiBPciBtYXliZSBuZWVkc1xuICAvLyB0aGUgc2NoZW1hIG9ubHkgZm9yIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LiBXZSdsbCBmaWd1cmUgdGhhdCBvdXQgbGF0ZXIuXG4gIGNyZWF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBvYmplY3Q6IGFueSwgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnkpIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uaW5zZXJ0T25lKG1vbmdvT2JqZWN0LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFttb25nb09iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvLyBEdXBsaWNhdGUgdmFsdWVcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLm1lc3NhZ2UubWF0Y2goL2luZGV4OltcXHNhLXpBLVowLTlfXFwtXFwuXStcXCQ/KFthLXpBLVpfLV0rKV8xLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkobW9uZ29XaGVyZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLnRoZW4oXG4gICAgICAgICh7IGRlbGV0ZWRDb3VudCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGRlbGV0ZWRDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0sXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRGF0YWJhc2UgYWRhcHRlciBlcnJvcicpO1xuICAgICAgICB9XG4gICAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEF0b21pY2FsbHkgZmluZHMgYW5kIHVwZGF0ZXMgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5maW5kT25lQW5kVXBkYXRlKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB7XG4gICAgICAgICAgcmV0dXJuRG9jdW1lbnQ6ICdhZnRlcicsXG4gICAgICAgICAgc2Vzc2lvbjogdHJhbnNhY3Rpb25hbFNlc3Npb24gfHwgdW5kZWZpbmVkLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIHJlc3VsdCwgc2NoZW1hKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5IHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwc2VydE9uZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBmaW5kLiBBY2NlcHRzOiBjbGFzc05hbWUsIHF1ZXJ5IGluIFBhcnNlIGZvcm1hdCwgYW5kIHsgc2tpcCwgbGltaXQsIHNvcnQgfS5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBzb3J0LFxuICAgICAga2V5cyxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgICBjb21tZW50LFxuICAgIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1NvcnQgPSBfLm1hcEtleXMoc29ydCwgKHZhbHVlLCBmaWVsZE5hbWUpID0+XG4gICAgICB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSlcbiAgICApO1xuICAgIGNvbnN0IG1vbmdvS2V5cyA9IF8ucmVkdWNlKFxuICAgICAga2V5cyxcbiAgICAgIChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vWydfcnBlcm0nXSA9IDE7XG4gICAgICAgICAgbWVtb1snX3dwZXJtJ10gPSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lbW9bdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwga2V5LCBzY2hlbWEpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgLy8gSWYgd2UgYXJlbid0IHJlcXVlc3RpbmcgdGhlIGBfaWRgIGZpZWxkLCB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgb3B0IG91dFxuICAgIC8vIG9mIGl0LiBEb2luZyBzbyBpbiBwYXJzZS1zZXJ2ZXIgaXMgdW51c3VhbCwgYnV0IGl0IGNhbiBhbGxvdyB1cyB0b1xuICAgIC8vIG9wdGltaXplIHNvbWUgcXVlcmllcyB3aXRoIGNvdmVyaW5nIGluZGV4ZXMuXG4gICAgaWYgKGtleXMgJiYgIW1vbmdvS2V5cy5faWQpIHtcbiAgICAgIG1vbmdvS2V5cy5faWQgPSAwO1xuICAgIH1cblxuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKG1vbmdvV2hlcmUsIHtcbiAgICAgICAgICBza2lwLFxuICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgIHNvcnQ6IG1vbmdvU29ydCxcbiAgICAgICAgICBrZXlzOiBtb25nb0tleXMsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICBjb21tZW50LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleENyZWF0aW9uUmVxdWVzdCwgaW5kZXhPcHRpb25zKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdCkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBfZXN0aW1hdGU6ID9ib29sZWFuLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBjb21tZW50OiA/c3RyaW5nXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmNvdW50KHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSwgdHJ1ZSksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhbixcbiAgICBjb21tZW50OiA/c3RyaW5nXG4gICkge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIGxldCBpc1BvaW50ZXJGaWVsZCA9IGZhbHNlO1xuICAgIHBpcGVsaW5lID0gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgc3RhZ2UuJGdyb3VwID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBzdGFnZS4kZ3JvdXApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZCAmJlxuICAgICAgICAgIHR5cGVvZiBzdGFnZS4kZ3JvdXAuX2lkID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQuaW5kZXhPZignJF9wXycpID49IDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgaXNQb2ludGVyRmllbGQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIHN0YWdlLiRtYXRjaCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRtYXRjaCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgc3RhZ2UuJHByb2plY3QgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYSwgc3RhZ2UuJHByb2plY3QpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRnZW9OZWFyICYmIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KSB7XG4gICAgICAgIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJGdlb05lYXIucXVlcnkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YWdlO1xuICAgIH0pO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uYWdncmVnYXRlKHBpcGVsaW5lLCB7XG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdfaWQnKSkge1xuICAgICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkICYmIHJlc3VsdC5faWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IHJlc3VsdC5faWQuc3BsaXQoJyQnKVsxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSBudWxsIHx8XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgIChbJ29iamVjdCcsICdzdHJpbmcnXS5pbmNsdWRlcyh0eXBlb2YgcmVzdWx0Ll9pZCkgJiYgXy5pc0VtcHR5KHJlc3VsdC5faWQpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gcmVzdWx0Ll9pZDtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHQuX2lkO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfSlcbiAgICAgIC50aGVuKG9iamVjdHMgPT4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjdXJzaXZlbHkgdHJhdmVyc2UgdGhlIHBpcGVsaW5lIGFuZCBjb252ZXJ0IGFueSBQb2ludGVyIG9yIERhdGUgY29sdW1ucy5cbiAgLy8gSWYgd2UgZGV0ZWN0IGEgcG9pbnRlciBjb2x1bW4gd2Ugd2lsbCByZW5hbWUgdGhlIGNvbHVtbiBiZWluZyBxdWVyaWVkIGZvciB0byBtYXRjaCB0aGUgY29sdW1uXG4gIC8vIGluIHRoZSBkYXRhYmFzZS4gV2UgYWxzbyBtb2RpZnkgdGhlIHZhbHVlIHRvIHdoYXQgd2UgZXhwZWN0IHRoZSB2YWx1ZSB0byBiZSBpbiB0aGUgZGF0YWJhc2VcbiAgLy8gYXMgd2VsbC5cbiAgLy8gRm9yIGRhdGVzLCB0aGUgZHJpdmVyIGV4cGVjdHMgYSBEYXRlIG9iamVjdCwgYnV0IHdlIGhhdmUgYSBzdHJpbmcgY29taW5nIGluLiBTbyB3ZSdsbCBjb252ZXJ0XG4gIC8vIHRoZSBzdHJpbmcgdG8gYSBEYXRlIHNvIHRoZSBkcml2ZXIgY2FuIHBlcmZvcm0gdGhlIG5lY2Vzc2FyeSBjb21wYXJpc29uLlxuICAvL1xuICAvLyBUaGUgZ29hbCBvZiB0aGlzIG1ldGhvZCBpcyB0byBsb29rIGZvciB0aGUgXCJsZWF2ZXNcIiBvZiB0aGUgcGlwZWxpbmUgYW5kIGRldGVybWluZSBpZiBpdCBuZWVkc1xuICAvLyB0byBiZSBjb252ZXJ0ZWQuIFRoZSBwaXBlbGluZSBjYW4gaGF2ZSBhIGZldyBkaWZmZXJlbnQgZm9ybXMuIEZvciBtb3JlIGRldGFpbHMsIHNlZTpcbiAgLy8gICAgIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL29wZXJhdG9yL2FnZ3JlZ2F0aW9uL1xuICAvL1xuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gYXJyYXksIGl0IG1lYW5zIHdlIGFyZSBwcm9iYWJseSBwYXJzaW5nIGFuICckYW5kJyBvciAnJG9yJyBvcGVyYXRvci4gSW5cbiAgLy8gdGhhdCBjYXNlIHdlIG5lZWQgdG8gbG9vcCB0aHJvdWdoIGFsbCBvZiBpdCdzIGNoaWxkcmVuIHRvIGZpbmQgdGhlIGNvbHVtbnMgYmVpbmcgb3BlcmF0ZWQgb24uXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBvYmplY3QsIHRoZW4gd2UnbGwgbG9vcCB0aHJvdWdoIHRoZSBrZXlzIGNoZWNraW5nIHRvIHNlZSBpZiB0aGUga2V5IG5hbWVcbiAgLy8gbWF0Y2hlcyBvbmUgb2YgdGhlIHNjaGVtYSBjb2x1bW5zLiBJZiBpdCBkb2VzIG1hdGNoIGEgY29sdW1uIGFuZCB0aGUgY29sdW1uIGlzIGEgUG9pbnRlciBvclxuICAvLyBhIERhdGUsIHRoZW4gd2UnbGwgY29udmVydCB0aGUgdmFsdWUgYXMgZGVzY3JpYmVkIGFib3ZlLlxuICAvL1xuICAvLyBBcyBtdWNoIGFzIEkgaGF0ZSByZWN1cnNpb24uLi50aGlzIHNlZW1lZCBsaWtlIGEgZ29vZCBmaXQgZm9yIGl0LiBXZSdyZSBlc3NlbnRpYWxseSB0cmF2ZXJzaW5nXG4gIC8vIGRvd24gYSB0cmVlIHRvIGZpbmQgYSBcImxlYWYgbm9kZVwiIGFuZCBjaGVja2luZyB0byBzZWUgaWYgaXQgbmVlZHMgdG8gYmUgY29udmVydGVkLlxuICBfcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAocGlwZWxpbmUgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBpcGVsaW5lW2ZpZWxkXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIC8vIFBhc3Mgb2JqZWN0cyBkb3duIHRvIE1vbmdvREIuLi50aGlzIGlzIG1vcmUgdGhhbiBsaWtlbHkgYW4gJGV4aXN0cyBvcGVyYXRvci5cbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IGAke3NjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzfSQke3BpcGVsaW5lW2ZpZWxkXX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSBvbmUgYWJvdmUuIFJhdGhlciB0aGFuIHRyeWluZyB0byBjb21iaW5lIHRoZXNlXG4gIC8vIHR3byBmdW5jdGlvbnMgYW5kIG1ha2luZyB0aGUgY29kZSBldmVuIGhhcmRlciB0byB1bmRlcnN0YW5kLCBJIGRlY2lkZWQgdG8gc3BsaXQgaXQgdXAuIFRoZVxuICAvLyBkaWZmZXJlbmNlIHdpdGggdGhpcyBmdW5jdGlvbiBpcyB3ZSBhcmUgbm90IHRyYW5zZm9ybWluZyB0aGUgdmFsdWVzLCBvbmx5IHRoZSBrZXlzIG9mIHRoZVxuICAvLyBwaXBlbGluZS5cbiAgX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSB0d28gYWJvdmUuIE1vbmdvREIgJGdyb3VwIGFnZ3JlZ2F0ZSBsb29rcyBsaWtlOlxuICAvLyAgICAgeyAkZ3JvdXA6IHsgX2lkOiA8ZXhwcmVzc2lvbj4sIDxmaWVsZDE+OiB7IDxhY2N1bXVsYXRvcjE+IDogPGV4cHJlc3Npb24xPiB9LCAuLi4gfSB9XG4gIC8vIFRoZSA8ZXhwcmVzc2lvbj4gY291bGQgYmUgYSBjb2x1bW4gbmFtZSwgcHJlZml4ZWQgd2l0aCB0aGUgJyQnIGNoYXJhY3Rlci4gV2UnbGwgbG9vayBmb3JcbiAgLy8gdGhlc2UgPGV4cHJlc3Npb24+IGFuZCBjaGVjayB0byBzZWUgaWYgaXQgaXMgYSAnUG9pbnRlcicgb3IgaWYgaXQncyBvbmUgb2YgY3JlYXRlZEF0LFxuICAvLyB1cGRhdGVkQXQgb3Igb2JqZWN0SWQgYW5kIGNoYW5nZSBpdCBhY2NvcmRpbmdseS5cbiAgX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgZmllbGQgPSBwaXBlbGluZS5zdWJzdHJpbmcoMSk7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJF9wXyR7ZmllbGR9YDtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX2NyZWF0ZWRfYXQnO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfdXBkYXRlZF9hdCc7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCBhdHRlbXB0IHRvIGNvbnZlcnQgdGhlIHByb3ZpZGVkIHZhbHVlIHRvIGEgRGF0ZSBvYmplY3QuIFNpbmNlIHRoaXMgaXMgcGFydFxuICAvLyBvZiBhbiBhZ2dyZWdhdGlvbiBwaXBlbGluZSwgdGhlIHZhbHVlIGNhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgaXQgY2FuIGJlIGFub3RoZXIgb2JqZWN0IHdpdGhcbiAgLy8gYW4gb3BlcmF0b3IgaW4gaXQgKGxpa2UgJGd0LCAkbHQsIGV0YykuIEJlY2F1c2Ugb2YgdGhpcyBJIGZlbHQgaXQgd2FzIGVhc2llciB0byBtYWtlIHRoaXMgYVxuICAvLyByZWN1cnNpdmUgbWV0aG9kIHRvIHRyYXZlcnNlIGRvd24gdG8gdGhlIFwibGVhZiBub2RlXCIgd2hpY2ggaXMgZ29pbmcgdG8gYmUgdGhlIHN0cmluZy5cbiAgX2NvbnZlcnRUb0RhdGUodmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gdmFsdWUpIHtcbiAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhlcyhpbmRleGVzKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGlmICh0eXBlICYmIHR5cGUudHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHtcbiAgICAgICAgW2ZpZWxkTmFtZV06ICcyZHNwaGVyZScsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlSW5kZXgoY2xhc3NOYW1lLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUsIHNjaGVtYTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnlbZmllbGROYW1lXSB8fCAhcXVlcnlbZmllbGROYW1lXS4kdGV4dCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXhpc3RpbmdJbmRleGVzKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhpc3RpbmdJbmRleGVzW2tleV07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5kZXgsIGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGluZGV4TmFtZSA9IGAke2ZpZWxkTmFtZX1fdGV4dGA7XG4gICAgICBjb25zdCB0ZXh0SW5kZXggPSB7XG4gICAgICAgIFtpbmRleE5hbWVdOiB7IFtmaWVsZE5hbWVdOiAndGV4dCcgfSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0ZXh0SW5kZXgsXG4gICAgICAgIGV4aXN0aW5nSW5kZXhlcyxcbiAgICAgICAgc2NoZW1hLmZpZWxkc1xuICAgICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uaW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEFsbEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oY2xhc3NlcyA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gY2xhc3Nlcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbW1pdCA9IHJldHJpZXMgPT4ge1xuICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uXG4gICAgICAgIC5jb21taXRUcmFuc2FjdGlvbigpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmhhc0Vycm9yTGFiZWwoJ1RyYW5zaWVudFRyYW5zYWN0aW9uRXJyb3InKSAmJiByZXRyaWVzID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbW1pdChyZXRyaWVzIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHJldHVybiBjb21taXQoNSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb24uYWJvcnRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLElBQUFBLGdCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxzQkFBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZUFBQSxHQUFBRixPQUFBO0FBRUEsSUFBQUcsV0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksZUFBQSxHQUFBSixPQUFBO0FBU0EsSUFBQUssS0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFB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