"use strict";

var _node = require("parse/node");
var _lodash = _interopRequireDefault(require("lodash"));
var _intersect = _interopRequireDefault(require("intersect"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _logger = _interopRequireDefault(require("../logger"));
var _Utils = _interopRequireDefault(require("../Utils"));
var SchemaController = _interopRequireWildcard(require("./SchemaController"));
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
const _excluded = ["ACL"],
  _excluded2 = ["_rperm", "_wperm"]; // A database adapter that works with data exported from the hosted
// Parse database.
// -disable-next
// -disable-next
// -disable-next
// -disable-next
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var s = Object.getOwnPropertySymbols(e); for (r = 0; r < s.length; r++) o = s[r], t.includes(o) || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.includes(n)) continue; t[n] = r[n]; } return t; }
function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}
function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
const transformObjectACL = _ref => {
  let {
      ACL
    } = _ref,
    result = _objectWithoutProperties(_ref, _excluded);
  if (!ACL) {
    return result;
  }
  result._wperm = [];
  result._rperm = [];
  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }
    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }
  return result;
};
const specialQueryKeys = ['$and', '$or', '$nor', '_rperm', '_wperm'];
const specialMasterQueryKeys = [...specialQueryKeys, '_email_verify_token', '_perishable_token', '_tombstone', '_email_verify_token_expires_at', '_failed_login_count', '_account_lockout_expires_at', '_password_changed_at', '_password_history'];
const validateQuery = (query, isMaster, isMaintenance, update) => {
  if (isMaintenance) {
    isMaster = true;
  }
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }
  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }
  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(value => validateQuery(value, isMaster, isMaintenance, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }
  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }
    if (!key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/) && (!specialQueryKeys.includes(key) && !isMaster && !update || update && isMaster && !specialMasterQueryKeys.includes(key))) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, isMaintenance, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id;

  // replace protectedFields when using pointer-permissions
  const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : {};
  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;
    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields).filter(key => key.startsWith('userField:')).map(key => {
        return {
          key: key.substring(10),
          value: perms.protectedFields[key]
        };
      });
      const newProtectedFields = [];
      let overrideProtectedFields = false;

      // check if the object grants the current user access based on the extracted fields
      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];
        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(user => user.objectId && user.objectId === userId);
          } else {
            pointerPermIncludesUser = readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }
        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(pointerPerm.value);
        }
      });

      // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C
      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      }
      // intersect all sets of protectedFields
      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }
  const isUserClass = className === '_User';
  if (isUserClass) {
    object.password = object._hashed_password;
    delete object._hashed_password;
    delete object.sessionToken;
  }
  if (isMaintenance) {
    return object;
  }

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    var _perms$protectedField;
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    // but were needed to apply protectedFields
    perms === null || perms === void 0 || (_perms$protectedField = perms.protectedFields) === null || _perms$protectedField === void 0 || (_perms$protectedField = _perms$protectedField.temporaryKeys) === null || _perms$protectedField === void 0 || _perms$protectedField.forEach(k => delete object[k]);
  }
  for (const key in object) {
    if (key.charAt(0) === '_') {
      delete object[key];
    }
  }
  if (!isUserClass || isMaster) {
    return object;
  }
  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }
  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];
const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};
function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}
const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].amount;
          break;
        case 'SetOnInsert':
          object[key] = object[key].amount;
          break;
        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = [];
          break;
        case 'Delete':
          delete object[key];
          break;
        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};
const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;
      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
};
// Transforms a Database format ACL to a REST API format ACL
const untransformObjectACL = _ref2 => {
  let {
      _rperm,
      _wperm
    } = _ref2,
    output = _objectWithoutProperties(_ref2, _excluded2);
  if (_rperm || _wperm) {
    output.ACL = {};
    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });
    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }
  return output;
};

/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */
const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};
const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};
const convertEmailToLowercase = (object, className, options) => {
  if (className === '_User' && options.convertEmailToLowercase) {
    if (typeof object['email'] === 'string') {
      object['email'] = object['email'].toLowerCase();
    }
  }
};
const convertUsernameToLowercase = (object, className, options) => {
  if (className === '_User' && options.convertUsernameToLowercase) {
    if (typeof object['username'] === 'string') {
      object['username'] = object['username'].toLowerCase();
    }
  }
};
class DatabaseController {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = options || {};
    this.idempotencyOptions = this.options.idempotencyOptions || {};
    // Prevent mutable this.schema, otherwise one request could use
    // multiple schemas, so instead use loadSchema to get a schema.
    this.schemaPromise = null;
    this._transactionalSession = null;
    this.options = options;
  }
  collectionExists(className) {
    return this.adapter.classExists(className);
  }
  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }
  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }
    return Promise.resolve();
  }

  // Returns a promise for a schemaController.
  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }
    this.schemaPromise = SchemaController.load(this.adapter, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }
  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  }

  // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface
  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);
      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }
      return className;
    });
  }

  // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.
  validateObject(className, object, query, runOptions, maintenance) {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;
      if (isMaster) {
        return Promise.resolve();
      }
      return this.canAddField(schema, className, object, aclGroup, runOptions);
    }).then(() => {
      return schema.validateObject(className, object, query, maintenance);
    });
  }
  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    try {
      _Utils.default.checkProhibitedKeywords(this.options, update);
    } catch (error) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, error));
    }
    const originalQuery = query;
    const originalUpdate = update;
    // Make a copy of the object, so we don't mutate the incoming data.
    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
          if (addsField) {
            query = {
              $and: [query, this.addPointerPermissions(schemaController, className, 'addField', query, aclGroup)]
            };
          }
        }
        if (!query) {
          return Promise.resolve();
        }
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, false, true);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }
          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
            const rootFieldName = getRootFieldName(fieldName);
            if (!SchemaController.fieldNameIsValid(rootFieldName, className) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });
          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }
          update = transformObjectACL(update);
          convertEmailToLowercase(update, className, this.options);
          convertUsernameToLowercase(update, className, this.options);
          transformAuthData(className, update, schema);
          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }
              return {};
            });
          }
          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update, this._transactionalSession);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update, this._transactionalSession);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update, this._transactionalSession);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        if (validateOnly) {
          return result;
        }
        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }
        return this._sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  }

  // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.
  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;
    var process = (op, key) => {
      if (!op) {
        return;
      }
      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }
      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }
      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };
    for (const key in update) {
      process(update[key], key);
    }
    for (const key of deleteMe) {
      delete update[key];
    }
    return ops;
  }

  // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed
  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }
      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }
      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  }

  // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.
  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  }

  // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.
  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc, this._transactionalSession).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }
      throw error;
    });
  }

  // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.
  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);
          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        }
        // delete by query
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, false, false);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }
          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query, this._transactionalSession)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }
          throw error;
        });
      });
    });
  }

  // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.
  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    try {
      _Utils.default.checkProhibitedKeywords(this.options, object);
    } catch (error) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, error));
    }
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    convertEmailToLowercase(object, className, this.options);
    convertUsernameToLowercase(object, className, this.options);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);
        if (validateOnly) {
          return {};
        }
        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object, this._transactionalSession);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }
        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return this._sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }
  canAddField(schema, className, object, aclGroup, runOptions) {
    const classSchema = schema.schemaData[className];
    if (!classSchema) {
      return Promise.resolve();
    }
    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }
      return schemaFields.indexOf(getRootFieldName(field)) < 0;
    });
    if (newKeys.length > 0) {
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;
      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
    }
    return Promise.resolve();
  }

  // Won't delete collections in the system namespace
  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */
  deleteEverything(fast = false) {
    this.schemaPromise = null;
    _SchemaCache.default.clear();
    return this.adapter.deleteAllClasses(fast);
  }

  // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.
  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};
    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  }

  // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.
  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  }

  // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated
  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    const promises = [];
    if (query['$or']) {
      const ors = query['$or'];
      promises.push(...ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      }));
    }
    if (query['$and']) {
      const ands = query['$and'];
      promises.push(...ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
        });
      }));
    }
    const otherKeys = Object.keys(query).map(key => {
      if (key === '$and' || key === '$or') {
        return;
      }
      const t = schema.getExpectedType(className, key);
      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }
      let queries = null;
      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;
          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }
          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      }

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independently to build the list of
      // $in / $nin
      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }
        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }
          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all([...promises, ...otherKeys]).then(() => {
      return Promise.resolve(query);
    });
  }

  // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated
  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }
    if (query['$and']) {
      return Promise.all(query['$and'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }
    var relatedTo = query['$relatedTo'];
    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }
  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

    // -disable-next
    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];
    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    }

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }
    query.objectId['$in'] = idsIntersection;
    return query;
  }
  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null);

    // make a set and spread to remove duplicates
    allIds = [...new Set(allIds)];

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }
    query.objectId['$nin'] = allIds;
    return query;
  }

  // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  //  caseInsensitive make string comparisons case insensitive
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.
  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference,
    hint,
    caseInsensitive = false,
    explain,
    comment
  } = {}, auth = {}, validSchemaController) {
    const isMaintenance = auth.isMaintenance;
    const isMaster = acl === undefined || isMaintenance;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
    // Count operation if counting
    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }
        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }
        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }
        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference,
          hint,
          caseInsensitive: this.options.enableCollationCaseComparison ? false : caseInsensitive,
          explain,
          comment
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }
          const rootFieldName = getRootFieldName(fieldName);
          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
          if (!schema.fields[fieldName.split('.')[0]] && fieldName !== 'score') {
            delete sort[fieldName];
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;
          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
            /* Don't use projections to optimize the protectedFields since the protectedFields
              based on pointer-permissions are determined after querying. The filtering can
              overwrite the protected fields. */
            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth, queryOptions);
          }
          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }
          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }
          validateQuery(query, isMaster, isMaintenance, false);
          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint, comment);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain, comment);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, isMaintenance, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }
  deleteSchema(className) {
    let schemaController;
    return this.loadSchema({
      clearCache: true
    }).then(s => {
      schemaController = s;
      return schemaController.getOneSchema(className, true);
    }).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }
        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            _SchemaCache.default.del(className);
            return schemaController.reloadData();
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  }

  // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json
  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  }

  // Naive logic reducer for OR operations meant to be used only for pointer permissions.
  reduceOrOperation(query) {
    if (!query.$or) {
      return query;
    }
    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$or.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$or[0]);
      delete query.$or;
    }
    return query;
  }

  // Naive logic reducer for AND operations meant to be used only for pointer permissions.
  reduceAndOperation(query) {
    if (!query.$and) {
      return query;
    }
    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$and.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$and[0]);
      delete query.$and;
    }
    return query;
  }

  // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)
  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }
    const perms = schema.getClassLevelPermissions(className);
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });
    const groupKey = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const permFields = [];
    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }
    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    }
    // the ACL should have exactly 1 user
    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }
      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType = fieldDescriptor && typeof fieldDescriptor === 'object' && Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type') ? fieldDescriptor.type : null;
        let queryClause;
        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = {
            [key]: userPointer
          };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = {
            [key]: {
              $all: [userPointer]
            }
          };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = {
            [key]: userPointer
          };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(`An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`);
        }
        // if we already have a constraint on the key, use the $and
        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        }
        // otherwise just add the constaint
        return Object.assign({}, query, queryClause);
      });
      return queries.length === 1 ? queries[0] : this.reduceOrOperation({
        $or: queries
      });
    } else {
      return query;
    }
  }
  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}, queryOptions = {}) {
    const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : schema;
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null;

    // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'
    const preserveKeys = queryOptions.keys;

    // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)
    const serverOnlyKeys = [];
    const authenticated = auth.user;

    // map to allow check without array search
    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {});

    // array of sets of protected fields. separate item for each applicable criteria
    const protectedKeysSets = [];
    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);
          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName);
            // 2. preserve it delete later
            serverOnlyKeys.push(fieldName);
          }
        }
        continue;
      }

      // add public tier
      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }
      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }
        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    }

    // check if there's a rule for current user's id
    if (authenticated) {
      const userId = auth.user.id;
      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    }

    // preserve fields to be removed before sending response to client
    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }
    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }
      return acc;
    }, []);

    // intersect all sets of protectedFields
    protectedKeysSets.forEach(fields => {
      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  }
  createTransactionalSession() {
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    });
  }
  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }
    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }
  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }
    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.
  async performInitialization() {
    await this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    const requiredUserFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const requiredIdempotencyFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Idempotency)
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);
      throw error;
    });
    if (!this.options.enableCollationCaseComparison) {
      await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
        _logger.default.warn('Unable to create case insensitive username index: ', error);
        throw error;
      });
      await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
        _logger.default.warn('Unable to create case insensitive email index: ', error);
        throw error;
      });
    }
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);
      throw error;
    });
    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);
      throw error;
    });
    await this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);
      throw error;
    });
    const isMongoAdapter = this.adapter instanceof _MongoStorageAdapter.default;
    const isPostgresAdapter = this.adapter instanceof _PostgresStorageAdapter.default;
    if (isMongoAdapter || isPostgresAdapter) {
      let options = {};
      if (isMongoAdapter) {
        options = {
          ttl: 0
        };
      } else if (isPostgresAdapter) {
        options = this.idempotencyOptions;
        options.setIdempotencyFunction = true;
      }
      await this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, options).catch(error => {
        _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);
        throw error;
      });
    }
    await this.adapter.updateSchemaWithIndexes();
  }
  _expandResultOnKeyPath(object, key, value) {
    if (key.indexOf('.') < 0) {
      object[key] = value[key];
      return object;
    }
    const path = key.split('.');
    const firstKey = path[0];
    const nextPath = path.slice(1).join('.');

    // Scan request data for denied keywords
    if (this.options && this.options.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of this.options.requestKeywordDenylist) {
        const match = _Utils.default.objectContainsKeyValue({
          [firstKey]: true,
          [nextPath]: true
        }, keyword.key, true);
        if (match) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
        }
      }
    }
    object[firstKey] = this._expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
    delete object[key];
    return object;
  }
  _sanitizeDatabaseResult(originalObject, result) {
    const response = {};
    if (!result) {
      return Promise.resolve(response);
    }
    Object.keys(originalObject).forEach(key => {
      const keyUpdate = originalObject[key];
      // determine if that was an op
      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment', 'SetOnInsert'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
        // Revert array to object conversion on dot notation for arrays (e.g. "field.0.key")
        if (key.includes('.')) {
          const [field, index] = key.split('.');
          const isArrayIndex = Array.from(index).every(c => c >= '0' && c <= '9');
          if (isArrayIndex && Array.isArray(result[field]) && !Array.isArray(response[field])) {
            response[field] = result[field];
          }
        }
      }
    });
    return Promise.resolve(response);
  }
}
module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9pbnRlcnNlY3QiLCJfZGVlcGNvcHkiLCJfbG9nZ2VyIiwiX1V0aWxzIiwiU2NoZW1hQ29udHJvbGxlciIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX01vbmdvU3RvcmFnZUFkYXB0ZXIiLCJfUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsIl9TY2hlbWFDYWNoZSIsIl9leGNsdWRlZCIsIl9leGNsdWRlZDIiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJlIiwiV2Vha01hcCIsInIiLCJ0IiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJuIiwiX19wcm90b19fIiwiYSIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwidSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImkiLCJzZXQiLCJvd25LZXlzIiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiVHlwZUVycm9yIiwiU3RyaW5nIiwiTnVtYmVyIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzIiwiaW5jbHVkZXMiLCJwcm9wZXJ0eUlzRW51bWVyYWJsZSIsImFkZFdyaXRlQUNMIiwicXVlcnkiLCJhY2wiLCJuZXdRdWVyeSIsIl8iLCJjbG9uZURlZXAiLCJfd3Blcm0iLCIkaW4iLCJhZGRSZWFkQUNMIiwiX3JwZXJtIiwidHJhbnNmb3JtT2JqZWN0QUNMIiwiX3JlZiIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsIndyaXRlIiwic3BlY2lhbFF1ZXJ5S2V5cyIsInNwZWNpYWxNYXN0ZXJRdWVyeUtleXMiLCJ2YWxpZGF0ZVF1ZXJ5IiwiaXNNYXN0ZXIiLCJpc01haW50ZW5hbmNlIiwidXBkYXRlIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsIiRhbmQiLCIkbm9yIiwia2V5IiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJpbmRleE9mIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpc1VzZXJDbGFzcyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9wZXJtcyRwcm90ZWN0ZWRGaWVsZCIsImsiLCJ0ZW1wb3JhcnlLZXlzIiwiY2hhckF0IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIl9yZWYyIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInNwbGl0IiwicmVsYXRpb25TY2hlbWEiLCJyZWxhdGVkSWQiLCJvd25pbmdJZCIsImNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlIiwib3B0aW9ucyIsInRvTG93ZXJDYXNlIiwiY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsImNsYXNzTmFtZUlzVmFsaWQiLCJQcm9taXNlIiwicmVqZWN0IiwiSU5WQUxJRF9DTEFTU19OQU1FIiwicmVzb2x2ZSIsImNsZWFyQ2FjaGUiLCJsb2FkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsIm1haW50ZW5hbmNlIiwidW5kZWZpbmVkIiwiY2FuQWRkRmllbGQiLCJtYW55IiwidXBzZXJ0IiwiYWRkc0ZpZWxkIiwic2tpcFNhbml0aXphdGlvbiIsInZhbGlkYXRlT25seSIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsIlV0aWxzIiwiY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMiLCJlcnJvciIsIm9yaWdpbmFsUXVlcnkiLCJvcmlnaW5hbFVwZGF0ZSIsImRlZXBjb3B5IiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwicHJvbWlzZXMiLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJvdGhlcktleXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJxIiwiaWRzIiwiYWRkTm90SW5PYmplY3RJZHNJZHMiLCJhZGRJbk9iamVjdElkc0lkcyIsInJlZHVjZVJlbGF0aW9uS2V5cyIsInJlbGF0ZWRUbyIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiY29tbWVudCIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJlbmFibGVDb2xsYXRpb25DYXNlQ29tcGFyaXNvbiIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJqb2luIiwicmVkdWNlT3JPcGVyYXRpb24iLCJyZXBlYXQiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJlbnN1cmVJbmRleCIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIl9leHBhbmRSZXN1bHRPbktleVBhdGgiLCJwYXRoIiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwicmVzcG9uc2UiLCJrZXlVcGRhdGUiLCJpc0FycmF5SW5kZXgiLCJmcm9tIiwiZXZlcnkiLCJjIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyLvu78vLyBAZmxvd1xuLy8gQSBkYXRhYmFzZSBhZGFwdGVyIHRoYXQgd29ya3Mgd2l0aCBkYXRhIGV4cG9ydGVkIGZyb20gdGhlIGhvc3RlZFxuLy8gUGFyc2UgZGF0YWJhc2UuXG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGludGVyc2VjdCBmcm9tICdpbnRlcnNlY3QnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0IHR5cGUgeyBRdWVyeU9wdGlvbnMsIEZ1bGxRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcblxuZnVuY3Rpb24gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCkge1xuICBjb25zdCBuZXdRdWVyeSA9IF8uY2xvbmVEZWVwKHF1ZXJ5KTtcbiAgLy9DYW4ndCBiZSBhbnkgZXhpc3RpbmcgJ193cGVybScgcXVlcnksIHdlIGRvbid0IGFsbG93IGNsaWVudCBxdWVyaWVzIG9uIHRoYXQsIG5vIG5lZWQgdG8gJGFuZFxuICBuZXdRdWVyeS5fd3Blcm0gPSB7ICRpbjogW251bGwsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG5mdW5jdGlvbiBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfcnBlcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3JwZXJtID0geyAkaW46IFtudWxsLCAnKicsIC4uLmFjbF0gfTtcbiAgcmV0dXJuIG5ld1F1ZXJ5O1xufVxuXG4vLyBUcmFuc2Zvcm1zIGEgUkVTVCBBUEkgZm9ybWF0dGVkIEFDTCBvYmplY3QgdG8gb3VyIHR3by1maWVsZCBtb25nbyBmb3JtYXQuXG5jb25zdCB0cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBBQ0wsIC4uLnJlc3VsdCB9KSA9PiB7XG4gIGlmICghQUNMKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJlc3VsdC5fd3Blcm0gPSBbXTtcbiAgcmVzdWx0Ll9ycGVybSA9IFtdO1xuXG4gIGZvciAoY29uc3QgZW50cnkgaW4gQUNMKSB7XG4gICAgaWYgKEFDTFtlbnRyeV0ucmVhZCkge1xuICAgICAgcmVzdWx0Ll9ycGVybS5wdXNoKGVudHJ5KTtcbiAgICB9XG4gICAgaWYgKEFDTFtlbnRyeV0ud3JpdGUpIHtcbiAgICAgIHJlc3VsdC5fd3Blcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBzcGVjaWFsUXVlcnlLZXlzID0gWyckYW5kJywgJyRvcicsICckbm9yJywgJ19ycGVybScsICdfd3Blcm0nXTtcbmNvbnN0IHNwZWNpYWxNYXN0ZXJRdWVyeUtleXMgPSBbXG4gIC4uLnNwZWNpYWxRdWVyeUtleXMsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ190b21ic3RvbmUnLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IHZhbGlkYXRlUXVlcnkgPSAoXG4gIHF1ZXJ5OiBhbnksXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICB1cGRhdGU6IGJvb2xlYW5cbik6IHZvaWQgPT4ge1xuICBpZiAoaXNNYWludGVuYW5jZSkge1xuICAgIGlzTWFzdGVyID0gdHJ1ZTtcbiAgfVxuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2godmFsdWUgPT4gdmFsaWRhdGVRdWVyeSh2YWx1ZSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIHVwZGF0ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0JhZCAkb3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kYW5kKSB7XG4gICAgaWYgKHF1ZXJ5LiRhbmQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJGFuZC5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCBpc01haW50ZW5hbmNlLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRub3IgZm9ybWF0IC0gdXNlIGFuIGFycmF5IG9mIGF0IGxlYXN0IDEgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmIChxdWVyeSAmJiBxdWVyeVtrZXldICYmIHF1ZXJ5W2tleV0uJHJlZ2V4KSB7XG4gICAgICBpZiAodHlwZW9mIHF1ZXJ5W2tleV0uJG9wdGlvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcXVlcnlba2V5XS4kb3B0aW9ucy5tYXRjaCgvXltpbXhzXSskLykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgYEJhZCAkb3B0aW9ucyB2YWx1ZSBmb3IgcXVlcnk6ICR7cXVlcnlba2V5XS4kb3B0aW9uc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoXG4gICAgICAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pICYmXG4gICAgICAoKCFzcGVjaWFsUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkgJiYgIWlzTWFzdGVyICYmICF1cGRhdGUpIHx8XG4gICAgICAgICh1cGRhdGUgJiYgaXNNYXN0ZXIgJiYgIXNwZWNpYWxNYXN0ZXJRdWVyeUtleXMuaW5jbHVkZXMoa2V5KSkpXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBpc01haW50ZW5hbmNlOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSA6IHt9O1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG4gIGlmIChpc1VzZXJDbGFzcykge1xuICAgIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3QuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBkZWxldGUgb2JqZWN0LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIGlmIChpc01haW50ZW5hbmNlKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvLyBidXQgd2VyZSBuZWVkZWQgdG8gYXBwbHkgcHJvdGVjdGVkRmllbGRzXG4gICAgcGVybXM/LnByb3RlY3RlZEZpZWxkcz8udGVtcG9yYXJ5S2V5cz8uZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJykge1xuICAgICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNVc2VyQ2xhc3MgfHwgaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKGFjbEdyb3VwLmluZGV4T2Yob2JqZWN0Lm9iamVjdElkKSA+IC0xKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0LmF1dGhEYXRhO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuLy8gUnVucyBhbiB1cGRhdGUgb24gdGhlIGRhdGFiYXNlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGFuIG9iamVjdCB3aXRoIHRoZSBuZXcgdmFsdWVzIGZvciBmaWVsZFxuLy8gbW9kaWZpY2F0aW9ucyB0aGF0IGRvbid0IGtub3cgdGhlaXIgcmVzdWx0cyBhaGVhZCBvZiB0aW1lLCBsaWtlXG4vLyAnaW5jcmVtZW50Jy5cbi8vIE9wdGlvbnM6XG4vLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbi8vICAgICAgICAgb25lIG9mIHRoZSBwcm92aWRlZCBzdHJpbmdzIG11c3QgcHJvdmlkZSB0aGUgY2FsbGVyIHdpdGhcbi8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG5jb25zdCBzcGVjaWFsS2V5c0ZvclVwZGF0ZSA9IFtcbiAgJ19oYXNoZWRfcGFzc3dvcmQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgJ19mYWlsZWRfbG9naW5fY291bnQnLFxuICAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxVcGRhdGVLZXkgPSBrZXkgPT4ge1xuICByZXR1cm4gc3BlY2lhbEtleXNGb3JVcGRhdGUuaW5kZXhPZihrZXkpID49IDA7XG59O1xuXG5mdW5jdGlvbiBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSB7XG4gIHJldHVybiBgX0pvaW46JHtrZXl9OiR7Y2xhc3NOYW1lfWA7XG59XG5cbmNvbnN0IGZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUgPSBvYmplY3QgPT4ge1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0W2tleV0gJiYgb2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgc3dpdGNoIChvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XS5hbW91bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLmFtb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnU2V0T25JbnNlcnQnOlxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgY29udmVydEVtYWlsVG9Mb3dlcmNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlKSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3RbJ2VtYWlsJ10gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmplY3RbJ2VtYWlsJ10gPSBvYmplY3RbJ2VtYWlsJ10udG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IGNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlID0gKG9iamVjdCwgY2xhc3NOYW1lLCBvcHRpb25zKSA9PiB7XG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiYgb3B0aW9ucy5jb252ZXJ0VXNlcm5hbWVUb0xvd2VyY2FzZSkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0Wyd1c2VybmFtZSddID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqZWN0Wyd1c2VybmFtZSddID0gb2JqZWN0Wyd1c2VybmFtZSddLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICB9XG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnMsXG4gICAgbWFpbnRlbmFuY2U6IGJvb2xlYW5cbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5LCBtYWludGVuYW5jZSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdHJ5IHtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMub3B0aW9ucywgdXBkYXRlKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBlcnJvcikpO1xuICAgIH1cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsIHVwZGF0ZSk7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGZhbHNlLCB0cnVlKTtcbiAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAgIC8vIHdpbGwgbGlrZWx5IG5lZWQgcmV2aXNpdGluZy5cbiAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZSBmb3IgdXBkYXRlOiAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSwgY2xhc3NOYW1lKSAmJlxuICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCB1cGRhdGVPcGVyYXRpb24gaW4gdXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gJiZcbiAgICAgICAgICAgICAgICAgIHR5cGVvZiB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICBpbm5lcktleSA9PiBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgICAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICBjb252ZXJ0RW1haWxUb0xvd2VyY2FzZSh1cGRhdGUsIGNsYXNzTmFtZSwgdGhpcy5vcHRpb25zKTtcbiAgICAgICAgICAgICAgY29udmVydFVzZXJuYW1lVG9Mb3dlcmNhc2UodXBkYXRlLCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnksIGlzTWFzdGVyLCBmYWxzZSwgZmFsc2UpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0cnkge1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5vcHRpb25zLCBvYmplY3QpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgfVxuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIGNvbnZlcnRFbWFpbFRvTG93ZXJjYXNlKG9iamVjdCwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgIGNvbnZlcnRVc2VybmFtZVRvTG93ZXJjYXNlKG9iamVjdCwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZSwgbnVsbCwgb2JqZWN0KTtcbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIGNvbnN0IG9ycyA9IHF1ZXJ5Wyckb3InXTtcbiAgICAgIHByb21pc2VzLnB1c2goXG4gICAgICAgIC4uLm9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5hbmRzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihhUXVlcnkgPT4ge1xuICAgICAgICAgICAgcXVlcnlbJyRhbmQnXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG90aGVyS2V5cyA9IE9iamVjdC5rZXlzKHF1ZXJ5KS5tYXAoa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT09ICckYW5kJyB8fCBrZXkgPT09ICckb3InKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICghdCB8fCB0LnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgICB9XG4gICAgICBsZXQgcXVlcmllczogPyhhbnlbXSkgPSBudWxsO1xuICAgICAgaWYgKFxuICAgICAgICBxdWVyeVtrZXldICYmXG4gICAgICAgIChxdWVyeVtrZXldWyckaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuZSddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XVsnJG5pbiddIHx8XG4gICAgICAgICAgcXVlcnlba2V5XS5fX3R5cGUgPT0gJ1BvaW50ZXInKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEJ1aWxkIHRoZSBsaXN0IG9mIHF1ZXJpZXNcbiAgICAgICAgcXVlcmllcyA9IE9iamVjdC5rZXlzKHF1ZXJ5W2tleV0pLm1hcChjb25zdHJhaW50S2V5ID0+IHtcbiAgICAgICAgICBsZXQgcmVsYXRlZElkcztcbiAgICAgICAgICBsZXQgaXNOZWdhdGlvbiA9IGZhbHNlO1xuICAgICAgICAgIGlmIChjb25zdHJhaW50S2V5ID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgICByZWxhdGVkSWRzID0gW3F1ZXJ5W2tleV0ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJGluJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRpbiddLm1hcChyID0+IHIub2JqZWN0SWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY29uc3RyYWludEtleSA9PSAnJG5pbicpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IHF1ZXJ5W2tleV1bJyRuaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuZScpIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24gPSB0cnVlO1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldWyckbmUnXS5vYmplY3RJZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzTmVnYXRpb24sXG4gICAgICAgICAgICByZWxhdGVkSWRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcmllcyA9IFt7IGlzTmVnYXRpb246IGZhbHNlLCByZWxhdGVkSWRzOiBbXSB9XTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVtb3ZlIHRoZSBjdXJyZW50IHF1ZXJ5S2V5IGFzIHdlIGRvbix0IG5lZWQgaXQgYW55bW9yZVxuICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAvLyBleGVjdXRlIGVhY2ggcXVlcnkgaW5kZXBlbmRlbnRseSB0byBidWlsZCB0aGUgbGlzdCBvZlxuICAgICAgLy8gJGluIC8gJG5pblxuICAgICAgY29uc3QgcHJvbWlzZXMgPSBxdWVyaWVzLm1hcChxID0+IHtcbiAgICAgICAgaWYgKCFxKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLm93bmluZ0lkcyhjbGFzc05hbWUsIGtleSwgcS5yZWxhdGVkSWRzKS50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgaWYgKHEuaXNOZWdhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5hZGROb3RJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChbLi4ucHJvbWlzZXMsIC4uLm90aGVyS2V5c10pLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICAgIGNvbW1lbnQsXG4gICAgfTogYW55ID0ge30sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01haW50ZW5hbmNlID0gYXV0aC5pc01haW50ZW5hbmNlO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQgfHwgaXNNYWludGVuYW5jZTtcbiAgICBjb25zdCBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBvcCA9XG4gICAgICBvcCB8fCAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09ICdzdHJpbmcnICYmIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDEgPyAnZ2V0JyA6ICdmaW5kJyk7XG4gICAgLy8gQ291bnQgb3BlcmF0aW9uIGlmIGNvdW50aW5nXG4gICAgb3AgPSBjb3VudCA9PT0gdHJ1ZSA/ICdjb3VudCcgOiBvcDtcblxuICAgIGxldCBjbGFzc0V4aXN0cyA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIC8vQWxsb3cgdm9sYXRpbGUgY2xhc3NlcyBpZiBxdWVyeWluZyB3aXRoIE1hc3RlciAoZm9yIF9QdXNoU3RhdHVzKVxuICAgICAgLy9UT0RPOiBNb3ZlIHZvbGF0aWxlIGNsYXNzZXMgY29uY2VwdCBpbnRvIG1vbmdvIGFkYXB0ZXIsIHBvc3RncmVzIGFkYXB0ZXIgc2hvdWxkbid0IGNhcmVcbiAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBpc01hc3RlcilcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyBCZWhhdmlvciBmb3Igbm9uLWV4aXN0ZW50IGNsYXNzZXMgaXMga2luZGEgd2VpcmQgb24gUGFyc2UuY29tLiBQcm9iYWJseSBkb2Vzbid0IG1hdHRlciB0b28gbXVjaC5cbiAgICAgICAgICAvLyBGb3Igbm93LCBwcmV0ZW5kIHRoZSBjbGFzcyBleGlzdHMgYnV0IGhhcyBubyBvYmplY3RzLFxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjbGFzc0V4aXN0cyA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBQYXJzZS5jb20gdHJlYXRzIHF1ZXJpZXMgb24gX2NyZWF0ZWRfYXQgYW5kIF91cGRhdGVkX2F0IGFzIGlmIHRoZXkgd2VyZSBxdWVyaWVzIG9uIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0LFxuICAgICAgICAgIC8vIHNvIGR1cGxpY2F0ZSB0aGF0IGJlaGF2aW9yIGhlcmUuIElmIGJvdGggYXJlIHNwZWNpZmllZCwgdGhlIGNvcnJlY3QgYmVoYXZpb3IgdG8gbWF0Y2ggUGFyc2UuY29tIGlzIHRvXG4gICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgaWYgKHNvcnQuX2NyZWF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQuY3JlYXRlZEF0ID0gc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc29ydC5fdXBkYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlOiB0aGlzLm9wdGlvbnMuZW5hYmxlQ29sbGF0aW9uQ2FzZUNvbXBhcmlzb24gPyBmYWxzZSA6IGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgICBjb21tZW50LFxuICAgICAgICAgIH07XG4gICAgICAgICAgT2JqZWN0LmtleXMoc29ydCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBDYW5ub3Qgc29ydCBieSAke2ZpZWxkTmFtZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lLnNwbGl0KCcuJylbMF1dICYmIGZpZWxkTmFtZSAhPT0gJ3Njb3JlJykge1xuICAgICAgICAgICAgICBkZWxldGUgc29ydFtmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWFDb250cm9sbGVyKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgbGV0IHByb3RlY3RlZEZpZWxkcztcbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvKiBEb24ndCB1c2UgcHJvamVjdGlvbnMgdG8gb3B0aW1pemUgdGhlIHByb3RlY3RlZEZpZWxkcyBzaW5jZSB0aGUgcHJvdGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICBiYXNlZCBvbiBwb2ludGVyLXBlcm1pc3Npb25zIGFyZSBkZXRlcm1pbmVkIGFmdGVyIHF1ZXJ5aW5nLiBUaGUgZmlsdGVyaW5nIGNhblxuICAgICAgICAgICAgICAgICAgb3ZlcndyaXRlIHRoZSBwcm90ZWN0ZWQgZmllbGRzLiAqL1xuICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHRoaXMuYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAnZ2V0Jykge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIGlzTWFpbnRlbmFuY2UsIGZhbHNlKTtcbiAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY291bnQoXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgY29tbWVudFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlzdGluY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGlzdGluY3QoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBkaXN0aW5jdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFnZ3JlZ2F0ZShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lLFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICAgICAgICAgICAgY29tbWVudFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXhwbGFpbikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAudGhlbihvYmplY3RzID0+XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0ID0gdW50cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyU2Vuc2l0aXZlRGF0YShcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWludGVuYW5jZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlU2NoZW1hKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWFDb250cm9sbGVyID0gcztcbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5hZGFwdGVyLmNvdW50KGNsYXNzTmFtZSwgeyBmaWVsZHM6IHt9IH0sIG51bGwsICcnLCBmYWxzZSkpXG4gICAgICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICAgICAgaWYgKGNvdW50ID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgMjU1LFxuICAgICAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gaXMgbm90IGVtcHR5LCBjb250YWlucyAke2NvdW50fSBvYmplY3RzLCBjYW5ub3QgZHJvcCBzY2hlbWEuYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVDbGFzcyhjbGFzc05hbWUpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4od2FzUGFyc2VDb2xsZWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICh3YXNQYXJzZUNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICAgICAgICAgIGZpZWxkTmFtZSA9PiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLm1hcChuYW1lID0+XG4gICAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3Moam9pblRhYmxlTmFtZShjbGFzc05hbWUsIG5hbWUpKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBTY2hlbWFDYWNoZS5kZWwoY2xhc3NOYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlci5yZWxvYWREYXRhKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBUaGlzIGhlbHBzIHRvIGNyZWF0ZSBpbnRlcm1lZGlhdGUgb2JqZWN0cyBmb3Igc2ltcGxlciBjb21wYXJpc29uIG9mXG4gIC8vIGtleSB2YWx1ZSBwYWlycyB1c2VkIGluIHF1ZXJ5IG9iamVjdHMuIEVhY2gga2V5IHZhbHVlIHBhaXIgd2lsbCByZXByZXNlbnRlZFxuICAvLyBpbiBhIHNpbWlsYXIgd2F5IHRvIGpzb25cbiAgb2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxdWVyeTogYW55KTogQXJyYXk8c3RyaW5nPiB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHF1ZXJ5KS5tYXAoYSA9PiBhLm1hcChzID0+IEpTT04uc3RyaW5naWZ5KHMpKS5qb2luKCc6JykpO1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgT1Igb3BlcmF0aW9ucyBtZWFudCB0byBiZSB1c2VkIG9ubHkgZm9yIHBvaW50ZXIgcGVybWlzc2lvbnMuXG4gIHJlZHVjZU9yT3BlcmF0aW9uKHF1ZXJ5OiB7ICRvcjogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRvcikge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBxdWVyaWVzID0gcXVlcnkuJG9yLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgbG9uZ2VyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJG9yLnNwbGljZShsb25nZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kb3IubGVuZ3RoID09PSAxKSB7XG4gICAgICBxdWVyeSA9IHsgLi4ucXVlcnksIC4uLnF1ZXJ5LiRvclswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRvcjtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gTmFpdmUgbG9naWMgcmVkdWNlciBmb3IgQU5EIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VBbmRPcGVyYXRpb24ocXVlcnk6IHsgJGFuZDogQXJyYXk8YW55PiB9KTogYW55IHtcbiAgICBpZiAoIXF1ZXJ5LiRhbmQpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRhbmQubWFwKHEgPT4gdGhpcy5vYmplY3RUb0VudHJpZXNTdHJpbmdzKHEpKTtcbiAgICBsZXQgcmVwZWF0ID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgcmVwZWF0ID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJpZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IHF1ZXJpZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBbc2hvcnRlciwgbG9uZ2VyXSA9IHF1ZXJpZXNbaV0ubGVuZ3RoID4gcXVlcmllc1tqXS5sZW5ndGggPyBbaiwgaV0gOiBbaSwgal07XG4gICAgICAgICAgY29uc3QgZm91bmRFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5yZWR1Y2UoXG4gICAgICAgICAgICAoYWNjLCBlbnRyeSkgPT4gYWNjICsgKHF1ZXJpZXNbbG9uZ2VyXS5pbmNsdWRlcyhlbnRyeSkgPyAxIDogMCksXG4gICAgICAgICAgICAwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzaG9ydGVyRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ubGVuZ3RoO1xuICAgICAgICAgIGlmIChmb3VuZEVudHJpZXMgPT09IHNob3J0ZXJFbnRyaWVzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2hvcnRlciBxdWVyeSBpcyBjb21wbGV0ZWx5IGNvbnRhaW5lZCBpbiB0aGUgbG9uZ2VyIG9uZSwgd2UgY2FuIHN0cmlrZVxuICAgICAgICAgICAgLy8gb3V0IHRoZSBzaG9ydGVyIHF1ZXJ5LlxuICAgICAgICAgICAgcXVlcnkuJGFuZC5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICBxdWVyaWVzLnNwbGljZShzaG9ydGVyLCAxKTtcbiAgICAgICAgICAgIHJlcGVhdCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IHdoaWxlIChyZXBlYXQpO1xuICAgIGlmIChxdWVyeS4kYW5kLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kYW5kWzBdIH07XG4gICAgICBkZWxldGUgcXVlcnkuJGFuZDtcbiAgICB9XG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgLy8gQ29uc3RyYWludHMgcXVlcnkgdXNpbmcgQ0xQJ3MgcG9pbnRlciBwZXJtaXNzaW9ucyAoUFApIGlmIGFueS5cbiAgLy8gMS4gRXRyYWN0IHRoZSB1c2VyIGlkIGZyb20gY2FsbGVyJ3MgQUNMZ3JvdXA7XG4gIC8vIDIuIEV4Y3RyYWN0IGEgbGlzdCBvZiBmaWVsZCBuYW1lcyB0aGF0IGFyZSBQUCBmb3IgdGFyZ2V0IGNvbGxlY3Rpb24gYW5kIG9wZXJhdGlvbjtcbiAgLy8gMy4gQ29uc3RyYWludCB0aGUgb3JpZ2luYWwgcXVlcnkgc28gdGhhdCBlYWNoIFBQIGZpZWxkIG11c3RcbiAgLy8gcG9pbnQgdG8gY2FsbGVyJ3MgaWQgKG9yIGNvbnRhaW4gaXQgaW4gY2FzZSBvZiBQUCBmaWVsZCBiZWluZyBhbiBhcnJheSlcbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKTogYW55IHtcbiAgICAvLyBDaGVjayBpZiBjbGFzcyBoYXMgcHVibGljIHBlcm1pc3Npb24gZm9yIG9wZXJhdGlvblxuICAgIC8vIElmIHRoZSBCYXNlQ0xQIHBhc3MsIGxldCBnbyB0aHJvdWdoXG4gICAgaWYgKHNjaGVtYS50ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKTtcblxuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cEtleSA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICBjb25zdCBwZXJtRmllbGRzID0gW107XG5cbiAgICBpZiAocGVybXNbb3BlcmF0aW9uXSAmJiBwZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpIHtcbiAgICAgIHBlcm1GaWVsZHMucHVzaCguLi5wZXJtc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHMpO1xuICAgIH1cblxuICAgIGlmIChwZXJtc1tncm91cEtleV0pIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICAgIGlmICghcGVybUZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwZXJtRmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIHRoZSBBQ0wgc2hvdWxkIGhhdmUgZXhhY3RseSAxIHVzZXJcbiAgICBpZiAocGVybUZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgICAvLyBObyB1c2VyIHNldCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAvLyBJZiB0aGUgbGVuZ3RoIGlzID4gMSwgdGhhdCBtZWFucyB3ZSBkaWRuJ3QgZGUtZHVwZSB1c2VycyBjb3JyZWN0bHlcbiAgICAgIGlmICh1c2VyQUNMLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXJJZCA9IHVzZXJBQ0xbMF07XG4gICAgICBjb25zdCB1c2VyUG9pbnRlciA9IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHF1ZXJpZXMgPSBwZXJtRmllbGRzLm1hcChrZXkgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZERlc2NyaXB0b3IgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgICAgY29uc3QgZmllbGRUeXBlID1cbiAgICAgICAgICBmaWVsZERlc2NyaXB0b3IgJiZcbiAgICAgICAgICB0eXBlb2YgZmllbGREZXNjcmlwdG9yID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZERlc2NyaXB0b3IsICd0eXBlJylcbiAgICAgICAgICAgID8gZmllbGREZXNjcmlwdG9yLnR5cGVcbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBsZXQgcXVlcnlDbGF1c2U7XG5cbiAgICAgICAgaWYgKGZpZWxkVHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3Igc2luZ2xlIHBvaW50ZXIgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgICAgLy8gY29uc3RyYWludCBmb3IgdXNlcnMtYXJyYXkgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHsgJGFsbDogW3VzZXJQb2ludGVyXSB9IH07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIG9iamVjdCBzZXR1cFxuICAgICAgICAgIHF1ZXJ5Q2xhdXNlID0geyBba2V5XTogdXNlclBvaW50ZXIgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUaGlzIG1lYW5zIHRoYXQgdGhlcmUgaXMgYSBDTFAgZmllbGQgb2YgYW4gdW5leHBlY3RlZCB0eXBlLiBUaGlzIGNvbmRpdGlvbiBzaG91bGQgbm90IGhhcHBlbiwgd2hpY2ggaXNcbiAgICAgICAgICAvLyB3aHkgaXMgYmVpbmcgdHJlYXRlZCBhcyBhbiBlcnJvci5cbiAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgIGBBbiB1bmV4cGVjdGVkIGNvbmRpdGlvbiBvY2N1cnJlZCB3aGVuIHJlc29sdmluZyBwb2ludGVyIHBlcm1pc3Npb25zOiAke2NsYXNzTmFtZX0gJHtrZXl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgY29uc3RyYWludCBvbiB0aGUga2V5LCB1c2UgdGhlICRhbmRcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChxdWVyeSwga2V5KSkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUFuZE9wZXJhdGlvbih7ICRhbmQ6IFtxdWVyeUNsYXVzZSwgcXVlcnldIH0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGFkZCB0aGUgY29uc3RhaW50XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgcXVlcnlDbGF1c2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBxdWVyaWVzLmxlbmd0aCA9PT0gMSA/IHF1ZXJpZXNbMF0gOiB0aGlzLnJlZHVjZU9yT3BlcmF0aW9uKHsgJG9yOiBxdWVyaWVzIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgYWRkUHJvdGVjdGVkRmllbGRzKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnkgPSB7fSxcbiAgICBhY2xHcm91cDogYW55W10gPSBbXSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICBxdWVyeU9wdGlvbnM6IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fVxuICApOiBudWxsIHwgc3RyaW5nW10ge1xuICAgIGNvbnN0IHBlcm1zID1cbiAgICAgIHNjaGVtYSAmJiBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zXG4gICAgICAgID8gc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpXG4gICAgICAgIDogc2NoZW1hO1xuICAgIGlmICghcGVybXMpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gcGVybXMucHJvdGVjdGVkRmllbGRzO1xuICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSByZXR1cm4gbnVsbDtcblxuICAgIGlmIChhY2xHcm91cC5pbmRleE9mKHF1ZXJ5Lm9iamVjdElkKSA+IC0xKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGZvciBxdWVyaWVzIHdoZXJlIFwia2V5c1wiIGFyZSBzZXQgYW5kIGRvIG5vdCBpbmNsdWRlIGFsbCAndXNlckZpZWxkJzp7ZmllbGR9LFxuICAgIC8vIHdlIGhhdmUgdG8gdHJhbnNwYXJlbnRseSBpbmNsdWRlIGl0LCBhbmQgdGhlbiByZW1vdmUgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnRcbiAgICAvLyBCZWNhdXNlIGlmIHN1Y2gga2V5IG5vdCBwcm9qZWN0ZWQgdGhlIHBlcm1pc3Npb24gd29uJ3QgYmUgZW5mb3JjZWQgcHJvcGVybHlcbiAgICAvLyBQUyB0aGlzIGlzIGNhbGxlZCB3aGVuICdleGNsdWRlS2V5cycgYWxyZWFkeSByZWR1Y2VkIHRvICdrZXlzJ1xuICAgIGNvbnN0IHByZXNlcnZlS2V5cyA9IHF1ZXJ5T3B0aW9ucy5rZXlzO1xuXG4gICAgLy8gdGhlc2UgYXJlIGtleXMgdGhhdCBuZWVkIHRvIGJlIGluY2x1ZGVkIG9ubHlcbiAgICAvLyB0byBiZSBhYmxlIHRvIGFwcGx5IHByb3RlY3RlZEZpZWxkcyBieSBwb2ludGVyXG4gICAgLy8gYW5kIHRoZW4gdW5zZXQgYmVmb3JlIHJldHVybmluZyB0byBjbGllbnQgKGxhdGVyIGluICBmaWx0ZXJTZW5zaXRpdmVGaWVsZHMpXG4gICAgY29uc3Qgc2VydmVyT25seUtleXMgPSBbXTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhdXRoLnVzZXI7XG5cbiAgICAvLyBtYXAgdG8gYWxsb3cgY2hlY2sgd2l0aG91dCBhcnJheSBzZWFyY2hcbiAgICBjb25zdCByb2xlcyA9IChhdXRoLnVzZXJSb2xlcyB8fCBbXSkucmVkdWNlKChhY2MsIHIpID0+IHtcbiAgICAgIGFjY1tyXSA9IHByb3RlY3RlZEZpZWxkc1tyXTtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgLy8gYXJyYXkgb2Ygc2V0cyBvZiBwcm90ZWN0ZWQgZmllbGRzLiBzZXBhcmF0ZSBpdGVtIGZvciBlYWNoIGFwcGxpY2FibGUgY3JpdGVyaWFcbiAgICBjb25zdCBwcm90ZWN0ZWRLZXlzU2V0cyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAvLyBza2lwIHVzZXJGaWVsZHNcbiAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKSB7XG4gICAgICAgIGlmIChwcmVzZXJ2ZUtleXMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc3Vic3RyaW5nKDEwKTtcbiAgICAgICAgICBpZiAoIXByZXNlcnZlS2V5cy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgICAvLyAxLiBwdXQgaXQgdGhlcmUgdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIHF1ZXJ5T3B0aW9ucy5rZXlzICYmIHF1ZXJ5T3B0aW9ucy5rZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIC8vIDIuIHByZXNlcnZlIGl0IGRlbGV0ZSBsYXRlclxuICAgICAgICAgICAgc2VydmVyT25seUtleXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gYWRkIHB1YmxpYyB0aWVyXG4gICAgICBpZiAoa2V5ID09PSAnKicpIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgICBpZiAoa2V5ID09PSAnYXV0aGVudGljYXRlZCcpIHtcbiAgICAgICAgICAvLyBmb3IgbG9nZ2VkIGluIHVzZXJzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwcm90ZWN0ZWRGaWVsZHNba2V5XSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm9sZXNba2V5XSAmJiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSkge1xuICAgICAgICAgIC8vIGFkZCBhcHBsaWNhYmxlIHJvbGVzXG4gICAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChyb2xlc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlJ3MgYSBydWxlIGZvciBjdXJyZW50IHVzZXIncyBpZFxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICBjb25zdCB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG4gICAgICBpZiAocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pIHtcbiAgICAgICAgcHJvdGVjdGVkS2V5c1NldHMucHVzaChwZXJtcy5wcm90ZWN0ZWRGaWVsZHNbdXNlcklkXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gcHJlc2VydmUgZmllbGRzIHRvIGJlIHJlbW92ZWQgYmVmb3JlIHNlbmRpbmcgcmVzcG9uc2UgdG8gY2xpZW50XG4gICAgaWYgKHNlcnZlck9ubHlLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzID0gc2VydmVyT25seUtleXM7XG4gICAgfVxuXG4gICAgbGV0IHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzU2V0cy5yZWR1Y2UoKGFjYywgbmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgYWNjLnB1c2goLi4ubmV4dCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICBwcm90ZWN0ZWRLZXlzU2V0cy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKHRyYW5zYWN0aW9uYWxTZXNzaW9uID0+IHtcbiAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gdHJhbnNhY3Rpb25hbFNlc3Npb247XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBjb21taXQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKCkge1xuICAgIGlmICghdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlcmUgaXMgbm8gdHJhbnNhY3Rpb25hbCBzZXNzaW9uIHRvIGFib3J0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUT0RPOiBjcmVhdGUgaW5kZXhlcyBvbiBmaXJzdCBjcmVhdGlvbiBvZiBhIF9Vc2VyIG9iamVjdC4gT3RoZXJ3aXNlIGl0J3MgaW1wb3NzaWJsZSB0b1xuICAvLyBoYXZlIGEgUGFyc2UgYXBwIHdpdGhvdXQgaXQgaGF2aW5nIGEgX1VzZXIgY29sbGVjdGlvbi5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKCkge1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIGNvbnN0IHJlcXVpcmVkVXNlckZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Vc2VyLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkUm9sZUZpZWxkcyA9IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgICAuLi5TY2hlbWFDb250cm9sbGVyLmRlZmF1bHRDb2x1bW5zLl9Sb2xlLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1VzZXInKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKSk7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4gc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX0lkZW1wb3RlbmN5JykpO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBpZiAoIXRoaXMub3B0aW9ucy5lbmFibGVDb2xsYXRpb25DYXNlQ29tcGFyaXNvbikge1xuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG5cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10sICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJywgdHJ1ZSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcbiAgfVxuXG4gIF9leHBhbmRSZXN1bHRPbktleVBhdGgob2JqZWN0OiBhbnksIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICAgIG9iamVjdFtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgfVxuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gICAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcblxuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBpZiAodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKFxuICAgICAgICAgIHsgW2ZpcnN0S2V5XTogdHJ1ZSwgW25leHRQYXRoXTogdHJ1ZSB9LFxuICAgICAgICAgIGtleXdvcmQua2V5LFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG9iamVjdFtmaXJzdEtleV0gPSB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgICBvYmplY3RbZmlyc3RLZXldIHx8IHt9LFxuICAgICAgbmV4dFBhdGgsXG4gICAgICB2YWx1ZVtmaXJzdEtleV1cbiAgICApO1xuICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3Q6IGFueSwgcmVzdWx0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0ge307XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgICAgaWYgKFxuICAgICAgICBrZXlVcGRhdGUgJiZcbiAgICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnLCAnU2V0T25JbnNlcnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgICApIHtcbiAgICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5lZCBvbiBhIGtleXBhdGhcbiAgICAgICAgdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgICAgIC8vIFJldmVydCBhcnJheSB0byBvYmplY3QgY29udmVyc2lvbiBvbiBkb3Qgbm90YXRpb24gZm9yIGFycmF5cyAoZS5nLiBcImZpZWxkLjAua2V5XCIpXG4gICAgICAgIGlmIChrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgIGNvbnN0IFtmaWVsZCwgaW5kZXhdID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICAgICAgY29uc3QgaXNBcnJheUluZGV4ID0gQXJyYXkuZnJvbShpbmRleCkuZXZlcnkoYyA9PiBjID49ICcwJyAmJiBjIDw9ICc5Jyk7XG4gICAgICAgICAgaWYgKGlzQXJyYXlJbmRleCAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtmaWVsZF0pICYmICFBcnJheS5pc0FycmF5KHJlc3BvbnNlW2ZpZWxkXSkpIHtcbiAgICAgICAgICAgIHJlc3BvbnNlW2ZpZWxkXSA9IHJlc3VsdFtmaWVsZF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IChhbnksIGJvb2xlYW4sIGJvb2xlYW4sIGJvb2xlYW4pID0+IHZvaWQ7XG4gIHN0YXRpYyBmaWx0ZXJTZW5zaXRpdmVEYXRhOiAoYm9vbGVhbiwgYm9vbGVhbiwgYW55W10sIGFueSwgYW55LCBhbnksIHN0cmluZywgYW55W10sIGFueSkgPT4gdm9pZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhYmFzZUNvbnRyb2xsZXI7XG4vLyBFeHBvc2UgdmFsaWRhdGVRdWVyeSBmb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl92YWxpZGF0ZVF1ZXJ5ID0gdmFsaWRhdGVRdWVyeTtcbm1vZHVsZS5leHBvcnRzLmZpbHRlclNlbnNpdGl2ZURhdGEgPSBmaWx0ZXJTZW5zaXRpdmVEYXRhO1xuIl0sIm1hcHBpbmdzIjoiOztBQUtBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUVBLElBQUFDLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFHLFVBQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFJLFNBQUEsR0FBQUYsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFNLE1BQUEsR0FBQUosc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFPLGdCQUFBLEdBQUFDLHVCQUFBLENBQUFSLE9BQUE7QUFDQSxJQUFBUyxlQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxvQkFBQSxHQUFBUixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQVcsdUJBQUEsR0FBQVQsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFZLFlBQUEs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