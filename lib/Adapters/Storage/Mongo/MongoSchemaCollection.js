"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));

var _node = _interopRequireDefault(require("parse/node"));

var _lodash = _interopRequireDefault(require("lodash"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function mongoFieldToParseSchemaField(type) {
  if (type[0] === '*') {
    return {
      type: 'Pointer',
      targetClass: type.slice(1)
    };
  }

  if (type.startsWith('relation<')) {
    return {
      type: 'Relation',
      targetClass: type.slice('relation<'.length, type.length - 1)
    };
  }

  switch (type) {
    case 'number':
      return {
        type: 'Number'
      };

    case 'string':
      return {
        type: 'String'
      };

    case 'boolean':
      return {
        type: 'Boolean'
      };

    case 'date':
      return {
        type: 'Date'
      };

    case 'map':
    case 'object':
      return {
        type: 'Object'
      };

    case 'array':
      return {
        type: 'Array'
      };

    case 'geopoint':
      return {
        type: 'GeoPoint'
      };

    case 'file':
      return {
        type: 'File'
      };

    case 'bytes':
      return {
        type: 'Bytes'
      };

    case 'polygon':
      return {
        type: 'Polygon'
      };
  }
}

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];

function mongoSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName]);

    if (schema._metadata && schema._metadata.fields_options && schema._metadata.fields_options[fieldName]) {
      obj[fieldName] = Object.assign({}, obj[fieldName], schema._metadata.fields_options[fieldName]);
    }

    return obj;
  }, {});
  response.ACL = {
    type: 'ACL'
  };
  response.createdAt = {
    type: 'Date'
  };
  response.updatedAt = {
    type: 'Date'
  };
  response.objectId = {
    type: 'String'
  };
  return response;
}

const emptyCLPS = Object.freeze({
  find: {},
  count: {},
  get: {},
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
  count: {
    '*': true
  },
  get: {
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

function mongoSchemaToParseSchema(mongoSchema) {
  let clps = defaultCLPS;
  let indexes = {};

  if (mongoSchema._metadata) {
    if (mongoSchema._metadata.class_permissions) {
      clps = _objectSpread(_objectSpread({}, emptyCLPS), mongoSchema._metadata.class_permissions);
    }

    if (mongoSchema._metadata.indexes) {
      indexes = _objectSpread({}, mongoSchema._metadata.indexes);
    }
  }

  return {
    className: mongoSchema._id,
    fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
    classLevelPermissions: clps,
    indexes: indexes
  };
}

function _mongoSchemaQueryFromNameQuery(name, query) {
  const object = {
    _id: name
  };

  if (query) {
    Object.keys(query).forEach(key => {
      object[key] = query[key];
    });
  }

  return object;
} // Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.


function parseFieldTypeToMongoFieldType({
  type,
  targetClass
}) {
  switch (type) {
    case 'Pointer':
      return `*${targetClass}`;

    case 'Relation':
      return `relation<${targetClass}>`;

    case 'Number':
      return 'number';

    case 'String':
      return 'string';

    case 'Boolean':
      return 'boolean';

    case 'Date':
      return 'date';

    case 'Object':
      return 'object';

    case 'Array':
      return 'array';

    case 'GeoPoint':
      return 'geopoint';

    case 'File':
      return 'file';

    case 'Bytes':
      return 'bytes';

    case 'Polygon':
      return 'polygon';
  }
}

class MongoSchemaCollection {
  constructor(collection) {
    this._collection = collection;
  }

  _fetchAllSchemasFrom_SCHEMA() {
    return this._collection._rawFind({}).then(schemas => schemas.map(mongoSchemaToParseSchema));
  }

  _fetchOneSchemaFrom_SCHEMA(name) {
    return this._collection._rawFind(_mongoSchemaQueryFromNameQuery(name), {
      limit: 1
    }).then(results => {
      if (results.length === 1) {
        return mongoSchemaToParseSchema(results[0]);
      } else {
        throw undefined;
      }
    });
  } // Atomically find and delete an object based on query.


  findAndDeleteSchema(name) {
    return this._collection._mongoCollection.findOneAndDelete(_mongoSchemaQueryFromNameQuery(name));
  }

  insertSchema(schema) {
    return this._collection.insertOne(schema).then(result => mongoSchemaToParseSchema(result.ops[0])).catch(error => {
      if (error.code === 11000) {
        //Mongo's duplicate key error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Class already exists.');
      } else {
        throw error;
      }
    });
  }

  updateSchema(name, update) {
    return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
  }

  upsertSchema(name, query, update) {
    return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
  } // Add a field to the schema. If database does not support the field
  // type (e.g. mongo doesn't support more than one GeoPoint in a class) reject with an "Incorrect Type"
  // Parse error with a desciptive message. If the field already exists, this function must
  // not modify the schema, and must reject with DUPLICATE_VALUE error.
  // If this is called for a class that doesn't exist, this function must create that class.
  // TODO: throw an error if an unsupported field type is passed. Deciding whether a type is supported
  // should be the job of the adapter. Some adapters may not support GeoPoint at all. Others may
  // Support additional types that Mongo doesn't, like Money, or something.
  // TODO: don't spend an extra query on finding the schema if the type we are trying to add isn't a GeoPoint.


  addFieldIfNotExists(className, fieldName, fieldType) {
    return this._fetchOneSchemaFrom_SCHEMA(className).then(schema => {
      // If a field with this name already exists, it will be handled elsewhere.
      if (schema.fields[fieldName] !== undefined) {
        return;
      } // The schema exists. Check for existing GeoPoints.


      if (fieldType.type === 'GeoPoint') {
        // Make sure there are not other geopoint fields
        if (Object.keys(schema.fields).some(existingField => schema.fields[existingField].type === 'GeoPoint')) {
          throw new _node.default.Error(_node.default.Error.INCORRECT_TYPE, 'MongoDB only supports one GeoPoint field in a class.');
        }
      }

      return;
    }, error => {
      // If error is undefined, the schema doesn't exist, and we can create the schema with the field.
      // If some other error, reject with it.
      if (error === undefined) {
        return;
      }

      throw error;
    }).then(() => {
      const {
        type,
        targetClass
      } = fieldType,
            fieldOptions = _objectWithoutProperties(fieldType, ["type", "targetClass"]); // We use $exists and $set to avoid overwriting the field type if it
      // already exists. (it could have added inbetween the last query and the update)


      if (fieldOptions && Object.keys(fieldOptions).length > 0) {
        return this.upsertSchema(className, {
          [fieldName]: {
            $exists: false
          }
        }, {
          $set: {
            [fieldName]: parseFieldTypeToMongoFieldType({
              type,
              targetClass
            }),
            [`_metadata.fields_options.${fieldName}`]: fieldOptions
          }
        });
      } else {
        return this.upsertSchema(className, {
          [fieldName]: {
            $exists: false
          }
        }, {
          $set: {
            [fieldName]: parseFieldTypeToMongoFieldType({
              type,
              targetClass
            })
          }
        });
      }
    });
  }

  async updateFieldOptions(className, fieldName, fieldType) {
    // eslint-disable-next-line no-unused-vars
    const {
      type,
      targetClass
    } = fieldType,
          fieldOptions = _objectWithoutProperties(fieldType, ["type", "targetClass"]);

    await this.upsertSchema(className, {
      [fieldName]: {
        $exists: true
      }
    }, {
      $set: {
        [`_metadata.fields_options.${fieldName}`]: fieldOptions
      }
    });
  }

} // Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.


MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;
var _default = MongoSchemaCollection;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZE9uZUFuZERlbGV0ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsInJlc3VsdCIsIm9wcyIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLFNBQVNBLDRCQUFULENBQXNDQyxJQUF0QyxFQUE0QztBQUMxQyxNQUFJQSxJQUFJLENBQUMsQ0FBRCxDQUFKLEtBQVksR0FBaEIsRUFBcUI7QUFDbkIsV0FBTztBQUNMQSxNQUFBQSxJQUFJLEVBQUUsU0FERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLENBQVg7QUFGUixLQUFQO0FBSUQ7O0FBQ0QsTUFBSUYsSUFBSSxDQUFDRyxVQUFMLENBQWdCLFdBQWhCLENBQUosRUFBa0M7QUFDaEMsV0FBTztBQUNMSCxNQUFBQSxJQUFJLEVBQUUsVUFERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLFlBQVlFLE1BQXZCLEVBQStCSixJQUFJLENBQUNJLE1BQUwsR0FBYyxDQUE3QztBQUZSLEtBQVA7QUFJRDs7QUFDRCxVQUFRSixJQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU87QUFBRUEsUUFBQUEsSUFBSSxFQUFFO0FBQVIsT0FBUDs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPO0FBQUVBLFFBQUFBLElBQUksRUFBRTtBQUFSLE9BQVA7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQOztBQUNGLFNBQUssS0FBTDtBQUNBLFNBQUssUUFBTDtBQUNFLGFBQU87QUFBRUEsUUFBQUEsSUFBSSxFQUFFO0FBQVIsT0FBUDs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPO0FBQUVBLFFBQUFBLElBQUksRUFBRTtBQUFSLE9BQVA7O0FBQ0YsU0FBSyxVQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQOztBQUNGLFNBQUssTUFBTDtBQUNFLGFBQU87QUFBRUEsUUFBQUEsSUFBSSxFQUFFO0FBQVIsT0FBUDs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPO0FBQUVBLFFBQUFBLElBQUksRUFBRTtBQUFSLE9BQVA7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQO0FBckJKO0FBdUJEOztBQUVELE1BQU1LLGtCQUFrQixHQUFHLENBQUMsS0FBRCxFQUFRLFdBQVIsRUFBcUIscUJBQXJCLENBQTNCOztBQUNBLFNBQVNDLG9DQUFULENBQThDQyxNQUE5QyxFQUFzRDtBQUNwRCxNQUFJQyxVQUFVLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZSCxNQUFaLEVBQW9CSSxNQUFwQixDQUEyQkMsR0FBRyxJQUFJUCxrQkFBa0IsQ0FBQ1EsT0FBbkIsQ0FBMkJELEdBQTNCLE1BQW9DLENBQUMsQ0FBdkUsQ0FBakI7QUFDQSxNQUFJRSxRQUFRLEdBQUdOLFVBQVUsQ0FBQ08sTUFBWCxDQUFrQixDQUFDQyxHQUFELEVBQU1DLFNBQU4sS0FBb0I7QUFDbkRELElBQUFBLEdBQUcsQ0FBQ0MsU0FBRCxDQUFILEdBQWlCbEIsNEJBQTRCLENBQUNRLE1BQU0sQ0FBQ1UsU0FBRCxDQUFQLENBQTdDOztBQUNBLFFBQ0VWLE1BQU0sQ0FBQ1csU0FBUCxJQUNBWCxNQUFNLENBQUNXLFNBQVAsQ0FBaUJDLGNBRGpCLElBRUFaLE1BQU0sQ0FBQ1csU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NGLFNBQWhDLENBSEYsRUFJRTtBQUNBRCxNQUFBQSxHQUFHLENBQUNDLFNBQUQsQ0FBSCxHQUFpQlIsTUFBTSxDQUFDVyxNQUFQLENBQ2YsRUFEZSxFQUVmSixHQUFHLENBQUNDLFNBQUQsQ0FGWSxFQUdmVixNQUFNLENBQUNXLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDRixTQUFoQyxDQUhlLENBQWpCO0FBS0Q7O0FBQ0QsV0FBT0QsR0FBUDtBQUNELEdBZGMsRUFjWixFQWRZLENBQWY7QUFlQUYsRUFBQUEsUUFBUSxDQUFDTyxHQUFULEdBQWU7QUFBRXJCLElBQUFBLElBQUksRUFBRTtBQUFSLEdBQWY7QUFDQWMsRUFBQUEsUUFBUSxDQUFDUSxTQUFULEdBQXFCO0FBQUV0QixJQUFBQSxJQUFJLEVBQUU7QUFBUixHQUFyQjtBQUNBYyxFQUFBQSxRQUFRLENBQUNTLFNBQVQsR0FBcUI7QUFBRXZCLElBQUFBLElBQUksRUFBRTtBQUFSLEdBQXJCO0FBQ0FjLEVBQUFBLFFBQVEsQ0FBQ1UsUUFBVCxHQUFvQjtBQUFFeEIsSUFBQUEsSUFBSSxFQUFFO0FBQVIsR0FBcEI7QUFDQSxTQUFPYyxRQUFQO0FBQ0Q7O0FBRUQsTUFBTVcsU0FBUyxHQUFHaEIsTUFBTSxDQUFDaUIsTUFBUCxDQUFjO0FBQzlCQyxFQUFBQSxJQUFJLEVBQUUsRUFEd0I7QUFFOUJDLEVBQUFBLEtBQUssRUFBRSxFQUZ1QjtBQUc5QkMsRUFBQUEsR0FBRyxFQUFFLEVBSHlCO0FBSTlCQyxFQUFBQSxNQUFNLEVBQUUsRUFKc0I7QUFLOUJDLEVBQUFBLE1BQU0sRUFBRSxFQUxzQjtBQU05QkMsRUFBQUEsTUFBTSxFQUFFLEVBTnNCO0FBTzlCQyxFQUFBQSxRQUFRLEVBQUUsRUFQb0I7QUFROUJDLEVBQUFBLGVBQWUsRUFBRTtBQVJhLENBQWQsQ0FBbEI7QUFXQSxNQUFNQyxXQUFXLEdBQUcxQixNQUFNLENBQUNpQixNQUFQLENBQWM7QUFDaENDLEVBQUFBLElBQUksRUFBRTtBQUFFLFNBQUs7QUFBUCxHQUQwQjtBQUVoQ0MsRUFBQUEsS0FBSyxFQUFFO0FBQUUsU0FBSztBQUFQLEdBRnlCO0FBR2hDQyxFQUFBQSxHQUFHLEVBQUU7QUFBRSxTQUFLO0FBQVAsR0FIMkI7QUFJaENDLEVBQUFBLE1BQU0sRUFBRTtBQUFFLFNBQUs7QUFBUCxHQUp3QjtBQUtoQ0MsRUFBQUEsTUFBTSxFQUFFO0FBQUUsU0FBSztBQUFQLEdBTHdCO0FBTWhDQyxFQUFBQSxNQUFNLEVBQUU7QUFBRSxTQUFLO0FBQVAsR0FOd0I7QUFPaENDLEVBQUFBLFFBQVEsRUFBRTtBQUFFLFNBQUs7QUFBUCxHQVBzQjtBQVFoQ0MsRUFBQUEsZUFBZSxFQUFFO0FBQUUsU0FBSztBQUFQO0FBUmUsQ0FBZCxDQUFwQjs7QUFXQSxTQUFTRSx3QkFBVCxDQUFrQ0MsV0FBbEMsRUFBK0M7QUFDN0MsTUFBSUMsSUFBSSxHQUFHSCxXQUFYO0FBQ0EsTUFBSUksT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsTUFBSUYsV0FBVyxDQUFDbkIsU0FBaEIsRUFBMkI7QUFDekIsUUFBSW1CLFdBQVcsQ0FBQ25CLFNBQVosQ0FBc0JzQixpQkFBMUIsRUFBNkM7QUFDM0NGLE1BQUFBLElBQUksbUNBQVFiLFNBQVIsR0FBc0JZLFdBQVcsQ0FBQ25CLFNBQVosQ0FBc0JzQixpQkFBNUMsQ0FBSjtBQUNEOztBQUNELFFBQUlILFdBQVcsQ0FBQ25CLFNBQVosQ0FBc0JxQixPQUExQixFQUFtQztBQUNqQ0EsTUFBQUEsT0FBTyxxQkFBUUYsV0FBVyxDQUFDbkIsU0FBWixDQUFzQnFCLE9BQTlCLENBQVA7QUFDRDtBQUNGOztBQUNELFNBQU87QUFDTEUsSUFBQUEsU0FBUyxFQUFFSixXQUFXLENBQUNLLEdBRGxCO0FBRUxDLElBQUFBLE1BQU0sRUFBRXJDLG9DQUFvQyxDQUFDK0IsV0FBRCxDQUZ2QztBQUdMTyxJQUFBQSxxQkFBcUIsRUFBRU4sSUFIbEI7QUFJTEMsSUFBQUEsT0FBTyxFQUFFQTtBQUpKLEdBQVA7QUFNRDs7QUFFRCxTQUFTTSw4QkFBVCxDQUF3Q0MsSUFBeEMsRUFBc0RDLEtBQXRELEVBQTZEO0FBQzNELFFBQU1DLE1BQU0sR0FBRztBQUFFTixJQUFBQSxHQUFHLEVBQUVJO0FBQVAsR0FBZjs7QUFDQSxNQUFJQyxLQUFKLEVBQVc7QUFDVHRDLElBQUFBLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZcUMsS0FBWixFQUFtQkUsT0FBbkIsQ0FBMkJyQyxHQUFHLElBQUk7QUFDaENvQyxNQUFBQSxNQUFNLENBQUNwQyxHQUFELENBQU4sR0FBY21DLEtBQUssQ0FBQ25DLEdBQUQsQ0FBbkI7QUFDRCxLQUZEO0FBR0Q7O0FBQ0QsU0FBT29DLE1BQVA7QUFDRCxDLENBRUQ7QUFDQTs7O0FBQ0EsU0FBU0UsOEJBQVQsQ0FBd0M7QUFBRWxELEVBQUFBLElBQUY7QUFBUUMsRUFBQUE7QUFBUixDQUF4QyxFQUErRDtBQUM3RCxVQUFRRCxJQUFSO0FBQ0UsU0FBSyxTQUFMO0FBQ0UsYUFBUSxJQUFHQyxXQUFZLEVBQXZCOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQVEsWUFBV0EsV0FBWSxHQUEvQjs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPLFFBQVA7O0FBQ0YsU0FBSyxRQUFMO0FBQ0UsYUFBTyxRQUFQOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU8sU0FBUDs7QUFDRixTQUFLLE1BQUw7QUFDRSxhQUFPLE1BQVA7O0FBQ0YsU0FBSyxRQUFMO0FBQ0UsYUFBTyxRQUFQOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU8sT0FBUDs7QUFDRixTQUFLLFVBQUw7QUFDRSxhQUFPLFVBQVA7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBTyxNQUFQOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU8sT0FBUDs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPLFNBQVA7QUF4Qko7QUEwQkQ7O0FBRUQsTUFBTWtELHFCQUFOLENBQTRCO0FBRzFCQyxFQUFBQSxXQUFXLENBQUNDLFVBQUQsRUFBOEI7QUFDdkMsU0FBS0MsV0FBTCxHQUFtQkQsVUFBbkI7QUFDRDs7QUFFREUsRUFBQUEsMkJBQTJCLEdBQUc7QUFDNUIsV0FBTyxLQUFLRCxXQUFMLENBQWlCRSxRQUFqQixDQUEwQixFQUExQixFQUE4QkMsSUFBOUIsQ0FBbUNDLE9BQU8sSUFBSUEsT0FBTyxDQUFDQyxHQUFSLENBQVl2Qix3QkFBWixDQUE5QyxDQUFQO0FBQ0Q7O0FBRUR3QixFQUFBQSwwQkFBMEIsQ0FBQ2QsSUFBRCxFQUFlO0FBQ3ZDLFdBQU8sS0FBS1EsV0FBTCxDQUNKRSxRQURJLENBQ0tYLDhCQUE4QixDQUFDQyxJQUFELENBRG5DLEVBQzJDO0FBQUVlLE1BQUFBLEtBQUssRUFBRTtBQUFULEtBRDNDLEVBRUpKLElBRkksQ0FFQ0ssT0FBTyxJQUFJO0FBQ2YsVUFBSUEsT0FBTyxDQUFDMUQsTUFBUixLQUFtQixDQUF2QixFQUEwQjtBQUN4QixlQUFPZ0Msd0JBQXdCLENBQUMwQixPQUFPLENBQUMsQ0FBRCxDQUFSLENBQS9CO0FBQ0QsT0FGRCxNQUVPO0FBQ0wsY0FBTUMsU0FBTjtBQUNEO0FBQ0YsS0FSSSxDQUFQO0FBU0QsR0FyQnlCLENBdUIxQjs7O0FBQ0FDLEVBQUFBLG1CQUFtQixDQUFDbEIsSUFBRCxFQUFlO0FBQ2hDLFdBQU8sS0FBS1EsV0FBTCxDQUFpQlcsZ0JBQWpCLENBQWtDQyxnQkFBbEMsQ0FBbURyQiw4QkFBOEIsQ0FBQ0MsSUFBRCxDQUFqRixDQUFQO0FBQ0Q7O0FBRURxQixFQUFBQSxZQUFZLENBQUM1RCxNQUFELEVBQWM7QUFDeEIsV0FBTyxLQUFLK0MsV0FBTCxDQUNKYyxTQURJLENBQ003RCxNQUROLEVBRUprRCxJQUZJLENBRUNZLE1BQU0sSUFBSWpDLHdCQUF3QixDQUFDaUMsTUFBTSxDQUFDQyxHQUFQLENBQVcsQ0FBWCxDQUFELENBRm5DLEVBR0pDLEtBSEksQ0FHRUMsS0FBSyxJQUFJO0FBQ2QsVUFBSUEsS0FBSyxDQUFDQyxJQUFOLEtBQWUsS0FBbkIsRUFBMEI7QUFDeEI7QUFDQSxjQUFNLElBQUlDLGNBQU1DLEtBQVYsQ0FBZ0JELGNBQU1DLEtBQU4sQ0FBWUMsZUFBNUIsRUFBNkMsdUJBQTdDLENBQU47QUFDRCxPQUhELE1BR087QUFDTCxjQUFNSixLQUFOO0FBQ0Q7QUFDRixLQVZJLENBQVA7QUFXRDs7QUFFREssRUFBQUEsWUFBWSxDQUFDL0IsSUFBRCxFQUFlZixNQUFmLEVBQXVCO0FBQ2pDLFdBQU8sS0FBS3VCLFdBQUwsQ0FBaUJ3QixTQUFqQixDQUEyQmpDLDhCQUE4QixDQUFDQyxJQUFELENBQXpELEVBQWlFZixNQUFqRSxDQUFQO0FBQ0Q7O0FBRURnRCxFQUFBQSxZQUFZLENBQUNqQyxJQUFELEVBQWVDLEtBQWYsRUFBOEJoQixNQUE5QixFQUFzQztBQUNoRCxXQUFPLEtBQUt1QixXQUFMLENBQWlCMEIsU0FBakIsQ0FBMkJuQyw4QkFBOEIsQ0FBQ0MsSUFBRCxFQUFPQyxLQUFQLENBQXpELEVBQXdFaEIsTUFBeEUsQ0FBUDtBQUNELEdBaER5QixDQWtEMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBOzs7QUFDQWtELEVBQUFBLG1CQUFtQixDQUFDeEMsU0FBRCxFQUFvQnhCLFNBQXBCLEVBQXVDaUUsU0FBdkMsRUFBMEQ7QUFDM0UsV0FBTyxLQUFLdEIsMEJBQUwsQ0FBZ0NuQixTQUFoQyxFQUNKZ0IsSUFESSxDQUVIbEQsTUFBTSxJQUFJO0FBQ1I7QUFDQSxVQUFJQSxNQUFNLENBQUNvQyxNQUFQLENBQWMxQixTQUFkLE1BQTZCOEMsU0FBakMsRUFBNEM7QUFDMUM7QUFDRCxPQUpPLENBS1I7OztBQUNBLFVBQUltQixTQUFTLENBQUNsRixJQUFWLEtBQW1CLFVBQXZCLEVBQW1DO0FBQ2pDO0FBQ0EsWUFDRVMsTUFBTSxDQUFDQyxJQUFQLENBQVlILE1BQU0sQ0FBQ29DLE1BQW5CLEVBQTJCd0MsSUFBM0IsQ0FDRUMsYUFBYSxJQUFJN0UsTUFBTSxDQUFDb0MsTUFBUCxDQUFjeUMsYUFBZCxFQUE2QnBGLElBQTdCLEtBQXNDLFVBRHpELENBREYsRUFJRTtBQUNBLGdCQUFNLElBQUkwRSxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWVUsY0FEUixFQUVKLHNEQUZJLENBQU47QUFJRDtBQUNGOztBQUNEO0FBQ0QsS0F0QkUsRUF1QkhiLEtBQUssSUFBSTtBQUNQO0FBQ0E7QUFDQSxVQUFJQSxLQUFLLEtBQUtULFNBQWQsRUFBeUI7QUFDdkI7QUFDRDs7QUFDRCxZQUFNUyxLQUFOO0FBQ0QsS0E5QkUsRUFnQ0pmLElBaENJLENBZ0NDLE1BQU07QUFDVixZQUFNO0FBQUV6RCxRQUFBQSxJQUFGO0FBQVFDLFFBQUFBO0FBQVIsVUFBeUNpRixTQUEvQztBQUFBLFlBQThCSSxZQUE5Qiw0QkFBK0NKLFNBQS9DLDJCQURVLENBRVY7QUFDQTs7O0FBQ0EsVUFBSUksWUFBWSxJQUFJN0UsTUFBTSxDQUFDQyxJQUFQLENBQVk0RSxZQUFaLEVBQTBCbEYsTUFBMUIsR0FBbUMsQ0FBdkQsRUFBMEQ7QUFDeEQsZUFBTyxLQUFLMkUsWUFBTCxDQUNMdEMsU0FESyxFQUVMO0FBQUUsV0FBQ3hCLFNBQUQsR0FBYTtBQUFFc0UsWUFBQUEsT0FBTyxFQUFFO0FBQVg7QUFBZixTQUZLLEVBR0w7QUFDRUMsVUFBQUEsSUFBSSxFQUFFO0FBQ0osYUFBQ3ZFLFNBQUQsR0FBYWlDLDhCQUE4QixDQUFDO0FBQzFDbEQsY0FBQUEsSUFEMEM7QUFFMUNDLGNBQUFBO0FBRjBDLGFBQUQsQ0FEdkM7QUFLSixhQUFFLDRCQUEyQmdCLFNBQVUsRUFBdkMsR0FBMkNxRTtBQUx2QztBQURSLFNBSEssQ0FBUDtBQWFELE9BZEQsTUFjTztBQUNMLGVBQU8sS0FBS1AsWUFBTCxDQUNMdEMsU0FESyxFQUVMO0FBQUUsV0FBQ3hCLFNBQUQsR0FBYTtBQUFFc0UsWUFBQUEsT0FBTyxFQUFFO0FBQVg7QUFBZixTQUZLLEVBR0w7QUFDRUMsVUFBQUEsSUFBSSxFQUFFO0FBQ0osYUFBQ3ZFLFNBQUQsR0FBYWlDLDhCQUE4QixDQUFDO0FBQzFDbEQsY0FBQUEsSUFEMEM7QUFFMUNDLGNBQUFBO0FBRjBDLGFBQUQ7QUFEdkM7QUFEUixTQUhLLENBQVA7QUFZRDtBQUNGLEtBaEVJLENBQVA7QUFpRUQ7O0FBRXVCLFFBQWxCd0Ysa0JBQWtCLENBQUNoRCxTQUFELEVBQW9CeEIsU0FBcEIsRUFBdUNpRSxTQUF2QyxFQUF1RDtBQUM3RTtBQUNBLFVBQU07QUFBRWxGLE1BQUFBLElBQUY7QUFBUUMsTUFBQUE7QUFBUixRQUF5Q2lGLFNBQS9DO0FBQUEsVUFBOEJJLFlBQTlCLDRCQUErQ0osU0FBL0M7O0FBQ0EsVUFBTSxLQUFLSCxZQUFMLENBQ0p0QyxTQURJLEVBRUo7QUFBRSxPQUFDeEIsU0FBRCxHQUFhO0FBQUVzRSxRQUFBQSxPQUFPLEVBQUU7QUFBWDtBQUFmLEtBRkksRUFHSjtBQUNFQyxNQUFBQSxJQUFJLEVBQUU7QUFDSixTQUFFLDRCQUEyQnZFLFNBQVUsRUFBdkMsR0FBMkNxRTtBQUR2QztBQURSLEtBSEksQ0FBTjtBQVNEOztBQTdJeUIsQyxDQWdKNUI7QUFDQTs7O0FBQ0FuQyxxQkFBcUIsQ0FBQ3VDLDZCQUF0QixHQUFzRHRELHdCQUF0RDtBQUNBZSxxQkFBcUIsQ0FBQ0QsOEJBQXRCLEdBQXVEQSw4QkFBdkQ7ZUFFZUMscUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5cbmZ1bmN0aW9uIG1vbmdvRmllbGRUb1BhcnNlU2NoZW1hRmllbGQodHlwZSkge1xuICBpZiAodHlwZVswXSA9PT0gJyonKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgIHRhcmdldENsYXNzOiB0eXBlLnNsaWNlKDEpLFxuICAgIH07XG4gIH1cbiAgaWYgKHR5cGUuc3RhcnRzV2l0aCgncmVsYXRpb248JykpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgIHRhcmdldENsYXNzOiB0eXBlLnNsaWNlKCdyZWxhdGlvbjwnLmxlbmd0aCwgdHlwZS5sZW5ndGggLSAxKSxcbiAgICB9O1xuICB9XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0Jvb2xlYW4nIH07XG4gICAgY2FzZSAnZGF0ZSc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnRGF0ZScgfTtcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnT2JqZWN0JyB9O1xuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdBcnJheScgfTtcbiAgICBjYXNlICdnZW9wb2ludCc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnR2VvUG9pbnQnIH07XG4gICAgY2FzZSAnZmlsZSc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnRmlsZScgfTtcbiAgICBjYXNlICdieXRlcyc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQnl0ZXMnIH07XG4gICAgY2FzZSAncG9seWdvbic6XG4gICAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicgfTtcbiAgfVxufVxuXG5jb25zdCBub25GaWVsZFNjaGVtYUtleXMgPSBbJ19pZCcsICdfbWV0YWRhdGEnLCAnX2NsaWVudF9wZXJtaXNzaW9ucyddO1xuZnVuY3Rpb24gbW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzKHNjaGVtYSkge1xuICB2YXIgZmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYSkuZmlsdGVyKGtleSA9PiBub25GaWVsZFNjaGVtYUtleXMuaW5kZXhPZihrZXkpID09PSAtMSk7XG4gIHZhciByZXNwb25zZSA9IGZpZWxkTmFtZXMucmVkdWNlKChvYmosIGZpZWxkTmFtZSkgPT4ge1xuICAgIG9ialtmaWVsZE5hbWVdID0gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZChzY2hlbWFbZmllbGROYW1lXSk7XG4gICAgaWYgKFxuICAgICAgc2NoZW1hLl9tZXRhZGF0YSAmJlxuICAgICAgc2NoZW1hLl9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyAmJlxuICAgICAgc2NoZW1hLl9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBvYmpbZmllbGROYW1lXSA9IE9iamVjdC5hc3NpZ24oXG4gICAgICAgIHt9LFxuICAgICAgICBvYmpbZmllbGROYW1lXSxcbiAgICAgICAgc2NoZW1hLl9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9LCB7fSk7XG4gIHJlc3BvbnNlLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcbiAgcmVzcG9uc2UuY3JlYXRlZEF0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgcmVzcG9uc2UudXBkYXRlZEF0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgcmVzcG9uc2Uub2JqZWN0SWQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIHJldHVybiByZXNwb25zZTtcbn1cblxuY29uc3QgZW1wdHlDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHt9LFxuICBjb3VudDoge30sXG4gIGdldDoge30sXG4gIGNyZWF0ZToge30sXG4gIHVwZGF0ZToge30sXG4gIGRlbGV0ZToge30sXG4gIGFkZEZpZWxkOiB7fSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7fSxcbn0pO1xuXG5jb25zdCBkZWZhdWx0Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjcmVhdGU6IHsgJyonOiB0cnVlIH0sXG4gIHVwZGF0ZTogeyAnKic6IHRydWUgfSxcbiAgZGVsZXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBhZGRGaWVsZDogeyAnKic6IHRydWUgfSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7ICcqJzogW10gfSxcbn0pO1xuXG5mdW5jdGlvbiBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEobW9uZ29TY2hlbWEpIHtcbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKG1vbmdvU2NoZW1hLl9tZXRhZGF0YSkge1xuICAgIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMpIHtcbiAgICAgIGNscHMgPSB7IC4uLmVtcHR5Q0xQUywgLi4ubW9uZ29TY2hlbWEuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zIH07XG4gICAgfVxuICAgIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEuaW5kZXhlcykge1xuICAgICAgaW5kZXhlcyA9IHsgLi4ubW9uZ29TY2hlbWEuX21ldGFkYXRhLmluZGV4ZXMgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBjbGFzc05hbWU6IG1vbmdvU2NoZW1hLl9pZCxcbiAgICBmaWVsZHM6IG1vbmdvU2NoZW1hRmllbGRzVG9QYXJzZVNjaGVtYUZpZWxkcyhtb25nb1NjaGVtYSksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXM6IGluZGV4ZXMsXG4gIH07XG59XG5cbmZ1bmN0aW9uIF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lOiBzdHJpbmcsIHF1ZXJ5KSB7XG4gIGNvbnN0IG9iamVjdCA9IHsgX2lkOiBuYW1lIH07XG4gIGlmIChxdWVyeSkge1xuICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBvYmplY3Rba2V5XSA9IHF1ZXJ5W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxuLy8gUmV0dXJucyBhIHR5cGUgc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIG1vbmdvIF9TQ0hFTUEgY29sbGVjdGlvbi5cbi8vIERvZXMgbm8gdmFsaWRhdGlvbi4gVGhhdCBpcyBleHBlY3RlZCB0byBiZSBkb25lIGluIFBhcnNlIFNlcnZlci5cbmZ1bmN0aW9uIHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7IHR5cGUsIHRhcmdldENsYXNzIH0pIHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICByZXR1cm4gYCoke3RhcmdldENsYXNzfWA7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgcmV0dXJuIGByZWxhdGlvbjwke3RhcmdldENsYXNzfT5gO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ251bWJlcic7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiAnc3RyaW5nJztcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiAnYm9vbGVhbic7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gJ2RhdGUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ29iamVjdCc7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdnZW9wb2ludCc7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ2ZpbGUnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnYnl0ZXMnO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgfVxufVxuXG5jbGFzcyBNb25nb1NjaGVtYUNvbGxlY3Rpb24ge1xuICBfY29sbGVjdGlvbjogTW9uZ29Db2xsZWN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKGNvbGxlY3Rpb246IE1vbmdvQ29sbGVjdGlvbikge1xuICAgIHRoaXMuX2NvbGxlY3Rpb24gPSBjb2xsZWN0aW9uO1xuICB9XG5cbiAgX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKCkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLl9yYXdGaW5kKHt9KS50aGVuKHNjaGVtYXMgPT4gc2NoZW1hcy5tYXAobW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKSk7XG4gIH1cblxuICBfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvblxuICAgICAgLl9yYXdGaW5kKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSwgeyBsaW1pdDogMSB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgIHJldHVybiBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEocmVzdWx0c1swXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEF0b21pY2FsbHkgZmluZCBhbmQgZGVsZXRlIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgZmluZEFuZERlbGV0ZVNjaGVtYShuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmZpbmRPbmVBbmREZWxldGUoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpKTtcbiAgfVxuXG4gIGluc2VydFNjaGVtYShzY2hlbWE6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuaW5zZXJ0T25lKHNjaGVtYSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEocmVzdWx0Lm9wc1swXSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvL01vbmdvJ3MgZHVwbGljYXRlIGtleSBlcnJvclxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsICdDbGFzcyBhbHJlYWR5IGV4aXN0cy4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWEobmFtZTogc3RyaW5nLCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cGRhdGVPbmUoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpLCB1cGRhdGUpO1xuICB9XG5cbiAgdXBzZXJ0U2NoZW1hKG5hbWU6IHN0cmluZywgcXVlcnk6IHN0cmluZywgdXBkYXRlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24udXBzZXJ0T25lKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lLCBxdWVyeSksIHVwZGF0ZSk7XG4gIH1cblxuICAvLyBBZGQgYSBmaWVsZCB0byB0aGUgc2NoZW1hLiBJZiBkYXRhYmFzZSBkb2VzIG5vdCBzdXBwb3J0IHRoZSBmaWVsZFxuICAvLyB0eXBlIChlLmcuIG1vbmdvIGRvZXNuJ3Qgc3VwcG9ydCBtb3JlIHRoYW4gb25lIEdlb1BvaW50IGluIGEgY2xhc3MpIHJlamVjdCB3aXRoIGFuIFwiSW5jb3JyZWN0IFR5cGVcIlxuICAvLyBQYXJzZSBlcnJvciB3aXRoIGEgZGVzY2lwdGl2ZSBtZXNzYWdlLiBJZiB0aGUgZmllbGQgYWxyZWFkeSBleGlzdHMsIHRoaXMgZnVuY3Rpb24gbXVzdFxuICAvLyBub3QgbW9kaWZ5IHRoZSBzY2hlbWEsIGFuZCBtdXN0IHJlamVjdCB3aXRoIERVUExJQ0FURV9WQUxVRSBlcnJvci5cbiAgLy8gSWYgdGhpcyBpcyBjYWxsZWQgZm9yIGEgY2xhc3MgdGhhdCBkb2Vzbid0IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIG11c3QgY3JlYXRlIHRoYXQgY2xhc3MuXG5cbiAgLy8gVE9ETzogdGhyb3cgYW4gZXJyb3IgaWYgYW4gdW5zdXBwb3J0ZWQgZmllbGQgdHlwZSBpcyBwYXNzZWQuIERlY2lkaW5nIHdoZXRoZXIgYSB0eXBlIGlzIHN1cHBvcnRlZFxuICAvLyBzaG91bGQgYmUgdGhlIGpvYiBvZiB0aGUgYWRhcHRlci4gU29tZSBhZGFwdGVycyBtYXkgbm90IHN1cHBvcnQgR2VvUG9pbnQgYXQgYWxsLiBPdGhlcnMgbWF5XG4gIC8vIFN1cHBvcnQgYWRkaXRpb25hbCB0eXBlcyB0aGF0IE1vbmdvIGRvZXNuJ3QsIGxpa2UgTW9uZXksIG9yIHNvbWV0aGluZy5cblxuICAvLyBUT0RPOiBkb24ndCBzcGVuZCBhbiBleHRyYSBxdWVyeSBvbiBmaW5kaW5nIHRoZSBzY2hlbWEgaWYgdGhlIHR5cGUgd2UgYXJlIHRyeWluZyB0byBhZGQgaXNuJ3QgYSBHZW9Qb2ludC5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkVHlwZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oXG4gICAgICAgIHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gSWYgYSBmaWVsZCB3aXRoIHRoaXMgbmFtZSBhbHJlYWR5IGV4aXN0cywgaXQgd2lsbCBiZSBoYW5kbGVkIGVsc2V3aGVyZS5cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBleGlzdHMuIENoZWNrIGZvciBleGlzdGluZyBHZW9Qb2ludHMuXG4gICAgICAgICAgaWYgKGZpZWxkVHlwZS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhlcmUgYXJlIG5vdCBvdGhlciBnZW9wb2ludCBmaWVsZHNcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuc29tZShcbiAgICAgICAgICAgICAgICBleGlzdGluZ0ZpZWxkID0+IHNjaGVtYS5maWVsZHNbZXhpc3RpbmdGaWVsZF0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICAgICdNb25nb0RCIG9ubHkgc3VwcG9ydHMgb25lIEdlb1BvaW50IGZpZWxkIGluIGEgY2xhc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAvLyBJZiBlcnJvciBpcyB1bmRlZmluZWQsIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgYW5kIHdlIGNhbiBjcmVhdGUgdGhlIHNjaGVtYSB3aXRoIHRoZSBmaWVsZC5cbiAgICAgICAgICAvLyBJZiBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBpdC5cbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkVHlwZTtcbiAgICAgICAgLy8gV2UgdXNlICRleGlzdHMgYW5kICRzZXQgdG8gYXZvaWQgb3ZlcndyaXRpbmcgdGhlIGZpZWxkIHR5cGUgaWYgaXRcbiAgICAgICAgLy8gYWxyZWFkeSBleGlzdHMuIChpdCBjb3VsZCBoYXZlIGFkZGVkIGluYmV0d2VlbiB0aGUgbGFzdCBxdWVyeSBhbmQgdGhlIHVwZGF0ZSlcbiAgICAgICAgaWYgKGZpZWxkT3B0aW9ucyAmJiBPYmplY3Qua2V5cyhmaWVsZE9wdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IGZhbHNlIH0gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgICAgIFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIFtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7ZmllbGROYW1lfWBdOiBmaWVsZE9wdGlvbnMsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IGZhbHNlIH0gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgICAgIFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGRUeXBlOiBhbnkpIHtcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW51c2VkLXZhcnNcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkVHlwZTtcbiAgICBhd2FpdCB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICB7XG4gICAgICAgICRzZXQ6IHtcbiAgICAgICAgICBbYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke2ZpZWxkTmFtZX1gXTogZmllbGRPcHRpb25zLFxuICAgICAgICB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuLy8gRXhwb3J0ZWQgZm9yIHRlc3RpbmcgcmVhc29ucyBhbmQgYmVjYXVzZSB3ZSBoYXZlbid0IG1vdmVkIGFsbCBtb25nbyBzY2hlbWEgZm9ybWF0XG4vLyByZWxhdGVkIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXIgeWV0LlxuTW9uZ29TY2hlbWFDb2xsZWN0aW9uLl9URVNUbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hID0gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hO1xuTW9uZ29TY2hlbWFDb2xsZWN0aW9uLnBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSA9IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZTtcblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TY2hlbWFDb2xsZWN0aW9uO1xuIl19