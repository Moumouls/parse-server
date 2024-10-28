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
_UnsafeRestQuery.prototype.runFind = async function (options = {}) {
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
  const results = await this.config.database.find(this.className, this.restWhere, findOptions, this.auth);
  if (this.className === '_User' && !findOptions.explain) {
    for (var result of results) {
      this.cleanResultAuthData(result);
    }
  }
  await this.config.filesController.expandFilesInObject(this.config, results);
  if (this.redirectClassName) {
    for (var r of results) {
      r.className = this.redirectClassName;
    }
  }
  this.response = {
    results: results
  };
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
_UnsafeRestQuery.prototype.handleInclude = async function () {
  if (this.include.length == 0) {
    return;
  }
  const indexedResults = this.response.results.reduce((indexed, result, i) => {
    indexed[result.objectId] = i;
    return indexed;
  }, {});

  // Build the execution tree
  const executionTree = {};
  this.include.forEach(path => {
    let current = executionTree;
    path.forEach(node => {
      if (!current[node]) {
        current[node] = {
          path,
          children: {}
        };
      }
      current = current[node].children;
    });
  });
  const recursiveExecutionTree = async treeNode => {
    const {
      path,
      children
    } = treeNode;
    const pathResponse = includePath(this.config, this.auth, this.response, path, this.context, this.restOptions, this);
    if (pathResponse.then) {
      const newResponse = await pathResponse;
      newResponse.results.forEach(newObject => {
        // We hydrate the root of each result with sub results
        this.response.results[indexedResults[newObject.objectId]][path[0]] = newObject[path[0]];
      });
    }
    return Promise.all(Object.values(children).map(recursiveExecutionTree));
  };
  await Promise.all(Object.values(executionTree).map(recursiveExecutionTree));
  this.include = [];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiZW5mb3JjZVJvbGVTZWN1cml0eSIsIlJlc3RRdWVyeSIsIm1ldGhvZCIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsInJ1bkJlZm9yZUZpbmQiLCJjb250ZXh0IiwiTWV0aG9kIiwiZmluZCIsImdldCIsImluY2x1ZGVzIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwicmVzdWx0IiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9VbnNhZmVSZXN0UXVlcnkiLCJPYmplY3QiLCJmcmVlemUiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIl9fdHlwZSIsIm9iamVjdElkIiwiaWQiLCJkb0NvdW50IiwiaW5jbHVkZUFsbCIsImluY2x1ZGUiLCJrZXlzRm9ySW5jbHVkZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImtleXMiLCJleGNsdWRlS2V5cyIsImxlbmd0aCIsInNwbGl0IiwiZmlsdGVyIiwia2V5IiwibWFwIiwic2xpY2UiLCJsYXN0SW5kZXhPZiIsImpvaW4iLCJvcHRpb24iLCJjb25jYXQiLCJBcnJheSIsImZyb20iLCJTZXQiLCJleGNsdWRlIiwiayIsImluZGV4T2YiLCJmaWVsZHMiLCJvcmRlciIsInNvcnQiLCJyZWR1Y2UiLCJzb3J0TWFwIiwiZmllbGQiLCJ0cmltIiwic2NvcmUiLCIkbWV0YSIsInBhdGhzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImRlbnlQcm90ZWN0ZWRGaWVsZHMiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImhhbmRsZUF1dGhBZGFwdGVycyIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImV4cGxhaW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJwcm90ZWN0ZWRGaWVsZHMiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsImluZGV4ZWRSZXN1bHRzIiwiaW5kZXhlZCIsImkiLCJleGVjdXRpb25UcmVlIiwiY3VycmVudCIsIm5vZGUiLCJjaGlsZHJlbiIsInJlY3Vyc2l2ZUV4ZWN1dGlvblRyZWUiLCJ0cmVlTm9kZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJuZXdPYmplY3QiLCJhbGwiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJhdXRoRGF0YU1hbmFnZXIiLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwic2l6ZSIsImV4Y2x1ZGVLZXlTZXQiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJxdWVyeVByb21pc2VzIiwib2JqZWN0SWRzIiwiJGluIiwicmVzcG9uc2VzIiwicmVwbGFjZSIsImluY2x1ZGVSZXNwb25zZSIsIm9iaiIsInNlc3Npb25Ub2tlbiIsInJlc3AiLCJyZXBsYWNlUG9pbnRlcnMiLCJ4IiwiZmxhdCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsImFuc3dlciIsInJvb3QiLCJpdGVtIiwic3Via2V5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQW4gb2JqZWN0IHRoYXQgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYSAnZmluZCdcbi8vIG9wZXJhdGlvbiwgZW5jb2RlZCBpbiB0aGUgUkVTVCBBUEkgZm9ybWF0LlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuY29uc3QgeyBlbmZvcmNlUm9sZVNlY3VyaXR5IH0gPSByZXF1aXJlKCcuL1NoYXJlZFJlc3QnKTtcblxuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG4vKipcbiAqIFVzZSB0byBwZXJmb3JtIGEgcXVlcnkgb24gYSBjbGFzcy4gSXQgd2lsbCBydW4gc2VjdXJpdHkgY2hlY2tzIGFuZCB0cmlnZ2Vycy5cbiAqIEBwYXJhbSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5tZXRob2Qge1Jlc3RRdWVyeS5NZXRob2R9IFRoZSB0eXBlIG9mIHF1ZXJ5IHRvIHBlcmZvcm1cbiAqIEBwYXJhbSBvcHRpb25zLmNvbmZpZyB7UGFyc2VTZXJ2ZXJDb25maWd1cmF0aW9ufSBUaGUgc2VydmVyIGNvbmZpZ3VyYXRpb25cbiAqIEBwYXJhbSBvcHRpb25zLmF1dGgge0F1dGh9IFRoZSBhdXRoIG9iamVjdCBmb3IgdGhlIHJlcXVlc3RcbiAqIEBwYXJhbSBvcHRpb25zLmNsYXNzTmFtZSB7c3RyaW5nfSBUaGUgbmFtZSBvZiB0aGUgY2xhc3MgdG8gcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RXaGVyZSB7b2JqZWN0fSBUaGUgd2hlcmUgb2JqZWN0IGZvciB0aGUgcXVlcnlcbiAqIEBwYXJhbSBvcHRpb25zLnJlc3RPcHRpb25zIHtvYmplY3R9IFRoZSBvcHRpb25zIG9iamVjdCBmb3IgdGhlIHF1ZXJ5XG4gKiBAcGFyYW0gb3B0aW9ucy5jbGllbnRTREsge3N0cmluZ30gVGhlIGNsaWVudCBTREsgdGhhdCBpcyBwZXJmb3JtaW5nIHRoZSBxdWVyeVxuICogQHBhcmFtIG9wdGlvbnMucnVuQWZ0ZXJGaW5kIHtib29sZWFufSBXaGV0aGVyIHRvIHJ1biB0aGUgYWZ0ZXJGaW5kIHRyaWdnZXJcbiAqIEBwYXJhbSBvcHRpb25zLnJ1bkJlZm9yZUZpbmQge2Jvb2xlYW59IFdoZXRoZXIgdG8gcnVuIHRoZSBiZWZvcmVGaW5kIHRyaWdnZXJcbiAqIEBwYXJhbSBvcHRpb25zLmNvbnRleHQge29iamVjdH0gVGhlIGNvbnRleHQgb2JqZWN0IGZvciB0aGUgcXVlcnlcbiAqIEByZXR1cm5zIHtQcm9taXNlPF9VbnNhZmVSZXN0UXVlcnk+fSBBIHByb21pc2UgdGhhdCBpcyByZXNvbHZlZCB3aXRoIHRoZSBfVW5zYWZlUmVzdFF1ZXJ5IG9iamVjdFxuICovXG5hc3luYyBmdW5jdGlvbiBSZXN0UXVlcnkoe1xuICBtZXRob2QsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUgPSB7fSxcbiAgcmVzdE9wdGlvbnMgPSB7fSxcbiAgY2xpZW50U0RLLFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBydW5CZWZvcmVGaW5kID0gdHJ1ZSxcbiAgY29udGV4dCxcbn0pIHtcbiAgaWYgKCFbUmVzdFF1ZXJ5Lk1ldGhvZC5maW5kLCBSZXN0UXVlcnkuTWV0aG9kLmdldF0uaW5jbHVkZXMobWV0aG9kKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnYmFkIHF1ZXJ5IHR5cGUnKTtcbiAgfVxuICBlbmZvcmNlUm9sZVNlY3VyaXR5KG1ldGhvZCwgY2xhc3NOYW1lLCBhdXRoKTtcbiAgY29uc3QgcmVzdWx0ID0gcnVuQmVmb3JlRmluZFxuICAgID8gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVGaW5kLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICBjb25maWcsXG4gICAgICBhdXRoLFxuICAgICAgY29udGV4dCxcbiAgICAgIG1ldGhvZCA9PT0gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXRcbiAgICApXG4gICAgOiBQcm9taXNlLnJlc29sdmUoeyByZXN0V2hlcmUsIHJlc3RPcHRpb25zIH0pO1xuXG4gIHJldHVybiBuZXcgX1Vuc2FmZVJlc3RRdWVyeShcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBjbGFzc05hbWUsXG4gICAgcmVzdWx0LnJlc3RXaGVyZSB8fCByZXN0V2hlcmUsXG4gICAgcmVzdWx0LnJlc3RPcHRpb25zIHx8IHJlc3RPcHRpb25zLFxuICAgIGNsaWVudFNESyxcbiAgICBydW5BZnRlckZpbmQsXG4gICAgY29udGV4dFxuICApO1xufVxuXG5SZXN0UXVlcnkuTWV0aG9kID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGdldDogJ2dldCcsXG4gIGZpbmQ6ICdmaW5kJyxcbn0pO1xuXG4vKipcbiAqIF9VbnNhZmVSZXN0UXVlcnkgaXMgbWVhbnQgZm9yIHNwZWNpZmljIGludGVybmFsIHVzYWdlIG9ubHkuIFdoZW4geW91IG5lZWQgdG8gc2tpcCBzZWN1cml0eSBjaGVja3Mgb3Igc29tZSB0cmlnZ2Vycy5cbiAqIERvbid0IHVzZSBpdCBpZiB5b3UgZG9uJ3Qga25vdyB3aGF0IHlvdSBhcmUgZG9pbmcuXG4gKiBAcGFyYW0gY29uZmlnXG4gKiBAcGFyYW0gYXV0aFxuICogQHBhcmFtIGNsYXNzTmFtZVxuICogQHBhcmFtIHJlc3RXaGVyZVxuICogQHBhcmFtIHJlc3RPcHRpb25zXG4gKiBAcGFyYW0gY2xpZW50U0RLXG4gKiBAcGFyYW0gcnVuQWZ0ZXJGaW5kXG4gKiBAcGFyYW0gY29udGV4dFxuICovXG5mdW5jdGlvbiBfVW5zYWZlUmVzdFF1ZXJ5KFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlID0ge30sXG4gIHJlc3RPcHRpb25zID0ge30sXG4gIGNsaWVudFNESyxcbiAgcnVuQWZ0ZXJGaW5kID0gdHJ1ZSxcbiAgY29udGV4dFxuKSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5yZXN0V2hlcmUgPSByZXN0V2hlcmU7XG4gIHRoaXMucmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucztcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMucnVuQWZ0ZXJGaW5kID0gcnVuQWZ0ZXJGaW5kO1xuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcbiAgdGhpcy5maW5kT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PSAnX1Nlc3Npb24nKSB7XG4gICAgICBpZiAoIXRoaXMuYXV0aC51c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVzdFdoZXJlID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5yZXN0V2hlcmUsXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHRoaXMuZG9Db3VudCA9IGZhbHNlO1xuICB0aGlzLmluY2x1ZGVBbGwgPSBmYWxzZTtcblxuICAvLyBUaGUgZm9ybWF0IGZvciB0aGlzLmluY2x1ZGUgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBmb3JtYXQgZm9yIHRoZVxuICAvLyBpbmNsdWRlIG9wdGlvbiAtIGl0J3MgdGhlIHBhdGhzIHdlIHNob3VsZCBpbmNsdWRlLCBpbiBvcmRlcixcbiAgLy8gc3RvcmVkIGFzIGFycmF5cywgdGFraW5nIGludG8gYWNjb3VudCB0aGF0IHdlIG5lZWQgdG8gaW5jbHVkZSBmb29cbiAgLy8gYmVmb3JlIGluY2x1ZGluZyBmb28uYmFyLiBBbHNvIGl0IHNob3VsZCBkZWR1cGUuXG4gIC8vIEZvciBleGFtcGxlLCBwYXNzaW5nIGFuIGFyZyBvZiBpbmNsdWRlPWZvby5iYXIsZm9vLmJheiBjb3VsZCBsZWFkIHRvXG4gIC8vIHRoaXMuaW5jbHVkZSA9IFtbJ2ZvbyddLCBbJ2ZvbycsICdiYXonXSwgWydmb28nLCAnYmFyJ11dXG4gIHRoaXMuaW5jbHVkZSA9IFtdO1xuICBsZXQga2V5c0ZvckluY2x1ZGUgPSAnJztcblxuICAvLyBJZiB3ZSBoYXZlIGtleXMsIHdlIHByb2JhYmx5IHdhbnQgdG8gZm9yY2Ugc29tZSBpbmNsdWRlcyAobi0xIGxldmVsKVxuICAvLyBTZWUgaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy8zMTg1XG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdE9wdGlvbnMsICdrZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IHJlc3RPcHRpb25zLmtleXM7XG4gIH1cblxuICAvLyBJZiB3ZSBoYXZlIGtleXMsIHdlIHByb2JhYmx5IHdhbnQgdG8gZm9yY2Ugc29tZSBpbmNsdWRlcyAobi0xIGxldmVsKVxuICAvLyBpbiBvcmRlciB0byBleGNsdWRlIHNwZWNpZmljIGtleXMuXG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdE9wdGlvbnMsICdleGNsdWRlS2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgKz0gJywnICsgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXM7XG4gIH1cblxuICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIGtleXNGb3JJbmNsdWRlID0ga2V5c0ZvckluY2x1ZGVcbiAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAuZmlsdGVyKGtleSA9PiB7XG4gICAgICAgIC8vIEF0IGxlYXN0IDIgY29tcG9uZW50c1xuICAgICAgICByZXR1cm4ga2V5LnNwbGl0KCcuJykubGVuZ3RoID4gMTtcbiAgICAgIH0pXG4gICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgIC8vIFNsaWNlIHRoZSBsYXN0IGNvbXBvbmVudCAoYS5iLmMgLT4gYS5iKVxuICAgICAgICAvLyBPdGhlcndpc2Ugd2UnbGwgaW5jbHVkZSBvbmUgbGV2ZWwgdG9vIG11Y2guXG4gICAgICAgIHJldHVybiBrZXkuc2xpY2UoMCwga2V5Lmxhc3RJbmRleE9mKCcuJykpO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsJyk7XG5cbiAgICAvLyBDb25jYXQgdGhlIHBvc3NpYmx5IHByZXNlbnQgaW5jbHVkZSBzdHJpbmcgd2l0aCB0aGUgb25lIGZyb20gdGhlIGtleXNcbiAgICAvLyBEZWR1cCAvIHNvcnRpbmcgaXMgaGFuZGxlIGluICdpbmNsdWRlJyBjYXNlLlxuICAgIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIXJlc3RPcHRpb25zLmluY2x1ZGUgfHwgcmVzdE9wdGlvbnMuaW5jbHVkZS5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlICs9ICcsJyArIGtleXNGb3JJbmNsdWRlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZvciAodmFyIG9wdGlvbiBpbiByZXN0T3B0aW9ucykge1xuICAgIHN3aXRjaCAob3B0aW9uKSB7XG4gICAgICBjYXNlICdrZXlzJzoge1xuICAgICAgICBjb25zdCBrZXlzID0gcmVzdE9wdGlvbnMua2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrZXkgPT4ga2V5Lmxlbmd0aCA+IDApXG4gICAgICAgICAgLmNvbmNhdChBbHdheXNTZWxlY3RlZEtleXMpO1xuICAgICAgICB0aGlzLmtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoa2V5cykpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2V4Y2x1ZGVLZXlzJzoge1xuICAgICAgICBjb25zdCBleGNsdWRlID0gcmVzdE9wdGlvbnMuZXhjbHVkZUtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiBBbHdheXNTZWxlY3RlZEtleXMuaW5kZXhPZihrKSA8IDApO1xuICAgICAgICB0aGlzLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGV4Y2x1ZGUpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdjb3VudCc6XG4gICAgICAgIHRoaXMuZG9Db3VudCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZUFsbCc6XG4gICAgICAgIHRoaXMuaW5jbHVkZUFsbCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXhwbGFpbic6XG4gICAgICBjYXNlICdoaW50JzpcbiAgICAgIGNhc2UgJ2Rpc3RpbmN0JzpcbiAgICAgIGNhc2UgJ3BpcGVsaW5lJzpcbiAgICAgIGNhc2UgJ3NraXAnOlxuICAgICAgY2FzZSAnbGltaXQnOlxuICAgICAgY2FzZSAncmVhZFByZWZlcmVuY2UnOlxuICAgICAgY2FzZSAnY29tbWVudCc6XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnNbb3B0aW9uXSA9IHJlc3RPcHRpb25zW29wdGlvbl07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb3JkZXInOlxuICAgICAgICB2YXIgZmllbGRzID0gcmVzdE9wdGlvbnMub3JkZXIuc3BsaXQoJywnKTtcbiAgICAgICAgdGhpcy5maW5kT3B0aW9ucy5zb3J0ID0gZmllbGRzLnJlZHVjZSgoc29ydE1hcCwgZmllbGQpID0+IHtcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnRyaW0oKTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICckc2NvcmUnIHx8IGZpZWxkID09PSAnLSRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb3B0aW9uOiAnICsgb3B0aW9uKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKGV4ZWN1dGVPcHRpb25zKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmJ1aWxkUmVzdFdoZXJlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZW55UHJvdGVjdGVkRmllbGRzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlQWxsKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVFeGNsdWRlS2V5cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRmluZChleGVjdXRlT3B0aW9ucyk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5Db3VudCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJGaW5kVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aEFkYXB0ZXJzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmVhY2ggPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcmVzdFdoZXJlLCByZXN0T3B0aW9ucywgY2xpZW50U0RLIH0gPSB0aGlzO1xuICAvLyBpZiB0aGUgbGltaXQgaXMgc2V0LCB1c2UgaXRcbiAgcmVzdE9wdGlvbnMubGltaXQgPSByZXN0T3B0aW9ucy5saW1pdCB8fCAxMDA7XG4gIHJlc3RPcHRpb25zLm9yZGVyID0gJ29iamVjdElkJztcbiAgbGV0IGZpbmlzaGVkID0gZmFsc2U7XG5cbiAgcmV0dXJuIGNvbnRpbnVlV2hpbGUoXG4gICAgKCkgPT4ge1xuICAgICAgcmV0dXJuICFmaW5pc2hlZDtcbiAgICB9LFxuICAgIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFNhZmUgaGVyZSB0byB1c2UgX1Vuc2FmZVJlc3RRdWVyeSBiZWNhdXNlIHRoZSBzZWN1cml0eSB3YXMgYWxyZWFkeVxuICAgICAgLy8gY2hlY2tlZCBkdXJpbmcgXCJhd2FpdCBSZXN0UXVlcnkoKVwiXG4gICAgICBjb25zdCBxdWVyeSA9IG5ldyBfVW5zYWZlUmVzdFF1ZXJ5KFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgY2xpZW50U0RLLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuYnVpbGRSZXN0V2hlcmUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZWRpcmVjdENsYXNzTmFtZUZvcktleSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlU2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlRG9udFNlbGVjdCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZUluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlRXF1YWxpdHkoKTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IHRoaXMuZmluZE9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBDaGFuZ2VzIHRoZSBjbGFzc05hbWUgaWYgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkgaXMgc2V0LlxuLy8gUmV0dXJucyBhIHByb21pc2UuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlZGlyZWN0S2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV2UgbmVlZCB0byBjaGFuZ2UgdGhlIGNsYXNzIG5hbWUgYmFzZWQgb24gdGhlIHNjaGVtYVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkodGhpcy5jbGFzc05hbWUsIHRoaXMucmVkaXJlY3RLZXkpXG4gICAgLnRoZW4obmV3Q2xhc3NOYW1lID0+IHtcbiAgICAgIHRoaXMuY2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICB9KTtcbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoaW5RdWVyeU9iamVjdFsnJGluJ10pKSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSBpblF1ZXJ5T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRpblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRpblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkaW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZUluUXVlcnkgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBpblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckaW5RdWVyeScpO1xuICBpZiAoIWluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgaW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgaW5RdWVyeVZhbHVlID0gaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKCFpblF1ZXJ5VmFsdWUud2hlcmUgfHwgIWluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRpblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogaW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogaW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiB0aGlzLmNvbnRleHQsXG4gIH0pO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10pKSB7XG4gICAgbm90SW5RdWVyeU9iamVjdFsnJG5pbiddID0gbm90SW5RdWVyeU9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRub3RJblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRub3RJblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkbm90SW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhICRuaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiB0aGlzLmNvbnRleHQsXG4gIH0pO1xuXG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG4vLyBVc2VkIHRvIGdldCB0aGUgZGVlcGVzdCBvYmplY3QgZnJvbSBqc29uIHVzaW5nIGRvdCBub3RhdGlvbi5cbmNvbnN0IGdldERlZXBlc3RPYmplY3RGcm9tS2V5ID0gKGpzb24sIGtleSwgaWR4LCBzcmMpID0+IHtcbiAgaWYgKGtleSBpbiBqc29uKSB7XG4gICAgcmV0dXJuIGpzb25ba2V5XTtcbiAgfVxuICBzcmMuc3BsaWNlKDEpOyAvLyBFeGl0IEVhcmx5XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSAoc2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZShnZXREZWVwZXN0T2JqZWN0RnJvbUtleSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RPYmplY3RbJyRpbiddKSkge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSBzZWxlY3RPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJHNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRzZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRzZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlU2VsZWN0ID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckc2VsZWN0Jyk7XG4gIGlmICghc2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIHNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgc2VsZWN0VmFsdWUgPSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgLy8gaU9TIFNESyBkb24ndCBzZW5kIHdoZXJlIGlmIG5vdCBzZXQsIGxldCBpdCBwYXNzXG4gIGlmIChcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhc2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIHNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhzZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJHNlbGVjdCcpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IHNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgcmVzdFdoZXJlOiBzZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICByZXN0T3B0aW9uczogYWRkaXRpb25hbE9wdGlvbnMsXG4gICAgY29udGV4dDogdGhpcy5jb250ZXh0LFxuICB9KTtcblxuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybVNlbGVjdChzZWxlY3RPYmplY3QsIHNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJHNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZVNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvbnRTZWxlY3QgPSAoZG9udFNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShkb250U2VsZWN0T2JqZWN0WyckbmluJ10pKSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gZG9udFNlbGVjdE9iamVjdFsnJG5pbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IHZhbHVlcztcbiAgfVxufTtcblxuLy8gUmVwbGFjZXMgYSAkZG9udFNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRkb250U2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkZG9udFNlbGVjdCBjbGF1c2UgdHVybnMgaW50byBhbiAkbmluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRG9udFNlbGVjdCA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBzdWJxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICBhdXRoOiB0aGlzLmF1dGgsXG4gICAgY2xhc3NOYW1lOiBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHJlc3RXaGVyZTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIHJlc3RPcHRpb25zOiBhZGRpdGlvbmFsT3B0aW9ucyxcbiAgICBjb250ZXh0OiB0aGlzLmNvbnRleHQsXG4gIH0pO1xuXG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtRG9udFNlbGVjdChkb250U2VsZWN0T2JqZWN0LCBkb250U2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkZG9udFNlbGVjdCBjbGF1c2VzXG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZURvbnRTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5jbGVhblJlc3VsdEF1dGhEYXRhID0gZnVuY3Rpb24gKHJlc3VsdCkge1xuICBkZWxldGUgcmVzdWx0LnBhc3N3b3JkO1xuICBpZiAocmVzdWx0LmF1dGhEYXRhKSB7XG4gICAgT2JqZWN0LmtleXMocmVzdWx0LmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgIGlmIChyZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXV0aERhdGE7XG4gICAgfVxuICB9XG59O1xuXG5jb25zdCByZXBsYWNlRXF1YWxpdHlDb25zdHJhaW50ID0gY29uc3RyYWludCA9PiB7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gY29uc3RyYWludDtcbiAgfVxuICBjb25zdCBlcXVhbFRvT2JqZWN0ID0ge307XG4gIGxldCBoYXNEaXJlY3RDb25zdHJhaW50ID0gZmFsc2U7XG4gIGxldCBoYXNPcGVyYXRvckNvbnN0cmFpbnQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBrZXkgaW4gY29uc3RyYWludCkge1xuICAgIGlmIChrZXkuaW5kZXhPZignJCcpICE9PSAwKSB7XG4gICAgICBoYXNEaXJlY3RDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICAgIGVxdWFsVG9PYmplY3Rba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKGhhc0RpcmVjdENvbnN0cmFpbnQgJiYgaGFzT3BlcmF0b3JDb25zdHJhaW50KSB7XG4gICAgY29uc3RyYWludFsnJGVxJ10gPSBlcXVhbFRvT2JqZWN0O1xuICAgIE9iamVjdC5rZXlzKGVxdWFsVG9PYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGRlbGV0ZSBjb25zdHJhaW50W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGNvbnN0cmFpbnQ7XG59O1xuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgdGhpcy5yZXN0V2hlcmUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucmVzdFdoZXJlKSB7XG4gICAgdGhpcy5yZXN0V2hlcmVba2V5XSA9IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQodGhpcy5yZXN0V2hlcmVba2V5XSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbiBvYmplY3QgdGhhdCBvbmx5IGhhcyAncmVzdWx0cycuXG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5GaW5kID0gYXN5bmMgZnVuY3Rpb24gKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aCk7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAhZmluZE9wdGlvbnMuZXhwbGFpbikge1xuICAgIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICB0aGlzLmNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICBhd2FpdCB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICBmb3IgKHZhciByIG9mIHJlc3VsdHMpIHtcbiAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICB9XG4gIH1cbiAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kb0NvdW50KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuZmluZE9wdGlvbnMuY291bnQgPSB0cnVlO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5za2lwO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5saW1pdDtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCB0aGlzLmZpbmRPcHRpb25zKS50aGVuKGMgPT4ge1xuICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICB9KTtcbn07XG5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmRlbnlQcm90ZWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5maW5kT3B0aW9uc1xuICAgICkgfHwgW107XG4gIGZvciAoY29uc3Qga2V5IG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgIGlmICh0aGlzLnJlc3RXaGVyZVtrZXldKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gcXVlcnkgJHtrZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5fVW5zYWZlUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlQWxsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgICAgICAgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaW5jbHVkZUZpZWxkcy5wdXNoKFtmaWVsZF0pO1xuICAgICAgICAgIGtleUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gQWRkIGZpZWxkcyB0byBpbmNsdWRlLCBrZXlzLCByZW1vdmUgZHVwc1xuICAgICAgdGhpcy5pbmNsdWRlID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMuaW5jbHVkZSwgLi4uaW5jbHVkZUZpZWxkc10pXTtcbiAgICAgIC8vIGlmIHRoaXMua2V5cyBub3Qgc2V0LCB0aGVuIGFsbCBrZXlzIGFyZSBhbHJlYWR5IGluY2x1ZGVkXG4gICAgICBpZiAodGhpcy5rZXlzKSB7XG4gICAgICAgIHRoaXMua2V5cyA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmtleXMsIC4uLmtleUZpZWxkc10pXTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8vIFVwZGF0ZXMgcHJvcGVydHkgYHRoaXMua2V5c2AgdG8gY29udGFpbiBhbGwga2V5cyBidXQgdGhlIG9uZXMgdW5zZWxlY3RlZC5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUV4Y2x1ZGVLZXlzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZXhjbHVkZUtleXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHRoaXMua2V5cykge1xuICAgIHRoaXMua2V5cyA9IHRoaXMua2V5cy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcyk7XG4gICAgICB0aGlzLmtleXMgPSBmaWVsZHMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIH0pO1xufTtcblxuLy8gQXVnbWVudHMgdGhpcy5yZXNwb25zZSB3aXRoIGRhdGEgYXQgdGhlIHBhdGhzIHByb3ZpZGVkIGluIHRoaXMuaW5jbHVkZS5cbl9VbnNhZmVSZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBpbmRleGVkUmVzdWx0cyA9IHRoaXMucmVzcG9uc2UucmVzdWx0cy5yZWR1Y2UoKGluZGV4ZWQsIHJlc3VsdCwgaSkgPT4ge1xuICAgIGluZGV4ZWRbcmVzdWx0Lm9iamVjdElkXSA9IGk7XG4gICAgcmV0dXJuIGluZGV4ZWQ7XG4gIH0sIHt9KTtcblxuICAvLyBCdWlsZCB0aGUgZXhlY3V0aW9uIHRyZWVcbiAgY29uc3QgZXhlY3V0aW9uVHJlZSA9IHt9XG4gIHRoaXMuaW5jbHVkZS5mb3JFYWNoKHBhdGggPT4ge1xuICAgIGxldCBjdXJyZW50ID0gZXhlY3V0aW9uVHJlZTtcbiAgICBwYXRoLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgIGlmICghY3VycmVudFtub2RlXSkge1xuICAgICAgICBjdXJyZW50W25vZGVdID0ge1xuICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgY2hpbGRyZW46IHt9XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBjdXJyZW50ID0gY3VycmVudFtub2RlXS5jaGlsZHJlblxuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCByZWN1cnNpdmVFeGVjdXRpb25UcmVlID0gYXN5bmMgKHRyZWVOb2RlKSA9PiB7XG4gICAgY29uc3QgeyBwYXRoLCBjaGlsZHJlbiB9ID0gdHJlZU5vZGU7XG4gICAgY29uc3QgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMucmVzcG9uc2UsXG4gICAgICBwYXRoLFxuICAgICAgdGhpcy5jb250ZXh0LFxuICAgICAgdGhpcy5yZXN0T3B0aW9ucyxcbiAgICAgIHRoaXMsXG4gICAgKTtcbiAgICBpZiAocGF0aFJlc3BvbnNlLnRoZW4pIHtcbiAgICAgIGNvbnN0IG5ld1Jlc3BvbnNlID0gYXdhaXQgcGF0aFJlc3BvbnNlXG4gICAgICBuZXdSZXNwb25zZS5yZXN1bHRzLmZvckVhY2gobmV3T2JqZWN0ID0+IHtcbiAgICAgICAgLy8gV2UgaHlkcmF0ZSB0aGUgcm9vdCBvZiBlYWNoIHJlc3VsdCB3aXRoIHN1YiByZXN1bHRzXG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0c1tpbmRleGVkUmVzdWx0c1tuZXdPYmplY3Qub2JqZWN0SWRdXVtwYXRoWzBdXSA9IG5ld09iamVjdFtwYXRoWzBdXTtcbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChPYmplY3QudmFsdWVzKGNoaWxkcmVuKS5tYXAocmVjdXJzaXZlRXhlY3V0aW9uVHJlZSkpO1xuICB9XG5cbiAgYXdhaXQgUHJvbWlzZS5hbGwoT2JqZWN0LnZhbHVlcyhleGVjdXRpb25UcmVlKS5tYXAocmVjdXJzaXZlRXhlY3V0aW9uVHJlZSkpO1xuICB0aGlzLmluY2x1ZGUgPSBbXVxufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUucnVuQWZ0ZXJGaW5kVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdGhpcy5ydW5BZnRlckZpbmQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJGaW5kJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlckZpbmRIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBpZiAoIWhhc0FmdGVyRmluZEhvb2spIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gU2tpcCBBZ2dyZWdhdGUgYW5kIERpc3RpbmN0IFF1ZXJpZXNcbiAgaWYgKHRoaXMuZmluZE9wdGlvbnMucGlwZWxpbmUgfHwgdGhpcy5maW5kT3B0aW9ucy5kaXN0aW5jdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHRoaXMucmVzdFdoZXJlO1xuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcbiAgLy8gUnVuIGFmdGVyRmluZCB0cmlnZ2VyIGFuZCBzZXQgdGhlIG5ldyByZXN1bHRzXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgcGFyc2VRdWVyeSxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIEVuc3VyZSB3ZSBwcm9wZXJseSBzZXQgdGhlIGNsYXNzTmFtZSBiYWNrXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICAgIG9iamVjdCA9IG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuX1Vuc2FmZVJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlQXV0aEFkYXB0ZXJzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5maW5kT3B0aW9ucy5leHBsYWluKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IFByb21pc2UuYWxsKFxuICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cy5tYXAocmVzdWx0ID0+XG4gICAgICB0aGlzLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKFxuICAgICAgICB7IGNvbmZpZzogdGhpcy5jb25maWcsIGF1dGg6IHRoaXMuYXV0aCB9LFxuICAgICAgICByZXN1bHQuYXV0aERhdGFcbiAgICAgIClcbiAgICApXG4gICk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCBjb250ZXh0LCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cykge1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBleGNsdWRlS2V5U2V0ID0gQXJyYXkuZnJvbShleGNsdWRlS2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPT0ga2V5UGF0aC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGV4Y2x1ZGVLZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20oZXhjbHVkZUtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmIChyZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG4gIGNvbnN0IHF1ZXJ5UHJvbWlzZXMgPSBPYmplY3Qua2V5cyhwb2ludGVyc0hhc2gpLm1hcChhc3luYyBjbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IG9iamVjdElkcyA9IEFycmF5LmZyb20ocG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0pO1xuICAgIGxldCB3aGVyZTtcbiAgICBpZiAob2JqZWN0SWRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiBvYmplY3RJZHNbMF0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2hlcmUgPSB7IG9iamVjdElkOiB7ICRpbjogb2JqZWN0SWRzIH0gfTtcbiAgICB9XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBvYmplY3RJZHMubGVuZ3RoID09PSAxID8gUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQgOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBjb25maWcsXG4gICAgICBhdXRoLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdFdoZXJlOiB3aGVyZSxcbiAgICAgIHJlc3RPcHRpb25zOiBpbmNsdWRlUmVzdE9wdGlvbnMsXG4gICAgICBjb250ZXh0OiBjb250ZXh0LFxuICAgIH0pO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHsgb3A6ICdnZXQnIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0cyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIEdldCB0aGUgb2JqZWN0cyBmb3IgYWxsIHRoZXNlIG9iamVjdCBpZHNcbiAgcmV0dXJuIFByb21pc2UuYWxsKHF1ZXJ5UHJvbWlzZXMpLnRoZW4ocmVzcG9uc2VzID0+IHtcbiAgICB2YXIgcmVwbGFjZSA9IHJlc3BvbnNlcy5yZWR1Y2UoKHJlcGxhY2UsIGluY2x1ZGVSZXNwb25zZSkgPT4ge1xuICAgICAgZm9yICh2YXIgb2JqIG9mIGluY2x1ZGVSZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgIG9iai5fX3R5cGUgPSAnT2JqZWN0JztcbiAgICAgICAgb2JqLmNsYXNzTmFtZSA9IGluY2x1ZGVSZXNwb25zZS5jbGFzc05hbWU7XG5cbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUgPT0gJ19Vc2VyJyAmJiAhYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIGRlbGV0ZSBvYmouc2Vzc2lvblRva2VuO1xuICAgICAgICAgIGRlbGV0ZSBvYmouYXV0aERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGFjZVtvYmoub2JqZWN0SWRdID0gb2JqO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcGxhY2U7XG4gICAgfSwge30pO1xuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdC5tYXAoeCA9PiBmaW5kUG9pbnRlcnMoeCwgcGF0aCkpLmZsYXQoKTtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuLy8gRm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fVW5zYWZlUmVzdFF1ZXJ5ID0gX1Vuc2FmZVJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsTUFBTUMsUUFBUSxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU07RUFBRUc7QUFBYyxDQUFDLEdBQUdILE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQztBQUNoRSxNQUFNSSxrQkFBa0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztBQUN4RSxNQUFNO0VBQUVDO0FBQW9CLENBQUMsR0FBR0wsT0FBTyxDQUFDLGNBQWMsQ0FBQzs7QUFFdkQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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