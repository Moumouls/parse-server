"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;
const triggers = require('./triggers');
const {
  continueWhile
} = require('parse/lib/node/promiseUtils');
const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
const {
  enforceRoleSecurity
} = require('./SharedRest');

// restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   excludeKeys
//   redirectClassNameForKey
//   readPreference
//   includeReadPreference
//   subqueryReadPreference
/**
 * Use to perform a query on a class. It will run security checks and triggers.
 * @param options
 * @param options.method {RestQuery.Method} The type of query to perform
 * @param options.config {ParseServerConfiguration} The server configuration
 * @param options.auth {Auth} The auth object for the request
 * @param options.className {string} The name of the class to query
 * @param options.restWhere {object} The where object for the query
 * @param options.restOptions {object} The options object for the query
 * @param options.clientSDK {string} The client SDK that is performing the query
 * @param options.runAfterFind {boolean} Whether to run the afterFind trigger
 * @param options.runBeforeFind {boolean} Whether to run the beforeFind trigger
 * @param options.context {object} The context object for the query
 * @returns {Promise<_UnsafeRestQuery>} A promise that is resolved with the _UnsafeRestQuery object
 */
async function RestQuery({
  method,
  config,
  auth,
  className,
  restWhere = {},
  restOptions = {},
  clientSDK,
  runAfterFind = true,
  runBeforeFind = true,
  context
}) {
  if (![RestQuery.Method.find, RestQuery.Method.get].includes(method)) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'bad query type');
  }
  enforceRoleSecurity(method, className, auth);
  const result = runBeforeFind ? await triggers.maybeRunQueryTrigger(triggers.Types.beforeFind, className, restWhere, restOptions, config, auth, context, method === RestQuery.Method.get) : Promise.resolve({
    restWhere,
    restOptions
  });
  return new _UnsafeRestQuery(config, auth, className, result.restWhere || restWhere, result.restOptions || restOptions, clientSDK, runAfterFind, context);
}
RestQuery.Method = Object.freeze({
  get: 'get',
  find: 'find'
});

/**
 * _UnsafeRestQuery is meant for specific internal usage only. When you need to skip security checks or some triggers.
 * Don't use it if you don't know what you are doing.
 * @param config
 * @param auth
 * @param className
 * @param restWhere
 * @param restOptions
 * @param clientSDK
 * @param runAfterFind
 * @param context
 */
function _UnsafeRestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true, context) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};
  this.context = context || {};
  if (!this.auth.isMaster) {
    if (this.className == '_Session') {
      if (!this.auth.user) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      }
      this.restWhere = {
        $and: [this.restWhere, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  this.doCount = false;
  this.includeAll = false;

  // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
  this.include = [];
  let keysForInclude = '';

  // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185
  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  }

  // If we have keys, we probably want to force some includes (n-1 level)
  // in order to exclude specific keys.
  if (Object.prototype.hasOwnProperty.call(restOptions, 'excludeKeys')) {
    keysForInclude += ',' + restOptions.excludeKeys;
  }
  if (keysForInclude.length > 0) {
    keysForInclude = keysForInclude.split(',').filter(key => {
      // At least 2 components
      return key.split('.').length > 1;
    }).map(key => {
      // Slice the last component (a.b.c -> a.b)
      // Otherwise we'll include one level too much.
      return key.slice(0, key.lastIndexOf('.'));
    }).join(',');

    // Concat the possibly present include string with the one from the keys
    // Dedup / sorting is handle in 'include' case.
    if (keysForInclude.length > 0) {
      if (!restOptions.include || restOptions.include.length == 0) {
        restOptions.include = keysForInclude;
      } else {
        restOptions.include += ',' + keysForInclude;
      }
    }
  }
  for (var option in restOptions) {
    switch (option) {
      case 'keys':
        {
          const keys = restOptions.keys.split(',').filter(key => key.length > 0).concat(AlwaysSelectedKeys);
          this.keys = Array.from(new Set(keys));
          break;
        }
      case 'excludeKeys':
        {
          const exclude = restOptions.excludeKeys.split(',').filter(k => AlwaysSelectedKeys.indexOf(k) < 0);
          this.excludeKeys = Array.from(new Set(exclude));
          break;
        }
      case 'count':
        this.doCount = true;
        break;
      case 'includeAll':
        this.includeAll = true;
        break;
      case 'explain':
      case 'hint':
      case 'distinct':
      case 'pipeline':
      case 'skip':
      case 'limit':
      case 'readPreference':
      case 'comment':
        this.findOptions[option] = restOptions[option];
        break;
      case 'order':
        var fields = restOptions.order.split(',');
        this.findOptions.sort = fields.reduce((sortMap, field) => {
          field = field.trim();
          if (field === '$score' || field === '-$score') {
            sortMap.score = {
              $meta: 'textScore'
            };
          } else if (field[0] == '-') {
            sortMap[field.slice(1)] = -1;
          } else {
            sortMap[field] = 1;
          }
          return sortMap;
        }, {});
        break;
      case 'include':
        {
          const paths = restOptions.include.split(',');
          if (paths.includes('*')) {
            this.includeAll = true;
            break;
          }
          // Load the existing includes (from keys)
          const pathSet = paths.reduce((memo, path) => {
            // Split each paths on . (a.b.c -> [a,b,c])
            // reduce to create all paths
            // ([a,b,c] -> {a: true, 'a.b': true, 'a.b.c': true})
            return path.split('.').reduce((memo, path, index, parts) => {
              memo[parts.slice(0, index + 1).join('.')] = true;
              return memo;
            }, memo);
          }, {});
          this.include = Object.keys(pathSet).map(s => {
            return s.split('.');
          }).sort((a, b) => {
            return a.length - b.length; // Sort by number of components
          });
          break;
        }
      case 'redirectClassNameForKey':
        this.redirectKey = restOptions.redirectClassNameForKey;
        this.redirectClassName = null;
        break;
      case 'includeReadPreference':
      case 'subqueryReadPreference':
        break;
      default:
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad option: ' + option);
    }
  }
}

// A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions
_UnsafeRestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.denyProtectedFields();
  }).then(() => {
    return this.handleIncludeAll();
  }).then(() => {
    return this.handleExcludeKeys();
  }).then(() => {
    return this.runFind(executeOptions);
  }).then(() => {
    return this.runCount();
  }).then(() => {
    return this.handleInclude();
  }).then(() => {
    return this.runAfterFindTrigger();
  }).then(() => {
    return this.handleAuthAdapters();
  }).then(() => {
    return this.response;
  });
};
_UnsafeRestQuery.prototype.each = function (callback) {
  const {
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK
  } = this;
  // if the limit is set, use it
  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;
  return continueWhile(() => {
    return !finished;
  }, async () => {
    // Safe here to use _UnsafeRestQuery because the security was already
    // checked during "await RestQuery()"
    const query = new _UnsafeRestQuery(config, auth, className, restWhere, restOptions, clientSDK, this.runAfterFind, this.context);
    const {
      results
    } = await query.execute();
    results.forEach(callback);
    finished = results.length < restOptions.limit;
    if (!finished) {
      restWhere.objectId = Object.assign({}, restWhere.objectId, {
        $gt: results[results.length - 1].objectId
      });
    }
  });
};
_UnsafeRestQuery.prototype.buildRestWhere = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.redirectClassNameForKey();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.replaceSelect();
  }).then(() => {
    return this.replaceDontSelect();
  }).then(() => {
    return this.replaceInQuery();
  }).then(() => {
    return this.replaceNotInQuery();
  }).then(() => {
    return this.replaceEquality();
  });
};

// Uses the Auth object to get the list of roles, adds the user id
_UnsafeRestQuery.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }
  this.findOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.findOptions.acl = this.findOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Changes the className if redirectClassNameForKey is set.
// Returns a promise.
_UnsafeRestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  }

  // We need to change the class name based on the schema
  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
};

// Validates this operation against the allowClientClassCreation config.
_UnsafeRestQuery.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};
function transformInQuery(inQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete inQueryObject['$inQuery'];
  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
}

// Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.
_UnsafeRestQuery.prototype.replaceInQuery = async function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
  if (!inQueryObject) {
    return;
  }

  // The inQuery value must have precisely two keys - where and className
  var inQueryValue = inQueryObject['$inQuery'];
  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $inQuery');
  }
  const additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: inQueryValue.className,
    restWhere: inQueryValue.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceInQuery();
  });
};
function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete notInQueryObject['$notInQuery'];
  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
}

// Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.
_UnsafeRestQuery.prototype.replaceNotInQuery = async function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
  if (!notInQueryObject) {
    return;
  }

  // The notInQuery value must have precisely two keys - where and className
  var notInQueryValue = notInQueryObject['$notInQuery'];
  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $notInQuery');
  }
  const additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: notInQueryValue.className,
    restWhere: notInQueryValue.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

// Used to get the deepest object from json using dot notation.
const getDeepestObjectFromKey = (json, key, idx, src) => {
  if (key in json) {
    return json[key];
  }
  src.splice(1); // Exit Early
};
const transformSelect = (selectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete selectObject['$select'];
  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
};

// Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.
_UnsafeRestQuery.prototype.replaceSelect = async function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');
  if (!selectObject) {
    return;
  }

  // The select value must have precisely two keys - query and key
  var selectValue = selectObject['$select'];
  // iOS SDK don't send where if not set, let it pass
  if (!selectValue.query || !selectValue.key || typeof selectValue.query !== 'object' || !selectValue.query.className || Object.keys(selectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $select');
  }
  const additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: selectValue.query.className,
    restWhere: selectValue.query.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results);
    // Keep replacing $select clauses
    return this.replaceSelect();
  });
};
const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete dontSelectObject['$dontSelect'];
  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
};

// Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.
_UnsafeRestQuery.prototype.replaceDontSelect = async function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
  if (!dontSelectObject) {
    return;
  }

  // The dontSelect value must have precisely two keys - query and key
  var dontSelectValue = dontSelectObject['$dontSelect'];
  if (!dontSelectValue.query || !dontSelectValue.key || typeof dontSelectValue.query !== 'object' || !dontSelectValue.query.className || Object.keys(dontSelectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $dontSelect');
  }
  const additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  const subquery = await RestQuery({
    method: RestQuery.Method.find,
    config: this.config,
    auth: this.auth,
    className: dontSelectValue.query.className,
    restWhere: dontSelectValue.query.where,
    restOptions: additionalOptions,
    context: this.context
  });
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results);
    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  });
};
_UnsafeRestQuery.prototype.cleanResultAuthData = function (result) {
  delete result.password;
  if (result.authData) {
    Object.keys(result.authData).forEach(provider => {
      if (result.authData[provider] === null) {
        delete result.authData[provider];
      }
    });
    if (Object.keys(result.authData).length == 0) {
      delete result.authData;
    }
  }
};
const replaceEqualityConstraint = constraint => {
  if (typeof constraint !== 'object') {
    return constraint;
  }
  const equalToObject = {};
  let hasDirectConstraint = false;
  let hasOperatorConstraint = false;
  for (const key in constraint) {
    if (key.indexOf('$') !== 0) {
      hasDirectConstraint = true;
      equalToObject[key] = constraint[key];
    } else {
      hasOperatorConstraint = true;
    }
  }
  if (hasDirectConstraint && hasOperatorConstraint) {
    constraint['$eq'] = equalToObject;
    Object.keys(equalToObject).forEach(key => {
      delete constraint[key];
    });
  }
  return constraint;
};
_UnsafeRestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }
  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
_UnsafeRestQuery.prototype.runFind = function (options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = {
      results: []
    };
    return Promise.resolve();
  }
  const findOptions = Object.assign({}, this.findOptions);
  if (this.keys) {
    findOptions.keys = this.keys.map(key => {
      return key.split('.')[0];
    });
  }
  if (options.op) {
    findOptions.op = options.op;
  }
  return this.config.database.find(this.className, this.restWhere, findOptions, this.auth).then(results => {
    if (this.className === '_User' && !findOptions.explain) {
      for (var result of results) {
        this.cleanResultAuthData(result);
      }
    }
    this.config.filesController.expandFilesInObject(this.config, results);
    if (this.redirectClassName) {
      for (var r of results) {
        r.className = this.redirectClassName;
      }
    }
    this.response = {
      results: results
    };
  });
};

// Returns a promise for whether it was successful.
// Populates this.response.count with the count
_UnsafeRestQuery.prototype.runCount = function () {
  if (!this.doCount) {
    return;
  }
  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(this.className, this.restWhere, this.findOptions).then(c => {
    this.response.count = c;
  });
};
_UnsafeRestQuery.prototype.denyProtectedFields = async function () {
  if (this.auth.isMaster) {
    return;
  }
  const schemaController = await this.config.database.loadSchema();
  const protectedFields = this.config.database.addProtectedFields(schemaController, this.className, this.restWhere, this.findOptions.acl, this.auth, this.findOptions) || [];
  for (const key of protectedFields) {
    if (this.restWhere[key]) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to query ${key} on class ${this.className}`);
    }
  }
};

// Augments this.response with all pointers on an object
_UnsafeRestQuery.prototype.handleIncludeAll = function () {
  if (!this.includeAll) {
    return;
  }
  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const includeFields = [];
    const keyFields = [];
    for (const field in schema.fields) {
      if (schema.fields[field].type && schema.fields[field].type === 'Pointer' || schema.fields[field].type && schema.fields[field].type === 'Array') {
        includeFields.push([field]);
        keyFields.push(field);
      }
    }
    // Add fields to include, keys, remove dups
    this.include = [...new Set([...this.include, ...includeFields])];
    // if this.keys not set, then all keys are already included
    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
};

// Updates property `this.keys` to contain all keys but the ones unselected.
_UnsafeRestQuery.prototype.handleExcludeKeys = function () {
  if (!this.excludeKeys) {
    return;
  }
  if (this.keys) {
    this.keys = this.keys.filter(k => !this.excludeKeys.includes(k));
    return;
  }
  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const fields = Object.keys(schema.fields);
    this.keys = fields.filter(k => !this.excludeKeys.includes(k));
  });
};

// Augments this.response with data at the paths provided in this.include.
_UnsafeRestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }
  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.context, this.restOptions);
  if (pathResponse.then) {
    return pathResponse.then(newResponse => {
      this.response = newResponse;
      this.include = this.include.slice(1);
      return this.handleInclude();
    });
  } else if (this.include.length > 0) {
    this.include = this.include.slice(1);
    return this.handleInclude();
  }
  return pathResponse;
};

//Returns a promise of a processed set of results
_UnsafeRestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }
  if (!this.runAfterFind) {
    return;
  }
  // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.
  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);
  if (!hasAfterFindHook) {
    return Promise.resolve();
  }
  // Skip Aggregate and Distinct Queries
  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }
  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json);
  // Run afterFind trigger and set the new results
  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config, parseQuery, this.context).then(results => {
    // Ensure we properly set the className back
    if (this.redirectClassName) {
      this.response.results = results.map(object => {
        if (object instanceof Parse.Object) {
          object = object.toJSON();
        }
        object.className = this.redirectClassName;
        return object;
      });
    } else {
      this.response.results = results;
    }
  });
};
_UnsafeRestQuery.prototype.handleAuthAdapters = async function () {
  if (this.className !== '_User' || this.findOptions.explain) {
    return;
  }
  await Promise.all(this.response.results.map(result => this.config.authDataManager.runAfterFind({
    config: this.config,
    auth: this.auth
  }, result.authData)));
};

// Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.
function includePath(config, auth, response, path, context, restOptions = {}) {
  var pointers = findPointers(response.results, path);
  if (pointers.length == 0) {
    return response;
  }
  const pointersHash = {};
  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }
    const className = pointer.className;
    // only include the good pointers
    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }
  const includeRestOptions = {};
  if (restOptions.keys) {
    const keys = new Set(restOptions.keys.split(','));
    const keySet = Array.from(keys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i < keyPath.length) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (keySet.size > 0) {
      includeRestOptions.keys = Array.from(keySet).join(',');
    }
  }
  if (restOptions.excludeKeys) {
    const excludeKeys = new Set(restOptions.excludeKeys.split(','));
    const excludeKeySet = Array.from(excludeKeys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i == keyPath.length - 1) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (excludeKeySet.size > 0) {
      includeRestOptions.excludeKeys = Array.from(excludeKeySet).join(',');
    }
  }
  if (restOptions.includeReadPreference) {
    includeRestOptions.readPreference = restOptions.includeReadPreference;
    includeRestOptions.includeReadPreference = restOptions.includeReadPreference;
  } else if (restOptions.readPreference) {
    includeRestOptions.readPreference = restOptions.readPreference;
  }
  const queryPromises = Object.keys(pointersHash).map(async className => {
    const objectIds = Array.from(pointersHash[className]);
    let where;
    if (objectIds.length === 1) {
      where = {
        objectId: objectIds[0]
      };
    } else {
      where = {
        objectId: {
          $in: objectIds
        }
      };
    }
    const query = await RestQuery({
      method: objectIds.length === 1 ? RestQuery.Method.get : RestQuery.Method.find,
      config,
      auth,
      className,
      restWhere: where,
      restOptions: includeRestOptions,
      context: context
    });
    return query.execute({
      op: 'get'
    }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  });

  // Get the objects for all these object ids
  return Promise.all(queryPromises).then(responses => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;
        if (obj.className == '_User' && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }
        replace[obj.objectId] = obj;
      }
      return replace;
    }, {});
    var resp = {
      results: replacePointers(response.results, path, replace)
    };
    if (response.count) {
      resp.count = response.count;
    }
    return resp;
  });
}

// Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.
function findPointers(object, path) {
  if (object instanceof Array) {
    return object.map(x => findPointers(x, path)).flat();
  }
  if (typeof object !== 'object' || !object) {
    return [];
  }
  if (path.length == 0) {
    if (object === null || object.__type == 'Pointer') {
      return [object];
    }
    return [];
  }
  var subobject = object[path[0]];
  if (!subobject) {
    return [];
  }
  return findPointers(subobject, path.slice(1));
}

// Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
// Returns something analogous to object, but with the appropriate
// pointers inflated.
function replacePointers(object, path, replace) {
  if (object instanceof Array) {
    return object.map(obj => replacePointers(obj, path, replace)).filter(obj => typeof obj !== 'undefined');
  }
  if (typeof object !== 'object' || !object) {
    return object;
  }
  if (path.length === 0) {
    if (object && object.__type === 'Pointer') {
      return replace[object.objectId];
    }
    return object;
  }
  var subobject = object[path[0]];
  if (!subobject) {
    return object;
  }
  var newsub = replacePointers(subobject, path.slice(1), replace);
  var answer = {};
  for (var key in object) {
    if (key == path[0]) {
      answer[key] = newsub;
    } else {
      answer[key] = object[key];
    }
  }
  return answer;
}

// Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.
function findObjectWithKey(root, key) {
  if (typeof root !== 'object') {
    return;
  }
  if (root instanceof Array) {
    for (var item of root) {
      const answer = findObjectWithKey(item, key);
      if (answer) {
        return answer;
      }
    }
  }
  if (root && root[key]) {
    return root;
  }
  for (var subkey in root) {
    const answer = findObjectWithKey(root[subkey], key);
    if (answer) {
      return answer;
    }
  }
}
module.exports = RestQuery;
// For tests
module.exports._UnsafeRestQuery = _UnsafeRestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiZW5mb3JjZVJvbGVTZWN1cml0eSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwicmVzdWx0IiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9VbnNhZmVSZXN0UXVlcnkiLCJPYmplY3QiLCJmcmVlemUiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJkb0NvdW50IiwiaW5jbHVkZUFsbCIsImluY2x1ZGUiLCJrZXlzRm9ySW5jbHVkZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXMiLCJleGNsdWRlS2V5cyIsImxlbmd0aCIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiayIsImluZGV4T2YiLCJmaWVsZHMiLCJvcmRlciIsInNvcnQiLCJyZWR1Y2UiLCJzb3J0TWFwIiwiZmllbGQiLCJ0cmltIiwic2NvcmUiLCIkbWV0YSIsInBhdGhzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImRlbnlQcm90ZWN0ZWRGaWVsZHMiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhbGwiLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwieCIsImZsYXQiLCJzdWJvYmplY3QiLCJuZXdzdWIiLCJhbnN3ZXIiLCJyb290IiwiaXRlbSIsInN1YmtleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvUmVzdFF1ZXJ5LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEFuIG9iamVjdCB0aGF0IGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGEgJ2ZpbmQnXG4vLyBvcGVyYXRpb24sIGVuY29kZWQgaW4gdGhlIFJFU1QgQVBJIGZvcm1hdC5cblxudmFyIFNjaGVtYUNvbnRyb2xsZXIgPSByZXF1aXJlKCcuL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi90cmlnZ2VycycpO1xuY29uc3QgeyBjb250aW51ZVdoaWxlIH0gPSByZXF1aXJlKCdwYXJzZS9saWIvbm9kZS9wcm9taXNlVXRpbHMnKTtcbmNvbnN0IEFsd2F5c1NlbGVjdGVkS2V5cyA9IFsnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCcsICdBQ0wnXTtcbmNvbnN0IHsgZW5mb3JjZVJvbGVTZWN1cml0eSB9ID0gcmVxdWlyZSgnLi9TaGFyZWRSZXN0Jyk7XG5cbi8vIHJlc3RPcHRpb25zIGNhbiBpbmNsdWRlOlxuLy8gICBza2lwXG4vLyAgIGxpbWl0XG4vLyAgIG9yZGVyXG4vLyAgIGNvdW50XG4vLyAgIGluY2x1ZGVcbi8vICAga2V5c1xuLy8gICBleGNsdWRlS2V5c1xuLy8gICByZWRpcmVjdENsYXNzTmFtZUZvcktleVxuLy8gICByZWFkUHJlZmVyZW5jZVxuLy8gICBpbmNsdWRlUmVhZFByZWZlcmVuY2Vcbi8vICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZVxuLyoqXG4gKiBVc2UgdG8gcGVyZm9ybSBhIHF1ZXJ5IG9uIGEgY2xhc3MuIEl0IHdpbGwgcnVuIHNlY3VyaXR5IGNoZWNrcyBhbmQgdHJpZ2dlcnMuXG4gKiBAcGFyYW0gb3B0aW9uc1xuICogQHBhcmFtIG9wdGlvbnMubWV0aG9kIHtSZXN0UXVlcnkuTWV0aG9kfSBUaGUgdHlwZSBvZiBxdWVyeSB0byBwZXJmb3JtXG4gKiBAcGFyYW0gb3B0aW9ucy5jb25maWcge1BhcnNlU2VydmVyQ29uZmlndXJhdGlvbn0gVGhlIHNlcnZlciBjb25maWd1cmF0aW9uXG4gKiBAcGFyYW0gb3B0aW9ucy5hdXRoIHtBdXRofSBUaGUgYXV0aCBvYmplY3QgZm9yIHRoZSByZXF1ZXN0XG4gKiBAcGFyYW0gb3B0aW9ucy5jbGFzc05hbWUge3N0cmluZ30gVGhlIG5hbWUgb2YgdGhlIGNsYXNzIHRvIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5yZXN0V2hlcmUge29iamVjdH0gVGhlIHdoZXJlIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5yZXN0T3B0aW9ucyB7b2JqZWN0fSBUaGUgb3B0aW9ucyBvYmplY3QgZm9yIHRoZSBxdWVyeVxuICogQHBhcmFtIG9wdGlvbnMuY2xpZW50U0RLIHtzdHJpbmd9IFRoZSBjbGllbnQgU0RLIHRoYXQgaXMgcGVyZm9ybWluZyB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJ1bkFmdGVyRmluZCB7Ym9vbGVhbn0gV2hldGhlciB0byBydW4gdGhlIGFmdGVyRmluZCB0cmlnZ2VyXG4gKiBAcGFyYW0gb3B0aW9ucy5ydW5CZWZvcmVGaW5kIHtib29sZWFufSBXaGV0aGVyIHRvIHJ1biB0aGUgYmVmb3JlRmluZCB0cmlnZ2VyXG4gKiBAcGFyYW0gb3B0aW9ucy5jb250ZXh0IHtvYmplY3R9IFRoZSBjb250ZXh0IG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcmV0dXJucyB7UHJvbWlzZTxfVW5zYWZlUmVzdFF1ZXJ5Pn0gQSBwcm9taXNlIHRoYXQgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgX1Vuc2FmZVJlc3RRdWVyeSBvYmplY3RcbiAqL1xuYXN5bmMgZnVuY3Rpb24gUmVzdFF1ZXJ5KHtcbiAgbWV0aG9kLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZSxcbiAgcnVuQmVmb3JlRmluZCA9IHRydWUsXG4gIGNvbnRleHQsXG59KSB7XG4gIGlmICghW1Jlc3RRdWVyeS5NZXRob2QuZmluZCwgUmVzdFF1ZXJ5Lk1ldGhvZC5nZXRdLmluY2x1ZGVzKG1ldGhvZCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2JhZCBxdWVyeSB0eXBlJyk7XG4gIH1cbiAgZW5mb3JjZVJvbGVTZWN1cml0eShtZXRob2QsIGNsYXNzTmFtZSwgYXV0aCk7XG4gIGNvbnN0IHJlc3VsdCA9IHJ1bkJlZm9yZUZpbmRcbiAgICA/IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRmluZCxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgY29uZmlnLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbnRleHQsXG4gICAgICBtZXRob2QgPT09IFJlc3RRdWVyeS5NZXRob2QuZ2V0XG4gICAgKVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKHsgcmVzdFdoZXJlLCByZXN0T3B0aW9ucyB9KTtcblxuICByZXR1cm4gbmV3IF9VbnNhZmVSZXN0UXVlcnkoXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgY2xhc3NOYW1lLFxuICAgIHJlc3VsdC5yZXN0V2hlcmUgfHwgcmVzdFdoZXJlLFxuICAgIHJlc3VsdC5yZXN0T3B0aW9ucyB8fCByZXN0T3B0aW9ucyxcbiAgICBjbGllbnRTREssXG4gICAgcnVuQWZ0ZXJGaW5kLFxuICAgIGNvbnRleHRcbiAgKTtcbn1cblxuUmVzdFF1ZXJ5Lk1ldGhvZCA9IE9iamVjdC5mcmVlemUoe1xuICBnZXQ6ICdnZXQnLFxuICBmaW5kOiAnZmluZCcsXG59KTtcblxuLyoqXG4gKiBfVW5zYWZlUmVzdFF1ZXJ5IGlzIG1lYW50IGZvciBzcGVjaWZpYyBpbnRlcm5hbCB1c2FnZSBvbmx5LiBXaGVuIHlvdSBuZWVkIHRvIHNraXAgc2VjdXJpdHkgY2hlY2tzIG9yIHNvbWUgdHJpZ2dlcnMuXG4gKiBEb24ndCB1c2UgaXQgaWYgeW91IGRvbid0IGtub3cgd2hhdCB5b3UgYXJlIGRvaW5nLlxuICogQHBhcmFtIGNvbmZpZ1xuICogQHBhcmFtIGF1dGhcbiAqIEBwYXJhbSBjbGFzc05hbWVcbiAqIEBwYXJhbSByZXN0V2hlcmVcbiAqIEBwYXJhbSByZXN0T3B0aW9uc1xuICogQHBhcmFtIGNsaWVudFNES1xuICogQHBhcmFtIHJ1bkFmdGVyRmluZFxuICogQHBhcmFtIGNvbnRleHRcbiAqL1xuZnVuY3Rpb24gX1Vuc2FmZVJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3RXaGVyZSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB0aGlzLmRvQ291bnQgPSBmYWxzZTtcbiAgdGhpcy5pbmNsdWRlQWxsID0gZmFsc2U7XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgdGhpcy5pbmNsdWRlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgZm9ybWF0IGZvciB0aGVcbiAgLy8gaW5jbHVkZSBvcHRpb24gLSBpdCdzIHRoZSBwYXRocyB3ZSBzaG91bGQgaW5jbHVkZSwgaW4gb3JkZXIsXG4gIC8vIHN0b3JlZCBhcyBhcnJheXMsIHRha2luZyBpbnRvIGFjY291bnQgdGhhdCB3ZSBuZWVkIHRvIGluY2x1ZGUgZm9vXG4gIC8vIGJlZm9yZSBpbmNsdWRpbmcgZm9vLmJhci4gQWxzbyBpdCBzaG91bGQgZGVkdXBlLlxuICAvLyBGb3IgZXhhbXBsZSwgcGFzc2luZyBhbiBhcmcgb2YgaW5jbHVkZT1mb28uYmFyLGZvby5iYXogY291bGQgbGVhZCB0b1xuICAvLyB0aGlzLmluY2x1ZGUgPSBbWydmb28nXSwgWydmb28nLCAnYmF6J10sIFsnZm9vJywgJ2JhciddXVxuICB0aGlzLmluY2x1ZGUgPSBbXTtcbiAgbGV0IGtleXNGb3JJbmNsdWRlID0gJyc7XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzO1xuICB9XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gaW4gb3JkZXIgdG8gZXhjbHVkZSBzcGVjaWZpYyBrZXlzLlxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAnZXhjbHVkZUtleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlICs9ICcsJyArIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzO1xuICB9XG5cbiAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ2NvbW1lbnQnOlxuICAgICAgICB0aGlzLmZpbmRPcHRpb25zW29wdGlvbl0gPSByZXN0T3B0aW9uc1tvcHRpb25dO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ29yZGVyJzpcbiAgICAgICAgdmFyIGZpZWxkcyA9IHJlc3RPcHRpb25zLm9yZGVyLnNwbGl0KCcsJyk7XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnMuc29ydCA9IGZpZWxkcy5yZWR1Y2UoKHNvcnRNYXAsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgZmllbGQgPSBmaWVsZC50cmltKCk7XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnJHNjb3JlJyB8fCBmaWVsZCA9PT0gJy0kc2NvcmUnKSB7XG4gICAgICAgICAgICBzb3J0TWFwLnNjb3JlID0geyAkbWV0YTogJ3RleHRTY29yZScgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpZWxkWzBdID09ICctJykge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZC5zbGljZSgxKV0gPSAtMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc29ydE1hcFtmaWVsZF0gPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gc29ydE1hcDtcbiAgICAgICAgfSwge30pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGUnOiB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gcmVzdE9wdGlvbnMuaW5jbHVkZS5zcGxpdCgnLCcpO1xuICAgICAgICBpZiAocGF0aHMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIHRoaXMuaW5jbHVkZUFsbCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTG9hZCB0aGUgZXhpc3RpbmcgaW5jbHVkZXMgKGZyb20ga2V5cylcbiAgICAgICAgY29uc3QgcGF0aFNldCA9IHBhdGhzLnJlZHVjZSgobWVtbywgcGF0aCkgPT4ge1xuICAgICAgICAgIC8vIFNwbGl0IGVhY2ggcGF0aHMgb24gLiAoYS5iLmMgLT4gW2EsYixjXSlcbiAgICAgICAgICAvLyByZWR1Y2UgdG8gY3JlYXRlIGFsbCBwYXRoc1xuICAgICAgICAgIC8vIChbYSxiLGNdIC0+IHthOiB0cnVlLCAnYS5iJzogdHJ1ZSwgJ2EuYi5jJzogdHJ1ZX0pXG4gICAgICAgICAgcmV0dXJuIHBhdGguc3BsaXQoJy4nKS5yZWR1Y2UoKG1lbW8sIHBhdGgsIGluZGV4LCBwYXJ0cykgPT4ge1xuICAgICAgICAgICAgbWVtb1twYXJ0cy5zbGljZSgwLCBpbmRleCArIDEpLmpvaW4oJy4nKV0gPSB0cnVlO1xuICAgICAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICAgICAgfSwgbWVtbyk7XG4gICAgICAgIH0sIHt9KTtcblxuICAgICAgICB0aGlzLmluY2x1ZGUgPSBPYmplY3Qua2V5cyhwYXRoU2V0KVxuICAgICAgICAgIC5tYXAocyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcy5zcGxpdCgnLicpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoOyAvLyBTb3J0IGJ5IG51bWJlciBvZiBjb21wb25lbnRzXG4gICAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAncmVkaXJlY3RDbGFzc05hbWVGb3JLZXknOlxuICAgICAgICB0aGlzLnJlZGlyZWN0S2V5ID0gcmVzdE9wdGlvbnMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXk7XG4gICAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBudWxsO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVSZWFkUHJlZmVyZW5jZSc6XG4gICAgICBjYXNlICdzdWJxdWVyeVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIG9wdGlvbjogJyArIG9wdGlvbik7XG4gICAgfVxuICB9XG59XG5cbi8vIEEgY29udmVuaWVudCBtZXRob2QgdG8gcGVyZm9ybSBhbGwgdGhlIHN0ZXBzIG9mIHByb2Nlc3NpbmcgYSBxdWVyeVxuLy8gaW4gb3JkZXIuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJlc3BvbnNlIC0gYW4gb2JqZWN0IHdpdGggb3B0aW9uYWwga2V5c1xuLy8gJ3Jlc3VsdHMnIGFuZCAnY291bnQnLlxuLy8gVE9ETzogY29uc29saWRhdGUgdGhlIHJlcGxhY2VYIGZ1bmN0aW9uc1xuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uIChleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVueVByb3RlY3RlZEZpZWxkcygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhBZGFwdGVycygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHJlc3RXaGVyZSwgcmVzdE9wdGlvbnMsIGNsaWVudFNESyB9ID0gdGhpcztcbiAgLy8gaWYgdGhlIGxpbWl0IGlzIHNldCwgdXNlIGl0XG4gIHJlc3RPcHRpb25zLmxpbWl0ID0gcmVzdE9wdGlvbnMubGltaXQgfHwgMTAwO1xuICByZXN0T3B0aW9ucy5vcmRlciA9ICdvYmplY3RJZCc7XG4gIGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBjb250aW51ZVdoaWxlKFxuICAgICgpID0+IHtcbiAgICAgIHJldHVybiAhZmluaXNoZWQ7XG4gICAgfSxcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBTYWZlIGhlcmUgdG8gdXNlIF9VbnNhZmVSZXN0UXVlcnkgYmVjYXVzZSB0aGUgc2VjdXJpdHkgd2FzIGFscmVhZHlcbiAgICAgIC8vIGNoZWNrZWQgZHVyaW5nIFwiYXdhaXQgUmVzdFF1ZXJ5KClcIlxuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgX1Vuc2FmZVJlc3RRdWVyeShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIGNsaWVudFNESyxcbiAgICAgICAgdGhpcy5ydW5BZnRlckZpbmQsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKGNhbGxiYWNrKTtcbiAgICAgIGZpbmlzaGVkID0gcmVzdWx0cy5sZW5ndGggPCByZXN0T3B0aW9ucy5saW1pdDtcbiAgICAgIGlmICghZmluaXNoZWQpIHtcbiAgICAgICAgcmVzdFdoZXJlLm9iamVjdElkID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdFdoZXJlLm9iamVjdElkLCB7XG4gICAgICAgICAgJGd0OiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV0ub2JqZWN0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmJ1aWxkUmVzdFdoZXJlID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRVc2VyQW5kUm9sZUFDTCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlTm90SW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUVxdWFsaXR5KCk7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZWRpcmVjdEtleSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBjbGFzcyBuYW1lIGJhc2VkIG9uIHRoZSBzY2hlbWFcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlZGlyZWN0S2V5KVxuICAgIC50aGVuKG5ld0NsYXNzTmFtZSA9PiB7XG4gICAgICB0aGlzLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICAgIHRoaXMucmVkaXJlY3RDbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgfSk7XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIGNsYXNzTmFtZSwgcmVzdWx0cykge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgdmFsdWVzLnB1c2goe1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiByZXN1bHQub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgZGVsZXRlIGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmIChBcnJheS5pc0FycmF5KGluUXVlcnlPYmplY3RbJyRpbiddKSkge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gaW5RdWVyeU9iamVjdFsnJGluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkaW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkaW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJGluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IGluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VOb3RJblF1ZXJ5ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgbm90SW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJG5vdEluUXVlcnknKTtcbiAgaWYgKCFub3RJblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIG5vdEluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIG5vdEluUXVlcnlWYWx1ZSA9IG5vdEluUXVlcnlPYmplY3RbJyRub3RJblF1ZXJ5J107XG4gIGlmICghbm90SW5RdWVyeVZhbHVlLndoZXJlIHx8ICFub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkbm90SW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IG5vdEluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IG5vdEluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcblxuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuLy8gVXNlZCB0byBnZXQgdGhlIGRlZXBlc3Qgb2JqZWN0IGZyb20ganNvbiB1c2luZyBkb3Qgbm90YXRpb24uXG5jb25zdCBnZXREZWVwZXN0T2JqZWN0RnJvbUtleSA9IChqc29uLCBrZXksIGlkeCwgc3JjKSA9PiB7XG4gIGlmIChrZXkgaW4ganNvbikge1xuICAgIHJldHVybiBqc29uW2tleV07XG4gIH1cbiAgc3JjLnNwbGljZSgxKTsgLy8gRXhpdCBFYXJseVxufTtcblxuY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gKHNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0T2JqZWN0WyckaW4nXSkpIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gc2VsZWN0T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRzZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkc2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkc2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZVNlbGVjdCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJHNlbGVjdCcpO1xuICBpZiAoIXNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBzZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIHNlbGVjdFZhbHVlID0gc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIC8vIGlPUyBTREsgZG9uJ3Qgc2VuZCB3aGVyZSBpZiBub3Qgc2V0LCBsZXQgaXQgcGFzc1xuICBpZiAoXG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIXNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBzZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoc2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRzZWxlY3QnKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBzZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgcmVzdE9wdGlvbnM6IGFkZGl0aW9uYWxPcHRpb25zLFxuICAgIGNvbnRleHQ6IHRoaXMuY29udGV4dCxcbiAgfSk7XG5cbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBkb250U2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckZG9udFNlbGVjdCcpO1xuICBpZiAoIWRvbnRTZWxlY3RPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgZG9udFNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgZG9udFNlbGVjdFZhbHVlID0gZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKFxuICAgICFkb250U2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBkb250U2VsZWN0VmFsdWUucXVlcnkgIT09ICdvYmplY3QnIHx8XG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhkb250U2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRkb250U2VsZWN0Jyk7XG4gIH1cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3Qgc3VicXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLFxuICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgYXV0aDogdGhpcy5hdXRoLFxuICAgIGNsYXNzTmFtZTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSxcbiAgICByZXN0V2hlcmU6IGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcblxuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoZG9udFNlbGVjdE9iamVjdCwgZG9udFNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJGRvbnRTZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuY2xlYW5SZXN1bHRBdXRoRGF0YSA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgZGVsZXRlIHJlc3VsdC5wYXNzd29yZDtcbiAgaWYgKHJlc3VsdC5hdXRoRGF0YSkge1xuICAgIE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBpZiAocmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCA9IGNvbnN0cmFpbnQgPT4ge1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGNvbnN0cmFpbnQ7XG4gIH1cbiAgY29uc3QgZXF1YWxUb09iamVjdCA9IHt9O1xuICBsZXQgaGFzRGlyZWN0Q29uc3RyYWludCA9IGZhbHNlO1xuICBsZXQgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gZmFsc2U7XG4gIGZvciAoY29uc3Qga2V5IGluIGNvbnN0cmFpbnQpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJyQnKSAhPT0gMCkge1xuICAgICAgaGFzRGlyZWN0Q29uc3RyYWludCA9IHRydWU7XG4gICAgICBlcXVhbFRvT2JqZWN0W2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhc09wZXJhdG9yQ29uc3RyYWludCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmIChoYXNEaXJlY3RDb25zdHJhaW50ICYmIGhhc09wZXJhdG9yQ29uc3RyYWludCkge1xuICAgIGNvbnN0cmFpbnRbJyRlcSddID0gZXF1YWxUb09iamVjdDtcbiAgICBPYmplY3Qua2V5cyhlcXVhbFRvT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBkZWxldGUgY29uc3RyYWludFtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBjb25zdHJhaW50O1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUVxdWFsaXR5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIHRoaXMucmVzdFdoZXJlICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnJlc3RXaGVyZSkge1xuICAgIHRoaXMucmVzdFdoZXJlW2tleV0gPSByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50KHRoaXMucmVzdFdoZXJlW2tleV0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlIHdpdGggYW4gb2JqZWN0IHRoYXQgb25seSBoYXMgJ3Jlc3VsdHMnLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGZ1bmN0aW9uIChvcHRpb25zID0ge30pIHtcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMubGltaXQgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiBbXSB9O1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICBjb25zdCBmaW5kT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZmluZE9wdGlvbnMpO1xuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgZmluZE9wdGlvbnMua2V5cyA9IHRoaXMua2V5cy5tYXAoa2V5ID0+IHtcbiAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKVswXTtcbiAgICB9KTtcbiAgfVxuICBpZiAob3B0aW9ucy5vcCkge1xuICAgIGZpbmRPcHRpb25zLm9wID0gb3B0aW9ucy5vcDtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZCh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZXN0V2hlcmUsIGZpbmRPcHRpb25zLCB0aGlzLmF1dGgpXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgIWZpbmRPcHRpb25zLmV4cGxhaW4pIHtcbiAgICAgICAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICB0aGlzLmNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIGZvciAodmFyIHIgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xuICAgIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kb0NvdW50KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuZmluZE9wdGlvbnMuY291bnQgPSB0cnVlO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5za2lwO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5saW1pdDtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCB0aGlzLmZpbmRPcHRpb25zKS50aGVuKGMgPT4ge1xuICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmRlbnlQcm90ZWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5maW5kT3B0aW9uc1xuICAgICkgfHwgW107XG4gIGZvciAoY29uc3Qga2V5IG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgIGlmICh0aGlzLnJlc3RXaGVyZVtrZXldKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gcXVlcnkgJHtrZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlQWxsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaW5jbHVkZUZpZWxkcy5wdXNoKFtmaWVsZF0pO1xuICAgICAgICAgIGtleUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gQWRkIGZpZWxkcyB0byBpbmNsdWRlLCBrZXlzLCByZW1vdmUgZHVwc1xuICAgICAgdGhpcy5pbmNsdWRlID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMuaW5jbHVkZSwgLi4uaW5jbHVkZUZpZWxkc10pXTtcbiAgICAgIC8vIGlmIHRoaXMua2V5cyBub3Qgc2V0LCB0aGVuIGFsbCBrZXlzIGFyZSBhbHJlYWR5IGluY2x1ZGVkXG4gICAgICBpZiAodGhpcy5rZXlzKSB7XG4gICAgICAgIHRoaXMua2V5cyA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmtleXMsIC4uLmtleUZpZWxkc10pXTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8vIFVwZGF0ZXMgcHJvcGVydHkgYHRoaXMua2V5c2AgdG8gY29udGFpbiBhbGwga2V5cyBidXQgdGhlIG9uZXMgdW5zZWxlY3RlZC5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUV4Y2x1ZGVLZXlzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZXhjbHVkZUtleXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHRoaXMua2V5cykge1xuICAgIHRoaXMua2V5cyA9IHRoaXMua2V5cy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcyk7XG4gICAgICB0aGlzLmtleXMgPSBmaWVsZHMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIH0pO1xufTtcblxuLy8gQXVnbWVudHMgdGhpcy5yZXNwb25zZSB3aXRoIGRhdGEgYXQgdGhlIHBhdGhzIHByb3ZpZGVkIGluIHRoaXMuaW5jbHVkZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMuY29udGV4dCxcbiAgICB0aGlzLnJlc3RPcHRpb25zXG4gICk7XG4gIGlmIChwYXRoUmVzcG9uc2UudGhlbikge1xuICAgIHJldHVybiBwYXRoUmVzcG9uc2UudGhlbihuZXdSZXNwb25zZSA9PiB7XG4gICAgICB0aGlzLnJlc3BvbnNlID0gbmV3UmVzcG9uc2U7XG4gICAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSk7XG4gIH0gZWxzZSBpZiAodGhpcy5pbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICB0aGlzLmluY2x1ZGUgPSB0aGlzLmluY2x1ZGUuc2xpY2UoMSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHBhdGhSZXNwb25zZTtcbn07XG5cbi8vUmV0dXJucyBhIHByb21pc2Ugb2YgYSBwcm9jZXNzZWQgc2V0IG9mIHJlc3VsdHNcbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLnJ1bkFmdGVyRmluZFRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXRoaXMucnVuQWZ0ZXJGaW5kKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyRmluZCcgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJGaW5kSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgaWYgKCFoYXNBZnRlckZpbmRIb29rKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFNraXAgQWdncmVnYXRlIGFuZCBEaXN0aW5jdCBRdWVyaWVzXG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLnBpcGVsaW5lIHx8IHRoaXMuZmluZE9wdGlvbnMuZGlzdGluY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5yZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSB0aGlzLnJlc3RXaGVyZTtcbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeSh0aGlzLmNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG4gIC8vIFJ1biBhZnRlckZpbmQgdHJpZ2dlciBhbmQgc2V0IHRoZSBuZXcgcmVzdWx0c1xuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHBhcnNlUXVlcnksXG4gICAgICB0aGlzLmNvbnRleHRcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAvLyBFbnN1cmUgd2UgcHJvcGVybHkgc2V0IHRoZSBjbGFzc05hbWUgYmFja1xuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzID0gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICBpZiAob2JqZWN0IGluc3RhbmNlb2YgUGFyc2UuT2JqZWN0KSB7XG4gICAgICAgICAgICBvYmplY3QgPSBvYmplY3QudG9KU09OKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdC5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzID0gcmVzdWx0cztcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUF1dGhBZGFwdGVycyA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMuZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMubWFwKHJlc3VsdCA9PlxuICAgICAgdGhpcy5jb25maWcuYXV0aERhdGFNYW5hZ2VyLnJ1bkFmdGVyRmluZChcbiAgICAgICAgeyBjb25maWc6IHRoaXMuY29uZmlnLCBhdXRoOiB0aGlzLmF1dGggfSxcbiAgICAgICAgcmVzdWx0LmF1dGhEYXRhXG4gICAgICApXG4gICAgKVxuICApO1xufTtcblxuLy8gQWRkcyBpbmNsdWRlZCB2YWx1ZXMgdG8gdGhlIHJlc3BvbnNlLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGQgbmFtZXMuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXVnbWVudGVkIHJlc3BvbnNlLlxuZnVuY3Rpb24gaW5jbHVkZVBhdGgoY29uZmlnLCBhdXRoLCByZXNwb25zZSwgcGF0aCwgY29udGV4dCwgcmVzdE9wdGlvbnMgPSB7fSkge1xuICB2YXIgcG9pbnRlcnMgPSBmaW5kUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCk7XG4gIGlmIChwb2ludGVycy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBwb2ludGVyc0hhc2ggPSB7fTtcbiAgZm9yICh2YXIgcG9pbnRlciBvZiBwb2ludGVycykge1xuICAgIGlmICghcG9pbnRlcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHBvaW50ZXIuY2xhc3NOYW1lO1xuICAgIC8vIG9ubHkgaW5jbHVkZSB0aGUgZ29vZCBwb2ludGVyc1xuICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdID0gcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gfHwgbmV3IFNldCgpO1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0uYWRkKHBvaW50ZXIub2JqZWN0SWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmNsdWRlUmVzdE9wdGlvbnMgPSB7fTtcbiAgaWYgKHJlc3RPcHRpb25zLmtleXMpIHtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGtleVNldCA9IEFycmF5LmZyb20oa2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPCBrZXlQYXRoLmxlbmd0aCkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChrZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5rZXlzID0gQXJyYXkuZnJvbShrZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuZXhjbHVkZUtleXMpIHtcbiAgICBjb25zdCBleGNsdWRlS2V5cyA9IG5ldyBTZXQocmVzdE9wdGlvbnMuZXhjbHVkZUtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3QgZXhjbHVkZUtleVNldCA9IEFycmF5LmZyb20oZXhjbHVkZUtleXMpLnJlZHVjZSgoc2V0LCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGtleVBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGZvciAoaTsgaSA8IHBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhdGhbaV0gIT0ga2V5UGF0aFtpXSkge1xuICAgICAgICAgIHJldHVybiBzZXQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChpID09IGtleVBhdGgubGVuZ3RoIC0gMSkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChleGNsdWRlS2V5U2V0LnNpemUgPiAwKSB7XG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKGV4Y2x1ZGVLZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAocmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChhc3luYyBjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBvYmplY3RJZHMubGVuZ3RoID09PSAxID8gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQgOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBjb25maWcsXG4gICAgICBhdXRoLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdFdoZXJlOiB3aGVyZSxcbiAgICAgIHJlc3RPcHRpb25zOiBpbmNsdWRlUmVzdE9wdGlvbnMsXG4gICAgICBjb250ZXh0OiBjb250ZXh0LFxuICAgIH0pO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHsgb3A6ICdnZXQnIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0cyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIEdldCB0aGUgb2JqZWN0cyBmb3IgYWxsIHRoZXNlIG9iamVjdCBpZHNcbiAgcmV0dXJuIFByb21pc2UuYWxsKHF1ZXJ5UHJvbWlzZXMpLnRoZW4ocmVzcG9uc2VzID0+IHtcbiAgICB2YXIgcmVwbGFjZSA9IHJlc3BvbnNlcy5yZWR1Y2UoKHJlcGxhY2UsIGluY2x1ZGVSZXNwb25zZSkgPT4ge1xuICAgICAgZm9yICh2YXIgb2JqIG9mIGluY2x1ZGVSZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgIG9iai5fX3R5cGUgPSAnT2JqZWN0JztcbiAgICAgICAgb2JqLmNsYXNzTmFtZSA9IGluY2x1ZGVSZXNwb25zZS5jbGFzc05hbWU7XG5cbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUgPT0gJ19Vc2VyJyAmJiAhYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIGRlbGV0ZSBvYmouc2Vzc2lvblRva2VuO1xuICAgICAgICAgIGRlbGV0ZSBvYmouYXV0aERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGFjZVtvYmoub2JqZWN0SWRdID0gb2JqO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcGxhY2U7XG4gICAgfSwge30pO1xuXG4gICAgdmFyIHJlc3AgPSB7XG4gICAgICByZXN1bHRzOiByZXBsYWNlUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCwgcmVwbGFjZSksXG4gICAgfTtcbiAgICBpZiAocmVzcG9uc2UuY291bnQpIHtcbiAgICAgIHJlc3AuY291bnQgPSByZXNwb25zZS5jb3VudDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3A7XG4gIH0pO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3QgdG8gZmluZCBwb2ludGVycyBpbiwgb3Jcbi8vIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBJZiB0aGUgcGF0aCB5aWVsZHMgdGhpbmdzIHRoYXQgYXJlbid0IHBvaW50ZXJzLCB0aGlzIHRocm93cyBhbiBlcnJvci5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIFJldHVybnMgYSBsaXN0IG9mIHBvaW50ZXJzIGluIFJFU1QgZm9ybWF0LlxuZnVuY3Rpb24gZmluZFBvaW50ZXJzKG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0Lm1hcCh4ID0+IGZpbmRQb2ludGVycyh4LCBwYXRoKSkuZmxhdCgpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT0gMCkge1xuICAgIGlmIChvYmplY3QgPT09IG51bGwgfHwgb2JqZWN0Ll9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiBbb2JqZWN0XTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIGZpbmRQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSkpO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3RzIHRvIHJlcGxhY2UgcG9pbnRlcnNcbi8vIGluLCBvciBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGRzIHRvIHNlYXJjaCBpbnRvLlxuLy8gcmVwbGFjZSBpcyBhIG1hcCBmcm9tIG9iamVjdCBpZCAtPiBvYmplY3QuXG4vLyBSZXR1cm5zIHNvbWV0aGluZyBhbmFsb2dvdXMgdG8gb2JqZWN0LCBidXQgd2l0aCB0aGUgYXBwcm9wcmlhdGVcbi8vIHBvaW50ZXJzIGluZmxhdGVkLlxuZnVuY3Rpb24gcmVwbGFjZVBvaW50ZXJzKG9iamVjdCwgcGF0aCwgcmVwbGFjZSkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gb2JqZWN0XG4gICAgICAubWFwKG9iaiA9PiByZXBsYWNlUG9pbnRlcnMob2JqLCBwYXRoLCByZXBsYWNlKSlcbiAgICAgIC5maWx0ZXIob2JqID0+IHR5cGVvZiBvYmogIT09ICd1bmRlZmluZWQnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChvYmplY3QgJiYgb2JqZWN0Ll9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gcmVwbGFjZVtvYmplY3Qub2JqZWN0SWRdO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHN1Ym9iamVjdCA9IG9iamVjdFtwYXRoWzBdXTtcbiAgaWYgKCFzdWJvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIHZhciBuZXdzdWIgPSByZXBsYWNlUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpLCByZXBsYWNlKTtcbiAgdmFyIGFuc3dlciA9IHt9O1xuICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKGtleSA9PSBwYXRoWzBdKSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG5ld3N1YjtcbiAgICB9IGVsc2Uge1xuICAgICAgYW5zd2VyW2tleV0gPSBvYmplY3Rba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gRmluZHMgYSBzdWJvYmplY3QgdGhhdCBoYXMgdGhlIGdpdmVuIGtleSwgaWYgdGhlcmUgaXMgb25lLlxuLy8gUmV0dXJucyB1bmRlZmluZWQgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZmluZE9iamVjdFdpdGhLZXkocm9vdCwga2V5KSB7XG4gIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJvb3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIGZvciAodmFyIGl0ZW0gb2Ygcm9vdCkge1xuICAgICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkoaXRlbSwga2V5KTtcbiAgICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKHJvb3QgJiYgcm9vdFtrZXldKSB7XG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cbiAgZm9yICh2YXIgc3Via2V5IGluIHJvb3QpIHtcbiAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShyb290W3N1YmtleV0sIGtleSk7XG4gICAgaWYgKGFuc3dlcikge1xuICAgICAgcmV0dXJuIGFuc3dlcjtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXN0UXVlcnk7XG4vLyBGb3IgdGVzdHNcbm1vZHVsZS5leHBvcnRzLl9VbnNhZmVSZXN0UXVlcnkgPSBfVW5zYWZlUmVzdFF1ZXJ5O1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7O0FBRUEsSUFBSUEsZ0JBQWdCLEdBQUdDLE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQztBQUNoRSxJQUFJQyxLQUFLLEdBQUdELE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQ0MsS0FBSztBQUN2QyxNQUFNQyxRQUFRLEdBQUdGLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDdEMsTUFBTTtFQUFFRztBQUFjLENBQUMsR0FBR0gsT0FBTyxDQUFDLDZCQUE2QixDQUFDO0FBQ2hFLE1BQU1JLGtCQUFrQixHQUFHLENBQUMsVUFBVSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDO0FBQ3hFLE1BQU07RUFBRUM7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ekMsT0FBTytLLE9BQU8sQ0FBQ3JCLE1BQU0sQ0FBQ3pKLFFBQVEsQ0FBQztJQUNqQztJQUNBLE9BQU95SixNQUFNO0VBQ2Y7RUFFQSxJQUFJNkIsU0FBUyxHQUFHN0IsTUFBTSxDQUFDbEgsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQy9CLElBQUksQ0FBQytJLFNBQVMsRUFBRTtJQUNkLE9BQU83QixNQUFNO0VBQ2Y7RUFDQSxJQUFJOEIsTUFBTSxHQUFHSixlQUFlLENBQUNHLFNBQVMsRUFBRS9JLElBQUksQ0FBQ3ZCLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRThKLE9BQU8sQ0FBQztFQUMvRCxJQUFJVSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0VBQ2YsS0FBSyxJQUFJMUssR0FBRyxJQUFJMkksTUFBTSxFQUFFO0lBQ3RCLElBQUkzSSxHQUFHLElBQUl5QixJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7TUFDbEJpSixNQUFNLENBQUMxSyxHQUFHLENBQUMsR0FBR3lLLE1BQU07SUFDdEIsQ0FBQyxNQUFNO01BQ0xDLE1BQU0sQ0FBQzFLLEdBQUcsQ0FBQyxHQUFHMkksTUFBTSxDQUFDM0ksR0FBRyxDQUFDO0lBQzNCO0VBQ0Y7RUFDQSxPQUFPMEssTUFBTTtBQUNmOztBQUVBO0FBQ0E7QUFDQSxTQUFTM0YsaUJBQWlCQSxDQUFDNEYsSUFBSSxFQUFFM0ssR0FBRyxFQUFFO0VBQ3BDLElBQUksT0FBTzJLLElBQUksS0FBSyxRQUFRLEVBQUU7SUFDNUI7RUFDRjtFQUNBLElBQUlBLElBQUksWUFBWXBLLEtBQUssRUFBRTtJQUN6QixLQUFLLElBQUlxSyxJQUFJLElBQUlELElBQUksRUFBRTtNQUNyQixNQUFNRCxNQUFNLEdBQUczRixpQkFBaUIsQ0FBQzZGLElBQUksRUFBRTVLLEdBQUcsQ0FBQztNQUMzQyxJQUFJMEssTUFBTSxFQUFFO1FBQ1YsT0FBT0EsTUFBTTtNQUNmO0lBQ0Y7RUFDRjtFQUNBLElBQUlDLElBQUksSUFBSUEsSUFBSSxDQUFDM0ssR0FBRyxDQUFDLEVBQUU7SUFDckIsT0FBTzJLLElBQUk7RUFDYjtFQUNBLEtBQUssSUFBSUUsTUFBTSxJQUFJRixJQUFJLEVBQUU7SUFDdkIsTUFBTUQsTUFBTSxHQUFHM0YsaUJBQWlCLENBQUM0RixJQUFJLENBQUNFLE1BQU0sQ0FBQyxFQUFFN0ssR0FBRyxDQUFDO0lBQ25ELElBQUkwSyxNQUFNLEVBQUU7TUFDVixPQUFPQSxNQUFNO0lBQ2Y7RUFDRjtBQUNGO0FBRUFJLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHOU4sU0FBUztBQUMxQjtBQUNBNk4sTUFBTSxDQUFDQyxPQUFPLENBQUN2TSxnQkFBZ0IsR0FBR0EsZ0JBQWdCIiwiaWdub3JlTGlzdCI6W119