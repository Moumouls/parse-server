"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;
const Utils = require('../../../Utils');
const transformKey = (className, fieldName, schema) => {
  // Check if the schema is known since it's a built-in field.
  switch (fieldName) {
    case 'objectId':
      return '_id';
    case 'createdAt':
      return '_created_at';
    case 'updatedAt':
      return '_updated_at';
    case 'sessionToken':
      return '_session_token';
    case 'lastUsed':
      return '_last_used';
    case 'timesUsed':
      return 'times_used';
  }
  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  } else if (schema.fields[fieldName] && schema.fields[fieldName].type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }
  return fieldName;
};
const transformKeyValueForUpdate = (className, restKey, restValue, parseFormatSchema) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;
  switch (key) {
    case 'objectId':
    case '_id':
      if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
        return {
          key: key,
          value: parseInt(restValue)
        };
      }
      key = '_id';
      break;
    case 'createdAt':
    case '_created_at':
      key = '_created_at';
      timeField = true;
      break;
    case 'updatedAt':
    case '_updated_at':
      key = '_updated_at';
      timeField = true;
      break;
    case 'sessionToken':
    case '_session_token':
      key = '_session_token';
      break;
    case 'expiresAt':
    case '_expiresAt':
      key = 'expiresAt';
      timeField = true;
      break;
    case '_email_verify_token_expires_at':
      key = '_email_verify_token_expires_at';
      timeField = true;
      break;
    case '_account_lockout_expires_at':
      key = '_account_lockout_expires_at';
      timeField = true;
      break;
    case '_failed_login_count':
      key = '_failed_login_count';
      break;
    case '_perishable_token_expires_at':
      key = '_perishable_token_expires_at';
      timeField = true;
      break;
    case '_password_changed_at':
      key = '_password_changed_at';
      timeField = true;
      break;
    case '_rperm':
    case '_wperm':
      return {
        key: key,
        value: restValue
      };
    case 'lastUsed':
    case '_last_used':
      key = '_last_used';
      timeField = true;
      break;
    case 'timesUsed':
    case 'times_used':
      key = 'times_used';
      timeField = true;
      break;
  }
  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !key.includes('.') && !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer' // Do not use the _p_ prefix for pointers inside nested documents
  ) {
    key = '_p_' + key;
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    if (timeField && typeof value === 'string') {
      value = new Date(value);
    }
    if (restKey.indexOf('.') > 0) {
      return {
        key,
        value: restValue
      };
    }
    return {
      key,
      value
    };
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key,
      value
    };
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {
      key,
      value: transformUpdateOperator(restValue, false)
    };
  }

  // Handle normal objects by recursing
  value = mapValues(restValue, transformInteriorValue);
  return {
    key,
    value
  };
};
const isRegex = value => {
  return value && value instanceof RegExp;
};
const isStartsWithRegex = value => {
  if (!isRegex(value)) {
    return false;
  }
  const matches = value.toString().match(/\/\^\\Q.*\\E\//);
  return !!matches;
};
const isAllValuesRegexOrNone = values => {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0]);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i])) {
      return false;
    }
  }
  return true;
};
const isAnyValueRegex = values => {
  return values.some(function (value) {
    return isRegex(value);
  });
};
const transformInteriorValue = restValue => {
  if (restValue !== null && typeof restValue === 'object' && Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  // Handle atomic values
  var value = transformInteriorAtom(restValue);
  if (value !== CannotTransform) {
    if (value && typeof value === 'object') {
      if (value instanceof Date) {
        return value;
      }
      if (value instanceof Array) {
        value = value.map(transformInteriorValue);
      } else {
        value = mapValues(value, transformInteriorValue);
      }
    }
    return value;
  }

  // Handle arrays
  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  }

  // Handle normal objects by recursing
  return mapValues(restValue, transformInteriorValue);
};
const valueAsDate = value => {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }
  return false;
};
function transformQueryKeyValue(className, key, value, schema, count = false) {
  switch (key) {
    case 'createdAt':
      if (valueAsDate(value)) {
        return {
          key: '_created_at',
          value: valueAsDate(value)
        };
      }
      key = '_created_at';
      break;
    case 'updatedAt':
      if (valueAsDate(value)) {
        return {
          key: '_updated_at',
          value: valueAsDate(value)
        };
      }
      key = '_updated_at';
      break;
    case 'expiresAt':
      if (valueAsDate(value)) {
        return {
          key: 'expiresAt',
          value: valueAsDate(value)
        };
      }
      break;
    case '_email_verify_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_email_verify_token_expires_at',
          value: valueAsDate(value)
        };
      }
      break;
    case 'objectId':
      {
        if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
          value = parseInt(value);
        }
        return {
          key: '_id',
          value
        };
      }
    case '_account_lockout_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_account_lockout_expires_at',
          value: valueAsDate(value)
        };
      }
      break;
    case '_failed_login_count':
      return {
        key,
        value
      };
    case 'sessionToken':
      return {
        key: '_session_token',
        value
      };
    case '_perishable_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_perishable_token_expires_at',
          value: valueAsDate(value)
        };
      }
      break;
    case '_password_changed_at':
      if (valueAsDate(value)) {
        return {
          key: '_password_changed_at',
          value: valueAsDate(value)
        };
      }
      break;
    case '_rperm':
    case '_wperm':
    case '_perishable_token':
    case '_email_verify_token':
      return {
        key,
        value
      };
    case '$or':
    case '$and':
    case '$nor':
      return {
        key: key,
        value: value.map(subQuery => transformWhere(className, subQuery, schema, count))
      };
    case 'lastUsed':
      if (valueAsDate(value)) {
        return {
          key: '_last_used',
          value: valueAsDate(value)
        };
      }
      key = '_last_used';
      break;
    case 'timesUsed':
      return {
        key: 'times_used',
        value: value
      };
    default:
      {
        // Other auth data
        const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
        if (authDataMatch) {
          const provider = authDataMatch[1];
          // Special-case auth data.
          return {
            key: `_auth_data_${provider}.id`,
            value
          };
        }
      }
  }
  const expectedTypeIsArray = schema && schema.fields[key] && schema.fields[key].type === 'Array';
  const expectedTypeIsPointer = schema && schema.fields[key] && schema.fields[key].type === 'Pointer';
  const field = schema && schema.fields[key];
  if (expectedTypeIsPointer || !schema && !key.includes('.') && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  }

  // Handle query constraints
  const transformedConstraint = transformConstraint(value, field, key, count);
  if (transformedConstraint !== CannotTransform) {
    if (transformedConstraint.$text) {
      return {
        key: '$text',
        value: transformedConstraint.$text
      };
    }
    if (transformedConstraint.$elemMatch) {
      return {
        key: '$nor',
        value: [{
          [key]: transformedConstraint
        }]
      };
    }
    return {
      key,
      value: transformedConstraint
    };
  }
  if (expectedTypeIsArray && !(value instanceof Array)) {
    return {
      key,
      value: {
        $all: [transformInteriorAtom(value)]
      }
    };
  }

  // Handle atomic values
  const transformRes = key.includes('.') ? transformInteriorAtom(value) : transformTopLevelAtom(value);
  if (transformRes !== CannotTransform) {
    return {
      key,
      value: transformRes
    };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
}

// Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.
function transformWhere(className, restWhere, schema, count = false) {
  const mongoWhere = {};
  for (const restKey in restWhere) {
    const out = transformQueryKeyValue(className, restKey, restWhere[restKey], schema, count);
    mongoWhere[out.key] = out.value;
  }
  return mongoWhere;
}
const parseObjectKeyValueToMongoObjectKeyValue = (restKey, restValue, schema) => {
  // Check if the schema is known since it's a built-in field.
  let transformedValue;
  let coercedToDate;
  switch (restKey) {
    case 'objectId':
      return {
        key: '_id',
        value: restValue
      };
    case 'expiresAt':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: 'expiresAt',
        value: coercedToDate
      };
    case '_email_verify_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_email_verify_token_expires_at',
        value: coercedToDate
      };
    case '_account_lockout_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_account_lockout_expires_at',
        value: coercedToDate
      };
    case '_perishable_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_perishable_token_expires_at',
        value: coercedToDate
      };
    case '_password_changed_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_password_changed_at',
        value: coercedToDate
      };
    case '_failed_login_count':
    case '_rperm':
    case '_wperm':
    case '_email_verify_token':
    case '_hashed_password':
    case '_perishable_token':
      return {
        key: restKey,
        value: restValue
      };
    case 'sessionToken':
      return {
        key: '_session_token',
        value: restValue
      };
    default:
      // Auth data should have been transformed already
      if (restKey.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + restKey);
      }
      // Trust that the auth data has been transformed and save it directly
      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return {
          key: restKey,
          value: restValue
        };
      }
  }
  //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason
  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    return {
      key: restKey,
      value: value
    };
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key: restKey,
      value: value
    };
  }

  // Handle normal objects by recursing
  if (Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  value = mapValues(restValue, transformInteriorValue);
  return {
    key: restKey,
    value
  };
};
const parseObjectToMongoObjectForCreate = (className, restCreate, schema) => {
  restCreate = addLegacyACL(restCreate);
  const mongoCreate = {};
  for (const restKey in restCreate) {
    if (restCreate[restKey] && restCreate[restKey].__type === 'Relation') {
      continue;
    }
    const {
      key,
      value
    } = parseObjectKeyValueToMongoObjectKeyValue(restKey, restCreate[restKey], schema);
    if (value !== undefined) {
      mongoCreate[key] = value;
    }
  }

  // Use the legacy mongo format for createdAt and updatedAt
  if (mongoCreate.createdAt) {
    mongoCreate._created_at = new Date(mongoCreate.createdAt.iso || mongoCreate.createdAt);
    delete mongoCreate.createdAt;
  }
  if (mongoCreate.updatedAt) {
    mongoCreate._updated_at = new Date(mongoCreate.updatedAt.iso || mongoCreate.updatedAt);
    delete mongoCreate.updatedAt;
  }
  return mongoCreate;
};

// Main exposed method to help update old objects.
const transformUpdate = (className, restUpdate, parseFormatSchema) => {
  const mongoUpdate = {};
  const acl = addLegacyACL(restUpdate);
  if (acl._rperm || acl._wperm || acl._acl) {
    mongoUpdate.$set = {};
    if (acl._rperm) {
      mongoUpdate.$set._rperm = acl._rperm;
    }
    if (acl._wperm) {
      mongoUpdate.$set._wperm = acl._wperm;
    }
    if (acl._acl) {
      mongoUpdate.$set._acl = acl._acl;
    }
  }
  for (var restKey in restUpdate) {
    if (restUpdate[restKey] && restUpdate[restKey].__type === 'Relation') {
      continue;
    }
    var out = transformKeyValueForUpdate(className, restKey, restUpdate[restKey], parseFormatSchema);

    // If the output value is an object with any $ keys, it's an
    // operator that needs to be lifted onto the top level update
    // object.
    if (typeof out.value === 'object' && out.value !== null && out.value.__op) {
      mongoUpdate[out.value.__op] = mongoUpdate[out.value.__op] || {};
      mongoUpdate[out.value.__op][out.key] = out.value.arg;
    } else {
      mongoUpdate['$set'] = mongoUpdate['$set'] || {};
      mongoUpdate['$set'][out.key] = out.value;
    }
  }
  return mongoUpdate;
};

// Add the legacy _acl format.
const addLegacyACL = restObject => {
  const restObjectCopy = {
    ...restObject
  };
  const _acl = {};
  if (restObject._wperm) {
    restObject._wperm.forEach(entry => {
      _acl[entry] = {
        w: true
      };
    });
    restObjectCopy._acl = _acl;
  }
  if (restObject._rperm) {
    restObject._rperm.forEach(entry => {
      if (!(entry in _acl)) {
        _acl[entry] = {
          r: true
        };
      } else {
        _acl[entry].r = true;
      }
    });
    restObjectCopy._acl = _acl;
  }
  return restObjectCopy;
};

// A sentinel value that helper transformations return when they
// cannot perform a transformation
function CannotTransform() {}
const transformInteriorAtom = atom => {
  // TODO: check validity harder for the __type-defined types
  if (typeof atom === 'object' && atom && !(atom instanceof Date) && atom.__type === 'Pointer') {
    return {
      __type: 'Pointer',
      className: atom.className,
      objectId: atom.objectId
    };
  } else if (typeof atom === 'function' || typeof atom === 'symbol') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);
  } else if (DateCoder.isValidJSON(atom)) {
    return DateCoder.JSONToDatabase(atom);
  } else if (BytesCoder.isValidJSON(atom)) {
    return BytesCoder.JSONToDatabase(atom);
  } else if (typeof atom === 'object' && atom && atom.$regex !== undefined) {
    return new RegExp(atom.$regex);
  } else {
    return atom;
  }
};

// Helper function to transform an atom from REST format to Mongo format.
// An atom is anything that can't contain other expressions. So it
// includes things where objects are used to represent other
// datatypes, like pointers and dates, but it does not include objects
// or arrays with generic stuff inside.
// Raises an error if this cannot possibly be valid REST format.
// Returns CannotTransform if it's just not an atom
function transformTopLevelAtom(atom, field) {
  switch (typeof atom) {
    case 'number':
    case 'boolean':
    case 'undefined':
      return atom;
    case 'string':
      if (field && field.type === 'Pointer') {
        return `${field.targetClass}$${atom}`;
      }
      return atom;
    case 'symbol':
    case 'function':
      throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);
    case 'object':
      if (atom instanceof Date) {
        // Technically dates are not rest format, but, it seems pretty
        // clear what they should be transformed to, so let's just do it.
        return atom;
      }
      if (atom === null) {
        return atom;
      }

      // TODO: check validity harder for the __type-defined types
      if (atom.__type == 'Pointer') {
        return `${atom.className}$${atom.objectId}`;
      }
      if (DateCoder.isValidJSON(atom)) {
        return DateCoder.JSONToDatabase(atom);
      }
      if (BytesCoder.isValidJSON(atom)) {
        return BytesCoder.JSONToDatabase(atom);
      }
      if (GeoPointCoder.isValidJSON(atom)) {
        return GeoPointCoder.JSONToDatabase(atom);
      }
      if (PolygonCoder.isValidJSON(atom)) {
        return PolygonCoder.JSONToDatabase(atom);
      }
      if (FileCoder.isValidJSON(atom)) {
        return FileCoder.JSONToDatabase(atom);
      }
      return CannotTransform;
    default:
      // I don't think typeof can ever let us get here
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `really did not expect value: ${atom}`);
  }
}

// Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.
function transformConstraint(constraint, field, queryKey, count = false) {
  const inArray = field && field.type && field.type === 'Array';
  // Check wether the given key has `.`
  const isNestedKey = queryKey.indexOf('.') > -1;
  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }
  // For inArray or nested key, we need to transform the interior atom
  const transformFunction = inArray || isNestedKey ? transformInteriorAtom : transformTopLevelAtom;
  const transformer = atom => {
    const result = transformFunction(atom, field);
    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${JSON.stringify(atom)}`);
    }
    return result;
  };
  // keys is the constraints in reverse alphabetical order.
  // This is a hack so that:
  //   $regex is handled before $options
  //   $nearSphere is handled before $maxDistance
  var keys = Object.keys(constraint).sort().reverse();
  var answer = {};
  for (var key of keys) {
    switch (key) {
      case '$lt':
      case '$lte':
      case '$gt':
      case '$gte':
      case '$exists':
      case '$ne':
      case '$eq':
        {
          const val = constraint[key];
          if (val && typeof val === 'object' && val.$relativeTime) {
            if (field && field.type !== 'Date') {
              throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            switch (key) {
              case '$exists':
              case '$ne':
              case '$eq':
                throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            }
            const parserResult = Utils.relativeTimeToDate(val.$relativeTime);
            if (parserResult.status === 'success') {
              answer[key] = parserResult.result;
              break;
            }
            _logger.default.info('Error while parsing relative date', parserResult);
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $relativeTime (${key}) value. ${parserResult.info}`);
          }
          answer[key] = transformer(val);
          break;
        }
      case '$in':
      case '$nin':
        {
          const arr = constraint[key];
          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }
          answer[key] = _lodash.default.flatMap(arr, value => {
            return (atom => {
              if (Array.isArray(atom)) {
                return value.map(transformer);
              } else {
                return transformer(atom);
              }
            })(value);
          });
          break;
        }
      case '$all':
        {
          const arr = constraint[key];
          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }
          answer[key] = arr.map(transformInteriorAtom);
          const values = answer[key];
          if (isAnyValueRegex(values) && !isAllValuesRegexOrNone(values)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + values);
          }
          break;
        }
      case '$regex':
        var s = constraint[key];
        if (typeof s !== 'string') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad regex: ' + s);
        }
        answer[key] = s;
        break;
      case '$containedBy':
        {
          const arr = constraint[key];
          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $containedBy: should be an array`);
          }
          answer.$elemMatch = {
            $nin: arr.map(transformer)
          };
          break;
        }
      case '$options':
        answer[key] = constraint[key];
        break;
      case '$text':
        {
          const search = constraint[key].$search;
          if (typeof search !== 'object') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $search, should be object`);
          }
          if (!search.$term || typeof search.$term !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $term, should be string`);
          } else {
            answer[key] = {
              $search: search.$term
            };
          }
          if (search.$language && typeof search.$language !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $language, should be string`);
          } else if (search.$language) {
            answer[key].$language = search.$language;
          }
          if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
          } else if (search.$caseSensitive) {
            answer[key].$caseSensitive = search.$caseSensitive;
          }
          if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
          } else if (search.$diacriticSensitive) {
            answer[key].$diacriticSensitive = search.$diacriticSensitive;
          }
          break;
        }
      case '$nearSphere':
        {
          const point = constraint[key];
          if (count) {
            answer.$geoWithin = {
              $centerSphere: [[point.longitude, point.latitude], constraint.$maxDistance]
            };
          } else {
            answer[key] = [point.longitude, point.latitude];
          }
          break;
        }
      case '$maxDistance':
        {
          if (count) {
            break;
          }
          answer[key] = constraint[key];
          break;
        }
      // The SDKs don't seem to use these but they are documented in the
      // REST API docs.
      case '$maxDistanceInRadians':
        answer['$maxDistance'] = constraint[key];
        break;
      case '$maxDistanceInMiles':
        answer['$maxDistance'] = constraint[key] / 3959;
        break;
      case '$maxDistanceInKilometers':
        answer['$maxDistance'] = constraint[key] / 6371;
        break;
      case '$select':
      case '$dontSelect':
        throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'the ' + key + ' constraint is not supported yet');
      case '$within':
        var box = constraint[key]['$box'];
        if (!box || box.length != 2) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'malformatted $within arg');
        }
        answer[key] = {
          $box: [[box[0].longitude, box[0].latitude], [box[1].longitude, box[1].latitude]]
        };
        break;
      case '$geoWithin':
        {
          const polygon = constraint[key]['$polygon'];
          const centerSphere = constraint[key]['$centerSphere'];
          if (polygon !== undefined) {
            let points;
            if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
              if (!polygon.coordinates || polygon.coordinates.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
              }
              points = polygon.coordinates;
            } else if (polygon instanceof Array) {
              if (polygon.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
              }
              points = polygon;
            } else {
              throw new Parse.Error(Parse.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
            }
            points = points.map(point => {
              if (point instanceof Array && point.length === 2) {
                Parse.GeoPoint._validate(point[1], point[0]);
                return point;
              }
              if (!GeoPointCoder.isValidJSON(point)) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
              } else {
                Parse.GeoPoint._validate(point.latitude, point.longitude);
              }
              return [point.longitude, point.latitude];
            });
            answer[key] = {
              $polygon: points
            };
          } else if (centerSphere !== undefined) {
            if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
            }
            // Get point, convert to geo point if necessary and validate
            let point = centerSphere[0];
            if (point instanceof Array && point.length === 2) {
              point = new Parse.GeoPoint(point[1], point[0]);
            } else if (!GeoPointCoder.isValidJSON(point)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
            }
            Parse.GeoPoint._validate(point.latitude, point.longitude);
            // Get distance and validate
            const distance = centerSphere[1];
            if (isNaN(distance) || distance < 0) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
            }
            answer[key] = {
              $centerSphere: [[point.longitude, point.latitude], distance]
            };
          }
          break;
        }
      case '$geoIntersects':
        {
          const point = constraint[key]['$point'];
          if (!GeoPointCoder.isValidJSON(point)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
          } else {
            Parse.GeoPoint._validate(point.latitude, point.longitude);
          }
          answer[key] = {
            $geometry: {
              type: 'Point',
              coordinates: [point.longitude, point.latitude]
            }
          };
          break;
        }
      default:
        if (key.match(/^\$+/)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad constraint: ' + key);
        }
        return CannotTransform;
    }
  }
  return answer;
}

// Transforms an update operator from REST format to mongo format.
// To be transformed, the input should have an __op field.
// If flatten is true, this will flatten operators to their static
// data format. For example, an increment of 2 would simply become a
// 2.
// The output for a non-flattened operator is a hash with __op being
// the mongo op, and arg being the argument.
// The output for a flattened operator is just a value.
// Returns undefined if this should be a no-op.

function transformUpdateOperator({
  __op,
  amount,
  objects
}, flatten) {
  switch (__op) {
    case 'Delete':
      if (flatten) {
        return undefined;
      } else {
        return {
          __op: '$unset',
          arg: ''
        };
      }
    case 'Increment':
      if (typeof amount !== 'number') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'incrementing must provide a number');
      }
      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$inc',
          arg: amount
        };
      }
    case 'SetOnInsert':
      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$setOnInsert',
          arg: amount
        };
      }
    case 'Add':
    case 'AddUnique':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
      }
      var toAdd = objects.map(transformInteriorAtom);
      if (flatten) {
        return toAdd;
      } else {
        var mongoOp = {
          Add: '$push',
          AddUnique: '$addToSet'
        }[__op];
        return {
          __op: mongoOp,
          arg: {
            $each: toAdd
          }
        };
      }
    case 'Remove':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to remove must be an array');
      }
      var toRemove = objects.map(transformInteriorAtom);
      if (flatten) {
        return [];
      } else {
        return {
          __op: '$pullAll',
          arg: toRemove
        };
      }
    default:
      throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, `The ${__op} operator is not supported yet.`);
  }
}
function mapValues(object, iterator) {
  const result = {};
  Object.keys(object).forEach(key => {
    result[key] = iterator(object[key]);
  });
  return result;
}
const nestedMongoObjectToNestedParseObject = mongoObject => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;
    case 'symbol':
    case 'function':
      throw 'bad value in nestedMongoObjectToNestedParseObject';
    case 'object':
      if (mongoObject === null) {
        return null;
      }
      if (mongoObject instanceof Array) {
        return mongoObject.map(nestedMongoObjectToNestedParseObject);
      }
      if (mongoObject instanceof Date) {
        return Parse._encode(mongoObject);
      }
      if (mongoObject instanceof mongodb.Long) {
        return mongoObject.toNumber();
      }
      if (mongoObject instanceof mongodb.Double) {
        return mongoObject.value;
      }
      if (BytesCoder.isValidDatabaseObject(mongoObject)) {
        return BytesCoder.databaseToJSON(mongoObject);
      }
      if (Object.prototype.hasOwnProperty.call(mongoObject, '__type') && mongoObject.__type == 'Date' && mongoObject.iso instanceof Date) {
        mongoObject.iso = mongoObject.iso.toJSON();
        return mongoObject;
      }
      return mapValues(mongoObject, nestedMongoObjectToNestedParseObject);
    default:
      throw 'unknown js type';
  }
};
const transformPointerString = (schema, field, pointerString) => {
  const objData = pointerString.split('$');
  if (objData[0] !== schema.fields[field].targetClass) {
    throw 'pointer to incorrect className';
  }
  return {
    __type: 'Pointer',
    className: objData[0],
    objectId: objData[1]
  };
};

// Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.
const mongoObjectToParseObject = (className, mongoObject, schema) => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;
    case 'symbol':
    case 'function':
      throw 'bad value in mongoObjectToParseObject';
    case 'object':
      {
        if (mongoObject === null) {
          return null;
        }
        if (mongoObject instanceof Array) {
          return mongoObject.map(nestedMongoObjectToNestedParseObject);
        }
        if (mongoObject instanceof Date) {
          return Parse._encode(mongoObject);
        }
        if (mongoObject instanceof mongodb.Long) {
          return mongoObject.toNumber();
        }
        if (mongoObject instanceof mongodb.Double) {
          return mongoObject.value;
        }
        if (BytesCoder.isValidDatabaseObject(mongoObject)) {
          return BytesCoder.databaseToJSON(mongoObject);
        }
        const restObject = {};
        if (mongoObject._rperm || mongoObject._wperm) {
          restObject._rperm = mongoObject._rperm || [];
          restObject._wperm = mongoObject._wperm || [];
          delete mongoObject._rperm;
          delete mongoObject._wperm;
        }
        for (var key in mongoObject) {
          switch (key) {
            case '_id':
              restObject['objectId'] = '' + mongoObject[key];
              break;
            case '_hashed_password':
              restObject._hashed_password = mongoObject[key];
              break;
            case '_acl':
              break;
            case '_email_verify_token':
            case '_perishable_token':
            case '_perishable_token_expires_at':
            case '_password_changed_at':
            case '_tombstone':
            case '_email_verify_token_expires_at':
            case '_account_lockout_expires_at':
            case '_failed_login_count':
            case '_password_history':
              // Those keys will be deleted if needed in the DB Controller
              restObject[key] = mongoObject[key];
              break;
            case '_session_token':
              restObject['sessionToken'] = mongoObject[key];
              break;
            case 'updatedAt':
            case '_updated_at':
              restObject['updatedAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;
            case 'createdAt':
            case '_created_at':
              restObject['createdAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;
            case 'expiresAt':
            case '_expiresAt':
              restObject['expiresAt'] = Parse._encode(new Date(mongoObject[key]));
              break;
            case 'lastUsed':
            case '_last_used':
              restObject['lastUsed'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;
            case 'timesUsed':
            case 'times_used':
              restObject['timesUsed'] = mongoObject[key];
              break;
            case 'authData':
              if (className === '_User') {
                _logger.default.warn('ignoring authData in _User as this key is reserved to be synthesized of `_auth_data_*` keys');
              } else {
                restObject['authData'] = mongoObject[key];
              }
              break;
            default:
              // Check other auth data keys
              var authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
              if (authDataMatch && className === '_User') {
                var provider = authDataMatch[1];
                restObject['authData'] = restObject['authData'] || {};
                restObject['authData'][provider] = mongoObject[key];
                break;
              }
              if (key.indexOf('_p_') == 0) {
                var newKey = key.substring(3);
                if (!schema.fields[newKey]) {
                  _logger.default.info('transform.js', 'Found a pointer column not in the schema, dropping it.', className, newKey);
                  break;
                }
                if (schema.fields[newKey].type !== 'Pointer') {
                  _logger.default.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);
                  break;
                }
                if (mongoObject[key] === null) {
                  break;
                }
                restObject[newKey] = transformPointerString(schema, newKey, mongoObject[key]);
                break;
              } else if (key[0] == '_' && key != '__type') {
                throw 'bad key in untransform: ' + key;
              } else {
                var value = mongoObject[key];
                if (schema.fields[key] && schema.fields[key].type === 'File' && FileCoder.isValidDatabaseObject(value)) {
                  restObject[key] = FileCoder.databaseToJSON(value);
                  break;
                }
                if (schema.fields[key] && schema.fields[key].type === 'GeoPoint' && GeoPointCoder.isValidDatabaseObject(value)) {
                  restObject[key] = GeoPointCoder.databaseToJSON(value);
                  break;
                }
                if (schema.fields[key] && schema.fields[key].type === 'Polygon' && PolygonCoder.isValidDatabaseObject(value)) {
                  restObject[key] = PolygonCoder.databaseToJSON(value);
                  break;
                }
                if (schema.fields[key] && schema.fields[key].type === 'Bytes' && BytesCoder.isValidDatabaseObject(value)) {
                  restObject[key] = BytesCoder.databaseToJSON(value);
                  break;
                }
              }
              restObject[key] = nestedMongoObjectToNestedParseObject(mongoObject[key]);
          }
        }
        const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
        const relationFields = {};
        relationFieldNames.forEach(relationFieldName => {
          relationFields[relationFieldName] = {
            __type: 'Relation',
            className: schema.fields[relationFieldName].targetClass
          };
        });
        return {
          ...restObject,
          ...relationFields
        };
      }
    default:
      throw 'unknown js type';
  }
};
var DateCoder = {
  JSONToDatabase(json) {
    return new Date(json.iso);
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Date';
  }
};
var BytesCoder = {
  base64Pattern: new RegExp('^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'),
  isBase64Value(object) {
    if (typeof object !== 'string') {
      return false;
    }
    return this.base64Pattern.test(object);
  },
  databaseToJSON(object) {
    let value;
    if (this.isBase64Value(object)) {
      value = object;
    } else {
      value = object.buffer.toString('base64');
    }
    return {
      __type: 'Bytes',
      base64: value
    };
  },
  isValidDatabaseObject(object) {
    return object instanceof mongodb.Binary || this.isBase64Value(object);
  },
  JSONToDatabase(json) {
    return new mongodb.Binary(Buffer.from(json.base64, 'base64'));
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Bytes';
  }
};
var GeoPointCoder = {
  databaseToJSON(object) {
    return {
      __type: 'GeoPoint',
      latitude: object[1],
      longitude: object[0]
    };
  },
  isValidDatabaseObject(object) {
    return object instanceof Array && object.length == 2;
  },
  JSONToDatabase(json) {
    return [json.longitude, json.latitude];
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var PolygonCoder = {
  databaseToJSON(object) {
    // Convert lng/lat -> lat/lng
    const coords = object.coordinates[0].map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      __type: 'Polygon',
      coordinates: coords
    };
  },
  isValidDatabaseObject(object) {
    const coords = object.coordinates[0];
    if (object.type !== 'Polygon' || !(coords instanceof Array)) {
      return false;
    }
    for (let i = 0; i < coords.length; i++) {
      const point = coords[i];
      if (!GeoPointCoder.isValidDatabaseObject(point)) {
        return false;
      }
      Parse.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    }
    return true;
  },
  JSONToDatabase(json) {
    let coords = json.coordinates;
    // Add first point to the end to close polygon
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }
    const unique = coords.filter((item, index, ar) => {
      let foundIndex = -1;
      for (let i = 0; i < ar.length; i += 1) {
        const pt = ar[i];
        if (pt[0] === item[0] && pt[1] === item[1]) {
          foundIndex = i;
          break;
        }
      }
      return foundIndex === index;
    });
    if (unique.length < 3) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
    }
    // Convert lat/long -> long/lat
    coords = coords.map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      type: 'Polygon',
      coordinates: [coords]
    };
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Polygon';
  }
};
var FileCoder = {
  databaseToJSON(object) {
    return {
      __type: 'File',
      name: object
    };
  },
  isValidDatabaseObject(object) {
    return typeof object === 'string';
  },
  JSONToDatabase(json) {
    return json.name;
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'File';
  }
};
module.exports = {
  transformKey,
  parseObjectToMongoObjectForCreate,
  transformUpdate,
  transformWhere,
  mongoObjectToParseObject,
  transformConstraint,
  transformPointerString
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwibW9uZ29kYiIsIlBhcnNlIiwiVXRpbHMiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJ0cmFuc2Zvcm1SZXMiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiY29uc3RyYWludCIsInF1ZXJ5S2V5IiwiaW5BcnJheSIsImlzTmVzdGVkS2V5IiwidHJhbnNmb3JtRnVuY3Rpb24iLCJ0cmFuc2Zvcm1lciIsInJlc3VsdCIsIkpTT04iLCJzdHJpbmdpZnkiLCJzb3J0IiwicmV2ZXJzZSIsImFuc3dlciIsInZhbCIsIiRyZWxhdGl2ZVRpbWUiLCJwYXJzZXJSZXN1bHQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJzdGF0dXMiLCJsb2ciLCJpbmZvIiwiYXJyIiwiXyIsImZsYXRNYXAiLCJzIiwiJG5pbiIsInNlYXJjaCIsIiRzZWFyY2giLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsInBvaW50IiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRtYXhEaXN0YW5jZSIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJib3giLCIkYm94IiwicG9seWdvbiIsImNlbnRlclNwaGVyZSIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiR2VvUG9pbnQiLCJfdmFsaWRhdGUiLCIkcG9seWdvbiIsImRpc3RhbmNlIiwiaXNOYU4iLCIkZ2VvbWV0cnkiLCJhbW91bnQiLCJvYmplY3RzIiwiZmxhdHRlbiIsInRvQWRkIiwibW9uZ29PcCIsIkFkZCIsIkFkZFVuaXF1ZSIsIiRlYWNoIiwidG9SZW1vdmUiLCJvYmplY3QiLCJpdGVyYXRvciIsIm5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCIsIm1vbmdvT2JqZWN0IiwiX2VuY29kZSIsIkxvbmciLCJ0b051bWJlciIsIkRvdWJsZSIsImlzVmFsaWREYXRhYmFzZU9iamVjdCIsImRhdGFiYXNlVG9KU09OIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidG9KU09OIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsInBvaW50ZXJTdHJpbmciLCJvYmpEYXRhIiwic3BsaXQiLCJtb25nb09iamVjdFRvUGFyc2VPYmplY3QiLCJfaGFzaGVkX3Bhc3N3b3JkIiwid2FybiIsIm5ld0tleSIsInN1YnN0cmluZyIsInJlbGF0aW9uRmllbGROYW1lcyIsImZpbHRlciIsInJlbGF0aW9uRmllbGRzIiwicmVsYXRpb25GaWVsZE5hbWUiLCJqc29uIiwiYmFzZTY0UGF0dGVybiIsImlzQmFzZTY0VmFsdWUiLCJ0ZXN0IiwiYnVmZmVyIiwiYmFzZTY0IiwiQmluYXJ5IiwiQnVmZmVyIiwiZnJvbSIsImNvb3JkcyIsImNvb3JkIiwicGFyc2VGbG9hdCIsInB1c2giLCJ1bmlxdWUiLCJpdGVtIiwiaW5kZXgiLCJhciIsImZvdW5kSW5kZXgiLCJwdCIsIm5hbWUiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29UcmFuc2Zvcm0uanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGxvZyBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbnZhciBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCB0cmFuc2Zvcm1LZXkgPSAoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgc3dpdGNoIChmaWVsZE5hbWUpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgICByZXR1cm4gJ19pZCc7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX2NyZWF0ZWRfYXQnO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICByZXR1cm4gJ191cGRhdGVkX2F0JztcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuICdfc2Vzc2lvbl90b2tlbic7XG4gICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgcmV0dXJuICdfbGFzdF91c2VkJztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuICd0aW1lc191c2VkJztcbiAgfVxuXG4gIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLl9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgZmllbGROYW1lID0gJ19wXycgKyBmaWVsZE5hbWU7XG4gIH1cblxuICByZXR1cm4gZmllbGROYW1lO1xufTtcblxuY29uc3QgdHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUgPSAoY2xhc3NOYW1lLCByZXN0S2V5LCByZXN0VmFsdWUsIHBhcnNlRm9ybWF0U2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICB2YXIga2V5ID0gcmVzdEtleTtcbiAgdmFyIHRpbWVGaWVsZCA9IGZhbHNlO1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICBjYXNlICdfaWQnOlxuICAgICAgaWYgKFsnX0dsb2JhbENvbmZpZycsICdfR3JhcGhRTENvbmZpZyddLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgICB2YWx1ZTogcGFyc2VJbnQocmVzdFZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfaWQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICBjYXNlICdfY3JlYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgY2FzZSAnX3VwZGF0ZWRfYXQnOlxuICAgICAga2V5ID0gJ191cGRhdGVkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgIGNhc2UgJ19zZXNzaW9uX3Rva2VuJzpcbiAgICAgIGtleSA9ICdfc2Vzc2lvbl90b2tlbic7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgIGNhc2UgJ19leHBpcmVzQXQnOlxuICAgICAga2V5ID0gJ2V4cGlyZXNBdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIGtleSA9ICdfZmFpbGVkX2xvZ2luX2NvdW50JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIGtleSA9ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgICAgcmV0dXJuIHsga2V5OiBrZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgY2FzZSAnX2xhc3RfdXNlZCc6XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICBjYXNlICd0aW1lc191c2VkJzpcbiAgICAgIGtleSA9ICd0aW1lc191c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgfVxuXG4gIGlmIChcbiAgICAocGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0gJiYgcGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICgha2V5LmluY2x1ZGVzKCcuJykgJiZcbiAgICAgICFwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgcmVzdFZhbHVlICYmXG4gICAgICByZXN0VmFsdWUuX190eXBlID09ICdQb2ludGVyJykgLy8gRG8gbm90IHVzZSB0aGUgX3BfIHByZWZpeCBmb3IgcG9pbnRlcnMgaW5zaWRlIG5lc3RlZCBkb2N1bWVudHNcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICBpZiAodGltZUZpZWxkICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHZhbHVlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cbiAgICBpZiAocmVzdEtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YWx1ZSA9IHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIHVwZGF0ZSBvcGVyYXRvcnNcbiAgaWYgKHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmICdfX29wJyBpbiByZXN0VmFsdWUpIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIGZhbHNlKSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICB2YWx1ZSA9IG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICByZXR1cm4geyBrZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBpc1JlZ2V4ID0gdmFsdWUgPT4ge1xuICByZXR1cm4gdmFsdWUgJiYgdmFsdWUgaW5zdGFuY2VvZiBSZWdFeHA7XG59O1xuXG5jb25zdCBpc1N0YXJ0c1dpdGhSZWdleCA9IHZhbHVlID0+IHtcbiAgaWYgKCFpc1JlZ2V4KHZhbHVlKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS50b1N0cmluZygpLm1hdGNoKC9cXC9cXF5cXFxcUS4qXFxcXEVcXC8vKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn07XG5cbmNvbnN0IGlzQWxsVmFsdWVzUmVnZXhPck5vbmUgPSB2YWx1ZXMgPT4ge1xuICBpZiAoIXZhbHVlcyB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZXMpIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IGZpcnN0VmFsdWVzSXNSZWdleCA9IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1swXSk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5jb25zdCBpc0FueVZhbHVlUmVnZXggPSB2YWx1ZXMgPT4ge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzUmVnZXgodmFsdWUpO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUludGVyaW9yVmFsdWUgPSByZXN0VmFsdWUgPT4ge1xuICBpZiAoXG4gICAgcmVzdFZhbHVlICE9PSBudWxsICYmXG4gICAgdHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICBPYmplY3Qua2V5cyhyZXN0VmFsdWUpLnNvbWUoa2V5ID0+IGtleS5pbmNsdWRlcygnJCcpIHx8IGtleS5pbmNsdWRlcygnLicpKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybUludGVyaW9yQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHZhbHVlID0gdmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWUgPSBtYXBWYWx1ZXModmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIHVwZGF0ZSBvcGVyYXRvcnNcbiAgaWYgKHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmICdfX29wJyBpbiByZXN0VmFsdWUpIHtcbiAgICByZXR1cm4gdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IocmVzdFZhbHVlLCB0cnVlKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgcmV0dXJuIG1hcFZhbHVlcyhyZXN0VmFsdWUsIHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xufTtcblxuY29uc3QgdmFsdWVBc0RhdGUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIGtleSwgdmFsdWUsIHNjaGVtYSwgY291bnQgPSBmYWxzZSkge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19jcmVhdGVkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19jcmVhdGVkX2F0JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ191cGRhdGVkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ191cGRhdGVkX2F0JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ2V4cGlyZXNBdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnb2JqZWN0SWQnOiB7XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KHZhbHVlKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IGtleTogJ19pZCcsIHZhbHVlIH07XG4gICAgfVxuICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWUgfTtcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgICAgICAgICB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19ycGVybSc6XG4gICAgY2FzZSAnX3dwZXJtJzpcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbic6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gICAgY2FzZSAnJG9yJzpcbiAgICBjYXNlICckYW5kJzpcbiAgICBjYXNlICckbm9yJzpcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGtleToga2V5LFxuICAgICAgICB2YWx1ZTogdmFsdWUubWFwKHN1YlF1ZXJ5ID0+IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgc3ViUXVlcnksIHNjaGVtYSwgY291bnQpKSxcbiAgICAgIH07XG4gICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfbGFzdF91c2VkJywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19sYXN0X3VzZWQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgIHJldHVybiB7IGtleTogJ3RpbWVzX3VzZWQnLCB2YWx1ZTogdmFsdWUgfTtcbiAgICBkZWZhdWx0OiB7XG4gICAgICAvLyBPdGhlciBhdXRoIGRhdGFcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBrZXkubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICAvLyBTcGVjaWFsLWNhc2UgYXV0aCBkYXRhLlxuICAgICAgICByZXR1cm4geyBrZXk6IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9LmlkYCwgdmFsdWUgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjb25zdCBleHBlY3RlZFR5cGVJc0FycmF5ID0gc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0FycmF5JztcblxuICBjb25zdCBleHBlY3RlZFR5cGVJc1BvaW50ZXIgPVxuICAgIHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJztcblxuICBjb25zdCBmaWVsZCA9IHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV07XG4gIGlmIChcbiAgICBleHBlY3RlZFR5cGVJc1BvaW50ZXIgfHxcbiAgICAoIXNjaGVtYSAmJiAha2V5LmluY2x1ZGVzKCcuJykgJiYgdmFsdWUgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpXG4gICkge1xuICAgIGtleSA9ICdfcF8nICsga2V5O1xuICB9XG5cbiAgLy8gSGFuZGxlIHF1ZXJ5IGNvbnN0cmFpbnRzXG4gIGNvbnN0IHRyYW5zZm9ybWVkQ29uc3RyYWludCA9IHRyYW5zZm9ybUNvbnN0cmFpbnQodmFsdWUsIGZpZWxkLCBrZXksIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGNvbnN0IHRyYW5zZm9ybVJlcyA9IGtleS5pbmNsdWRlcygnLicpXG4gICAgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b20odmFsdWUpXG4gICAgOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpO1xuICBpZiAodHJhbnNmb3JtUmVzICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1SZXMgfTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgWW91IGNhbm5vdCB1c2UgJHt2YWx1ZX0gYXMgYSBxdWVyeSBwYXJhbWV0ZXIuYFxuICAgICk7XG4gIH1cbn1cblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHJ1biBxdWVyaWVzLlxuLy8gcmVzdFdoZXJlIGlzIHRoZSBcIndoZXJlXCIgY2xhdXNlIGluIFJFU1QgQVBJIGZvcm0uXG4vLyBSZXR1cm5zIHRoZSBtb25nbyBmb3JtIG9mIHRoZSBxdWVyeS5cbmZ1bmN0aW9uIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcmVzdFdoZXJlLCBzY2hlbWEsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgbW9uZ29XaGVyZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdFdoZXJlKSB7XG4gICAgY29uc3Qgb3V0ID0gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RXaGVyZVtyZXN0S2V5XSwgc2NoZW1hLCBjb3VudCk7XG4gICAgbW9uZ29XaGVyZVtvdXQua2V5XSA9IG91dC52YWx1ZTtcbiAgfVxuICByZXR1cm4gbW9uZ29XaGVyZTtcbn1cblxuY29uc3QgcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSA9IChyZXN0S2V5LCByZXN0VmFsdWUsIHNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgbGV0IHRyYW5zZm9ybWVkVmFsdWU7XG4gIGxldCBjb2VyY2VkVG9EYXRlO1xuICBzd2l0Y2ggKHJlc3RLZXkpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBBdXRoIGRhdGEgc2hvdWxkIGhhdmUgYmVlbiB0cmFuc2Zvcm1lZCBhbHJlYWR5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdjYW4gb25seSBxdWVyeSBvbiAnICsgcmVzdEtleSk7XG4gICAgICB9XG4gICAgICAvLyBUcnVzdCB0aGF0IHRoZSBhdXRoIGRhdGEgaGFzIGJlZW4gdHJhbnNmb3JtZWQgYW5kIHNhdmUgaXQgZGlyZWN0bHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV9bYS16QS1aMC05X10rJC8pKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgICAgfVxuICB9XG4gIC8vc2tpcCBzdHJhaWdodCB0byB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20gZm9yIEJ5dGVzLCB0aGV5IGRvbid0IHNob3cgdXAgaW4gdGhlIHNjaGVtYSBmb3Igc29tZSByZWFzb25cbiAgaWYgKHJlc3RWYWx1ZSAmJiByZXN0VmFsdWUuX190eXBlICE9PSAnQnl0ZXMnKSB7XG4gICAgLy9Ob3RlOiBXZSBtYXkgbm90IGtub3cgdGhlIHR5cGUgb2YgYSBmaWVsZCBoZXJlLCBhcyB0aGUgdXNlciBjb3VsZCBiZSBzYXZpbmcgKG51bGwpIHRvIGEgZmllbGRcbiAgICAvL1RoYXQgbmV2ZXIgZXhpc3RlZCBiZWZvcmUsIG1lYW5pbmcgd2UgY2FuJ3QgaW5mZXIgdGhlIHR5cGUuXG4gICAgaWYgKFxuICAgICAgKHNjaGVtYS5maWVsZHNbcmVzdEtleV0gJiYgc2NoZW1hLmZpZWxkc1tyZXN0S2V5XS50eXBlID09ICdQb2ludGVyJykgfHxcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICAgKSB7XG4gICAgICByZXN0S2V5ID0gJ19wXycgKyByZXN0S2V5O1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBBQ0xzIGFyZSBoYW5kbGVkIGJlZm9yZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcbiAgLy8gSWYgYW4gQUNMIGtleSBzdGlsbCBleGlzdHMgaGVyZSwgc29tZXRoaW5nIGlzIHdyb25nLlxuICBpZiAocmVzdEtleSA9PT0gJ0FDTCcpIHtcbiAgICB0aHJvdyAnVGhlcmUgd2FzIGEgcHJvYmxlbSB0cmFuc2Zvcm1pbmcgYW4gQUNMLic7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICBpZiAoT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG5cbiAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZSB9O1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlID0gKGNsYXNzTmFtZSwgcmVzdENyZWF0ZSwgc2NoZW1hKSA9PiB7XG4gIHJlc3RDcmVhdGUgPSBhZGRMZWdhY3lBQ0wocmVzdENyZWF0ZSk7XG4gIGNvbnN0IG1vbmdvQ3JlYXRlID0ge307XG4gIGZvciAoY29uc3QgcmVzdEtleSBpbiByZXN0Q3JlYXRlKSB7XG4gICAgaWYgKHJlc3RDcmVhdGVbcmVzdEtleV0gJiYgcmVzdENyZWF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB7IGtleSwgdmFsdWUgfSA9IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUoXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdENyZWF0ZVtyZXN0S2V5XSxcbiAgICAgIHNjaGVtYVxuICAgICk7XG4gICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG1vbmdvQ3JlYXRlW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICAvLyBVc2UgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQgZm9yIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0XG4gIGlmIChtb25nb0NyZWF0ZS5jcmVhdGVkQXQpIHtcbiAgICBtb25nb0NyZWF0ZS5fY3JlYXRlZF9hdCA9IG5ldyBEYXRlKG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdC5pc28gfHwgbW9uZ29DcmVhdGUuY3JlYXRlZEF0KTtcbiAgICBkZWxldGUgbW9uZ29DcmVhdGUuY3JlYXRlZEF0O1xuICB9XG4gIGlmIChtb25nb0NyZWF0ZS51cGRhdGVkQXQpIHtcbiAgICBtb25nb0NyZWF0ZS5fdXBkYXRlZF9hdCA9IG5ldyBEYXRlKG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdC5pc28gfHwgbW9uZ29DcmVhdGUudXBkYXRlZEF0KTtcbiAgICBkZWxldGUgbW9uZ29DcmVhdGUudXBkYXRlZEF0O1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvQ3JlYXRlO1xufTtcblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHVwZGF0ZSBvbGQgb2JqZWN0cy5cbmNvbnN0IHRyYW5zZm9ybVVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RVcGRhdGUsIHBhcnNlRm9ybWF0U2NoZW1hKSA9PiB7XG4gIGNvbnN0IG1vbmdvVXBkYXRlID0ge307XG4gIGNvbnN0IGFjbCA9IGFkZExlZ2FjeUFDTChyZXN0VXBkYXRlKTtcbiAgaWYgKGFjbC5fcnBlcm0gfHwgYWNsLl93cGVybSB8fCBhY2wuX2FjbCkge1xuICAgIG1vbmdvVXBkYXRlLiRzZXQgPSB7fTtcbiAgICBpZiAoYWNsLl9ycGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fcnBlcm0gPSBhY2wuX3JwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl93cGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fd3Blcm0gPSBhY2wuX3dwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl9hY2wpIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX2FjbCA9IGFjbC5fYWNsO1xuICAgIH1cbiAgfVxuICBmb3IgKHZhciByZXN0S2V5IGluIHJlc3RVcGRhdGUpIHtcbiAgICBpZiAocmVzdFVwZGF0ZVtyZXN0S2V5XSAmJiByZXN0VXBkYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHZhciBvdXQgPSB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0VXBkYXRlW3Jlc3RLZXldLFxuICAgICAgcGFyc2VGb3JtYXRTY2hlbWFcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG91dHB1dCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbnkgJCBrZXlzLCBpdCdzIGFuXG4gICAgLy8gb3BlcmF0b3IgdGhhdCBuZWVkcyB0byBiZSBsaWZ0ZWQgb250byB0aGUgdG9wIGxldmVsIHVwZGF0ZVxuICAgIC8vIG9iamVjdC5cbiAgICBpZiAodHlwZW9mIG91dC52YWx1ZSA9PT0gJ29iamVjdCcgJiYgb3V0LnZhbHVlICE9PSBudWxsICYmIG91dC52YWx1ZS5fX29wKSB7XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gPSBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF1bb3V0LmtleV0gPSBvdXQudmFsdWUuYXJnO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddID0gbW9uZ29VcGRhdGVbJyRzZXQnXSB8fCB7fTtcbiAgICAgIG1vbmdvVXBkYXRlWyckc2V0J11bb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1vbmdvVXBkYXRlO1xufTtcblxuLy8gQWRkIHRoZSBsZWdhY3kgX2FjbCBmb3JtYXQuXG5jb25zdCBhZGRMZWdhY3lBQ0wgPSByZXN0T2JqZWN0ID0+IHtcbiAgY29uc3QgcmVzdE9iamVjdENvcHkgPSB7IC4uLnJlc3RPYmplY3QgfTtcbiAgY29uc3QgX2FjbCA9IHt9O1xuXG4gIGlmIChyZXN0T2JqZWN0Ll93cGVybSkge1xuICAgIHJlc3RPYmplY3QuX3dwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgX2FjbFtlbnRyeV0gPSB7IHc6IHRydWUgfTtcbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIGlmIChyZXN0T2JqZWN0Ll9ycGVybSkge1xuICAgIHJlc3RPYmplY3QuX3JwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCEoZW50cnkgaW4gX2FjbCkpIHtcbiAgICAgICAgX2FjbFtlbnRyeV0gPSB7IHI6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF9hY2xbZW50cnldLnIgPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJlc3RPYmplY3RDb3B5Ll9hY2wgPSBfYWNsO1xuICB9XG5cbiAgcmV0dXJuIHJlc3RPYmplY3RDb3B5O1xufTtcblxuLy8gQSBzZW50aW5lbCB2YWx1ZSB0aGF0IGhlbHBlciB0cmFuc2Zvcm1hdGlvbnMgcmV0dXJuIHdoZW4gdGhleVxuLy8gY2Fubm90IHBlcmZvcm0gYSB0cmFuc2Zvcm1hdGlvblxuZnVuY3Rpb24gQ2Fubm90VHJhbnNmb3JtKCkge31cblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JBdG9tID0gYXRvbSA9PiB7XG4gIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gIGlmICh0eXBlb2YgYXRvbSA9PT0gJ29iamVjdCcgJiYgYXRvbSAmJiAhKGF0b20gaW5zdGFuY2VvZiBEYXRlKSAmJiBhdG9tLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBhdG9tLmNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiBhdG9tLm9iamVjdElkLFxuICAgIH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIGF0b20gPT09ICdzeW1ib2wnKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGNhbm5vdCB0cmFuc2Zvcm0gdmFsdWU6ICR7YXRvbX1gKTtcbiAgfSBlbHNlIGlmIChEYXRlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICByZXR1cm4gRGF0ZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICB9IGVsc2UgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXRvbSA9PT0gJ29iamVjdCcgJiYgYXRvbSAmJiBhdG9tLiRyZWdleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoYXRvbS4kcmVnZXgpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBhdG9tO1xuICB9XG59O1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gdHJhbnNmb3JtIGFuIGF0b20gZnJvbSBSRVNUIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBbiBhdG9tIGlzIGFueXRoaW5nIHRoYXQgY2FuJ3QgY29udGFpbiBvdGhlciBleHByZXNzaW9ucy4gU28gaXRcbi8vIGluY2x1ZGVzIHRoaW5ncyB3aGVyZSBvYmplY3RzIGFyZSB1c2VkIHRvIHJlcHJlc2VudCBvdGhlclxuLy8gZGF0YXR5cGVzLCBsaWtlIHBvaW50ZXJzIGFuZCBkYXRlcywgYnV0IGl0IGRvZXMgbm90IGluY2x1ZGUgb2JqZWN0c1xuLy8gb3IgYXJyYXlzIHdpdGggZ2VuZXJpYyBzdHVmZiBpbnNpZGUuXG4vLyBSYWlzZXMgYW4gZXJyb3IgaWYgdGhpcyBjYW5ub3QgcG9zc2libHkgYmUgdmFsaWQgUkVTVCBmb3JtYXQuXG4vLyBSZXR1cm5zIENhbm5vdFRyYW5zZm9ybSBpZiBpdCdzIGp1c3Qgbm90IGFuIGF0b21cbmZ1bmN0aW9uIHRyYW5zZm9ybVRvcExldmVsQXRvbShhdG9tLCBmaWVsZCkge1xuICBzd2l0Y2ggKHR5cGVvZiBhdG9tKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIGF0b207XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAke2ZpZWxkLnRhcmdldENsYXNzfSQke2F0b219YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGNhbm5vdCB0cmFuc2Zvcm0gdmFsdWU6ICR7YXRvbX1gKTtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKGF0b20gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIC8vIFRlY2huaWNhbGx5IGRhdGVzIGFyZSBub3QgcmVzdCBmb3JtYXQsIGJ1dCwgaXQgc2VlbXMgcHJldHR5XG4gICAgICAgIC8vIGNsZWFyIHdoYXQgdGhleSBzaG91bGQgYmUgdHJhbnNmb3JtZWQgdG8sIHNvIGxldCdzIGp1c3QgZG8gaXQuXG4gICAgICAgIHJldHVybiBhdG9tO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXRvbSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgLy8gVE9ETzogY2hlY2sgdmFsaWRpdHkgaGFyZGVyIGZvciB0aGUgX190eXBlLWRlZmluZWQgdHlwZXNcbiAgICAgIGlmIChhdG9tLl9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAke2F0b20uY2xhc3NOYW1lfSQke2F0b20ub2JqZWN0SWR9YDtcbiAgICAgIH1cbiAgICAgIGlmIChEYXRlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEdlb1BvaW50Q29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoUG9seWdvbkNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBQb2x5Z29uQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoRmlsZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBGaWxlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEkgZG9uJ3QgdGhpbmsgdHlwZW9mIGNhbiBldmVyIGxldCB1cyBnZXQgaGVyZVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgIGByZWFsbHkgZGlkIG5vdCBleHBlY3QgdmFsdWU6ICR7YXRvbX1gXG4gICAgICApO1xuICB9XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBxdWVyeSBjb25zdHJhaW50IGZyb20gUkVTVCBBUEkgZm9ybWF0IHRvIE1vbmdvIGZvcm1hdC5cbi8vIEEgY29uc3RyYWludCBpcyBzb21ldGhpbmcgd2l0aCBmaWVsZHMgbGlrZSAkbHQuXG4vLyBJZiBpdCBpcyBub3QgYSB2YWxpZCBjb25zdHJhaW50IGJ1dCBpdCBjb3VsZCBiZSBhIHZhbGlkIHNvbWV0aGluZ1xuLy8gZWxzZSwgcmV0dXJuIENhbm5vdFRyYW5zZm9ybS5cbi8vIGluQXJyYXkgaXMgd2hldGhlciB0aGlzIGlzIGFuIGFycmF5IGZpZWxkLlxuZnVuY3Rpb24gdHJhbnNmb3JtQ29uc3RyYWludChjb25zdHJhaW50LCBmaWVsZCwgcXVlcnlLZXksIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgaW5BcnJheSA9IGZpZWxkICYmIGZpZWxkLnR5cGUgJiYgZmllbGQudHlwZSA9PT0gJ0FycmF5JztcbiAgLy8gQ2hlY2sgd2V0aGVyIHRoZSBnaXZlbiBrZXkgaGFzIGAuYFxuICBjb25zdCBpc05lc3RlZEtleSA9IHF1ZXJ5S2V5LmluZGV4T2YoJy4nKSA+IC0xO1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnIHx8ICFjb25zdHJhaW50KSB7XG4gICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcbiAgfVxuICAvLyBGb3IgaW5BcnJheSBvciBuZXN0ZWQga2V5LCB3ZSBuZWVkIHRvIHRyYW5zZm9ybSB0aGUgaW50ZXJpb3IgYXRvbVxuICBjb25zdCB0cmFuc2Zvcm1GdW5jdGlvbiA9IChpbkFycmF5IHx8IGlzTmVzdGVkS2V5KSA/IHRyYW5zZm9ybUludGVyaW9yQXRvbSA6IHRyYW5zZm9ybVRvcExldmVsQXRvbTtcbiAgY29uc3QgdHJhbnNmb3JtZXIgPSBhdG9tID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zvcm1GdW5jdGlvbihhdG9tLCBmaWVsZCk7XG4gICAgaWYgKHJlc3VsdCA9PT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkIGF0b206ICR7SlNPTi5zdHJpbmdpZnkoYXRvbSl9YCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG4gIC8vIGtleXMgaXMgdGhlIGNvbnN0cmFpbnRzIGluIHJldmVyc2UgYWxwaGFiZXRpY2FsIG9yZGVyLlxuICAvLyBUaGlzIGlzIGEgaGFjayBzbyB0aGF0OlxuICAvLyAgICRyZWdleCBpcyBoYW5kbGVkIGJlZm9yZSAkb3B0aW9uc1xuICAvLyAgICRuZWFyU3BoZXJlIGlzIGhhbmRsZWQgYmVmb3JlICRtYXhEaXN0YW5jZVxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNvbnN0cmFpbnQpLnNvcnQoKS5yZXZlcnNlKCk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IG9mIGtleXMpIHtcbiAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgY2FzZSAnJGd0JzpcbiAgICAgIGNhc2UgJyRndGUnOlxuICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICBjYXNlICckbmUnOlxuICAgICAgY2FzZSAnJGVxJzoge1xuICAgICAgICBjb25zdCB2YWwgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgICAgICAgIGNhc2UgJyRuZSc6XG4gICAgICAgICAgICBjYXNlICckZXEnOlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSBVdGlscy5yZWxhdGl2ZVRpbWVUb0RhdGUodmFsLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGFuc3dlcltrZXldID0gcGFyc2VyUmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGxvZy5pbmZvKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtrZXl9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFuc3dlcltrZXldID0gdHJhbnNmb3JtZXIodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICBjYXNlICckbmluJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJyArIGtleSArICcgdmFsdWUnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IF8uZmxhdE1hcChhcnIsIHZhbHVlID0+IHtcbiAgICAgICAgICByZXR1cm4gKGF0b20gPT4ge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXRvbSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCh0cmFuc2Zvcm1lcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIoYXRvbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkodmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckYWxsJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJyArIGtleSArICcgdmFsdWUnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGFyci5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhbnN3ZXJba2V5XTtcbiAgICAgICAgaWYgKGlzQW55VmFsdWVSZWdleCh2YWx1ZXMpICYmICFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgdmFsdWVzXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4JzpcbiAgICAgICAgdmFyIHMgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh0eXBlb2YgcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIHJlZ2V4OiAnICsgcyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBzO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGNvbnRhaW5lZEJ5Jzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXIuJGVsZW1NYXRjaCA9IHtcbiAgICAgICAgICAkbmluOiBhcnIubWFwKHRyYW5zZm9ybWVyKSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckb3B0aW9ucyc6XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHRleHQnOiB7XG4gICAgICAgIGNvbnN0IHNlYXJjaCA9IGNvbnN0cmFpbnRba2V5XS4kc2VhcmNoO1xuICAgICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHNlYXJjaDogc2VhcmNoLiR0ZXJtLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kY2FzZVNlbnNpdGl2ZSA9IHNlYXJjaC4kY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGRpYWNyaXRpY1NlbnNpdGl2ZSA9IHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG5lYXJTcGhlcmUnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBhbnN3ZXIuJGdlb1dpdGhpbiA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGNvbnN0cmFpbnQuJG1heERpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0gW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlJzoge1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICAvLyBUaGUgU0RLcyBkb24ndCBzZWVtIHRvIHVzZSB0aGVzZSBidXQgdGhleSBhcmUgZG9jdW1lbnRlZCBpbiB0aGVcbiAgICAgIC8vIFJFU1QgQVBJIGRvY3MuXG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJblJhZGlhbnMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluTWlsZXMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldIC8gMzk1OTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldIC8gNjM3MTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRzZWxlY3QnOlxuICAgICAgY2FzZSAnJGRvbnRTZWxlY3QnOlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAndGhlICcgKyBrZXkgKyAnIGNvbnN0cmFpbnQgaXMgbm90IHN1cHBvcnRlZCB5ZXQnXG4gICAgICAgICk7XG5cbiAgICAgIGNhc2UgJyR3aXRoaW4nOlxuICAgICAgICB2YXIgYm94ID0gY29uc3RyYWludFtrZXldWyckYm94J107XG4gICAgICAgIGlmICghYm94IHx8IGJveC5sZW5ndGggIT0gMikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdtYWxmb3JtYXR0ZWQgJHdpdGhpbiBhcmcnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkYm94OiBbXG4gICAgICAgICAgICBbYm94WzBdLmxvbmdpdHVkZSwgYm94WzBdLmxhdGl0dWRlXSxcbiAgICAgICAgICAgIFtib3hbMV0ubG9uZ2l0dWRlLCBib3hbMV0ubGF0aXR1ZGVdLFxuICAgICAgICAgIF0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckZ2VvV2l0aGluJzoge1xuICAgICAgICBjb25zdCBwb2x5Z29uID0gY29uc3RyYWludFtrZXldWyckcG9seWdvbiddO1xuICAgICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBjb25zdHJhaW50W2tleV1bJyRjZW50ZXJTcGhlcmUnXTtcbiAgICAgICAgaWYgKHBvbHlnb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBwb2ludHM7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBvaW50cyA9IHBvaW50cy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgICByZXR1cm4gcG9pbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRwb2x5Z29uOiBwb2ludHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmIChjZW50ZXJTcGhlcmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJGNlbnRlclNwaGVyZTogW1twb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSwgZGlzdGFuY2VdLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckZ2VvSW50ZXJzZWN0cyc6IHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBjb25zdHJhaW50W2tleV1bJyRwb2ludCddO1xuICAgICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICRnZW9tZXRyeToge1xuICAgICAgICAgICAgdHlwZTogJ1BvaW50JyxcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eXFwkKy8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBjb25zdHJhaW50OiAnICsga2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYW5zd2VyO1xufVxuXG4vLyBUcmFuc2Zvcm1zIGFuIHVwZGF0ZSBvcGVyYXRvciBmcm9tIFJFU1QgZm9ybWF0IHRvIG1vbmdvIGZvcm1hdC5cbi8vIFRvIGJlIHRyYW5zZm9ybWVkLCB0aGUgaW5wdXQgc2hvdWxkIGhhdmUgYW4gX19vcCBmaWVsZC5cbi8vIElmIGZsYXR0ZW4gaXMgdHJ1ZSwgdGhpcyB3aWxsIGZsYXR0ZW4gb3BlcmF0b3JzIHRvIHRoZWlyIHN0YXRpY1xuLy8gZGF0YSBmb3JtYXQuIEZvciBleGFtcGxlLCBhbiBpbmNyZW1lbnQgb2YgMiB3b3VsZCBzaW1wbHkgYmVjb21lIGFcbi8vIDIuXG4vLyBUaGUgb3V0cHV0IGZvciBhIG5vbi1mbGF0dGVuZWQgb3BlcmF0b3IgaXMgYSBoYXNoIHdpdGggX19vcCBiZWluZ1xuLy8gdGhlIG1vbmdvIG9wLCBhbmQgYXJnIGJlaW5nIHRoZSBhcmd1bWVudC5cbi8vIFRoZSBvdXRwdXQgZm9yIGEgZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGp1c3QgYSB2YWx1ZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoaXMgc2hvdWxkIGJlIGEgbm8tb3AuXG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHsgX19vcCwgYW1vdW50LCBvYmplY3RzIH0sIGZsYXR0ZW4pIHtcbiAgc3dpdGNoIChfX29wKSB7XG4gICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHVuc2V0JywgYXJnOiAnJyB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgIGlmICh0eXBlb2YgYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnaW5jcmVtZW50aW5nIG11c3QgcHJvdmlkZSBhIG51bWJlcicpO1xuICAgICAgfVxuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIGFtb3VudDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckaW5jJywgYXJnOiBhbW91bnQgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ1NldE9uSW5zZXJ0JzpcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBhbW91bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHNldE9uSW5zZXJ0JywgYXJnOiBhbW91bnQgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0FkZCc6XG4gICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b0FkZCA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdG9BZGQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbW9uZ29PcCA9IHtcbiAgICAgICAgICBBZGQ6ICckcHVzaCcsXG4gICAgICAgICAgQWRkVW5pcXVlOiAnJGFkZFRvU2V0JyxcbiAgICAgICAgfVtfX29wXTtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogbW9uZ29PcCwgYXJnOiB7ICRlYWNoOiB0b0FkZCB9IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgaWYgKCEob2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byByZW1vdmUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgfVxuICAgICAgdmFyIHRvUmVtb3ZlID0gb2JqZWN0cy5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckcHVsbEFsbCcsIGFyZzogdG9SZW1vdmUgfTtcbiAgICAgIH1cblxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgIGBUaGUgJHtfX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICApO1xuICB9XG59XG5mdW5jdGlvbiBtYXBWYWx1ZXMob2JqZWN0LCBpdGVyYXRvcikge1xuICBjb25zdCByZXN1bHQgPSB7fTtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgcmVzdWx0W2tleV0gPSBpdGVyYXRvcihvYmplY3Rba2V5XSk7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5jb25zdCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QgPSBtb25nb09iamVjdCA9PiB7XG4gIHN3aXRjaCAodHlwZW9mIG1vbmdvT2JqZWN0KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyAnYmFkIHZhbHVlIGluIG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCc7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobW9uZ29PYmplY3QsICdfX3R5cGUnKSAmJlxuICAgICAgICBtb25nb09iamVjdC5fX3R5cGUgPT0gJ0RhdGUnICYmXG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyBpbnN0YW5jZW9mIERhdGVcbiAgICAgICkge1xuICAgICAgICBtb25nb09iamVjdC5pc28gPSBtb25nb09iamVjdC5pc28udG9KU09OKCk7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcFZhbHVlcyhtb25nb09iamVjdCwgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ3Vua25vd24ganMgdHlwZSc7XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcgPSAoc2NoZW1hLCBmaWVsZCwgcG9pbnRlclN0cmluZykgPT4ge1xuICBjb25zdCBvYmpEYXRhID0gcG9pbnRlclN0cmluZy5zcGxpdCgnJCcpO1xuICBpZiAob2JqRGF0YVswXSAhPT0gc2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MpIHtcbiAgICB0aHJvdyAncG9pbnRlciB0byBpbmNvcnJlY3QgY2xhc3NOYW1lJztcbiAgfVxuICByZXR1cm4ge1xuICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgIGNsYXNzTmFtZTogb2JqRGF0YVswXSxcbiAgICBvYmplY3RJZDogb2JqRGF0YVsxXSxcbiAgfTtcbn07XG5cbi8vIENvbnZlcnRzIGZyb20gYSBtb25nby1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbmNvbnN0IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCA9IChjbGFzc05hbWUsIG1vbmdvT2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgc3dpdGNoICh0eXBlb2YgbW9uZ29PYmplY3QpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93ICdiYWQgdmFsdWUgaW4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0JztcbiAgICBjYXNlICdvYmplY3QnOiB7XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3RPYmplY3QgPSB7fTtcbiAgICAgIGlmIChtb25nb09iamVjdC5fcnBlcm0gfHwgbW9uZ29PYmplY3QuX3dwZXJtKSB7XG4gICAgICAgIHJlc3RPYmplY3QuX3JwZXJtID0gbW9uZ29PYmplY3QuX3JwZXJtIHx8IFtdO1xuICAgICAgICByZXN0T2JqZWN0Ll93cGVybSA9IG1vbmdvT2JqZWN0Ll93cGVybSB8fCBbXTtcbiAgICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9ycGVybTtcbiAgICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll93cGVybTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIga2V5IGluIG1vbmdvT2JqZWN0KSB7XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgY2FzZSAnX2lkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ29iamVjdElkJ10gPSAnJyArIG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfaGFzaGVkX3Bhc3N3b3JkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3QuX2hhc2hlZF9wYXNzd29yZCA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfYWNsJzpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICAgICAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICAgICAgY2FzZSAnX3RvbWJzdG9uZSc6XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9oaXN0b3J5JzpcbiAgICAgICAgICAgIC8vIFRob3NlIGtleXMgd2lsbCBiZSBkZWxldGVkIGlmIG5lZWRlZCBpbiB0aGUgREIgQ29udHJvbGxlclxuICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19zZXNzaW9uX3Rva2VuJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3Nlc3Npb25Ub2tlbiddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX3VwZGF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndXBkYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2NyZWF0ZWRBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgICAgICBjYXNlICdfZXhwaXJlc0F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2V4cGlyZXNBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICAgICAgY2FzZSAnX2xhc3RfdXNlZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydsYXN0VXNlZCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgICAgICBjYXNlICd0aW1lc191c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3RpbWVzVXNlZCddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2F1dGhEYXRhJzpcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgbG9nLndhcm4oXG4gICAgICAgICAgICAgICAgJ2lnbm9yaW5nIGF1dGhEYXRhIGluIF9Vc2VyIGFzIHRoaXMga2V5IGlzIHJlc2VydmVkIHRvIGJlIHN5bnRoZXNpemVkIG9mIGBfYXV0aF9kYXRhXypgIGtleXMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBDaGVjayBvdGhlciBhdXRoIGRhdGEga2V5c1xuICAgICAgICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBrZXkubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgICAgICAgIGlmIChhdXRoRGF0YU1hdGNoICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gcmVzdE9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGtleS5pbmRleE9mKCdfcF8nKSA9PSAwKSB7XG4gICAgICAgICAgICAgIHZhciBuZXdLZXkgPSBrZXkuc3Vic3RyaW5nKDMpO1xuICAgICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbbmV3S2V5XSkge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGNvbHVtbiBub3QgaW4gdGhlIHNjaGVtYSwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG5ld0tleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbbmV3S2V5XS50eXBlICE9PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBpbiBhIG5vbi1wb2ludGVyIGNvbHVtbiwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIGtleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1vbmdvT2JqZWN0W2tleV0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXN0T2JqZWN0W25ld0tleV0gPSB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKHNjaGVtYSwgbmV3S2V5LCBtb25nb09iamVjdFtrZXldKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtleVswXSA9PSAnXycgJiYga2V5ICE9ICdfX3R5cGUnKSB7XG4gICAgICAgICAgICAgIHRocm93ICdiYWQga2V5IGluIHVudHJhbnNmb3JtOiAnICsga2V5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFyIHZhbHVlID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnRmlsZScgJiZcbiAgICAgICAgICAgICAgICBGaWxlQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBGaWxlQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50JyAmJlxuICAgICAgICAgICAgICAgIEdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBHZW9Qb2ludENvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2x5Z29uJyAmJlxuICAgICAgICAgICAgICAgIFBvbHlnb25Db2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IFBvbHlnb25Db2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICAgICAgICAgICAgQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QobW9uZ29PYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICk7XG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkcyA9IHt9O1xuICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLmZvckVhY2gocmVsYXRpb25GaWVsZE5hbWUgPT4ge1xuICAgICAgICByZWxhdGlvbkZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgLi4ucmVzdE9iamVjdCwgLi4ucmVsYXRpb25GaWVsZHMgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG52YXIgRGF0ZUNvZGVyID0ge1xuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKGpzb24uaXNvKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnO1xuICB9LFxufTtcblxudmFyIEJ5dGVzQ29kZXIgPSB7XG4gIGJhc2U2NFBhdHRlcm46IG5ldyBSZWdFeHAoJ14oPzpbQS1aYS16MC05Ky9dezR9KSooPzpbQS1aYS16MC05Ky9dezJ9PT18W0EtWmEtejAtOSsvXXszfT0pPyQnKSxcbiAgaXNCYXNlNjRWYWx1ZShvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYmFzZTY0UGF0dGVybi50ZXN0KG9iamVjdCk7XG4gIH0sXG5cbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgbGV0IHZhbHVlO1xuICAgIGlmICh0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KSkge1xuICAgICAgdmFsdWUgPSBvYmplY3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0LmJ1ZmZlci50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkJpbmFyeSB8fCB0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBtb25nb2RiLkJpbmFyeShCdWZmZXIuZnJvbShqc29uLmJhc2U2NCwgJ2Jhc2U2NCcpKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJztcbiAgfSxcbn07XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgbGF0aXR1ZGU6IG9iamVjdFsxXSxcbiAgICAgIGxvbmdpdHVkZTogb2JqZWN0WzBdLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBBcnJheSAmJiBvYmplY3QubGVuZ3RoID09IDI7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBbanNvbi5sb25naXR1ZGUsIGpzb24ubGF0aXR1ZGVdO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxudmFyIFBvbHlnb25Db2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgLy8gQ29udmVydCBsbmcvbGF0IC0+IGxhdC9sbmdcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF0ubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXTtcbiAgICBpZiAob2JqZWN0LnR5cGUgIT09ICdQb2x5Z29uJyB8fCAhKGNvb3JkcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcG9pbnQgPSBjb29yZHNbaV07XG4gICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHBvaW50KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIGxldCBjb29yZHMgPSBqc29uLmNvb3JkaW5hdGVzO1xuICAgIC8vIEFkZCBmaXJzdCBwb2ludCB0byB0aGUgZW5kIHRvIGNsb3NlIHBvbHlnb25cbiAgICBpZiAoXG4gICAgICBjb29yZHNbMF1bMF0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICAgIGNvb3Jkc1swXVsxXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVsxXVxuICAgICkge1xuICAgICAgY29vcmRzLnB1c2goY29vcmRzWzBdKTtcbiAgICB9XG4gICAgY29uc3QgdW5pcXVlID0gY29vcmRzLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICAgIH0pO1xuICAgIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIENvbnZlcnQgbGF0L2xvbmcgLT4gbG9uZy9sYXRcbiAgICBjb29yZHMgPSBjb29yZHMubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicsIGNvb3JkaW5hdGVzOiBbY29vcmRzXSB9O1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnUG9seWdvbic7XG4gIH0sXG59O1xuXG52YXIgRmlsZUNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiBvYmplY3QsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4ganNvbi5uYW1lO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRmlsZSc7XG4gIH0sXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdHJhbnNmb3JtS2V5LFxuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgdHJhbnNmb3JtQ29uc3RyYWludCxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsT0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQXVCLFNBQUFELHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBQ3ZCLElBQUlHLE9BQU8sR0FBR0wsT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUNoQyxJQUFJTSxLQUFLLEdBQUdOLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQ00sS0FBSztBQUN2QyxNQUFNQyxLQUFLLEdBQUdQLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztBQUV2QyxNQUFNUSxZQUFZLEdBQUdBLENBQUNDLFNBQVMsRUFBRUMsU0FBUyxFQUFFQyxNQUFNLEtBQUs7RUFDckQ7RUFDQSxRQUFRRCxTQUFTO0lBQ2YsS0FBSyxVQUFVO01BQ2IsT0FBTyxLQUFLO0lBQ2QsS0FBSyxXQUFXO01BQ2QsT0FBTyxhQUFhO0lBQ3RCLEtB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