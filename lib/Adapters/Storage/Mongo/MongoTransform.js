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
  const transformedConstraint = transformConstraint(value, field, count);
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
function transformConstraint(constraint, field, count = false) {
  const inArray = field && field.type && field.type === 'Array';
  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }
  const transformFunction = inArray ? transformInteriorAtom : transformTopLevelAtom;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwibW9uZ29kYiIsIlBhcnNlIiwiVXRpbHMiLCJ0cmFuc2Zvcm1LZXkiLCJjbGFzc05hbWUiLCJmaWVsZE5hbWUiLCJzY2hlbWEiLCJmaWVsZHMiLCJfX3R5cGUiLCJ0eXBlIiwidHJhbnNmb3JtS2V5VmFsdWVGb3JVcGRhdGUiLCJyZXN0S2V5IiwicmVzdFZhbHVlIiwicGFyc2VGb3JtYXRTY2hlbWEiLCJrZXkiLCJ0aW1lRmllbGQiLCJpbmNsdWRlcyIsInZhbHVlIiwicGFyc2VJbnQiLCJ0cmFuc2Zvcm1Ub3BMZXZlbEF0b20iLCJDYW5ub3RUcmFuc2Zvcm0iLCJEYXRlIiwiaW5kZXhPZiIsIkFycmF5IiwibWFwIiwidHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSIsInRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yIiwibWFwVmFsdWVzIiwiaXNSZWdleCIsIlJlZ0V4cCIsImlzU3RhcnRzV2l0aFJlZ2V4IiwibWF0Y2hlcyIsInRvU3RyaW5nIiwibWF0Y2giLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwidmFsdWVzIiwiaXNBcnJheSIsImxlbmd0aCIsImZpcnN0VmFsdWVzSXNSZWdleCIsImkiLCJpc0FueVZhbHVlUmVnZXgiLCJzb21lIiwiT2JqZWN0Iiwia2V5cyIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJ0cmFuc2Zvcm1SZXMiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJmb3JFYWNoIiwiZW50cnkiLCJ3IiwiciIsImF0b20iLCJvYmplY3RJZCIsIkRhdGVDb2RlciIsImlzVmFsaWRKU09OIiwiSlNPTlRvRGF0YWJhc2UiLCJCeXRlc0NvZGVyIiwiJHJlZ2V4IiwidGFyZ2V0Q2xhc3MiLCJHZW9Qb2ludENvZGVyIiwiUG9seWdvbkNvZGVyIiwiRmlsZUNvZGVyIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiY29uc3RyYWludCIsImluQXJyYXkiLCJ0cmFuc2Zvcm1GdW5jdGlvbiIsInRyYW5zZm9ybWVyIiwicmVzdWx0IiwiSlNPTiIsInN0cmluZ2lmeSIsInNvcnQiLCJyZXZlcnNlIiwiYW5zd2VyIiwidmFsIiwiJHJlbGF0aXZlVGltZSIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsImxvZyIsImluZm8iLCJhcnIiLCJfIiwiZmxhdE1hcCIsInMiLCIkbmluIiwic2VhcmNoIiwiJHNlYXJjaCIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwicG9pbnQiLCIkZ2VvV2l0aGluIiwiJGNlbnRlclNwaGVyZSIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJG1heERpc3RhbmNlIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsImJveCIsIiRib3giLCJwb2x5Z29uIiwiY2VudGVyU3BoZXJlIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCJHZW9Qb2ludCIsIl92YWxpZGF0ZSIsIiRwb2x5Z29uIiwiZGlzdGFuY2UiLCJpc05hTiIsIiRnZW9tZXRyeSIsImFtb3VudCIsIm9iamVjdHMiLCJmbGF0dGVuIiwidG9BZGQiLCJtb25nb09wIiwiQWRkIiwiQWRkVW5pcXVlIiwiJGVhY2giLCJ0b1JlbW92ZSIsIm9iamVjdCIsIml0ZXJhdG9yIiwibmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0IiwibW9uZ29PYmplY3QiLCJfZW5jb2RlIiwiTG9uZyIsInRvTnVtYmVyIiwiRG91YmxlIiwiaXNWYWxpZERhdGFiYXNlT2JqZWN0IiwiZGF0YWJhc2VUb0pTT04iLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0b0pTT04iLCJ0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nIiwicG9pbnRlclN0cmluZyIsIm9iakRhdGEiLCJzcGxpdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwiZmlsdGVyIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwicHVzaCIsInVuaXF1ZSIsIml0ZW0iLCJpbmRleCIsImFyIiwiZm91bmRJbmRleCIsInB0IiwibmFtZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1RyYW5zZm9ybS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbG9nIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xudmFyIG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uLy4uLy4uL1V0aWxzJyk7XG5cbmNvbnN0IHRyYW5zZm9ybUtleSA9IChjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBzd2l0Y2ggKGZpZWxkTmFtZSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiAnX2lkJztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfY3JlYXRlZF9hdCc7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIHJldHVybiAnX3VwZGF0ZWRfYXQnO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4gJ19zZXNzaW9uX3Rva2VuJztcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICByZXR1cm4gJ19sYXN0X3VzZWQnO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4gJ3RpbWVzX3VzZWQnO1xuICB9XG5cbiAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uX190eXBlID09ICdQb2ludGVyJykge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICBmaWVsZE5hbWUgPSAnX3BfJyArIGZpZWxkTmFtZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZE5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RWYWx1ZSwgcGFyc2VGb3JtYXRTY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHZhciBrZXkgPSByZXN0S2V5O1xuICB2YXIgdGltZUZpZWxkID0gZmFsc2U7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgIGNhc2UgJ19pZCc6XG4gICAgICBpZiAoWydfR2xvYmFsQ29uZmlnJywgJ19HcmFwaFFMQ29uZmlnJ10uaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleToga2V5LFxuICAgICAgICAgIHZhbHVlOiBwYXJzZUludChyZXN0VmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAga2V5ID0gJ19pZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICBjYXNlICdfdXBkYXRlZF9hdCc6XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgY2FzZSAnX3Nlc3Npb25fdG9rZW4nOlxuICAgICAga2V5ID0gJ19zZXNzaW9uX3Rva2VuJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICBrZXkgPSAnZXhwaXJlc0F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAga2V5ID0gJ19mYWlsZWRfbG9naW5fY291bnQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAga2V5ID0gJ19wYXNzd29yZF9jaGFuZ2VkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgICByZXR1cm4geyBrZXk6IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICBjYXNlICdfbGFzdF91c2VkJzpcbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgIGNhc2UgJ3RpbWVzX3VzZWQnOlxuICAgICAga2V5ID0gJ3RpbWVzX3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKFxuICAgIChwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XSAmJiBwYXJzZUZvcm1hdFNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcicpIHx8XG4gICAgKCFrZXkuaW5jbHVkZXMoJy4nKSAmJlxuICAgICAgIXBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICByZXN0VmFsdWUgJiZcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInKSAvLyBEbyBub3QgdXNlIHRoZSBfcF8gcHJlZml4IGZvciBwb2ludGVycyBpbnNpZGUgbmVzdGVkIGRvY3VtZW50c1xuICApIHtcbiAgICBrZXkgPSAnX3BfJyArIGtleTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIGlmICh0aW1lRmllbGQgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgdmFsdWUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuICAgIGlmIChyZXN0S2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHJlc3RWYWx1ZSwgZmFsc2UpIH07XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbn07XG5cbmNvbnN0IGlzUmVnZXggPSB2YWx1ZSA9PiB7XG4gIHJldHVybiB2YWx1ZSAmJiB2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cDtcbn07XG5cbmNvbnN0IGlzU3RhcnRzV2l0aFJlZ2V4ID0gdmFsdWUgPT4ge1xuICBpZiAoIWlzUmVnZXgodmFsdWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLnRvU3RyaW5nKCkubWF0Y2goL1xcL1xcXlxcXFxRLipcXFxcRVxcLy8pO1xuICByZXR1cm4gISFtYXRjaGVzO1xufTtcblxuY29uc3QgaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSA9IHZhbHVlcyA9PiB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdKTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmNvbnN0IGlzQW55VmFsdWVSZWdleCA9IHZhbHVlcyA9PiB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNSZWdleCh2YWx1ZSk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSA9IHJlc3RWYWx1ZSA9PiB7XG4gIGlmIChcbiAgICByZXN0VmFsdWUgIT09IG51bGwgJiZcbiAgICB0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIE9iamVjdC5rZXlzKHJlc3RWYWx1ZSkuc29tZShrZXkgPT4ga2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICk7XG4gIH1cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtSW50ZXJpb3JBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZSA9IG1hcFZhbHVlcyh2YWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIHJlc3RWYWx1ZS5tYXAodHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgdXBkYXRlIG9wZXJhdG9yc1xuICBpZiAodHlwZW9mIHJlc3RWYWx1ZSA9PT0gJ29iamVjdCcgJiYgJ19fb3AnIGluIHJlc3RWYWx1ZSkge1xuICAgIHJldHVybiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcihyZXN0VmFsdWUsIHRydWUpO1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICByZXR1cm4gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG59O1xuXG5jb25zdCB2YWx1ZUFzRGF0ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKGNsYXNzTmFtZSwga2V5LCB2YWx1ZSwgc2NoZW1hLCBjb3VudCA9IGZhbHNlKSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2NyZWF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2NyZWF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAndXBkYXRlZEF0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3VwZGF0ZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX3VwZGF0ZWRfYXQnO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnZXhwaXJlc0F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdvYmplY3RJZCc6IHtcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsga2V5OiAnX2lkJywgdmFsdWUgfTtcbiAgICB9XG4gICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBrZXk6ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX3Nlc3Npb25fdG9rZW4nLCB2YWx1ZSB9O1xuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAgICAgICAgIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSB9O1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX3JwZXJtJzpcbiAgICBjYXNlICdfd3Blcm0nOlxuICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgICBjYXNlICckb3InOlxuICAgIGNhc2UgJyRhbmQnOlxuICAgIGNhc2UgJyRub3InOlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHZhbHVlOiB2YWx1ZS5tYXAoc3ViUXVlcnkgPT4gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBzdWJRdWVyeSwgc2NoZW1hLCBjb3VudCkpLFxuICAgICAgfTtcbiAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogJ19sYXN0X3VzZWQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2xhc3RfdXNlZCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd0aW1lc1VzZWQnOlxuICAgICAgcmV0dXJuIHsga2V5OiAndGltZXNfdXNlZCcsIHZhbHVlOiB2YWx1ZSB9O1xuICAgIGRlZmF1bHQ6IHtcbiAgICAgIC8vIE90aGVyIGF1dGggZGF0YVxuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIC8vIFNwZWNpYWwtY2FzZSBhdXRoIGRhdGEuXG4gICAgICAgIHJldHVybiB7IGtleTogYF9hdXRoX2RhdGFfJHtwcm92aWRlcn0uaWRgLCB2YWx1ZSB9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzQXJyYXkgPSBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQXJyYXknO1xuXG4gIGNvbnN0IGV4cGVjdGVkVHlwZUlzUG9pbnRlciA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuXG4gIGNvbnN0IGZpZWxkID0gc2NoZW1hICYmIHNjaGVtYS5maWVsZHNba2V5XTtcbiAgaWYgKFxuICAgIGV4cGVjdGVkVHlwZUlzUG9pbnRlciB8fFxuICAgICghc2NoZW1hICYmICFrZXkuaW5jbHVkZXMoJy4nKSAmJiB2YWx1ZSAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJylcbiAgKSB7XG4gICAga2V5ID0gJ19wXycgKyBrZXk7XG4gIH1cblxuICAvLyBIYW5kbGUgcXVlcnkgY29uc3RyYWludHNcbiAgY29uc3QgdHJhbnNmb3JtZWRDb25zdHJhaW50ID0gdHJhbnNmb3JtQ29uc3RyYWludCh2YWx1ZSwgZmllbGQsIGNvdW50KTtcbiAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludCAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kdGV4dCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJHRleHQnLCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0IH07XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJGVsZW1NYXRjaCkge1xuICAgICAgcmV0dXJuIHsga2V5OiAnJG5vcicsIHZhbHVlOiBbeyBba2V5XTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH1dIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybWVkQ29uc3RyYWludCB9O1xuICB9XG5cbiAgaWYgKGV4cGVjdGVkVHlwZUlzQXJyYXkgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHsgJGFsbDogW3RyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSldIH0gfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIGNvbnN0IHRyYW5zZm9ybVJlcyA9IGtleS5pbmNsdWRlcygnLicpXG4gICAgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b20odmFsdWUpXG4gICAgOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20odmFsdWUpO1xuICBpZiAodHJhbnNmb3JtUmVzICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlOiB0cmFuc2Zvcm1SZXMgfTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgWW91IGNhbm5vdCB1c2UgJHt2YWx1ZX0gYXMgYSBxdWVyeSBwYXJhbWV0ZXIuYFxuICAgICk7XG4gIH1cbn1cblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHJ1biBxdWVyaWVzLlxuLy8gcmVzdFdoZXJlIGlzIHRoZSBcIndoZXJlXCIgY2xhdXNlIGluIFJFU1QgQVBJIGZvcm0uXG4vLyBSZXR1cm5zIHRoZSBtb25nbyBmb3JtIG9mIHRoZSBxdWVyeS5cbmZ1bmN0aW9uIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcmVzdFdoZXJlLCBzY2hlbWEsIGNvdW50ID0gZmFsc2UpIHtcbiAgY29uc3QgbW9uZ29XaGVyZSA9IHt9O1xuICBmb3IgKGNvbnN0IHJlc3RLZXkgaW4gcmVzdFdoZXJlKSB7XG4gICAgY29uc3Qgb3V0ID0gdHJhbnNmb3JtUXVlcnlLZXlWYWx1ZShjbGFzc05hbWUsIHJlc3RLZXksIHJlc3RXaGVyZVtyZXN0S2V5XSwgc2NoZW1hLCBjb3VudCk7XG4gICAgbW9uZ29XaGVyZVtvdXQua2V5XSA9IG91dC52YWx1ZTtcbiAgfVxuICByZXR1cm4gbW9uZ29XaGVyZTtcbn1cblxuY29uc3QgcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSA9IChyZXN0S2V5LCByZXN0VmFsdWUsIHNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgbGV0IHRyYW5zZm9ybWVkVmFsdWU7XG4gIGxldCBjb2VyY2VkVG9EYXRlO1xuICBzd2l0Y2ggKHJlc3RLZXkpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ19wYXNzd29yZF9jaGFuZ2VkX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbic6XG4gICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19zZXNzaW9uX3Rva2VuJywgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBBdXRoIGRhdGEgc2hvdWxkIGhhdmUgYmVlbiB0cmFuc2Zvcm1lZCBhbHJlYWR5XG4gICAgICBpZiAocmVzdEtleS5tYXRjaCgvXmF1dGhEYXRhXFwuKFthLXpBLVowLTlfXSspXFwuaWQkLykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdjYW4gb25seSBxdWVyeSBvbiAnICsgcmVzdEtleSk7XG4gICAgICB9XG4gICAgICAvLyBUcnVzdCB0aGF0IHRoZSBhdXRoIGRhdGEgaGFzIGJlZW4gdHJhbnNmb3JtZWQgYW5kIHNhdmUgaXQgZGlyZWN0bHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV9bYS16QS1aMC05X10rJC8pKSB7XG4gICAgICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHJlc3RWYWx1ZSB9O1xuICAgICAgfVxuICB9XG4gIC8vc2tpcCBzdHJhaWdodCB0byB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20gZm9yIEJ5dGVzLCB0aGV5IGRvbid0IHNob3cgdXAgaW4gdGhlIHNjaGVtYSBmb3Igc29tZSByZWFzb25cbiAgaWYgKHJlc3RWYWx1ZSAmJiByZXN0VmFsdWUuX190eXBlICE9PSAnQnl0ZXMnKSB7XG4gICAgLy9Ob3RlOiBXZSBtYXkgbm90IGtub3cgdGhlIHR5cGUgb2YgYSBmaWVsZCBoZXJlLCBhcyB0aGUgdXNlciBjb3VsZCBiZSBzYXZpbmcgKG51bGwpIHRvIGEgZmllbGRcbiAgICAvL1RoYXQgbmV2ZXIgZXhpc3RlZCBiZWZvcmUsIG1lYW5pbmcgd2UgY2FuJ3QgaW5mZXIgdGhlIHR5cGUuXG4gICAgaWYgKFxuICAgICAgKHNjaGVtYS5maWVsZHNbcmVzdEtleV0gJiYgc2NoZW1hLmZpZWxkc1tyZXN0S2V5XS50eXBlID09ICdQb2ludGVyJykgfHxcbiAgICAgIHJlc3RWYWx1ZS5fX3R5cGUgPT0gJ1BvaW50ZXInXG4gICAgKSB7XG4gICAgICByZXN0S2V5ID0gJ19wXycgKyByZXN0S2V5O1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhdG9taWMgdmFsdWVzXG4gIHZhciB2YWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICBpZiAodmFsdWUgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBBQ0xzIGFyZSBoYW5kbGVkIGJlZm9yZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWRcbiAgLy8gSWYgYW4gQUNMIGtleSBzdGlsbCBleGlzdHMgaGVyZSwgc29tZXRoaW5nIGlzIHdyb25nLlxuICBpZiAocmVzdEtleSA9PT0gJ0FDTCcpIHtcbiAgICB0aHJvdyAnVGhlcmUgd2FzIGEgcHJvYmxlbSB0cmFuc2Zvcm1pbmcgYW4gQUNMLic7XG4gIH1cblxuICAvLyBIYW5kbGUgYXJyYXlzXG4gIGlmIChyZXN0VmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHZhbHVlID0gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiB2YWx1ZSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIG5vcm1hbCBvYmplY3RzIGJ5IHJlY3Vyc2luZ1xuICBpZiAoT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICApO1xuICB9XG4gIHZhbHVlID0gbWFwVmFsdWVzKHJlc3RWYWx1ZSwgdHJhbnNmb3JtSW50ZXJpb3JWYWx1ZSk7XG5cbiAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZSB9O1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlID0gKGNsYXNzTmFtZSwgcmVzdENyZWF0ZSwgc2NoZW1hKSA9PiB7XG4gIHJlc3RDcmVhdGUgPSBhZGRMZWdhY3lBQ0wocmVzdENyZWF0ZSk7XG4gIGNvbnN0IG1vbmdvQ3JlYXRlID0ge307XG4gIGZvciAoY29uc3QgcmVzdEtleSBpbiByZXN0Q3JlYXRlKSB7XG4gICAgaWYgKHJlc3RDcmVhdGVbcmVzdEtleV0gJiYgcmVzdENyZWF0ZVtyZXN0S2V5XS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCB7IGtleSwgdmFsdWUgfSA9IHBhcnNlT2JqZWN0S2V5VmFsdWVUb01vbmdvT2JqZWN0S2V5VmFsdWUoXG4gICAgICByZXN0S2V5LFxuICAgICAgcmVzdENyZWF0ZVtyZXN0S2V5XSxcbiAgICAgIHNjaGVtYVxuICAgICk7XG4gICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG1vbmdvQ3JlYXRlW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICAvLyBVc2UgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQgZm9yIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0XG4gIGlmIChtb25nb0NyZWF0ZS5jcmVhdGVkQXQpIHtcbiAgICBtb25nb0NyZWF0ZS5fY3JlYXRlZF9hdCA9IG5ldyBEYXRlKG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdC5pc28gfHwgbW9uZ29DcmVhdGUuY3JlYXRlZEF0KTtcbiAgICBkZWxldGUgbW9uZ29DcmVhdGUuY3JlYXRlZEF0O1xuICB9XG4gIGlmIChtb25nb0NyZWF0ZS51cGRhdGVkQXQpIHtcbiAgICBtb25nb0NyZWF0ZS5fdXBkYXRlZF9hdCA9IG5ldyBEYXRlKG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdC5pc28gfHwgbW9uZ29DcmVhdGUudXBkYXRlZEF0KTtcbiAgICBkZWxldGUgbW9uZ29DcmVhdGUudXBkYXRlZEF0O1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvQ3JlYXRlO1xufTtcblxuLy8gTWFpbiBleHBvc2VkIG1ldGhvZCB0byBoZWxwIHVwZGF0ZSBvbGQgb2JqZWN0cy5cbmNvbnN0IHRyYW5zZm9ybVVwZGF0ZSA9IChjbGFzc05hbWUsIHJlc3RVcGRhdGUsIHBhcnNlRm9ybWF0U2NoZW1hKSA9PiB7XG4gIGNvbnN0IG1vbmdvVXBkYXRlID0ge307XG4gIGNvbnN0IGFjbCA9IGFkZExlZ2FjeUFDTChyZXN0VXBkYXRlKTtcbiAgaWYgKGFjbC5fcnBlcm0gfHwgYWNsLl93cGVybSB8fCBhY2wuX2FjbCkge1xuICAgIG1vbmdvVXBkYXRlLiRzZXQgPSB7fTtcbiAgICBpZiAoYWNsLl9ycGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fcnBlcm0gPSBhY2wuX3JwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl93cGVybSkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fd3Blcm0gPSBhY2wuX3dwZXJtO1xuICAgIH1cbiAgICBpZiAoYWNsLl9hY2wpIHtcbiAgICAgIG1vbmdvVXBkYXRlLiRzZXQuX2FjbCA9IGFjbC5fYWNsO1xuICAgIH1cbiAgfVxuICBmb3IgKHZhciByZXN0S2V5IGluIHJlc3RVcGRhdGUpIHtcbiAgICBpZiAocmVzdFVwZGF0ZVtyZXN0S2V5XSAmJiByZXN0VXBkYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHZhciBvdXQgPSB0cmFuc2Zvcm1LZXlWYWx1ZUZvclVwZGF0ZShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0VXBkYXRlW3Jlc3RLZXldLFxuICAgICAgcGFyc2VGb3JtYXRTY2hlbWFcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG91dHB1dCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbnkgJCBrZXlzLCBpdCdzIGFuXG4gICAgLy8gb3BlcmF0b3IgdGhhdCBuZWVkcyB0byBiZSBsaWZ0ZWQgb250byB0aGUgdG9wIGxldmVsIHVwZGF0ZVxuICAgIC8vIG9iamVjdC5cbiAgICBpZiAodHlwZW9mIG91dC52YWx1ZSA9PT0gJ29iamVjdCcgJiYgb3V0LnZhbHVlICE9PSBudWxsICYmIG91dC52YWx1ZS5fX29wKSB7XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gPSBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF0gfHwge307XG4gICAgICBtb25nb1VwZGF0ZVtvdXQudmFsdWUuX19vcF1bb3V0LmtleV0gPSBvdXQudmFsdWUuYXJnO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb1VwZGF0ZVsnJHNldCddID0gbW9uZ29VcGRhdGVbJyRzZXQnXSB8fCB7fTtcbiAgICAgIG1vbmdvVXBkYXRlWyckc2V0J11bb3V0LmtleV0gPSBvdXQudmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1vbmdvVXBkYXRlO1xufTtcblxuLy8gQWRkIHRoZSBsZWdhY3kgX2FjbCBmb3JtYXQuXG5jb25zdCBhZGRMZWdhY3lBQ0wgPSByZXN0T2JqZWN0ID0+IHtcbiAgY29uc3QgcmVzdE9iamVjdENvcHkgPSB7IC4uLnJlc3RPYmplY3QgfTtcbiAgY29uc3QgX2FjbCA9IHt9O1xuXG4gIGlmIChyZXN0T2JqZWN0Ll93cGVybSkge1xuICAgIHJlc3RPYmplY3QuX3dwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgX2FjbFtlbnRyeV0gPSB7IHc6IHRydWUgfTtcbiAgICB9KTtcbiAgICByZXN0T2JqZWN0Q29weS5fYWNsID0gX2FjbDtcbiAgfVxuXG4gIGlmIChyZXN0T2JqZWN0Ll9ycGVybSkge1xuICAgIHJlc3RPYmplY3QuX3JwZXJtLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKCEoZW50cnkgaW4gX2FjbCkpIHtcbiAgICAgICAgX2FjbFtlbnRyeV0gPSB7IHI6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF9hY2xbZW50cnldLnIgPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJlc3RPYmplY3RDb3B5Ll9hY2wgPSBfYWNsO1xuICB9XG5cbiAgcmV0dXJuIHJlc3RPYmplY3RDb3B5O1xufTtcblxuLy8gQSBzZW50aW5lbCB2YWx1ZSB0aGF0IGhlbHBlciB0cmFuc2Zvcm1hdGlvbnMgcmV0dXJuIHdoZW4gdGhleVxuLy8gY2Fubm90IHBlcmZvcm0gYSB0cmFuc2Zvcm1hdGlvblxuZnVuY3Rpb24gQ2Fubm90VHJhbnNmb3JtKCkge31cblxuY29uc3QgdHJhbnNmb3JtSW50ZXJpb3JBdG9tID0gYXRvbSA9PiB7XG4gIC8vIFRPRE86IGNoZWNrIHZhbGlkaXR5IGhhcmRlciBmb3IgdGhlIF9fdHlwZS1kZWZpbmVkIHR5cGVzXG4gIGlmICh0eXBlb2YgYXRvbSA9PT0gJ29iamVjdCcgJiYgYXRvbSAmJiAhKGF0b20gaW5zdGFuY2VvZiBEYXRlKSAmJiBhdG9tLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBhdG9tLmNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiBhdG9tLm9iamVjdElkLFxuICAgIH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIGF0b20gPT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIGF0b20gPT09ICdzeW1ib2wnKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGNhbm5vdCB0cmFuc2Zvcm0gdmFsdWU6ICR7YXRvbX1gKTtcbiAgfSBlbHNlIGlmIChEYXRlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICByZXR1cm4gRGF0ZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICB9IGVsc2UgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICByZXR1cm4gQnl0ZXNDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXRvbSA9PT0gJ29iamVjdCcgJiYgYXRvbSAmJiBhdG9tLiRyZWdleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoYXRvbS4kcmVnZXgpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBhdG9tO1xuICB9XG59O1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gdHJhbnNmb3JtIGFuIGF0b20gZnJvbSBSRVNUIGZvcm1hdCB0byBNb25nbyBmb3JtYXQuXG4vLyBBbiBhdG9tIGlzIGFueXRoaW5nIHRoYXQgY2FuJ3QgY29udGFpbiBvdGhlciBleHByZXNzaW9ucy4gU28gaXRcbi8vIGluY2x1ZGVzIHRoaW5ncyB3aGVyZSBvYmplY3RzIGFyZSB1c2VkIHRvIHJlcHJlc2VudCBvdGhlclxuLy8gZGF0YXR5cGVzLCBsaWtlIHBvaW50ZXJzIGFuZCBkYXRlcywgYnV0IGl0IGRvZXMgbm90IGluY2x1ZGUgb2JqZWN0c1xuLy8gb3IgYXJyYXlzIHdpdGggZ2VuZXJpYyBzdHVmZiBpbnNpZGUuXG4vLyBSYWlzZXMgYW4gZXJyb3IgaWYgdGhpcyBjYW5ub3QgcG9zc2libHkgYmUgdmFsaWQgUkVTVCBmb3JtYXQuXG4vLyBSZXR1cm5zIENhbm5vdFRyYW5zZm9ybSBpZiBpdCdzIGp1c3Qgbm90IGFuIGF0b21cbmZ1bmN0aW9uIHRyYW5zZm9ybVRvcExldmVsQXRvbShhdG9tLCBmaWVsZCkge1xuICBzd2l0Y2ggKHR5cGVvZiBhdG9tKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIGF0b207XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAke2ZpZWxkLnRhcmdldENsYXNzfSQke2F0b219YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhdG9tO1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGNhbm5vdCB0cmFuc2Zvcm0gdmFsdWU6ICR7YXRvbX1gKTtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKGF0b20gaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIC8vIFRlY2huaWNhbGx5IGRhdGVzIGFyZSBub3QgcmVzdCBmb3JtYXQsIGJ1dCwgaXQgc2VlbXMgcHJldHR5XG4gICAgICAgIC8vIGNsZWFyIHdoYXQgdGhleSBzaG91bGQgYmUgdHJhbnNmb3JtZWQgdG8sIHNvIGxldCdzIGp1c3QgZG8gaXQuXG4gICAgICAgIHJldHVybiBhdG9tO1xuICAgICAgfVxuXG4gICAgICBpZiAoYXRvbSA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gYXRvbTtcbiAgICAgIH1cblxuICAgICAgLy8gVE9ETzogY2hlY2sgdmFsaWRpdHkgaGFyZGVyIGZvciB0aGUgX190eXBlLWRlZmluZWQgdHlwZXNcbiAgICAgIGlmIChhdG9tLl9fdHlwZSA9PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAke2F0b20uY2xhc3NOYW1lfSQke2F0b20ub2JqZWN0SWR9YDtcbiAgICAgIH1cbiAgICAgIGlmIChEYXRlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIERhdGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEdlb1BvaW50Q29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoUG9seWdvbkNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBQb2x5Z29uQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoRmlsZUNvZGVyLmlzVmFsaWRKU09OKGF0b20pKSB7XG4gICAgICAgIHJldHVybiBGaWxlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEkgZG9uJ3QgdGhpbmsgdHlwZW9mIGNhbiBldmVyIGxldCB1cyBnZXQgaGVyZVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgIGByZWFsbHkgZGlkIG5vdCBleHBlY3QgdmFsdWU6ICR7YXRvbX1gXG4gICAgICApO1xuICB9XG59XG5cbi8vIFRyYW5zZm9ybXMgYSBxdWVyeSBjb25zdHJhaW50IGZyb20gUkVTVCBBUEkgZm9ybWF0IHRvIE1vbmdvIGZvcm1hdC5cbi8vIEEgY29uc3RyYWludCBpcyBzb21ldGhpbmcgd2l0aCBmaWVsZHMgbGlrZSAkbHQuXG4vLyBJZiBpdCBpcyBub3QgYSB2YWxpZCBjb25zdHJhaW50IGJ1dCBpdCBjb3VsZCBiZSBhIHZhbGlkIHNvbWV0aGluZ1xuLy8gZWxzZSwgcmV0dXJuIENhbm5vdFRyYW5zZm9ybS5cbi8vIGluQXJyYXkgaXMgd2hldGhlciB0aGlzIGlzIGFuIGFycmF5IGZpZWxkLlxuZnVuY3Rpb24gdHJhbnNmb3JtQ29uc3RyYWludChjb25zdHJhaW50LCBmaWVsZCwgY291bnQgPSBmYWxzZSkge1xuICBjb25zdCBpbkFycmF5ID0gZmllbGQgJiYgZmllbGQudHlwZSAmJiBmaWVsZC50eXBlID09PSAnQXJyYXknO1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnIHx8ICFjb25zdHJhaW50KSB7XG4gICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcbiAgfVxuICBjb25zdCB0cmFuc2Zvcm1GdW5jdGlvbiA9IGluQXJyYXkgPyB0cmFuc2Zvcm1JbnRlcmlvckF0b20gOiB0cmFuc2Zvcm1Ub3BMZXZlbEF0b207XG4gIGNvbnN0IHRyYW5zZm9ybWVyID0gYXRvbSA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNmb3JtRnVuY3Rpb24oYXRvbSwgZmllbGQpO1xuICAgIGlmIChyZXN1bHQgPT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCBhdG9tOiAke0pTT04uc3RyaW5naWZ5KGF0b20pfWApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuICAvLyBrZXlzIGlzIHRoZSBjb25zdHJhaW50cyBpbiByZXZlcnNlIGFscGhhYmV0aWNhbCBvcmRlci5cbiAgLy8gVGhpcyBpcyBhIGhhY2sgc28gdGhhdDpcbiAgLy8gICAkcmVnZXggaXMgaGFuZGxlZCBiZWZvcmUgJG9wdGlvbnNcbiAgLy8gICAkbmVhclNwaGVyZSBpcyBoYW5kbGVkIGJlZm9yZSAkbWF4RGlzdGFuY2VcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjb25zdHJhaW50KS5zb3J0KCkucmV2ZXJzZSgpO1xuICB2YXIgYW5zd2VyID0ge307XG4gIGZvciAodmFyIGtleSBvZiBrZXlzKSB7XG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgIGNhc2UgJyRsdCc6XG4gICAgICBjYXNlICckbHRlJzpcbiAgICAgIGNhc2UgJyRndCc6XG4gICAgICBjYXNlICckZ3RlJzpcbiAgICAgIGNhc2UgJyRleGlzdHMnOlxuICAgICAgY2FzZSAnJG5lJzpcbiAgICAgIGNhc2UgJyRlcSc6IHtcbiAgICAgICAgY29uc3QgdmFsID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAodmFsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmIHZhbC4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICAgICAgICBjYXNlICckbmUnOlxuICAgICAgICAgICAgY2FzZSAnJGVxJzpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHZhbC4kcmVsYXRpdmVUaW1lKTtcbiAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICBhbnN3ZXJba2V5XSA9IHBhcnNlclJlc3VsdC5yZXN1bHQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsb2cuaW5mbygnRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7a2V5fSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBhbnN3ZXJba2V5XSA9IHRyYW5zZm9ybWVyKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICckaW4nOlxuICAgICAgY2FzZSAnJG5pbic6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICcgKyBrZXkgKyAnIHZhbHVlJyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBfLmZsYXRNYXAoYXJyLCB2YWx1ZSA9PiB7XG4gICAgICAgICAgcmV0dXJuIChhdG9tID0+IHtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGF0b20pKSB7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAodHJhbnNmb3JtZXIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVyKGF0b20pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKHZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGFsbCc6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICcgKyBrZXkgKyAnIHZhbHVlJyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBhcnIubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG5cbiAgICAgICAgY29uc3QgdmFsdWVzID0gYW5zd2VyW2tleV07XG4gICAgICAgIGlmIChpc0FueVZhbHVlUmVnZXgodmFsdWVzKSAmJiAhaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ0FsbCAkYWxsIHZhbHVlcyBtdXN0IGJlIG9mIHJlZ2V4IHR5cGUgb3Igbm9uZTogJyArIHZhbHVlc1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRyZWdleCc6XG4gICAgICAgIHZhciBzID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAodHlwZW9mIHMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCByZWdleDogJyArIHMpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0gcztcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRjb250YWluZWRCeSc6IHtcbiAgICAgICAgY29uc3QgYXJyID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyLiRlbGVtTWF0Y2ggPSB7XG4gICAgICAgICAgJG5pbjogYXJyLm1hcCh0cmFuc2Zvcm1lciksXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG9wdGlvbnMnOlxuICAgICAgICBhbnN3ZXJba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyR0ZXh0Jzoge1xuICAgICAgICBjb25zdCBzZWFyY2ggPSBjb25zdHJhaW50W2tleV0uJHNlYXJjaDtcbiAgICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHNlYXJjaCwgc2hvdWxkIGJlIG9iamVjdGApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJHRlcm0sIHNob3VsZCBiZSBzdHJpbmdgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRzZWFyY2g6IHNlYXJjaC4kdGVybSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGxhbmd1YWdlICYmIHR5cGVvZiBzZWFyY2guJGxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRjYXNlU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGNhc2VTZW5zaXRpdmUgPSBzZWFyY2guJGNhc2VTZW5zaXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRkaWFjcml0aWNTZW5zaXRpdmUgPSBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRuZWFyU3BoZXJlJzoge1xuICAgICAgICBjb25zdCBwb2ludCA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYW5zd2VyLiRnZW9XaXRoaW4gPSB7XG4gICAgICAgICAgICAkY2VudGVyU3BoZXJlOiBbW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLCBjb25zdHJhaW50LiRtYXhEaXN0YW5jZV0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZSc6IHtcbiAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgLy8gVGhlIFNES3MgZG9uJ3Qgc2VlbSB0byB1c2UgdGhlc2UgYnV0IHRoZXkgYXJlIGRvY3VtZW50ZWQgaW4gdGhlXG4gICAgICAvLyBSRVNUIEFQSSBkb2NzLlxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5SYWRpYW5zJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbk1pbGVzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDM5NTk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnJG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzJzpcbiAgICAgICAgYW5zd2VyWyckbWF4RGlzdGFuY2UnXSA9IGNvbnN0cmFpbnRba2V5XSAvIDYzNzE7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckc2VsZWN0JzpcbiAgICAgIGNhc2UgJyRkb250U2VsZWN0JzpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgICAgJ3RoZSAnICsga2V5ICsgJyBjb25zdHJhaW50IGlzIG5vdCBzdXBwb3J0ZWQgeWV0J1xuICAgICAgICApO1xuXG4gICAgICBjYXNlICckd2l0aGluJzpcbiAgICAgICAgdmFyIGJveCA9IGNvbnN0cmFpbnRba2V5XVsnJGJveCddO1xuICAgICAgICBpZiAoIWJveCB8fCBib3gubGVuZ3RoICE9IDIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnbWFsZm9ybWF0dGVkICR3aXRoaW4gYXJnJyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgJGJveDogW1xuICAgICAgICAgICAgW2JveFswXS5sb25naXR1ZGUsIGJveFswXS5sYXRpdHVkZV0sXG4gICAgICAgICAgICBbYm94WzFdLmxvbmdpdHVkZSwgYm94WzFdLmxhdGl0dWRlXSxcbiAgICAgICAgICBdLFxuICAgICAgICB9O1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGdlb1dpdGhpbic6IHtcbiAgICAgICAgY29uc3QgcG9seWdvbiA9IGNvbnN0cmFpbnRba2V5XVsnJHBvbHlnb24nXTtcbiAgICAgICAgY29uc3QgY2VudGVyU3BoZXJlID0gY29uc3RyYWludFtrZXldWyckY2VudGVyU3BoZXJlJ107XG4gICAgICAgIGlmIChwb2x5Z29uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgcG9pbnRzO1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgICAgIH0gZWxzZSBpZiAocG9seWdvbiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludHMgPSBwb2ludHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBvaW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRnZW9XaXRoaW4gdmFsdWUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgYW5zd2VyW2tleV0gPSB7XG4gICAgICAgICAgICAkcG9seWdvbjogcG9pbnRzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoY2VudGVyU3BoZXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAoIShjZW50ZXJTcGhlcmUgaW5zdGFuY2VvZiBBcnJheSkgfHwgY2VudGVyU3BoZXJlLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgc2hvdWxkIGJlIGFuIGFycmF5IG9mIFBhcnNlLkdlb1BvaW50IGFuZCBkaXN0YW5jZSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEdldCBwb2ludCwgY29udmVydCB0byBnZW8gcG9pbnQgaWYgbmVjZXNzYXJ5IGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHBvaW50ID0gbmV3IFBhcnNlLkdlb1BvaW50KHBvaW50WzFdLCBwb2ludFswXSk7XG4gICAgICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gY2VudGVyU3BoZXJlWzFdO1xuICAgICAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGRpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJGdlb0ludGVyc2VjdHMnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldWyckcG9pbnQnXTtcbiAgICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkZ2VvbWV0cnk6IHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludCcsXG4gICAgICAgICAgICBjb29yZGluYXRlczogW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGtleS5tYXRjaCgvXlxcJCsvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgY29uc3RyYWludDogJyArIGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIENhbm5vdFRyYW5zZm9ybTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFuc3dlcjtcbn1cblxuLy8gVHJhbnNmb3JtcyBhbiB1cGRhdGUgb3BlcmF0b3IgZnJvbSBSRVNUIGZvcm1hdCB0byBtb25nbyBmb3JtYXQuXG4vLyBUbyBiZSB0cmFuc2Zvcm1lZCwgdGhlIGlucHV0IHNob3VsZCBoYXZlIGFuIF9fb3AgZmllbGQuXG4vLyBJZiBmbGF0dGVuIGlzIHRydWUsIHRoaXMgd2lsbCBmbGF0dGVuIG9wZXJhdG9ycyB0byB0aGVpciBzdGF0aWNcbi8vIGRhdGEgZm9ybWF0LiBGb3IgZXhhbXBsZSwgYW4gaW5jcmVtZW50IG9mIDIgd291bGQgc2ltcGx5IGJlY29tZSBhXG4vLyAyLlxuLy8gVGhlIG91dHB1dCBmb3IgYSBub24tZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGEgaGFzaCB3aXRoIF9fb3AgYmVpbmdcbi8vIHRoZSBtb25nbyBvcCwgYW5kIGFyZyBiZWluZyB0aGUgYXJndW1lbnQuXG4vLyBUaGUgb3V0cHV0IGZvciBhIGZsYXR0ZW5lZCBvcGVyYXRvciBpcyBqdXN0IGEgdmFsdWUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGlzIHNob3VsZCBiZSBhIG5vLW9wLlxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1VcGRhdGVPcGVyYXRvcih7IF9fb3AsIGFtb3VudCwgb2JqZWN0cyB9LCBmbGF0dGVuKSB7XG4gIHN3aXRjaCAoX19vcCkge1xuICAgIGNhc2UgJ0RlbGV0ZSc6XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyR1bnNldCcsIGFyZzogJycgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0luY3JlbWVudCc6XG4gICAgICBpZiAodHlwZW9mIGFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2luY3JlbWVudGluZyBtdXN0IHByb3ZpZGUgYSBudW1iZXInKTtcbiAgICAgIH1cbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBhbW91bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJGluYycsIGFyZzogYW1vdW50IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdTZXRPbkluc2VydCc6XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gYW1vdW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogJyRzZXRPbkluc2VydCcsIGFyZzogYW1vdW50IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdBZGQnOlxuICAgIGNhc2UgJ0FkZFVuaXF1ZSc6XG4gICAgICBpZiAoIShvYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICB9XG4gICAgICB2YXIgdG9BZGQgPSBvYmplY3RzLm1hcCh0cmFuc2Zvcm1JbnRlcmlvckF0b20pO1xuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIHRvQWRkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG1vbmdvT3AgPSB7XG4gICAgICAgICAgQWRkOiAnJHB1c2gnLFxuICAgICAgICAgIEFkZFVuaXF1ZTogJyRhZGRUb1NldCcsXG4gICAgICAgIH1bX19vcF07XG4gICAgICAgIHJldHVybiB7IF9fb3A6IG1vbmdvT3AsIGFyZzogeyAkZWFjaDogdG9BZGQgfSB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gcmVtb3ZlIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b1JlbW92ZSA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHB1bGxBbGwnLCBhcmc6IHRvUmVtb3ZlIH07XG4gICAgICB9XG5cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICBgVGhlICR7X19vcH0gb3BlcmF0b3IgaXMgbm90IHN1cHBvcnRlZCB5ZXQuYFxuICAgICAgKTtcbiAgfVxufVxuZnVuY3Rpb24gbWFwVmFsdWVzKG9iamVjdCwgaXRlcmF0b3IpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgIHJlc3VsdFtrZXldID0gaXRlcmF0b3Iob2JqZWN0W2tleV0pO1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuY29uc3QgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0ID0gbW9uZ29PYmplY3QgPT4ge1xuICBzd2l0Y2ggKHR5cGVvZiBtb25nb09iamVjdCkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0O1xuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgdGhyb3cgJ2JhZCB2YWx1ZSBpbiBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QnO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG1vbmdvT2JqZWN0LCAnX190eXBlJykgJiZcbiAgICAgICAgbW9uZ29PYmplY3QuX190eXBlID09ICdEYXRlJyAmJlxuICAgICAgICBtb25nb09iamVjdC5pc28gaW5zdGFuY2VvZiBEYXRlXG4gICAgICApIHtcbiAgICAgICAgbW9uZ29PYmplY3QuaXNvID0gbW9uZ29PYmplY3QuaXNvLnRvSlNPTigpO1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBtYXBWYWx1ZXMobW9uZ29PYmplY3QsIG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nID0gKHNjaGVtYSwgZmllbGQsIHBvaW50ZXJTdHJpbmcpID0+IHtcbiAgY29uc3Qgb2JqRGF0YSA9IHBvaW50ZXJTdHJpbmcuc3BsaXQoJyQnKTtcbiAgaWYgKG9iakRhdGFbMF0gIT09IHNjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzKSB7XG4gICAgdGhyb3cgJ3BvaW50ZXIgdG8gaW5jb3JyZWN0IGNsYXNzTmFtZSc7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICBjbGFzc05hbWU6IG9iakRhdGFbMF0sXG4gICAgb2JqZWN0SWQ6IG9iakRhdGFbMV0sXG4gIH07XG59O1xuXG4vLyBDb252ZXJ0cyBmcm9tIGEgbW9uZ28tZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbi8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG5jb25zdCBtb25nb09iamVjdFRvUGFyc2VPYmplY3QgPSAoY2xhc3NOYW1lLCBtb25nb09iamVjdCwgc2NoZW1hKSA9PiB7XG4gIHN3aXRjaCAodHlwZW9mIG1vbmdvT2JqZWN0KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyAnYmFkIHZhbHVlIGluIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCc7XG4gICAgY2FzZSAnb2JqZWN0Jzoge1xuICAgICAgaWYgKG1vbmdvT2JqZWN0ID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0Lm1hcChuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgIHJldHVybiBQYXJzZS5fZW5jb2RlKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Mb25nKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC50b051bWJlcigpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkRvdWJsZSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudmFsdWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChCeXRlc0NvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChtb25nb09iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04obW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN0T2JqZWN0ID0ge307XG4gICAgICBpZiAobW9uZ29PYmplY3QuX3JwZXJtIHx8IG1vbmdvT2JqZWN0Ll93cGVybSkge1xuICAgICAgICByZXN0T2JqZWN0Ll9ycGVybSA9IG1vbmdvT2JqZWN0Ll9ycGVybSB8fCBbXTtcbiAgICAgICAgcmVzdE9iamVjdC5fd3Blcm0gPSBtb25nb09iamVjdC5fd3Blcm0gfHwgW107XG4gICAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fd3Blcm07XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGtleSBpbiBtb25nb09iamVjdCkge1xuICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgIGNhc2UgJ19pZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydvYmplY3RJZCddID0gJycgKyBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2hhc2hlZF9wYXNzd29yZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQgPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnX2FjbCc6XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICAgICAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbic6XG4gICAgICAgICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnOlxuICAgICAgICAgIGNhc2UgJ190b21ic3RvbmUnOlxuICAgICAgICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICAgICAgY2FzZSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfZmFpbGVkX2xvZ2luX2NvdW50JzpcbiAgICAgICAgICBjYXNlICdfcGFzc3dvcmRfaGlzdG9yeSc6XG4gICAgICAgICAgICAvLyBUaG9zZSBrZXlzIHdpbGwgYmUgZGVsZXRlZCBpZiBuZWVkZWQgaW4gdGhlIERCIENvbnRyb2xsZXJcbiAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfc2Vzc2lvbl90b2tlbic6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydzZXNzaW9uVG9rZW4nXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgICAgIGNhc2UgJ191cGRhdGVkX2F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3VwZGF0ZWRBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnY3JlYXRlZEF0JzpcbiAgICAgICAgICBjYXNlICdfY3JlYXRlZF9hdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydjcmVhdGVkQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2V4cGlyZXNBdCc6XG4gICAgICAgICAgY2FzZSAnX2V4cGlyZXNBdCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydleHBpcmVzQXQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgICAgICAgIGNhc2UgJ19sYXN0X3VzZWQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsnbGFzdFVzZWQnXSA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUobW9uZ29PYmplY3Rba2V5XSkpLmlzbztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICAgICAgY2FzZSAndGltZXNfdXNlZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0Wyd0aW1lc1VzZWQnXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdhdXRoRGF0YSc6XG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgICAgICAgIGxvZy53YXJuKFxuICAgICAgICAgICAgICAgICdpZ25vcmluZyBhdXRoRGF0YSBpbiBfVXNlciBhcyB0aGlzIGtleSBpcyByZXNlcnZlZCB0byBiZSBzeW50aGVzaXplZCBvZiBgX2F1dGhfZGF0YV8qYCBrZXlzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQ2hlY2sgb3RoZXIgYXV0aCBkYXRhIGtleXNcbiAgICAgICAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0ga2V5Lm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICAgICAgICBpZiAoYXV0aERhdGFNYXRjaCAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXSA9IHJlc3RPYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgICAgICAgIHJlc3RPYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChrZXkuaW5kZXhPZignX3BfJykgPT0gMCkge1xuICAgICAgICAgICAgICB2YXIgbmV3S2V5ID0ga2V5LnN1YnN0cmluZygzKTtcbiAgICAgICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW25ld0tleV0pIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBjb2x1bW4gbm90IGluIHRoZSBzY2hlbWEsIGRyb3BwaW5nIGl0LicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBuZXdLZXlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW25ld0tleV0udHlwZSAhPT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgICAgICAgbG9nLmluZm8oXG4gICAgICAgICAgICAgICAgICAndHJhbnNmb3JtLmpzJyxcbiAgICAgICAgICAgICAgICAgICdGb3VuZCBhIHBvaW50ZXIgaW4gYSBub24tcG9pbnRlciBjb2x1bW4sIGRyb3BwaW5nIGl0LicsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBrZXlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChtb25nb09iamVjdFtrZXldID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmVzdE9iamVjdFtuZXdLZXldID0gdHJhbnNmb3JtUG9pbnRlclN0cmluZyhzY2hlbWEsIG5ld0tleSwgbW9uZ29PYmplY3Rba2V5XSk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlbMF0gPT0gJ18nICYmIGtleSAhPSAnX190eXBlJykge1xuICAgICAgICAgICAgICB0aHJvdyAnYmFkIGtleSBpbiB1bnRyYW5zZm9ybTogJyArIGtleTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhciB2YWx1ZSA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICAgICAgICAgICAgRmlsZUNvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gRmlsZUNvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdHZW9Qb2ludCcgJiZcbiAgICAgICAgICAgICAgICBHZW9Qb2ludENvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdCh2YWx1ZSlcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gR2VvUG9pbnRDb2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9seWdvbicgJiZcbiAgICAgICAgICAgICAgICBQb2x5Z29uQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBQb2x5Z29uQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgICAgICAgICAgIEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KG1vbmdvT2JqZWN0W2tleV0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgZmllbGROYW1lID0+IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nXG4gICAgICApO1xuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZHMgPSB7fTtcbiAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5mb3JFYWNoKHJlbGF0aW9uRmllbGROYW1lID0+IHtcbiAgICAgICAgcmVsYXRpb25GaWVsZHNbcmVsYXRpb25GaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbcmVsYXRpb25GaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IC4uLnJlc3RPYmplY3QsIC4uLnJlbGF0aW9uRmllbGRzIH07XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAndW5rbm93biBqcyB0eXBlJztcbiAgfVxufTtcblxudmFyIERhdGVDb2RlciA9IHtcbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBuZXcgRGF0ZShqc29uLmlzbyk7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJztcbiAgfSxcbn07XG5cbnZhciBCeXRlc0NvZGVyID0ge1xuICBiYXNlNjRQYXR0ZXJuOiBuZXcgUmVnRXhwKCdeKD86W0EtWmEtejAtOSsvXXs0fSkqKD86W0EtWmEtejAtOSsvXXsyfT09fFtBLVphLXowLTkrL117M309KT8kJyksXG4gIGlzQmFzZTY0VmFsdWUob2JqZWN0KSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmJhc2U2NFBhdHRlcm4udGVzdChvYmplY3QpO1xuICB9LFxuXG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIGxldCB2YWx1ZTtcbiAgICBpZiAodGhpcy5pc0Jhc2U2NFZhbHVlKG9iamVjdCkpIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSA9IG9iamVjdC5idWZmZXIudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgYmFzZTY0OiB2YWx1ZSxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5CaW5hcnkgfHwgdGhpcy5pc0Jhc2U2NFZhbHVlKG9iamVjdCk7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBuZXcgbW9uZ29kYi5CaW5hcnkoQnVmZmVyLmZyb20oanNvbi5iYXNlNjQsICdiYXNlNjQnKSk7XG4gIH0sXG5cbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcyc7XG4gIH0sXG59O1xuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgIGxhdGl0dWRlOiBvYmplY3RbMV0sXG4gICAgICBsb25naXR1ZGU6IG9iamVjdFswXSxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgQXJyYXkgJiYgb2JqZWN0Lmxlbmd0aCA9PSAyO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4gW2pzb24ubG9uZ2l0dWRlLCBqc29uLmxhdGl0dWRlXTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50JztcbiAgfSxcbn07XG5cbnZhciBQb2x5Z29uQ29kZXIgPSB7XG4gIGRhdGFiYXNlVG9KU09OKG9iamVjdCkge1xuICAgIC8vIENvbnZlcnQgbG5nL2xhdCAtPiBsYXQvbG5nXG4gICAgY29uc3QgY29vcmRzID0gb2JqZWN0LmNvb3JkaW5hdGVzWzBdLm1hcChjb29yZCA9PiB7XG4gICAgICByZXR1cm4gW2Nvb3JkWzFdLCBjb29yZFswXV07XG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgY29vcmRpbmF0ZXM6IGNvb3JkcyxcbiAgICB9O1xuICB9LFxuXG4gIGlzVmFsaWREYXRhYmFzZU9iamVjdChvYmplY3QpIHtcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF07XG4gICAgaWYgKG9iamVjdC50eXBlICE9PSAnUG9seWdvbicgfHwgIShjb29yZHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb29yZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gY29vcmRzW2ldO1xuICAgICAgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWREYXRhYmFzZU9iamVjdChwb2ludCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICBsZXQgY29vcmRzID0ganNvbi5jb29yZGluYXRlcztcbiAgICAvLyBBZGQgZmlyc3QgcG9pbnQgdG8gdGhlIGVuZCB0byBjbG9zZSBwb2x5Z29uXG4gICAgaWYgKFxuICAgICAgY29vcmRzWzBdWzBdICE9PSBjb29yZHNbY29vcmRzLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgICBjb29yZHNbMF1bMV0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMV1cbiAgICApIHtcbiAgICAgIGNvb3Jkcy5wdXNoKGNvb3Jkc1swXSk7XG4gICAgfVxuICAgIGNvbnN0IHVuaXF1ZSA9IGNvb3Jkcy5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgICAgZm91bmRJbmRleCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgICB9KTtcbiAgICBpZiAodW5pcXVlLmxlbmd0aCA8IDMpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAnR2VvSlNPTjogTG9vcCBtdXN0IGhhdmUgYXQgbGVhc3QgMyBkaWZmZXJlbnQgdmVydGljZXMnXG4gICAgICApO1xuICAgIH1cbiAgICAvLyBDb252ZXJ0IGxhdC9sb25nIC0+IGxvbmcvbGF0XG4gICAgY29vcmRzID0gY29vcmRzLm1hcChjb29yZCA9PiB7XG4gICAgICByZXR1cm4gW2Nvb3JkWzFdLCBjb29yZFswXV07XG4gICAgfSk7XG4gICAgcmV0dXJuIHsgdHlwZTogJ1BvbHlnb24nLCBjb29yZGluYXRlczogW2Nvb3Jkc10gfTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nO1xuICB9LFxufTtcblxudmFyIEZpbGVDb2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogb2JqZWN0LFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiB0eXBlb2Ygb2JqZWN0ID09PSAnc3RyaW5nJztcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIGpzb24ubmFtZTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnO1xuICB9LFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRyYW5zZm9ybUtleSxcbiAgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVdoZXJlLFxuICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QsXG4gIHRyYW5zZm9ybUNvbnN0cmFpbnQsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUF1QixTQUFBRCx1QkFBQUcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUN2QixJQUFJRyxPQUFPLEdBQUdMLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFDaEMsSUFBSU0sS0FBSyxHQUFHTixPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNNLEtBQUs7QUFDdkMsTUFBTUMsS0FBSyxHQUFHUCxPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFFdkMsTUFBTVEsWUFBWSxHQUFHQSxDQUFDQyxTQUFTLEVBQUVDLFNBQVMsRUFBRUMsTUFBTSxLQUFLO0VBQ3JEO0VBQ0EsUUFBUUQsU0FBUztJQUNmLEtBQUssVUFBVTtNQUNiLE9BQU8sS0FBSztJQUNkLEtBQUssV0FBVztNQUNkLE9BQU8sYUFBYTtJQUN0QixLQUFLLFdBQVc7TUFDZCxPQUFPLGFBQWE7SUFDdEIsS0FBSyxjQUFjO01BQ2pCLE9BQU8sZ0JBQWdCO0lBQ3pCLEtBQUssVUFBVTtNQUNiLE9BQU8sWUFBWTtJQUNyQixLQUFLLFdBQVc7TUFDZCxPQUFPLFlBQVk7RUFDdkI7RUFFQSxJQUFJQyxNQUFNLENBQUNDLE1BQU0sQ0FBQ0YsU0FBUyxDQUFDLElBQUlDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDRixTQUFTLENBQUMsQ0FBQ0csTUFBTSxJQUFJ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