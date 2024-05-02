"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;
var _PostgresClient = require("./PostgresClient");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _sql = _interopRequireDefault(require("./sql"));
var _StorageAdapter = require("../StorageAdapter");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // -disable-next
// -disable-next
// -disable-next
const Utils = require('../../../Utils');
const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');
const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};
const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp with time zone';
    case 'Object':
      return 'jsonb';
    case 'File':
      return 'text';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'GeoPoint':
      return 'point';
    case 'Bytes':
      return 'jsonb';
    case 'Polygon':
      return 'polygon';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};
const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};
const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};
const toPostgresValueCastType = value => {
  const postgresValue = toPostgresValue(value);
  let castType;
  switch (typeof postgresValue) {
    case 'number':
      castType = 'double precision';
      break;
    case 'boolean':
      castType = 'boolean';
      break;
    default:
      castType = undefined;
  }
  return castType;
};
const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  count: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});
const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = _objectSpread(_objectSpread({}, emptyCLPS), schema.classLevelPermissions);
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = _objectSpread({}, schema.indexes);
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};
const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }
  return schema;
};
const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      /* eslint-disable no-cond-assign */
      while (next = components.shift()) {
        /* eslint-enable no-cond-assign */
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
};
const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    return `'${cmpt}'`;
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};
const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }
  if (fieldName === '$_created_at') {
    return 'createdAt';
  }
  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }
  return fieldName.substring(1);
};
const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }
      if (key.includes('$') || key.includes('.')) {
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
};

// Returns the list of join tables on a schema
const joinTablesForSchema = schema => {
  const list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
};
const buildWhereClause = ({
  schema,
  query,
  index,
  caseInsensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothing in the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }
    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (caseInsensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb @> $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}::text`);
          values.push(name, fieldValue);
          index += 2;
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      // Can't cast boolean to double precision
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
      }
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          caseInsensitive
        });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';
      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }
    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toPostgresValueCastType(fieldValue.$ne);
              const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`);
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            } else {
              patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
            }
          }
        }
      }
      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }
    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue.$eq);
          const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem != null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };
      if (fieldValue.$in) {
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }
    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }
        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      }
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    } else if (Array.isArray(fieldValue.$all)) {
      if (fieldValue.$all.length === 1) {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$all[0].objectId);
        index += 2;
      }
    }
    if (typeof fieldValue.$exists !== 'undefined') {
      if (typeof fieldValue.$exists === 'object' && fieldValue.$exists.$relativeTime) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
      } else if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }
    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;
      if (!(arr instanceof Array)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }
      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }
    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }
    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }
      _node.default.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }
        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }
      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);
          return `(${point[0]}, ${point[1]})`;
        }
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }
    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }
      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }
    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }
    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }
    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }
    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }
    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        let constraintFieldName;
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue[cmp]);
          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
          if (typeof postgresValue === 'object' && postgresValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            const parserResult = Utils.relativeTimeToDate(postgresValue.$relativeTime);
            if (parserResult.status === 'success') {
              postgresValue = toPostgresValue(parserResult.result);
            } else {
              console.error('Error while parsing relative date', parserResult);
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $relativeTime (${postgresValue.$relativeTime}) value. ${parserResult.info}`);
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(postgresValue);
        patterns.push(`${constraintFieldName} ${pgComparator} $${index++}`);
      }
    });
    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};
class PostgresStorageAdapter {
  // Private

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions = {}
  }) {
    const options = _objectSpread({}, databaseOptions);
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    this.disableIndexFieldValidation = !!databaseOptions.disableIndexFieldValidation;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'disableIndexFieldValidation']) {
      delete options[key];
    }
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, options);
    this._client = client;
    this._onchange = () => {};
    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }
  watch(callback) {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }
  handleShutdown() {
    if (this._stream) {
      this._stream.done();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }
  async _listenToSchema() {
    if (!this._stream && this.enableSchemaHooks) {
      this._stream = await this._client.connect({
        direct: true
      });
      this._stream.client.on('notification', data => {
        const payload = JSON.parse(data.payload);
        if (payload.senderId !== this._uuid) {
          this._onchange();
        }
      });
      await this._stream.none('LISTEN $1~', 'schema.change');
    }
  }
  _notifySchemaChange() {
    if (this._stream) {
      this._stream.none('NOTIFY $1~, $2', ['schema.change', {
        senderId: this._uuid
      }]).catch(error => {
        console.log('Failed to Notify:', error); // unlikely to ever happen
      });
    }
  }
  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      throw error;
    });
  }
  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }
  async setClassLevelPermissions(className, CLPs) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
    this._notifySchemaChange();
  }
  async setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;
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
    const deletedIndexes = [];
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
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!this.disableIndexFieldValidation && !Object.prototype.hasOwnProperty.call(fields, key)) {
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
    await conn.tx('set-indexes-with-schema-format', async t => {
      try {
        if (insertedIndexes.length > 0) {
          await self.createIndexes(className, insertedIndexes, t);
        }
      } catch (e) {
        var _e$errors;
        const columnDoesNotExistError = ((_e$errors = e.errors) === null || _e$errors === void 0 || (_e$errors = _e$errors[0]) === null || _e$errors === void 0 ? void 0 : _e$errors.code) === '42703';
        if (columnDoesNotExistError && !this.disableIndexFieldValidation) {
          throw e;
        }
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
    this._notifySchemaChange();
  }
  async createClass(className, schema, conn) {
    conn = conn || this._client;
    const parseSchema = await conn.tx('create-class', async t => {
      await this.createTable(className, schema, t);
      await t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return toParseSchema(schema);
    }).catch(err => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }
      throw err;
    });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className, schema, conn) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    return conn.task('create-table', async t => {
      try {
        await t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }
      await t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }
  async schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;
    await conn.task('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));
      await t.batch(newColumns);
    });
  }
  async addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN IF NOT EXISTS $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        await t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }
      const result = await t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });
      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
    this._notifySchemaChange();
  }
  async updateFieldOptions(className, fieldName, type) {
    await this._client.tx('update-schema-field-options', async t => {
      const path = `{fields,${fieldName}}`;
      await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
        path,
        type,
        className
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  async deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    const response = await this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table

    this._notifySchemaChange();
    return response;
  }

  // Delete all data known to this adapter. Used for testing.
  async deleteAllClasses() {
    var _this$_client;
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    if ((_this$_client = this._client) !== null && _this$_client !== void 0 && _this$_client.$pool.ended) {
      return;
    }
    await this._client.task('delete-all-classes', async t => {
      try {
        const results = await t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', '_Idempotency', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        await t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  async deleteFields(className, schema, fieldNames) {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $<schema> WHERE "className" = $<className>', {
        schema,
        className
      });
      if (values.length > 1) {
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
      }
    });
    this._notifySchemaChange();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  async getClass(className) {
    debug('getClass');
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className" = $<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }
      return result[0].schema;
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  async createObject(className, schema, object, transactionalSession) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};
    object = handleDotFields(object);
    validateKeys(object);
    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      const authDataAlreadyExists = !!object.authData;
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
        // Avoid adding authData multiple times to the query
        if (authDataAlreadyExists) {
          return;
        }
      }
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client).none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        error = err;
      }
      throw error;
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  async deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      // ELSE: Don't delete anything if doesn't exist
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }
  // Return value not currently well specified.
  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);
    const originalUpdate = _objectSpread({}, update);

    // Set flag for dot notation fields
    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }
    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      // Drop any undefined values.
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }
        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', {
          fieldName,
          fieldValue
        });
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    caseInsensitive,
    explain
  }) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }
    let sortPattern = '';
    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->');
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }
        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }
    let columns = '*';
    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0 && (
        // Remove selected field not referenced in the schema
        // Relation is not a column in postgres
        // $score is a Parse special field and is also not a column
        schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }
    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return [];
    }).then(results => {
      if (explain) {
        return results;
      }
      return results.map(object => this.postgresObjectToParseObject(className, object, schema));
    });
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = new String(object[fieldName]);
        coords = coords.substring(2, coords.length - 2).split('),(');
        const updatedCoords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: updatedCoords
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    });
    //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }
    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }
    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  async count(className, schema, query, readPreference, estimate = true) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';
    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }
    return this._client.one(qs, values, a => {
      if (a.approximate_row_count == null || a.approximate_row_count == -1) {
        return !isNaN(+a.count) ? +a.count : 0;
      } else {
        return +a.approximate_row_count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return 0;
    });
  }
  async distinct(className, schema, query, fieldName) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }
      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }
          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }
      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }
  async aggregate(className, schema, pipeline, readPreference, hint, explain) {
    debug('aggregate');
    const values = [className];
    let index = 2;
    let columns = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }
          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];
            for (const alias in value) {
              if (typeof value[alias] === 'string' && value[alias]) {
                const source = transformAggregateField(value[alias]);
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }
                values.push(source, alias);
                columns.push(`$${index}:name AS $${index + 1}:name`);
                index += 2;
              } else {
                const operation = Object.keys(value[alias])[0];
                const source = transformAggregateField(value[alias][operation]);
                if (mongoAggregateToPostgres[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC')::integer AS $${index + 1}:name`);
                  values.push(source, alias);
                  index += 2;
                }
              }
            }
            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }
          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }
            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }
            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }
            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or') ? ' OR ' : ' AND ';
        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }
        for (let field in stage.$match) {
          const value = stage.$match[field];
          if (field === '_id') {
            field = 'objectId';
          }
          const matchPatterns = [];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
              index += 2;
            }
          });
          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }
          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }
      if (stage.$limit) {
        limitPattern = `LIMIT $${index}`;
        values.push(stage.$limit);
        index += 1;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }
    if (groupPattern) {
      columns.forEach((e, i, a) => {
        if (e && e.trim() === '*') {
          a[i] = '';
        }
      });
    }
    const originalQuery = `SELECT ${columns.filter(Boolean).join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.postgresObjectToParseObject(className, object, schema));
      results.forEach(result => {
        if (!Object.prototype.hasOwnProperty.call(result, 'objectId')) {
          result.objectId = null;
        }
        if (groupValues) {
          result.objectId = {};
          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }
        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }
  async performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', async t => {
        await t.none(_sql.default.misc.jsonObjectSetKeys);
        await t.none(_sql.default.array.add);
        await t.none(_sql.default.array.addUnique);
        await t.none(_sql.default.array.remove);
        await t.none(_sql.default.array.containsAll);
        await t.none(_sql.default.array.containsAllRegex);
        await t.none(_sql.default.array.contains);
        return t.ctx;
      });
    }).then(ctx => {
      debug(`initializationDone in ${ctx.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }
  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }
  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }
  async dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    await (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }
  async getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }
  async updateSchemaWithIndexes() {
    return Promise.resolve();
  }

  // Used for testing purposes
  async updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }
  async createTransactionalSession() {
    return new Promise(resolve => {
      const transactionalSession = {};
      transactionalSession.result = this._client.tx(t => {
        transactionalSession.t = t;
        transactionalSession.promise = new Promise(resolve => {
          transactionalSession.resolve = resolve;
        });
        transactionalSession.batch = [];
        resolve(transactionalSession);
        return transactionalSession.promise;
      });
    });
  }
  commitTransactionalSession(transactionalSession) {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }
  abortTransactionalSession(transactionalSession) {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }
  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX IF NOT EXISTS $1:name ON $2:name (${constraintPatterns.join()})`;
    const setIdempotencyFunction = options.setIdempotencyFunction !== undefined ? options.setIdempotencyFunction : false;
    if (setIdempotencyFunction) {
      await this.ensureIdempotencyFunctionExists(options);
    }
    await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexNameOptions.name)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }
  async deleteIdempotencyFunction(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION IF EXISTS idempotency_delete_expired_records()';
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
  async ensureIdempotencyFunctionExists(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl} seconds` : '60 seconds';
    const qs = 'CREATE OR REPLACE FUNCTION idempotency_delete_expired_records() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM "_Idempotency" WHERE expire < NOW() - INTERVAL $1; END; $$;';
    return conn.none(qs, [ttlOptions]).catch(error => {
      throw error;
    });
  }
}
exports.PostgresStorageAdapter = PostgresStorageAdapter;
function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
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
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }
  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}
function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gim, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gim, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1')
  // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}
function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}
function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }
  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}
function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }
  return true;
}
function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}
function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all unicode letter chars
    if (c.match(regex) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/g, `$1''`).replace(/^'([^'])/, `''$1`);
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = exports.default = PostgresStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsImUiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsImtleSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwib2JqZWN0IiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyaW5nIiwidmFsaWRhdGVLZXlzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCIkcmVsYXRpdmVUaW1lIiwiSU5WQUxJRF9KU09OIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24iLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJzZWxmIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJ0eCIsImNyZWF0ZUluZGV4ZXMiLCJfZSRlcnJvcnMiLCJjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciIsImVycm9ycyIsImNvZGUiLCJkcm9wSW5kZXhlcyIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJjcmVhdGVUYWJsZSIsImVyciIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIl90aGlzJF9jbGllbnQiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImVuZGVkIiwicmVzdWx0cyIsImpvaW5zIiwicmVkdWNlIiwiY2xhc3NlcyIsInF1ZXJpZXMiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwiaWR4IiwiZ2V0QWxsQ2xhc3NlcyIsInJvdyIsImdldENsYXNzIiwiY3JlYXRlT2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb2x1bW5zQXJyYXkiLCJnZW9Qb2ludHMiLCJhdXRoRGF0YUFscmVhZHlFeGlzdHMiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImMiLCJrZXlzVG9EZWxldGUiLCJkZWxldGVQYXR0ZXJucyIsInAiLCJ1cGRhdGVPYmplY3QiLCJleHBlY3RlZFR5cGUiLCJyZWplY3QiLCJ3aGVyZUNsYXVzZSIsInVwc2VydE9uZU9iamVjdCIsImNyZWF0ZVZhbHVlIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImV4cGxhaW4iLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsIm9yaWdpbmFsUXVlcnkiLCJwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QiLCJ0YXJnZXRDbGFzcyIsInkiLCJ4IiwiY29vcmRzIiwidXBkYXRlZENvb3JkcyIsInBhcnNlRmxvYXQiLCJjcmVhdGVkQXQiLCJ0b0lTT1N0cmluZyIsInVwZGF0ZWRBdCIsImV4cGlyZXNBdCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJjb25zdHJhaW50TmFtZSIsImNvbnN0cmFpbnRQYXR0ZXJucyIsIm1lc3NhZ2UiLCJyZWFkUHJlZmVyZW5jZSIsImVzdGltYXRlIiwiYXBwcm94aW1hdGVfcm93X2NvdW50IiwiZGlzdGluY3QiLCJjb2x1bW4iLCJpc05lc3RlZCIsImlzUG9pbnRlckZpZWxkIiwidHJhbnNmb3JtZXIiLCJjaGlsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiaGludCIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwic291cmNlIiwib3BlcmF0aW9uIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsInRyaW0iLCJCb29sZWFuIiwicGFyc2VJbnQiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicHJvbWlzZXMiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJhbGwiLCJzcWwiLCJtaXNjIiwianNvbk9iamVjdFNldEtleXMiLCJhcnJheSIsImFkZCIsImFkZFVuaXF1ZSIsInJlbW92ZSIsImNvbnRhaW5zQWxsIiwiY29udGFpbnNBbGxSZWdleCIsImNvbnRhaW5zIiwiY3R4IiwiZHVyYXRpb24iLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJnZXRJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJ1cGRhdGVFc3RpbWF0ZWRDb3VudCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiZW5zdXJlSW5kZXgiLCJpbmRleE5hbWUiLCJkZWZhdWx0SW5kZXhOYW1lIiwiaW5kZXhOYW1lT3B0aW9ucyIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJlbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzIiwiZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbiIsInR0bE9wdGlvbnMiLCJ0dGwiLCJleHBvcnRzIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gJy4vUG9zdGdyZXNDbGllbnQnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHNxbCBmcm9tICcuL3NxbCc7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVHlwZSwgUXVlcnlUeXBlLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uLy4uLy4uL1V0aWxzJyk7XG5cbmNvbnN0IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciA9ICc0MlAwMSc7XG5jb25zdCBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgPSAnNDJQMDcnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciA9ICc0MjcwMSc7XG5jb25zdCBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciA9ICc0MjcwMyc7XG5jb25zdCBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgPSAnMjM1MDUnO1xuY29uc3QgbG9nZ2VyID0gcmVxdWlyZSgnLi4vLi4vLi4vbG9nZ2VyJyk7XG5cbmNvbnN0IGRlYnVnID0gZnVuY3Rpb24gKC4uLmFyZ3M6IGFueSkge1xuICBhcmdzID0gWydQRzogJyArIGFyZ3VtZW50c1swXV0uY29uY2F0KGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGgpKTtcbiAgY29uc3QgbG9nID0gbG9nZ2VyLmdldExvZ2dlcigpO1xuICBsb2cuZGVidWcuYXBwbHkobG9nLCBhcmdzKTtcbn07XG5cbmNvbnN0IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlID0gdHlwZSA9PiB7XG4gIHN3aXRjaCAodHlwZS50eXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gJ3RpbWVzdGFtcCB3aXRoIHRpbWUgem9uZSc7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiAnYm9vbGVhbic7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAncG9pbnQnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICBpZiAodHlwZS5jb250ZW50cyAmJiB0eXBlLmNvbnRlbnRzLnR5cGUgPT09ICdTdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiAndGV4dFtdJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAnanNvbmInO1xuICAgICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBgbm8gdHlwZSBmb3IgJHtKU09OLnN0cmluZ2lmeSh0eXBlKX0geWV0YDtcbiAgfVxufTtcblxuY29uc3QgUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yID0ge1xuICAkZ3Q6ICc+JyxcbiAgJGx0OiAnPCcsXG4gICRndGU6ICc+PScsXG4gICRsdGU6ICc8PScsXG59O1xuXG5jb25zdCBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMgPSB7XG4gICRkYXlPZk1vbnRoOiAnREFZJyxcbiAgJGRheU9mV2VlazogJ0RPVycsXG4gICRkYXlPZlllYXI6ICdET1knLFxuICAkaXNvRGF5T2ZXZWVrOiAnSVNPRE9XJyxcbiAgJGlzb1dlZWtZZWFyOiAnSVNPWUVBUicsXG4gICRob3VyOiAnSE9VUicsXG4gICRtaW51dGU6ICdNSU5VVEUnLFxuICAkc2Vjb25kOiAnU0VDT05EJyxcbiAgJG1pbGxpc2Vjb25kOiAnTUlMTElTRUNPTkRTJyxcbiAgJG1vbnRoOiAnTU9OVEgnLFxuICAkd2VlazogJ1dFRUsnLFxuICAkeWVhcjogJ1lFQVInLFxufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLmlzbztcbiAgICB9XG4gICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuY29uc3QgdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUgPSB2YWx1ZSA9PiB7XG4gIGNvbnN0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUodmFsdWUpO1xuICBsZXQgY2FzdFR5cGU7XG4gIHN3aXRjaCAodHlwZW9mIHBvc3RncmVzVmFsdWUpIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgY2FzdFR5cGUgPSAnZG91YmxlIHByZWNpc2lvbic7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIGNhc3RUeXBlID0gJ2Jvb2xlYW4nO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNhc3RUeXBlID0gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiBjYXN0VHlwZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBEdXBsaWNhdGUgZnJvbSB0aGVuIG1vbmdvIGFkYXB0ZXIuLi5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY291bnQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuY29uc3QgdG9QYXJzZVNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuICBpZiAoc2NoZW1hLmZpZWxkcykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIH1cbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgaWYgKHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLnNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfTtcbiAgfVxuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAoc2NoZW1hLmluZGV4ZXMpIHtcbiAgICBpbmRleGVzID0geyAuLi5zY2hlbWEuaW5kZXhlcyB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlcyxcbiAgfTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoIXNjaGVtYSkge1xuICAgIHJldHVybiBzY2hlbWE7XG4gIH1cbiAgc2NoZW1hLmZpZWxkcyA9IHNjaGVtYS5maWVsZHMgfHwge307XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgIHNjaGVtYS5maWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgfVxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgaGFuZGxlRG90RmllbGRzID0gb2JqZWN0ID0+IHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICBvYmplY3RbZmlyc3RdID0gb2JqZWN0W2ZpcnN0XSB8fCB7fTtcbiAgICAgIGxldCBjdXJyZW50T2JqID0gb2JqZWN0W2ZpcnN0XTtcbiAgICAgIGxldCBuZXh0O1xuICAgICAgbGV0IHZhbHVlID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICBpZiAodmFsdWUgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgd2hpbGUgKChuZXh0ID0gY29tcG9uZW50cy5zaGlmdCgpKSkge1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSBjdXJyZW50T2JqW25leHRdIHx8IHt9O1xuICAgICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjdXJyZW50T2JqW25leHRdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudE9iaiA9IGN1cnJlbnRPYmpbbmV4dF07XG4gICAgICB9XG4gICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzID0gZmllbGROYW1lID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpLm1hcCgoY21wdCwgaW5kZXgpID0+IHtcbiAgICBpZiAoaW5kZXggPT09IDApIHtcbiAgICAgIHJldHVybiBgXCIke2NtcHR9XCJgO1xuICAgIH1cbiAgICByZXR1cm4gYCcke2NtcHR9J2A7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICByZXR1cm4gZmllbGROYW1lLnN1YnN0cmluZygxKTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoeyBzY2hlbWEsIHF1ZXJ5LCBpbmRleCwgY2FzZUluc2Vuc2l0aXZlIH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgIC8vIFRPRE86IEhhbmRsZSBxdWVyeWluZyBieSBfYXV0aF9kYXRhX3Byb3ZpZGVyLCBhdXRoRGF0YSBpcyBzdG9yZWQgaW4gYXV0aERhdGEgZmllbGRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoY2FzZUluc2Vuc2l0aXZlICYmIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKSkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9OnJhdyk6Ompzb25iIEA+ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kaW4pKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGxhdGVyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyA9ICQke2luZGV4ICsgMX06OnRleHRgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IGZpZWxkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgLy8gQ2FuJ3QgY2FzdCBib29sZWFuIHRvIGRvdWJsZSBwcmVjaXNpb25cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgIC8vIFNob3VsZCBhbHdheXMgcmV0dXJuIHplcm8gcmVzdWx0c1xuICAgICAgICBjb25zdCBNQVhfSU5UX1BMVVNfT05FID0gOTIyMzM3MjAzNjg1NDc3NTgwODtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBNQVhfSU5UX1BMVVNfT05FKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICB9XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoWyckb3InLCAnJG5vcicsICckYW5kJ10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgICAgY29uc3QgY2xhdXNlVmFsdWVzID0gW107XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goc3ViUXVlcnkgPT4ge1xuICAgICAgICBjb25zdCBjbGF1c2UgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgcXVlcnk6IHN1YlF1ZXJ5LFxuICAgICAgICAgIGluZGV4LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJHtjb25zdHJhaW50RmllbGROYW1lfSA8PiAkJHtpbmRleCArIDF9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kbmUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSA8PiAkJHtpbmRleCArIDF9IE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXEgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGVxLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXhpc3RzLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJGV4aXN0cykge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5KSB7XG4gICAgICBjb25zdCBhcnIgPSBmaWVsZFZhbHVlLiRjb250YWluZWRCeTtcbiAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIDxAICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGFycikpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kdGV4dCkge1xuICAgICAgY29uc3Qgc2VhcmNoID0gZmllbGRWYWx1ZS4kdGV4dC4kc2VhcmNoO1xuICAgICAgbGV0IGxhbmd1YWdlID0gJ2VuZ2xpc2gnO1xuICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgIH1cbiAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlIG5vdCBzdXBwb3J0ZWQsIHBsZWFzZSB1c2UgJHJlZ2V4IG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGxvd2VyIGNhc2UgY29sdW1uLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlIC0gZmFsc2Ugbm90IHN1cHBvcnRlZCwgaW5zdGFsbCBQb3N0Z3JlcyBVbmFjY2VudCBFeHRlbnNpb25gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgdG9fdHN2ZWN0b3IoJCR7aW5kZXh9LCAkJHtpbmRleCArIDF9Om5hbWUpIEBAIHRvX3RzcXVlcnkoJCR7aW5kZXggKyAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBsZXQgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuXG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBjb25zdCBjYXN0VHlwZSA9IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSA9PT0gJ29iamVjdCcgJiYgcG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICAgIHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUocGFyc2VyUmVzdWx0LnJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWV9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3BncDogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIF91dWlkOiBhbnk7XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuICBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb246IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHsgLi4uZGF0YWJhc2VPcHRpb25zIH07XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGVUdGwgPSBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGw7XG4gICAgdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gPSAhIWRhdGFiYXNlT3B0aW9ucy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb247XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWydlbmFibGVTY2hlbWFIb29rcycsICdzY2hlbWFDYWNoZVR0bCcsICdkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24nXSkge1xuICAgICAgZGVsZXRlIG9wdGlvbnNba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBvcHRpb25zKTtcbiAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSAoKSA9PiB7fTtcbiAgICB0aGlzLl9wZ3AgPSBwZ3A7XG4gICAgdGhpcy5fdXVpZCA9IHV1aWR2NCgpO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IGZhbHNlO1xuICB9XG5cbiAgd2F0Y2goY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLl9vbmNoYW5nZSA9IGNhbGxiYWNrO1xuICB9XG5cbiAgLy9Ob3RlIHRoYXQgYW5hbHl6ZT10cnVlIHdpbGwgcnVuIHRoZSBxdWVyeSwgZXhlY3V0aW5nIElOU0VSVFMsIERFTEVURVMsIGV0Yy5cbiAgY3JlYXRlRXhwbGFpbmFibGVRdWVyeShxdWVyeTogc3RyaW5nLCBhbmFseXplOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBpZiAoYW5hbHl6ZSkge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChBTkFMWVpFLCBGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKHRoaXMuX3N0cmVhbSkge1xuICAgICAgdGhpcy5fc3RyZWFtLmRvbmUoKTtcbiAgICAgIGRlbGV0ZSB0aGlzLl9zdHJlYW07XG4gICAgfVxuICAgIGlmICghdGhpcy5fY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2NsaWVudC4kcG9vbC5lbmQoKTtcbiAgfVxuXG4gIGFzeW5jIF9saXN0ZW5Ub1NjaGVtYSgpIHtcbiAgICBpZiAoIXRoaXMuX3N0cmVhbSAmJiB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICB0aGlzLl9zdHJlYW0gPSBhd2FpdCB0aGlzLl9jbGllbnQuY29ubmVjdCh7IGRpcmVjdDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuX3N0cmVhbS5jbGllbnQub24oJ25vdGlmaWNhdGlvbicsIGRhdGEgPT4ge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShkYXRhLnBheWxvYWQpO1xuICAgICAgICBpZiAocGF5bG9hZC5zZW5kZXJJZCAhPT0gdGhpcy5fdXVpZCkge1xuICAgICAgICAgIHRoaXMuX29uY2hhbmdlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5fc3RyZWFtLm5vbmUoJ0xJU1RFTiAkMX4nLCAnc2NoZW1hLmNoYW5nZScpO1xuICAgIH1cbiAgfVxuXG4gIF9ub3RpZnlTY2hlbWFDaGFuZ2UoKSB7XG4gICAgaWYgKHRoaXMuX3N0cmVhbSkge1xuICAgICAgdGhpcy5fc3RyZWFtXG4gICAgICAgIC5ub25lKCdOT1RJRlkgJDF+LCAkMicsIFsnc2NoZW1hLmNoYW5nZScsIHsgc2VuZGVySWQ6IHRoaXMuX3V1aWQgfV0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBOb3RpZnk6JywgZXJyb3IpOyAvLyB1bmxpa2VseSB0byBldmVyIGhhcHBlblxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyhjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgYXdhaXQgY29ublxuICAgICAgLm5vbmUoXG4gICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBcIl9TQ0hFTUFcIiAoIFwiY2xhc3NOYW1lXCIgdmFyQ2hhcigxMjApLCBcInNjaGVtYVwiIGpzb25iLCBcImlzUGFyc2VDbGFzc1wiIGJvb2wsIFBSSU1BUlkgS0VZIChcImNsYXNzTmFtZVwiKSApJ1xuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQub25lKFxuICAgICAgJ1NFTEVDVCBFWElTVFMgKFNFTEVDVCAxIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcyBXSEVSRSB0YWJsZV9uYW1lID0gJDEpJyxcbiAgICAgIFtuYW1lXSxcbiAgICAgIGEgPT4gYS5leGlzdHNcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2NsYXNzTGV2ZWxQZXJtaXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KENMUHMpXTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgYFVQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVkSW5kZXhlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgZGVsZXRlZEluZGV4ZXMucHVzaChuYW1lKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uICYmXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgYXdhaXQgc2VsZi5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzLCB0KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciA9IGUuZXJyb3JzPy5bMF0/LmNvZGUgPT09ICc0MjcwMyc7XG4gICAgICAgIGlmIChjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciAmJiAhdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24pIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcbiAgICBpZiAodGhpcy5fY2xpZW50Py4kcG9vbC5lbmRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGNvbnN0IGF1dGhEYXRhQWxyZWFkeUV4aXN0cyA9ICEhb2JqZWN0LmF1dGhEYXRhO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgICAgLy8gQXZvaWQgYWRkaW5nIGF1dGhEYXRhIG11bHRpcGxlIHRpbWVzIHRvIHRoZSBxdWVyeVxuICAgICAgICBpZiAoYXV0aERhdGFBbHJlYWR5RXhpc3RzKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KS5hbnkocXMsIHZhbHVlcyk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybUtleSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGtleSkuam9pbignLT4nKTtcbiAgICAgICAgICAvLyBVc2luZyAkaWR4IHBhdHRlcm4gZ2l2ZXM6ICBub24taW50ZWdlciBjb25zdGFudCBpbiBPUkRFUiBCWVxuICAgICAgICAgIGlmIChzb3J0Q29weVtrZXldID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBBU0NgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBERVNDYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5rZXlzKHNvcnQpLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGtleS5sZW5ndGggPiAwICYmXG4gICAgICAgICAgLy8gUmVtb3ZlIHNlbGVjdGVkIGZpZWxkIG5vdCByZWZlcmVuY2VkIGluIHRoZSBzY2hlbWFcbiAgICAgICAgICAvLyBSZWxhdGlvbiBpcyBub3QgYSBjb2x1bW4gaW4gcG9zdGdyZXNcbiAgICAgICAgICAvLyAkc2NvcmUgaXMgYSBQYXJzZSBzcGVjaWFsIGZpZWxkIGFuZCBpcyBhbHNvIG5vdCBhIGNvbHVtblxuICAgICAgICAgICgoc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlICE9PSAnUmVsYXRpb24nKSB8fCBrZXkgPT09ICckc2NvcmUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG5ldyBTdHJpbmcob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyaW5nKDIsIGNvb3Jkcy5sZW5ndGggLSAyKS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZWRDb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IHVwZGF0ZWRDb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBmaWVsZCBpbiBzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRtYXRjaFtmaWVsZF07XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJykge1xuICAgICAgICAgICAgZmllbGQgPSAnb2JqZWN0SWQnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKSB7XG4gIHJldHVybiByZW1haW5pbmdcbiAgICAuc3BsaXQoJycpXG4gICAgLm1hcChjID0+IHtcbiAgICAgIGNvbnN0IHJlZ2V4ID0gUmVnRXhwKCdbMC05IF18XFxcXHB7TH0nLCAndScpOyAvLyBTdXBwb3J0IGFsbCB1bmljb2RlIGxldHRlciBjaGFyc1xuICAgICAgaWYgKGMubWF0Y2gocmVnZXgpICE9PSBudWxsKSB7XG4gICAgICAgIC8vIGRvbid0IGVzY2FwZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyc1xuICAgICAgICByZXR1cm4gYztcbiAgICAgIH1cbiAgICAgIC8vIGVzY2FwZSBldmVyeXRoaW5nIGVsc2UgKHNpbmdsZSBxdW90ZXMgd2l0aCBzaW5nbGUgcXVvdGVzLCBldmVyeXRoaW5nIGVsc2Ugd2l0aCBhIGJhY2tzbGFzaClcbiAgICAgIHJldHVybiBjID09PSBgJ2AgPyBgJydgIDogYFxcXFwke2N9YDtcbiAgICB9KVxuICAgIC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzOiBzdHJpbmcpIHtcbiAgY29uc3QgbWF0Y2hlcjEgPSAvXFxcXFEoKD8hXFxcXEUpLiopXFxcXEUkLztcbiAgY29uc3QgcmVzdWx0MTogYW55ID0gcy5tYXRjaChtYXRjaGVyMSk7XG4gIGlmIChyZXN1bHQxICYmIHJlc3VsdDEubGVuZ3RoID4gMSAmJiByZXN1bHQxLmluZGV4ID4gLTEpIHtcbiAgICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIGFuZCBhbiBlbmQgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHJpbmcoMCwgcmVzdWx0MS5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MVsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gIGNvbnN0IG1hdGNoZXIyID0gL1xcXFxRKCg/IVxcXFxFKS4qKSQvO1xuICBjb25zdCByZXN1bHQyOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIyKTtcbiAgaWYgKHJlc3VsdDIgJiYgcmVzdWx0Mi5sZW5ndGggPiAxICYmIHJlc3VsdDIuaW5kZXggPiAtMSkge1xuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyaW5nKDAsIHJlc3VsdDIuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDJbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyByZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRSBmcm9tIHRoZSByZW1haW5pbmcgdGV4dCAmIGVzY2FwZSBzaW5nbGUgcXVvdGVzXG4gIHJldHVybiBzXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcRSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXFEpLywgJyQxJylcbiAgICAucmVwbGFjZSgvXlxcXFxFLywgJycpXG4gICAgLnJlcGxhY2UoL15cXFxcUS8sICcnKVxuICAgIC5yZXBsYWNlKC8oW14nXSknL2csIGAkMScnYClcbiAgICAucmVwbGFjZSgvXicoW14nXSkvLCBgJyckMWApO1xufVxuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCc7XG4gIH0sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuIl0sIm1h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