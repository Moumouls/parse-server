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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
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
const isArrayIndex = arrayIndex => Array.from(arrayIndex).every(c => c >= '0' && c <= '9');
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
    if (isArrayIndex(cmpt)) {
      return Number(cmpt);
    } else {
      return `'${cmpt}'`;
    }
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
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all Unicode letter chars
    if (c.match(regex) !== null) {
      // Don't escape alphanumeric characters
      return c;
    }
    // Escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // Process Regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Process Regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Remove problematic chars from remaining text
  return s
  // Remove all instances of \Q and \E
  .replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '')
  // Ensure even number of single quote sequences by adding an extra single quote if needed;
  // this ensures that every single quote is escaped
  .replace(/'+/g, match => {
    return match.length % 2 === 0 ? match : match + "'";
  });
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = exports.default = PostgresStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaXNBcnJheUluZGV4IiwiYXJyYXlJbmRleCIsIkFycmF5IiwiZnJvbSIsImV2ZXJ5IiwiYyIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0cmluZyIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwiJHJlbGF0aXZlVGltZSIsIklOVkFMSURfSlNPTiIsInBvaW50IiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkZXEiLCJpc0luT3JOaW4iLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwicHJvY2Vzc1JlZ2V4UGF0dGVybiIsIiRjb250YWluZWRCeSIsImFyciIsIiR0ZXh0Iiwic2VhcmNoIiwiJHNlYXJjaCIsImxhbmd1YWdlIiwiJHRlcm0iLCIkbGFuZ3VhZ2UiLCIkY2FzZVNlbnNpdGl2ZSIsIiRkaWFjcml0aWNTZW5zaXRpdmUiLCIkbmVhclNwaGVyZSIsImRpc3RhbmNlIiwiJG1heERpc3RhbmNlIiwiZGlzdGFuY2VJbktNIiwiJHdpdGhpbiIsIiRib3giLCJib3giLCJsZWZ0IiwiYm90dG9tIiwicmlnaHQiLCJ0b3AiLCIkZ2VvV2l0aGluIiwiJGNlbnRlclNwaGVyZSIsImNlbnRlclNwaGVyZSIsIkdlb1BvaW50IiwiR2VvUG9pbnRDb2RlciIsImlzVmFsaWRKU09OIiwiX3ZhbGlkYXRlIiwiaXNOYU4iLCIkcG9seWdvbiIsInBvbHlnb24iLCJwb2ludHMiLCJjb29yZGluYXRlcyIsIiRnZW9JbnRlcnNlY3RzIiwiJHBvaW50IiwicmVnZXgiLCJvcGVyYXRvciIsIm9wdHMiLCIkb3B0aW9ucyIsInJlbW92ZVdoaXRlU3BhY2UiLCJjb252ZXJ0UG9seWdvblRvU1FMIiwiY21wIiwicGdDb21wYXJhdG9yIiwicGFyc2VyUmVzdWx0IiwicmVsYXRpdmVUaW1lVG9EYXRlIiwic3RhdHVzIiwicmVzdWx0IiwiY29uc29sZSIsImVycm9yIiwiaW5mbyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJ1cmkiLCJjb2xsZWN0aW9uUHJlZml4IiwiZGF0YWJhc2VPcHRpb25zIiwib3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiZW5hYmxlU2NoZW1hSG9va3MiLCJzY2hlbWFDYWNoZVR0bCIsImRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiIsImNsaWVudCIsInBncCIsImNyZWF0ZUNsaWVudCIsIl9jbGllbnQiLCJfb25jaGFuZ2UiLCJfcGdwIiwidXVpZHY0IiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiX3N0cmVhbSIsImRvbmUiLCIkcG9vbCIsImVuZCIsIl9saXN0ZW5Ub1NjaGVtYSIsImNvbm5lY3QiLCJkaXJlY3QiLCJvbiIsImRhdGEiLCJwYXlsb2FkIiwicGFyc2UiLCJzZW5kZXJJZCIsIm5vbmUiLCJfbm90aWZ5U2NoZW1hQ2hhbmdlIiwiY2F0Y2giLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwidGFzayIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsInNlbGYiLCJQcm9taXNlIiwicmVzb2x2ZSIsIl9pZF8iLCJfaWQiLCJkZWxldGVkSW5kZXhlcyIsImluc2VydGVkSW5kZXhlcyIsIklOVkFMSURfUVVFUlkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInR4IiwiY3JlYXRlSW5kZXhlcyIsIl9lJGVycm9ycyIsImNvbHVtbkRvZXNOb3RFeGlzdEVycm9yIiwiZXJyb3JzIiwiY29kZSIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwiX3RoaXMkX2NsaWVudCIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZW5kZWQiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsImF1dGhEYXRhQWxyZWFkeUV4aXN0cyIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJwb3AiLCJpbml0aWFsVmFsdWVzIiwidmFsIiwidGVybWluYXRpb24iLCJnZW9Qb2ludHNJbmplY3RzIiwibCIsImNvbHVtbnNQYXR0ZXJuIiwiY29sIiwidmFsdWVzUGF0dGVybiIsInByb21pc2UiLCJvcHMiLCJ1bmRlcmx5aW5nRXJyb3IiLCJjb25zdHJhaW50IiwibWF0Y2hlcyIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5Iiwid2hlcmUiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZmluZE9uZUFuZFVwZGF0ZSIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlUGF0dGVybnMiLCJvcmlnaW5hbFVwZGF0ZSIsImRvdE5vdGF0aW9uT3B0aW9ucyIsImdlbmVyYXRlIiwianNvbmIiLCJsYXN0S2V5IiwiZmllbGROYW1lSW5kZXgiLCJzdHIiLCJhbW91bnQiLCJvYmplY3RzIiwia2V5c1RvSW5jcmVtZW50IiwiayIsImluY3JlbWVudFBhdHRlcm5zIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsInVwZGF0ZWRDb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImhpbnQiLCJjb3VudEZpZWxkIiwiZ3JvdXBWYWx1ZXMiLCJncm91cFBhdHRlcm4iLCJzdGFnZSIsIiRncm91cCIsImdyb3VwQnlGaWVsZHMiLCJhbGlhcyIsInNvdXJjZSIsIm9wZXJhdGlvbiIsIiRzdW0iLCIkbWF4IiwiJG1pbiIsIiRhdmciLCIkcHJvamVjdCIsIiRtYXRjaCIsIiRvciIsImNvbGxhcHNlIiwiZWxlbWVudCIsIm1hdGNoUGF0dGVybnMiLCIkbGltaXQiLCIkc2tpcCIsIiRzb3J0Iiwib3JkZXIiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwiZXhwb3J0cyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGlzQXJyYXlJbmRleCA9IChhcnJheUluZGV4KSA9PiBBcnJheS5mcm9tKGFycmF5SW5kZXgpLmV2ZXJ5KGMgPT4gYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuXG5jb25zdCBoYW5kbGVEb3RGaWVsZHMgPSBvYmplY3QgPT4ge1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgIG9iamVjdFtmaXJzdF0gPSBvYmplY3RbZmlyc3RdIHx8IHt9O1xuICAgICAgbGV0IGN1cnJlbnRPYmogPSBvYmplY3RbZmlyc3RdO1xuICAgICAgbGV0IG5leHQ7XG4gICAgICBsZXQgdmFsdWUgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICB3aGlsZSAoKG5leHQgPSBjb21wb25lbnRzLnNoaWZ0KCkpKSB7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IGN1cnJlbnRPYmpbbmV4dF0gfHwge307XG4gICAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50T2JqID0gY3VycmVudE9ialtuZXh0XTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMgPSBmaWVsZE5hbWUgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJykubWFwKChjbXB0LCBpbmRleCkgPT4ge1xuICAgIGlmIChpbmRleCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGBcIiR7Y21wdH1cImA7XG4gICAgfVxuICAgIGlmIChpc0FycmF5SW5kZXgoY21wdCkpIHtcbiAgICAgIHJldHVybiBOdW1iZXIoY21wdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBgJyR7Y21wdH0nYDtcbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICByZXR1cm4gZmllbGROYW1lLnN1YnN0cmluZygxKTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoeyBzY2hlbWEsIHF1ZXJ5LCBpbmRleCwgY2FzZUluc2Vuc2l0aXZlIH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgIC8vIFRPRE86IEhhbmRsZSBxdWVyeWluZyBieSBfYXV0aF9kYXRhX3Byb3ZpZGVyLCBhdXRoRGF0YSBpcyBzdG9yZWQgaW4gYXV0aERhdGEgZmllbGRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoY2FzZUluc2Vuc2l0aXZlICYmIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKSkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9OnJhdyk6Ompzb25iIEA+ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kaW4pKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGxhdGVyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyA9ICQke2luZGV4ICsgMX06OnRleHRgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IGZpZWxkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgLy8gQ2FuJ3QgY2FzdCBib29sZWFuIHRvIGRvdWJsZSBwcmVjaXNpb25cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgIC8vIFNob3VsZCBhbHdheXMgcmV0dXJuIHplcm8gcmVzdWx0c1xuICAgICAgICBjb25zdCBNQVhfSU5UX1BMVVNfT05FID0gOTIyMzM3MjAzNjg1NDc3NTgwODtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBNQVhfSU5UX1BMVVNfT05FKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICB9XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoWyckb3InLCAnJG5vcicsICckYW5kJ10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgICAgY29uc3QgY2xhdXNlVmFsdWVzID0gW107XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goc3ViUXVlcnkgPT4ge1xuICAgICAgICBjb25zdCBjbGF1c2UgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgcXVlcnk6IHN1YlF1ZXJ5LFxuICAgICAgICAgIGluZGV4LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJHtjb25zdHJhaW50RmllbGROYW1lfSA8PiAkJHtpbmRleCArIDF9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kbmUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSA8PiAkJHtpbmRleCArIDF9IE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXEgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGVxLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXhpc3RzLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJGV4aXN0cykge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5KSB7XG4gICAgICBjb25zdCBhcnIgPSBmaWVsZFZhbHVlLiRjb250YWluZWRCeTtcbiAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIDxAICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGFycikpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kdGV4dCkge1xuICAgICAgY29uc3Qgc2VhcmNoID0gZmllbGRWYWx1ZS4kdGV4dC4kc2VhcmNoO1xuICAgICAgbGV0IGxhbmd1YWdlID0gJ2VuZ2xpc2gnO1xuICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgIH1cbiAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlIG5vdCBzdXBwb3J0ZWQsIHBsZWFzZSB1c2UgJHJlZ2V4IG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGxvd2VyIGNhc2UgY29sdW1uLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlIC0gZmFsc2Ugbm90IHN1cHBvcnRlZCwgaW5zdGFsbCBQb3N0Z3JlcyBVbmFjY2VudCBFeHRlbnNpb25gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgdG9fdHN2ZWN0b3IoJCR7aW5kZXh9LCAkJHtpbmRleCArIDF9Om5hbWUpIEBAIHRvX3RzcXVlcnkoJCR7aW5kZXggKyAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBsZXQgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuXG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBjb25zdCBjYXN0VHlwZSA9IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSA9PT0gJ29iamVjdCcgJiYgcG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICAgIHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUocGFyc2VyUmVzdWx0LnJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWV9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3BncDogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIF91dWlkOiBhbnk7XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuICBkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb246IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHsgLi4uZGF0YWJhc2VPcHRpb25zIH07XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGVUdGwgPSBkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGw7XG4gICAgdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gPSAhIWRhdGFiYXNlT3B0aW9ucy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb247XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWydlbmFibGVTY2hlbWFIb29rcycsICdzY2hlbWFDYWNoZVR0bCcsICdkaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24nXSkge1xuICAgICAgZGVsZXRlIG9wdGlvbnNba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBvcHRpb25zKTtcbiAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSAoKSA9PiB7fTtcbiAgICB0aGlzLl9wZ3AgPSBwZ3A7XG4gICAgdGhpcy5fdXVpZCA9IHV1aWR2NCgpO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IGZhbHNlO1xuICB9XG5cbiAgd2F0Y2goY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLl9vbmNoYW5nZSA9IGNhbGxiYWNrO1xuICB9XG5cbiAgLy9Ob3RlIHRoYXQgYW5hbHl6ZT10cnVlIHdpbGwgcnVuIHRoZSBxdWVyeSwgZXhlY3V0aW5nIElOU0VSVFMsIERFTEVURVMsIGV0Yy5cbiAgY3JlYXRlRXhwbGFpbmFibGVRdWVyeShxdWVyeTogc3RyaW5nLCBhbmFseXplOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBpZiAoYW5hbHl6ZSkge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChBTkFMWVpFLCBGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKHRoaXMuX3N0cmVhbSkge1xuICAgICAgdGhpcy5fc3RyZWFtLmRvbmUoKTtcbiAgICAgIGRlbGV0ZSB0aGlzLl9zdHJlYW07XG4gICAgfVxuICAgIGlmICghdGhpcy5fY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2NsaWVudC4kcG9vbC5lbmQoKTtcbiAgfVxuXG4gIGFzeW5jIF9saXN0ZW5Ub1NjaGVtYSgpIHtcbiAgICBpZiAoIXRoaXMuX3N0cmVhbSAmJiB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICB0aGlzLl9zdHJlYW0gPSBhd2FpdCB0aGlzLl9jbGllbnQuY29ubmVjdCh7IGRpcmVjdDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuX3N0cmVhbS5jbGllbnQub24oJ25vdGlmaWNhdGlvbicsIGRhdGEgPT4ge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShkYXRhLnBheWxvYWQpO1xuICAgICAgICBpZiAocGF5bG9hZC5zZW5kZXJJZCAhPT0gdGhpcy5fdXVpZCkge1xuICAgICAgICAgIHRoaXMuX29uY2hhbmdlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5fc3RyZWFtLm5vbmUoJ0xJU1RFTiAkMX4nLCAnc2NoZW1hLmNoYW5nZScpO1xuICAgIH1cbiAgfVxuXG4gIF9ub3RpZnlTY2hlbWFDaGFuZ2UoKSB7XG4gICAgaWYgKHRoaXMuX3N0cmVhbSkge1xuICAgICAgdGhpcy5fc3RyZWFtXG4gICAgICAgIC5ub25lKCdOT1RJRlkgJDF+LCAkMicsIFsnc2NoZW1hLmNoYW5nZScsIHsgc2VuZGVySWQ6IHRoaXMuX3V1aWQgfV0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBOb3RpZnk6JywgZXJyb3IpOyAvLyB1bmxpa2VseSB0byBldmVyIGhhcHBlblxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyhjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgYXdhaXQgY29ublxuICAgICAgLm5vbmUoXG4gICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBcIl9TQ0hFTUFcIiAoIFwiY2xhc3NOYW1lXCIgdmFyQ2hhcigxMjApLCBcInNjaGVtYVwiIGpzb25iLCBcImlzUGFyc2VDbGFzc1wiIGJvb2wsIFBSSU1BUlkgS0VZIChcImNsYXNzTmFtZVwiKSApJ1xuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQub25lKFxuICAgICAgJ1NFTEVDVCBFWElTVFMgKFNFTEVDVCAxIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcyBXSEVSRSB0YWJsZV9uYW1lID0gJDEpJyxcbiAgICAgIFtuYW1lXSxcbiAgICAgIGEgPT4gYS5leGlzdHNcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgYXN5bmMgdCA9PiB7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2NsYXNzTGV2ZWxQZXJtaXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KENMUHMpXTtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgYFVQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzXG4gICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVkSW5kZXhlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgZGVsZXRlZEluZGV4ZXMucHVzaChuYW1lKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uICYmXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgYXdhaXQgc2VsZi5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzLCB0KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zdCBjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciA9IGUuZXJyb3JzPy5bMF0/LmNvZGUgPT09ICc0MjcwMyc7XG4gICAgICAgIGlmIChjb2x1bW5Eb2VzTm90RXhpc3RFcnJvciAmJiAhdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24pIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcbiAgICBpZiAodGhpcy5fY2xpZW50Py4kcG9vbC5lbmRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGNvbnN0IGF1dGhEYXRhQWxyZWFkeUV4aXN0cyA9ICEhb2JqZWN0LmF1dGhEYXRhO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgICAgLy8gQXZvaWQgYWRkaW5nIGF1dGhEYXRhIG11bHRpcGxlIHRpbWVzIHRvIHRoZSBxdWVyeVxuICAgICAgICBpZiAoYXV0aERhdGFBbHJlYWR5RXhpc3RzKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KS5hbnkocXMsIHZhbHVlcyk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybUtleSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGtleSkuam9pbignLT4nKTtcbiAgICAgICAgICAvLyBVc2luZyAkaWR4IHBhdHRlcm4gZ2l2ZXM6ICBub24taW50ZWdlciBjb25zdGFudCBpbiBPUkRFUiBCWVxuICAgICAgICAgIGlmIChzb3J0Q29weVtrZXldID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBBU0NgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBERVNDYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5rZXlzKHNvcnQpLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGtleS5sZW5ndGggPiAwICYmXG4gICAgICAgICAgLy8gUmVtb3ZlIHNlbGVjdGVkIGZpZWxkIG5vdCByZWZlcmVuY2VkIGluIHRoZSBzY2hlbWFcbiAgICAgICAgICAvLyBSZWxhdGlvbiBpcyBub3QgYSBjb2x1bW4gaW4gcG9zdGdyZXNcbiAgICAgICAgICAvLyAkc2NvcmUgaXMgYSBQYXJzZSBzcGVjaWFsIGZpZWxkIGFuZCBpcyBhbHNvIG5vdCBhIGNvbHVtblxuICAgICAgICAgICgoc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlICE9PSAnUmVsYXRpb24nKSB8fCBrZXkgPT09ICckc2NvcmUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG5ldyBTdHJpbmcob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyaW5nKDIsIGNvb3Jkcy5sZW5ndGggLSAyKS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZWRDb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IHVwZGF0ZWRDb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBmaWVsZCBpbiBzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRtYXRjaFtmaWVsZF07XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJykge1xuICAgICAgICAgICAgZmllbGQgPSAnb2JqZWN0SWQnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIFVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gRG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gRXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIFByb2Nlc3MgUmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gUHJvY2VzcyBSZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHJpbmcoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBwcm9ibGVtYXRpYyBjaGFycyBmcm9tIHJlbWFpbmluZyB0ZXh0XG4gIHJldHVybiBzXG4gICAgLy8gUmVtb3ZlIGFsbCBpbnN0YW5jZXMgb2YgXFxRIGFuZCBcXEVcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLy8gRW5zdXJlIGV2ZW4gbnVtYmVyIG9mIHNpbmdsZSBxdW90ZSBzZXF1ZW5jZXMgYnkgYWRkaW5nIGFuIGV4dHJhIHNpbmdsZSBxdW90ZSBpZiBuZWVkZWQ7XG4gICAgLy8gdGhpcyBlbnN1cmVzIHRoYXQgZXZlcnkgc2luZ2xlIHF1b3RlIGlzIGVzY2FwZWRcbiAgICAucmVwbGFjZSgvJysvZywgbWF0Y2ggPT4ge1xuICAgICAgcmV0dXJuIG1hdGNoLmxlbmd0aCAlIDIgPT09IDAgPyBtYXRjaCA6IG1hdGNoICsgXCInXCI7XG4gICAgfSk7XG59XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50JztcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLElBQUFBLGVBQUEsR0FBQUMsT0FBQTtBQUVBLElBQUFDLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFHLE9BQUEsR0FBQUQsc0JBQUEsQ0FBQUYsT0FBQTtBQUVBLElBQUFJLEtBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLElBQUEsR0FBQUgsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFNLGVBQUEsR0FBQU4sT0FBQTtBQUFtRCxTQUFBRSx1QkFBQUssQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUFBLFNBQUFHLFFBQUFILENBQUEsRUFBQUksQ0FBQSxRQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsSUFBQSxDQUFBUCxDQUFBLE9BQUFNLE1BQUEsQ0FBQUUscUJBQUEsUUFBQUMsQ0FBQSxHQUFBSCxNQUFBLENBQUFFLHFCQUFBLENBQUFSLENBQUEsR0FBQUksQ0FBQSxLQUFBSyxDQUFBLEdBQUFBLENBQUEsQ0FB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