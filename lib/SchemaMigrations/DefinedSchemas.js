"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefinedSchemas = void 0;

var _logger = require("../logger");

var _Config = _interopRequireDefault(require("../Config"));

var _SchemasRouter = require("../Routers/SchemasRouter");

var _SchemaController = require("../Controllers/SchemaController");

var _Options = require("../Options");

var Migrations = _interopRequireWildcard(require("./Migrations"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Parse = require('parse/node');

class DefinedSchemas {
  constructor(schemaOptions, config) {
    this.localSchemas = [];
    this.config = _Config.default.get(config.appId);
    this.schemaOptions = schemaOptions;

    if (schemaOptions && schemaOptions.definitions) {
      if (!Array.isArray(schemaOptions.definitions)) {
        throw `"schema.definitions" must be an array of schemas`;
      }

      this.localSchemas = schemaOptions.definitions;
    }

    this.retries = 0;
    this.maxRetries = 3;
  } // Simulate save like the SDK
  // We cannot use SDK since routes are disabled


  async saveSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp
    };
    await (0, _SchemasRouter.internalCreateSchema)(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }

  resetSchemaOps(schema) {
    // Reset ops like SDK
    schema._fields = {};
    schema._indexes = {};
  } // Simulate update like the SDK
  // We cannot use SDK since routes are disabled


  async updateSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp
    };
    await (0, _SchemasRouter.internalUpdateSchema)(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }

  async execute() {
    try {
      var _this$schemaOptions, _this$schemaOptions2;

      _logger.logger.info('Running Migrations');

      if ((_this$schemaOptions = this.schemaOptions) !== null && _this$schemaOptions !== void 0 && _this$schemaOptions.beforeMigration) {
        await Promise.resolve(this.schemaOptions.beforeMigration());
      }

      await this.executeMigrations();

      if ((_this$schemaOptions2 = this.schemaOptions) !== null && _this$schemaOptions2 !== void 0 && _this$schemaOptions2.afterMigration) {
        await Promise.resolve(this.schemaOptions.afterMigration());
      }

      _logger.logger.info('Running Migrations Completed');
    } catch (e) {
      _logger.logger.error(`Failed to run migrations: ${e}`);

      if (process.env.NODE_ENV === 'production') process.exit(1);
    }
  }

  async executeMigrations() {
    let timeout = null;

    try {
      // Set up a time out in production
      // if we fail to get schema
      // pm2 or K8s and many other process managers will try to restart the process
      // after the exit
      if (process.env.NODE_ENV === 'production') {
        timeout = setTimeout(() => {
          _logger.logger.error('Timeout occurred during execution of migrations. Exiting...');

          process.exit(1);
        }, 20000);
      } // Hack to force session schema to be created


      await this.createDeleteSession();
      this.allCloudSchemas = await Parse.Schema.all();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);

      if (this.retries < this.maxRetries) {
        this.retries++; // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time. Modern systems like k8 avoid this by doing rolling updates

        await this.wait(1000 * this.retries);
        await this.executeMigrations();
      } else {
        _logger.logger.error(`Failed to run migrations: ${e}`);

        if (process.env.NODE_ENV === 'production') process.exit(1);
      }
    }
  }

  checkForMissingSchemas() {
    if (this.schemaOptions.strict !== true) {
      return;
    }

    const cloudSchemas = this.allCloudSchemas.map(s => s.className);
    const localSchemas = this.localSchemas.map(s => s.className);
    const missingSchemas = cloudSchemas.filter(c => !localSchemas.includes(c) && !_SchemaController.systemClasses.includes(c));

    if (new Set(localSchemas).size !== localSchemas.length) {
      _logger.logger.error(`The list of schemas provided contains duplicated "className"  "${localSchemas.join('","')}"`);

      process.exit(1);
    }

    if (this.schemaOptions.strict && missingSchemas.length) {
      _logger.logger.warn(`The following schemas are currently present in the database, but not explicitly defined in a schema: "${missingSchemas.join('", "')}"`);
    }
  } // Required for testing purpose


  wait(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  async enforceCLPForNonProvidedClass() {
    const nonProvidedClasses = this.allCloudSchemas.filter(cloudSchema => !this.localSchemas.some(localSchema => localSchema.className === cloudSchema.className));
    await Promise.all(nonProvidedClasses.map(async schema => {
      const parseSchema = new Parse.Schema(schema.className);
      this.handleCLP(schema, parseSchema);
      await this.updateSchemaToDB(parseSchema);
    }));
  } // Create a fake session since Parse do not create the _Session until
  // a session is created


  async createDeleteSession() {
    const session = new Parse.Session();
    await session.save(null, {
      useMasterKey: true
    });
    await session.destroy({
      useMasterKey: true
    });
  }

  async saveOrUpdate(localSchema) {
    const cloudSchema = this.allCloudSchemas.find(sc => sc.className === localSchema.className);

    if (cloudSchema) {
      try {
        await this.updateSchema(localSchema, cloudSchema);
      } catch (e) {
        throw `Error during update of schema for type ${cloudSchema.className}: ${e}`;
      }
    } else {
      try {
        await this.saveSchema(localSchema);
      } catch (e) {
        throw `Error while saving Schema for type ${localSchema.className}: ${e}`;
      }
    }
  }

  async saveSchema(localSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);

    if (localSchema.fields) {
      // Handle fields
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        const field = localSchema.fields[fieldName];
        this.handleFields(newLocalSchema, fieldName, field);
      });
    } // Handle indexes


    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
        }
      });
    }

    this.handleCLP(localSchema, newLocalSchema);
    return await this.saveSchemaToDB(newLocalSchema);
  }

  async updateSchema(localSchema, cloudSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className); // Handle fields
    // Check addition

    if (localSchema.fields) {
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        const field = localSchema.fields[fieldName];
        if (!cloudSchema.fields[fieldName]) this.handleFields(newLocalSchema, fieldName, field);
      });
    }

    const fieldsToDelete = [];
    const fieldsToRecreate = [];
    const fieldsWithChangedParams = []; // Check deletion

    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
      const field = cloudSchema.fields[fieldName];

      if (!localSchema.fields || !localSchema.fields[fieldName]) {
        fieldsToDelete.push(fieldName);
        return;
      }

      const localField = localSchema.fields[fieldName]; // Check if field has a changed type

      if (!this.paramsAreEquals({
        type: field.type,
        targetClass: field.targetClass
      }, {
        type: localField.type,
        targetClass: localField.targetClass
      })) {
        fieldsToRecreate.push({
          fieldName,
          from: {
            type: field.type,
            targetClass: field.targetClass
          },
          to: {
            type: localField.type,
            targetClass: localField.targetClass
          }
        });
        return;
      } // Check if something changed other than the type (like required, defaultValue)


      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });

    if (this.schemaOptions.deleteExtraFields === true) {
      fieldsToDelete.forEach(fieldName => {
        newLocalSchema.deleteField(fieldName);
      }); // Delete fields from the schema then apply changes

      await this.updateSchemaToDB(newLocalSchema);
    } else if (this.schemaOptions.strict === true && fieldsToDelete.length) {
      _logger.logger.warn(`The following fields exist in the database for "${localSchema.className}", but are missing in the schema : "${fieldsToDelete.join('" ,"')}"`);
    }

    if (this.schemaOptions.recreateModifiedFields === true) {
      fieldsToRecreate.forEach(field => {
        newLocalSchema.deleteField(field.fieldName);
      }); // Delete fields from the schema then apply changes

      await this.updateSchemaToDB(newLocalSchema);
      fieldsToRecreate.forEach(fieldInfo => {
        const field = localSchema.fields[fieldInfo.fieldName];
        this.handleFields(newLocalSchema, fieldInfo.fieldName, field);
      });
    } else if (this.schemaOptions.strict === true && fieldsToRecreate.length) {
      fieldsToRecreate.forEach(field => {
        const from = field.from.type + (field.from.targetClass ? ` (${field.from.targetClass})` : '');
        const to = field.to.type + (field.to.targetClass ? ` (${field.to.targetClass})` : '');

        _logger.logger.warn(`The field "${field.fieldName}" type differ between the schema and the database for "${localSchema.className}"; Schema is defined as "${to}" and current database type is "${from}"`);
      });
    }

    fieldsWithChangedParams.forEach(fieldName => {
      const field = localSchema.fields[fieldName];
      this.handleFields(newLocalSchema, fieldName, field);
    }); // Handle Indexes
    // Check addition

    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if ((!cloudSchema.indexes || !cloudSchema.indexes[indexName]) && !this.isProtectedIndex(localSchema.className, indexName)) newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
      });
    }

    const indexesToAdd = []; // Check deletion

    if (cloudSchema.indexes) {
      Object.keys(cloudSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          if (!localSchema.indexes || !localSchema.indexes[indexName]) {
            newLocalSchema.deleteIndex(indexName);
          } else if (!this.paramsAreEquals(localSchema.indexes[indexName], cloudSchema.indexes[indexName])) {
            newLocalSchema.deleteIndex(indexName);
            indexesToAdd.push({
              indexName,
              index: localSchema.indexes[indexName]
            });
          }
        }
      });
    }

    this.handleCLP(localSchema, newLocalSchema, cloudSchema); // Apply changes

    await this.updateSchemaToDB(newLocalSchema); // Apply new/changed indexes

    if (indexesToAdd.length) {
      _logger.logger.debug(`Updating indexes for "${newLocalSchema.className}" :  ${indexesToAdd.join(' ,')}`);

      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }

  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    } // Use spread to avoid read only issue (encountered by Moumouls using directAccess)


    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {}; // To avoid inconsistency we need to remove all rights on addField

    clp.addField = {};
    newLocalSchema.setCLP(clp);
  }

  isProtectedFields(className, fieldName) {
    return !!_SchemaController.defaultColumns._Default[fieldName] || !!(_SchemaController.defaultColumns[className] && _SchemaController.defaultColumns[className][fieldName]);
  }

  isProtectedIndex(className, indexName) {
    let indexes = ['_id_'];

    if (className === '_User') {
      indexes = [...indexes, 'case_insensitive_username', 'case_insensitive_email', 'username_1', 'email_1'];
    }

    return indexes.indexOf(indexName) !== -1;
  }

  paramsAreEquals(objA, objB) {
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB); // Check key name

    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => objA[k] === objB[k]);
  }

  handleFields(newLocalSchema, fieldName, field) {
    if (field.type === 'Relation') {
      newLocalSchema.addRelation(fieldName, field.targetClass);
    } else if (field.type === 'Pointer') {
      newLocalSchema.addPointer(fieldName, field.targetClass, field);
    } else {
      newLocalSchema.addField(fieldName, field.type, field);
    }
  }

}

exports.DefinedSchemas = DefinedSchemas;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsIkRlZmluZWRTY2hlbWFzIiwiY29uc3RydWN0b3IiLCJzY2hlbWFPcHRpb25zIiwiY29uZmlnIiwibG9jYWxTY2hlbWFzIiwiQ29uZmlnIiwiZ2V0IiwiYXBwSWQiLCJkZWZpbml0aW9ucyIsIkFycmF5IiwiaXNBcnJheSIsInJldHJpZXMiLCJtYXhSZXRyaWVzIiwic2F2ZVNjaGVtYVRvREIiLCJzY2hlbWEiLCJwYXlsb2FkIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2ZpZWxkcyIsImluZGV4ZXMiLCJfaW5kZXhlcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9jbHAiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJleGVjdXRlIiwibG9nZ2VyIiwiaW5mbyIsImJlZm9yZU1pZ3JhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhlY3V0ZU1pZ3JhdGlvbnMiLCJhZnRlck1pZ3JhdGlvbiIsImUiLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJhbGxDbG91ZFNjaGVtYXMiLCJTY2hlbWEiLCJhbGwiLCJjbGVhclRpbWVvdXQiLCJtYXAiLCJsb2NhbFNjaGVtYSIsInNhdmVPclVwZGF0ZSIsImNoZWNrRm9yTWlzc2luZ1NjaGVtYXMiLCJlbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcyIsIndhaXQiLCJzdHJpY3QiLCJjbG91ZFNjaGVtYXMiLCJzIiwibWlzc2luZ1NjaGVtYXMiLCJmaWx0ZXIiLCJjIiwiaW5jbHVkZXMiLCJzeXN0ZW1DbGFzc2VzIiwiU2V0Iiwic2l6ZSIsImxlbmd0aCIsImpvaW4iLCJ3YXJuIiwidGltZSIsIm5vblByb3ZpZGVkQ2xhc3NlcyIsImNsb3VkU2NoZW1hIiwic29tZSIsInBhcnNlU2NoZW1hIiwiaGFuZGxlQ0xQIiwic2Vzc2lvbiIsIlNlc3Npb24iLCJzYXZlIiwidXNlTWFzdGVyS2V5IiwiZGVzdHJveSIsImZpbmQiLCJzYyIsInVwZGF0ZVNjaGVtYSIsInNhdmVTY2hlbWEiLCJuZXdMb2NhbFNjaGVtYSIsIk9iamVjdCIsImtleXMiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmcm9tIiwidG8iLCJkZWxldGVFeHRyYUZpZWxkcyIsImRlbGV0ZUZpZWxkIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImZpZWxkSW5mbyIsImluZGV4ZXNUb0FkZCIsImRlbGV0ZUluZGV4IiwiaW5kZXgiLCJkZWJ1ZyIsIm8iLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBTkEsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsWUFBRCxDQUFyQjs7QUFRTyxNQUFNQyxjQUFOLENBQXFCO0FBTzFCQyxFQUFBQSxXQUFXLENBQUNDLGFBQUQsRUFBMENDLE1BQTFDLEVBQXNFO0FBQy9FLFNBQUtDLFlBQUwsR0FBb0IsRUFBcEI7QUFDQSxTQUFLRCxNQUFMLEdBQWNFLGdCQUFPQyxHQUFQ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a0RHLEtBQWxELEVBQStFO0FBQ3pGLFFBQUlBLEtBQUssQ0FBQ1csSUFBTixLQUFlLFVBQW5CLEVBQStCO0FBQzdCakIsTUFBQUEsY0FBYyxDQUFDMEMsV0FBZixDQUEyQnZDLFNBQTNCLEVBQXNDRyxLQUFLLENBQUNZLFdBQTVDO0FBQ0QsS0FGRCxNQUVPLElBQUlaLEtBQUssQ0FBQ1csSUFBTixLQUFlLFNBQW5CLEVBQThCO0FBQ25DakIsTUFBQUEsY0FBYyxDQUFDMkMsVUFBZixDQUEwQnhDLFNBQTFCLEVBQXFDRyxLQUFLLENBQUNZLFdBQTNDLEVBQXdEWixLQUF4RDtBQUNELEtBRk0sTUFFQTtBQUNMTixNQUFBQSxjQUFjLENBQUMrQixRQUFmLENBQXdCNUIsU0FBeEIsRUFBbUNHLEtBQUssQ0FBQ1csSUFBekMsRUFBK0NYLEtBQS9DO0FBQ0Q7QUFDRjs7QUFyWnlCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCB7IGludGVybmFsQ3JlYXRlU2NoZW1hLCBpbnRlcm5hbFVwZGF0ZVNjaGVtYSB9IGZyb20gJy4uL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucywgc3lzdGVtQ2xhc3NlcyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgKiBhcyBNaWdyYXRpb25zIGZyb20gJy4vTWlncmF0aW9ucyc7XG5cbmV4cG9ydCBjbGFzcyBEZWZpbmVkU2NoZW1hcyB7XG4gIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnM7XG4gIGxvY2FsU2NoZW1hczogTWlncmF0aW9ucy5KU09OU2NoZW1hW107XG4gIHJldHJpZXM6IG51bWJlcjtcbiAgbWF4UmV0cmllczogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucywgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IFtdO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLmdldChjb25maWcuYXBwSWQpO1xuICAgIHRoaXMuc2NoZW1hT3B0aW9ucyA9IHNjaGVtYU9wdGlvbnM7XG4gICAgaWYgKHNjaGVtYU9wdGlvbnMgJiYgc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykge1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpKSB7XG4gICAgICAgIHRocm93IGBcInNjaGVtYS5kZWZpbml0aW9uc1wiIG11c3QgYmUgYW4gYXJyYXkgb2Ygc2NoZW1hc2A7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubG9jYWxTY2hlbWFzID0gc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucztcbiAgICB9XG5cbiAgICB0aGlzLnJldHJpZXMgPSAwO1xuICAgIHRoaXMubWF4UmV0cmllcyA9IDM7XG4gIH1cblxuICAvLyBTaW11bGF0ZSBzYXZlIGxpa2UgdGhlIFNES1xuICAvLyBXZSBjYW5ub3QgdXNlIFNESyBzaW5jZSByb3V0ZXMgYXJlIGRpc2FibGVkXG4gIGFzeW5jIHNhdmVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxDcmVhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIHJlc2V0U2NoZW1hT3BzKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgLy8gUmVzZXQgb3BzIGxpa2UgU0RLXG4gICAgc2NoZW1hLl9maWVsZHMgPSB7fTtcbiAgICBzY2hlbWEuX2luZGV4ZXMgPSB7fTtcbiAgfVxuXG4gIC8vIFNpbXVsYXRlIHVwZGF0ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyB1cGRhdGVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxVcGRhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMnKTtcbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnM/LmJlZm9yZU1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuXG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zPy5hZnRlck1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zIENvbXBsZXRlZCcpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhY2sgdG8gZm9yY2Ugc2Vzc2lvbiBzY2hlbWEgdG8gYmUgY3JlYXRlZFxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IFBhcnNlLlNjaGVtYS5hbGwoKTtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHRoaXMubG9jYWxTY2hlbWFzLm1hcChhc3luYyBsb2NhbFNjaGVtYSA9PiB0aGlzLnNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYSkpKTtcblxuICAgICAgdGhpcy5jaGVja0Zvck1pc3NpbmdTY2hlbWFzKCk7XG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHRpbWVvdXQpIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjaGVja0Zvck1pc3NpbmdTY2hlbWFzKCkge1xuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2xvdWRTY2hlbWFzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IGxvY2FsU2NoZW1hcyA9IHRoaXMubG9jYWxTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBtaXNzaW5nU2NoZW1hcyA9IGNsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjID0+ICFsb2NhbFNjaGVtYXMuaW5jbHVkZXMoYykgJiYgIXN5c3RlbUNsYXNzZXMuaW5jbHVkZXMoYylcbiAgICApO1xuXG4gICAgaWYgKG5ldyBTZXQobG9jYWxTY2hlbWFzKS5zaXplICE9PSBsb2NhbFNjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBUaGUgbGlzdCBvZiBzY2hlbWFzIHByb3ZpZGVkIGNvbnRhaW5zIGR1cGxpY2F0ZWQgXCJjbGFzc05hbWVcIiAgXCIke2xvY2FsU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIixcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgJiYgbWlzc2luZ1NjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgc2NoZW1hcyBhcmUgY3VycmVudGx5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCBidXQgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBhIHNjaGVtYTogXCIke21pc3NpbmdTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLCBcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICB3YWl0KHRpbWUpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRpbWUpKTtcbiAgfVxuXG4gIGFzeW5jIGVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk6IHZvaWQge1xuICAgIGNvbnN0IG5vblByb3ZpZGVkQ2xhc3NlcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGNsb3VkU2NoZW1hID0+XG4gICAgICAgICF0aGlzLmxvY2FsU2NoZW1hcy5zb21lKGxvY2FsU2NoZW1hID0+IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xvdWRTY2hlbWEuY2xhc3NOYW1lKVxuICAgICk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBub25Qcm92aWRlZENsYXNzZXMubWFwKGFzeW5jIHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5oYW5kbGVDTFAoc2NoZW1hLCBwYXJzZVNjaGVtYSk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihwYXJzZVNjaGVtYSk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBmYWtlIHNlc3Npb24gc2luY2UgUGFyc2UgZG8gbm90IGNyZWF0ZSB0aGUgX1Nlc3Npb24gdW50aWxcbiAgLy8gYSBzZXNzaW9uIGlzIGNyZWF0ZWRcbiAgYXN5bmMgY3JlYXRlRGVsZXRlU2Vzc2lvbigpIHtcbiAgICBjb25zdCBzZXNzaW9uID0gbmV3IFBhcnNlLlNlc3Npb24oKTtcbiAgICBhd2FpdCBzZXNzaW9uLnNhdmUobnVsbCwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gICAgYXdhaXQgc2Vzc2lvbi5kZXN0cm95KHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG5cbiAgYXN5bmMgc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIGR1cmluZyB1cGRhdGUgb2Ygc2NoZW1hIGZvciB0eXBlICR7Y2xvdWRTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYShsb2NhbFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciB3aGlsZSBzYXZpbmcgU2NoZW1hIGZvciB0eXBlICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hKTtcblxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNhdmVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLCBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG5cbiAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgLy8gQ2hlY2sgYWRkaXRpb25cbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIGlmICghY2xvdWRTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZmllbGRzVG9SZWNyZWF0ZToge1xuICAgICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgICBmcm9tOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M6IHN0cmluZyB9LFxuICAgICAgdG86IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzczogc3RyaW5nIH0sXG4gICAgfVtdID0gW107XG4gICAgY29uc3QgZmllbGRzV2l0aENoYW5nZWRQYXJhbXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmZpZWxkcylcbiAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gY2xvdWRTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGlmICghbG9jYWxTY2hlbWEuZmllbGRzIHx8ICFsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgIGZpZWxkc1RvRGVsZXRlLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsb2NhbEZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIC8vIENoZWNrIGlmIGZpZWxkIGhhcyBhIGNoYW5nZWQgdHlwZVxuICAgICAgICBpZiAoXG4gICAgICAgICAgIXRoaXMucGFyYW1zQXJlRXF1YWxzKFxuICAgICAgICAgICAgeyB0eXBlOiBmaWVsZC50eXBlLCB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICAgIHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9XG4gICAgICAgICAgKVxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZHNUb1JlY3JlYXRlLnB1c2goe1xuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgZnJvbTogeyB0eXBlOiBmaWVsZC50eXBlLCB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICAgIHRvOiB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiBzb21ldGhpbmcgY2hhbmdlZCBvdGhlciB0aGFuIHRoZSB0eXBlIChsaWtlIHJlcXVpcmVkLCBkZWZhdWx0VmFsdWUpXG4gICAgICAgIGlmICghdGhpcy5wYXJhbXNBcmVFcXVhbHMoZmllbGQsIGxvY2FsRmllbGQpKSB7XG4gICAgICAgICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvRGVsZXRlLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvRGVsZXRlLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIGZpZWxkcyBleGlzdCBpbiB0aGUgZGF0YWJhc2UgZm9yIFwiJHtcbiAgICAgICAgICBsb2NhbFNjaGVtYS5jbGFzc05hbWVcbiAgICAgICAgfVwiLCBidXQgYXJlIG1pc3NpbmcgaW4gdGhlIHNjaGVtYSA6IFwiJHtmaWVsZHNUb0RlbGV0ZS5qb2luKCdcIiAsXCInKX1cImBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZC5maWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcblxuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkSW5mbyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkSW5mby5maWVsZE5hbWVdO1xuICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGRJbmZvLmZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvUmVjcmVhdGUubGVuZ3RoKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBjb25zdCBmcm9tID1cbiAgICAgICAgICBmaWVsZC5mcm9tLnR5cGUgKyAoZmllbGQuZnJvbS50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQuZnJvbS50YXJnZXRDbGFzc30pYCA6ICcnKTtcbiAgICAgICAgY29uc3QgdG8gPSBmaWVsZC50by50eXBlICsgKGZpZWxkLnRvLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC50by50YXJnZXRDbGFzc30pYCA6ICcnKTtcblxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgVGhlIGZpZWxkIFwiJHtmaWVsZC5maWVsZE5hbWV9XCIgdHlwZSBkaWZmZXIgYmV0d2VlbiB0aGUgc2NoZW1hIGFuZCB0aGUgZGF0YWJhc2UgZm9yIFwiJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9XCI7IFNjaGVtYSBpcyBkZWZpbmVkIGFzIFwiJHt0b31cIiBhbmQgY3VycmVudCBkYXRhYmFzZSB0eXBlIGlzIFwiJHtmcm9tfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSBJbmRleGVzXG4gICAgLy8gQ2hlY2sgYWRkaXRpb25cbiAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgKCFjbG91ZFNjaGVtYS5pbmRleGVzIHx8ICFjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pICYmXG4gICAgICAgICAgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSlcbiAgICAgICAgKVxuICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGluZGV4ZXNUb0FkZCA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBpZiAoY2xvdWRTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAoIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmluZGV4ZXMgfHwgIWxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlSW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgIXRoaXMucGFyYW1zQXJlRXF1YWxzKGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSwgY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlSW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICAgIGluZGV4ZXNUb0FkZC5wdXNoKHtcbiAgICAgICAgICAgICAgaW5kZXhOYW1lLFxuICAgICAgICAgICAgICBpbmRleDogbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAvLyBBcHBseSBjaGFuZ2VzXG4gICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICAvLyBBcHBseSBuZXcvY2hhbmdlZCBpbmRleGVzXG4gICAgaWYgKGluZGV4ZXNUb0FkZC5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYFVwZGF0aW5nIGluZGV4ZXMgZm9yIFwiJHtuZXdMb2NhbFNjaGVtYS5jbGFzc05hbWV9XCIgOiAgJHtpbmRleGVzVG9BZGQuam9pbignICwnKX1gXG4gICAgICApO1xuICAgICAgaW5kZXhlc1RvQWRkLmZvckVhY2gobyA9PiBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChvLmluZGV4TmFtZSwgby5pbmRleCkpO1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVDTFAobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSwgbmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSwgY2xvdWRTY2hlbWEpIHtcbiAgICBpZiAoIWxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAmJiAhY2xvdWRTY2hlbWEpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBjbGFzc0xldmVsUGVybWlzc2lvbnMgbm90IHByb3ZpZGVkIGZvciAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX0uYCk7XG4gICAgfVxuICAgIC8vIFVzZSBzcHJlYWQgdG8gYXZvaWQgcmVhZCBvbmx5IGlzc3VlIChlbmNvdW50ZXJlZCBieSBNb3Vtb3VscyB1c2luZyBkaXJlY3RBY2Nlc3MpXG4gICAgY29uc3QgY2xwID0geyAuLi5sb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfSB8fCB7fTtcbiAgICAvLyBUbyBhdm9pZCBpbmNvbnNpc3RlbmN5IHdlIG5lZWQgdG8gcmVtb3ZlIGFsbCByaWdodHMgb24gYWRkRmllbGRcbiAgICBjbHAuYWRkRmllbGQgPSB7fTtcbiAgICBuZXdMb2NhbFNjaGVtYS5zZXRDTFAoY2xwKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkRmllbGRzKGNsYXNzTmFtZSwgZmllbGROYW1lKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICEhZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGROYW1lXSB8fFxuICAgICAgISEoZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSAmJiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV0pXG4gICAgKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkSW5kZXgoY2xhc3NOYW1lLCBpbmRleE5hbWUpIHtcbiAgICBsZXQgaW5kZXhlcyA9IFsnX2lkXyddO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGluZGV4ZXMgPSBbXG4gICAgICAgIC4uLmluZGV4ZXMsXG4gICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJyxcbiAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLFxuICAgICAgICAndXNlcm5hbWVfMScsXG4gICAgICAgICdlbWFpbF8xJyxcbiAgICAgIF07XG4gICAgfVxuXG4gICAgcmV0dXJuIGluZGV4ZXMuaW5kZXhPZihpbmRleE5hbWUpICE9PSAtMTtcbiAgfVxuXG4gIHBhcmFtc0FyZUVxdWFsczxUPihvYmpBOiBULCBvYmpCOiBUKSB7XG4gICAgY29uc3Qga2V5c0EgPSBPYmplY3Qua2V5cyhvYmpBKTtcbiAgICBjb25zdCBrZXlzQiA9IE9iamVjdC5rZXlzKG9iakIpO1xuXG4gICAgLy8gQ2hlY2sga2V5IG5hbWVcbiAgICBpZiAoa2V5c0EubGVuZ3RoICE9PSBrZXlzQi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4ga2V5c0EuZXZlcnkoayA9PiBvYmpBW2tdID09PSBvYmpCW2tdKTtcbiAgfVxuXG4gIGhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGQ6IE1pZ3JhdGlvbnMuRmllbGRUeXBlKSB7XG4gICAgaWYgKGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFJlbGF0aW9uKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MpO1xuICAgIH0gZWxzZSBpZiAoZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRQb2ludGVyKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MsIGZpZWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkRmllbGQoZmllbGROYW1lLCBmaWVsZC50eXBlLCBmaWVsZCk7XG4gICAgfVxuICB9XG59XG4iXX0=