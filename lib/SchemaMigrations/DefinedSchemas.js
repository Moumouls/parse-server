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
var _Auth = _interopRequireDefault(require("../Auth"));
var _rest = _interopRequireDefault(require("../rest"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// -disable-next Cannot resolve module `parse/node`.
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
  }
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
  }

  // Simulate update like the SDK
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
      _logger.logger.info('Running Migrations');
      if (this.schemaOptions && this.schemaOptions.beforeMigration) {
        await Promise.resolve(this.schemaOptions.beforeMigration());
      }
      await this.executeMigrations();
      if (this.schemaOptions && this.schemaOptions.afterMigration) {
        await Promise.resolve(this.schemaOptions.afterMigration());
      }
      _logger.logger.info('Running Migrations Completed');
    } catch (e) {
      _logger.logger.error(`Failed to run migrations: ${e}`);
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
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
      }
      await this.createDeleteSession();
      // -disable-next-line
      const schemaController = await this.config.database.loadSchema();
      this.allCloudSchemas = await schemaController.getAllClasses();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (this.retries < this.maxRetries) {
        this.retries++;
        // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time. Modern systems like k8 avoid this by doing rolling updates
        await this.wait(1000 * this.retries);
        await this.executeMigrations();
      } else {
        _logger.logger.error(`Failed to run migrations: ${e}`);
        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }
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
  }

  // Required for testing purpose
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
  }

  // Create a fake session since Parse do not create the _Session until
  // a session is created
  async createDeleteSession() {
    const {
      response
    } = await _rest.default.create(this.config, _Auth.default.master(this.config), '_Session', {});
    await _rest.default.del(this.config, _Auth.default.master(this.config), '_Session', response.objectId);
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
        if (localSchema.fields) {
          const field = localSchema.fields[fieldName];
          this.handleFields(newLocalSchema, fieldName, field);
        }
      });
    }
    // Handle indexes
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (localSchema.indexes && !this.isProtectedIndex(localSchema.className, indexName)) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
        }
      });
    }
    this.handleCLP(localSchema, newLocalSchema);
    return await this.saveSchemaToDB(newLocalSchema);
  }
  async updateSchema(localSchema, cloudSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);

    // Handle fields
    // Check addition
    if (localSchema.fields) {
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        // -disable-next
        const field = localSchema.fields[fieldName];
        if (!cloudSchema.fields[fieldName]) {
          this.handleFields(newLocalSchema, fieldName, field);
        }
      });
    }
    const fieldsToDelete = [];
    const fieldsToRecreate = [];
    const fieldsWithChangedParams = [];

    // Check deletion
    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
      const field = cloudSchema.fields[fieldName];
      if (!localSchema.fields || !localSchema.fields[fieldName]) {
        fieldsToDelete.push(fieldName);
        return;
      }
      const localField = localSchema.fields[fieldName];
      // Check if field has a changed type
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
      }

      // Check if something changed other than the type (like required, defaultValue)
      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });
    if (this.schemaOptions.deleteExtraFields === true) {
      fieldsToDelete.forEach(fieldName => {
        newLocalSchema.deleteField(fieldName);
      });

      // Delete fields from the schema then apply changes
      await this.updateSchemaToDB(newLocalSchema);
    } else if (this.schemaOptions.strict === true && fieldsToDelete.length) {
      _logger.logger.warn(`The following fields exist in the database for "${localSchema.className}", but are missing in the schema : "${fieldsToDelete.join('" ,"')}"`);
    }
    if (this.schemaOptions.recreateModifiedFields === true) {
      fieldsToRecreate.forEach(field => {
        newLocalSchema.deleteField(field.fieldName);
      });

      // Delete fields from the schema then apply changes
      await this.updateSchemaToDB(newLocalSchema);
      fieldsToRecreate.forEach(fieldInfo => {
        if (localSchema.fields) {
          const field = localSchema.fields[fieldInfo.fieldName];
          this.handleFields(newLocalSchema, fieldInfo.fieldName, field);
        }
      });
    } else if (this.schemaOptions.strict === true && fieldsToRecreate.length) {
      fieldsToRecreate.forEach(field => {
        const from = field.from.type + (field.from.targetClass ? ` (${field.from.targetClass})` : '');
        const to = field.to.type + (field.to.targetClass ? ` (${field.to.targetClass})` : '');
        _logger.logger.warn(`The field "${field.fieldName}" type differ between the schema and the database for "${localSchema.className}"; Schema is defined as "${to}" and current database type is "${from}"`);
      });
    }
    fieldsWithChangedParams.forEach(fieldName => {
      if (localSchema.fields) {
        const field = localSchema.fields[fieldName];
        this.handleFields(newLocalSchema, fieldName, field);
      }
    });

    // Handle Indexes
    // Check addition
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if ((!cloudSchema.indexes || !cloudSchema.indexes[indexName]) && !this.isProtectedIndex(localSchema.className, indexName)) {
          if (localSchema.indexes) {
            newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
          }
        }
      });
    }
    const indexesToAdd = [];

    // Check deletion
    if (cloudSchema.indexes) {
      Object.keys(cloudSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          if (!localSchema.indexes || !localSchema.indexes[indexName]) {
            newLocalSchema.deleteIndex(indexName);
          } else if (!this.paramsAreEquals(localSchema.indexes[indexName], cloudSchema.indexes[indexName])) {
            newLocalSchema.deleteIndex(indexName);
            if (localSchema.indexes) {
              indexesToAdd.push({
                indexName,
                index: localSchema.indexes[indexName]
              });
            }
          }
        }
      });
    }
    this.handleCLP(localSchema, newLocalSchema, cloudSchema);
    // Apply changes
    await this.updateSchemaToDB(newLocalSchema);
    // Apply new/changed indexes
    if (indexesToAdd.length) {
      _logger.logger.debug(`Updating indexes for "${newLocalSchema.className}" :  ${indexesToAdd.join(' ,')}`);
      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }
  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    }
    // Use spread to avoid read only issue (encountered by Moumouls using directAccess)
    const clp = {
      ...(localSchema.classLevelPermissions || {})
    };
    // To avoid inconsistency we need to remove all rights on addField
    clp.addField = {};
    newLocalSchema.setCLP(clp);
  }
  isProtectedFields(className, fieldName) {
    return !!_SchemaController.defaultColumns._Default[fieldName] || !!(_SchemaController.defaultColumns[className] && _SchemaController.defaultColumns[className][fieldName]);
  }
  isProtectedIndex(className, indexName) {
    const indexes = ['_id_'];
    switch (className) {
      case '_User':
        indexes.push('case_insensitive_username', 'case_insensitive_email', 'username_1', 'email_1');
        break;
      case '_Role':
        indexes.push('name_1');
        break;
      case '_Idempotency':
        indexes.push('reqId_1');
        break;
    }
    return indexes.indexOf(indexName) !== -1;
  }
  paramsAreEquals(objA, objB) {
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    // Check key name
    if (keysA.length !== keysB.length) {
      return false;
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0F1dGgiLCJfcmVzdCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIlBhcnNlIiwiRGVmaW5lZFNjaGVtYXMiLCJjb25zdHJ1Y3RvciIsInNjaGVtYU9wdGlvbnMiLCJjb25maWciLCJsb2NhbFNjaGVtYXMiLCJDb25maWciLCJhcHBJZCIsImRlZmluaXRpb25zIiwiQXJyYXkiLCJpc0FycmF5IiwicmV0cmllcyIsIm1heFJldHJpZXMiLCJzYXZlU2NoZW1hVG9EQiIsInNjaGVtYSIsInBheWxvYWQiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfZmllbGRzIiwiaW5kZXhlcyIsIl9pbmRleGVzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiX2NscCIsImludGVybmFsQ3JlYXRlU2NoZW1hIiwicmVzZXRTY2hlbWFPcHMiLCJ1cGRhdGVTY2hlbWFUb0RCIiwiaW50ZXJuYWxVcGRhdGVTY2hlbWEiLCJleGVjdXRlIiwibG9nZ2VyIiwiaW5mbyIsImJlZm9yZU1pZ3JhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhlY3V0ZU1pZ3JhdGlvbnMiLCJhZnRlck1pZ3JhdGlvbiIsImVycm9yIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY3JlYXRlRGVsZXRlU2Vzc2lvbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJhbGxDbG91ZFNjaGVtYXMiLCJnZXRBbGxDbGFzc2VzIiwiY2xlYXJUaW1lb3V0IiwiYWxsIiwibWFwIiwibG9jYWxTY2hlbWEiLCJzYXZlT3JVcGRhdGUiLCJjaGVja0Zvck1pc3NpbmdTY2hlbWFzIiwiZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MiLCJ3YWl0Iiwic3RyaWN0IiwiY2xvdWRTY2hlbWFzIiwicyIsIm1pc3NpbmdTY2hlbWFzIiwiZmlsdGVyIiwiYyIsImluY2x1ZGVzIiwic3lzdGVtQ2xhc3NlcyIsIlNldCIsInNpemUiLCJsZW5ndGgiLCJqb2luIiwid2FybiIsInRpbWUiLCJub25Qcm92aWRlZENsYXNzZXMiLCJjbG91ZFNjaGVtYSIsInNvbWUiLCJwYXJzZVNjaGVtYSIsIlNjaGVtYSIsImhhbmRsZUNMUCIsInJlc3BvbnNlIiwicmVzdCIsImNyZWF0ZSIsIkF1dGgiLCJtYXN0ZXIiLCJkZWwiLCJvYmplY3RJZCIsImZpbmQiLCJzYyIsInVwZGF0ZVNjaGVtYSIsInNhdmVTY2hlbWEiLCJuZXdMb2NhbFNjaGVtYSIsImtleXMiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmcm9tIiwidG8iLCJkZWxldGVFeHRyYUZpZWxkcyIsImRlbGV0ZUZpZWxkIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImZpZWxkSW5mbyIsImluZGV4ZXNUb0FkZCIsImRlbGV0ZUluZGV4IiwiaW5kZXgiLCJkZWJ1ZyIsIm8iLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBAZmxvdy1kaXNhYmxlLW5leHQgQ2Fubm90IHJlc29sdmUgbW9kdWxlIGBwYXJzZS9ub2RlYC5cbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCB7IGludGVybmFsQ3JlYXRlU2NoZW1hLCBpbnRlcm5hbFVwZGF0ZVNjaGVtYSB9IGZyb20gJy4uL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucywgc3lzdGVtQ2xhc3NlcyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgKiBhcyBNaWdyYXRpb25zIGZyb20gJy4vTWlncmF0aW9ucyc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuXG5leHBvcnQgY2xhc3MgRGVmaW5lZFNjaGVtYXMge1xuICBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zO1xuICBsb2NhbFNjaGVtYXM6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYVtdO1xuICByZXRyaWVzOiBudW1iZXI7XG4gIG1heFJldHJpZXM6IG51bWJlcjtcbiAgYWxsQ2xvdWRTY2hlbWFzOiBQYXJzZS5TY2hlbWFbXTtcblxuICBjb25zdHJ1Y3RvcihzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnMsIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBbXTtcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnLmFwcElkKTtcbiAgICB0aGlzLnNjaGVtYU9wdGlvbnMgPSBzY2hlbWFPcHRpb25zO1xuICAgIGlmIChzY2hlbWFPcHRpb25zICYmIHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSkge1xuICAgICAgICB0aHJvdyBgXCJzY2hlbWEuZGVmaW5pdGlvbnNcIiBtdXN0IGJlIGFuIGFycmF5IG9mIHNjaGVtYXNgO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnM7XG4gICAgfVxuXG4gICAgdGhpcy5yZXRyaWVzID0gMDtcbiAgICB0aGlzLm1heFJldHJpZXMgPSAzO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbENyZWF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgcmVzZXRTY2hlbWFPcHMoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICAvLyBSZXNldCBvcHMgbGlrZSBTREtcbiAgICBzY2hlbWEuX2ZpZWxkcyA9IHt9O1xuICAgIHNjaGVtYS5faW5kZXhlcyA9IHt9O1xuICB9XG5cbiAgLy8gU2ltdWxhdGUgdXBkYXRlIGxpa2UgdGhlIFNES1xuICAvLyBXZSBjYW5ub3QgdXNlIFNESyBzaW5jZSByb3V0ZXMgYXJlIGRpc2FibGVkXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbFVwZGF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucycpO1xuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG5cbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMgQ29tcGxldGVkJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7IHByb2Nlc3MuZXhpdCgxKTsgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuY3JlYXRlRGVsZXRlU2Vzc2lvbigpO1xuICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0LWxpbmVcbiAgICAgIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IHNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5sb2NhbFNjaGVtYXMubWFwKGFzeW5jIGxvY2FsU2NoZW1hID0+IHRoaXMuc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hKSkpO1xuXG4gICAgICB0aGlzLmNoZWNrRm9yTWlzc2luZ1NjaGVtYXMoKTtcbiAgICAgIGF3YWl0IHRoaXMuZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodGltZW91dCkgeyBjbGVhclRpbWVvdXQodGltZW91dCk7IH1cbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHsgcHJvY2Vzcy5leGl0KDEpOyB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAhPT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNsb3VkU2NoZW1hcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBsb2NhbFNjaGVtYXMgPSB0aGlzLmxvY2FsU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbWlzc2luZ1NjaGVtYXMgPSBjbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgYyA9PiAhbG9jYWxTY2hlbWFzLmluY2x1ZGVzKGMpICYmICFzeXN0ZW1DbGFzc2VzLmluY2x1ZGVzKGMpXG4gICAgKTtcblxuICAgIGlmIChuZXcgU2V0KGxvY2FsU2NoZW1hcykuc2l6ZSAhPT0gbG9jYWxTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgVGhlIGxpc3Qgb2Ygc2NoZW1hcyBwcm92aWRlZCBjb250YWlucyBkdXBsaWNhdGVkIFwiY2xhc3NOYW1lXCIgIFwiJHtsb2NhbFNjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICYmIG1pc3NpbmdTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIHNjaGVtYXMgYXJlIGN1cnJlbnRseSBwcmVzZW50IGluIHRoZSBkYXRhYmFzZSwgYnV0IG5vdCBleHBsaWNpdGx5IGRlZmluZWQgaW4gYSBzY2hlbWE6IFwiJHttaXNzaW5nU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIiwgXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJlcXVpcmVkIGZvciB0ZXN0aW5nIHB1cnBvc2VcbiAgd2FpdCh0aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRpbWUpKTtcbiAgfVxuXG4gIGFzeW5jIGVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vblByb3ZpZGVkQ2xhc3NlcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGNsb3VkU2NoZW1hID0+XG4gICAgICAgICF0aGlzLmxvY2FsU2NoZW1hcy5zb21lKGxvY2FsU2NoZW1hID0+IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xvdWRTY2hlbWEuY2xhc3NOYW1lKVxuICAgICk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBub25Qcm92aWRlZENsYXNzZXMubWFwKGFzeW5jIHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5oYW5kbGVDTFAoc2NoZW1hLCBwYXJzZVNjaGVtYSk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihwYXJzZVNjaGVtYSk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBmYWtlIHNlc3Npb24gc2luY2UgUGFyc2UgZG8gbm90IGNyZWF0ZSB0aGUgX1Nlc3Npb24gdW50aWxcbiAgLy8gYSBzZXNzaW9uIGlzIGNyZWF0ZWRcbiAgYXN5bmMgY3JlYXRlRGVsZXRlU2Vzc2lvbigpIHtcbiAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCByZXN0LmNyZWF0ZSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7fSk7XG4gICAgYXdhaXQgcmVzdC5kZWwodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywgcmVzcG9uc2Uub2JqZWN0SWQpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIGR1cmluZyB1cGRhdGUgb2Ygc2NoZW1hIGZvciB0eXBlICR7Y2xvdWRTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYShsb2NhbFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciB3aGlsZSBzYXZpbmcgU2NoZW1hIGZvciB0eXBlICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzICYmICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcblxuICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgaWYgKCFjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZmllbGRzVG9SZWNyZWF0ZToge1xuICAgICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgICBmcm9tOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICAgIHRvOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICB9W10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuZmllbGRzKVxuICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5maWVsZHMgfHwgIWxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgZmllbGRzVG9EZWxldGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsRmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmllbGQgaGFzIGEgY2hhbmdlZCB0eXBlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMoXG4gICAgICAgICAgICB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH1cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkc1RvUmVjcmVhdGUucHVzaCh7XG4gICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICBmcm9tOiB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgdG86IHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbWV0aGluZyBjaGFuZ2VkIG90aGVyIHRoYW4gdGhlIHR5cGUgKGxpa2UgcmVxdWlyZWQsIGRlZmF1bHRWYWx1ZSlcbiAgICAgICAgaWYgKCF0aGlzLnBhcmFtc0FyZUVxdWFscyhmaWVsZCwgbG9jYWxGaWVsZCkpIHtcbiAgICAgICAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9EZWxldGUuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9EZWxldGUubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgZmllbGRzIGV4aXN0IGluIHRoZSBkYXRhYmFzZSBmb3IgXCIke1xuICAgICAgICAgIGxvY2FsU2NoZW1hLmNsYXNzTmFtZVxuICAgICAgICB9XCIsIGJ1dCBhcmUgbWlzc2luZyBpbiB0aGUgc2NoZW1hIDogXCIke2ZpZWxkc1RvRGVsZXRlLmpvaW4oJ1wiICxcIicpfVwiYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkLmZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGRJbmZvID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkSW5mby5maWVsZE5hbWVdO1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZEluZm8uZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb1JlY3JlYXRlLmxlbmd0aCkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgY29uc3QgZnJvbSA9XG4gICAgICAgICAgZmllbGQuZnJvbS50eXBlICsgKGZpZWxkLmZyb20udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLmZyb20udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG4gICAgICAgIGNvbnN0IHRvID0gZmllbGQudG8udHlwZSArIChmaWVsZC50by50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQudG8udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG5cbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYFRoZSBmaWVsZCBcIiR7ZmllbGQuZmllbGROYW1lfVwiIHR5cGUgZGlmZmVyIGJldHdlZW4gdGhlIHNjaGVtYSBhbmQgdGhlIGRhdGFiYXNlIGZvciBcIiR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiOyBTY2hlbWEgaXMgZGVmaW5lZCBhcyBcIiR7dG99XCIgYW5kIGN1cnJlbnQgZGF0YWJhc2UgdHlwZSBpcyBcIiR7ZnJvbX1cImBcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEluZGV4ZXNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoIWNsb3VkU2NoZW1hLmluZGV4ZXMgfHwgIWNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkgJiZcbiAgICAgICAgICAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhlc1RvQWRkID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIGlmIChjbG91ZFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIGlmICghbG9jYWxTY2hlbWEuaW5kZXhlcyB8fCAhbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMobG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLCBjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgICAgaW5kZXhlc1RvQWRkLnB1c2goe1xuICAgICAgICAgICAgICAgIGluZGV4TmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleDogbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgIC8vIEFwcGx5IGNoYW5nZXNcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIC8vIEFwcGx5IG5ldy9jaGFuZ2VkIGluZGV4ZXNcbiAgICBpZiAoaW5kZXhlc1RvQWRkLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgVXBkYXRpbmcgaW5kZXhlcyBmb3IgXCIke25ld0xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIiA6ICAke2luZGV4ZXNUb0FkZC5qb2luKCcgLCcpfWBcbiAgICAgICk7XG4gICAgICBpbmRleGVzVG9BZGQuZm9yRWFjaChvID0+IG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KG8uaW5kZXhOYW1lLCBvLmluZGV4KSk7XG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZUNMUChcbiAgICBsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLFxuICAgIG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsXG4gICAgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYVxuICApIHtcbiAgICBpZiAoIWxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAmJiAhY2xvdWRTY2hlbWEpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBjbGFzc0xldmVsUGVybWlzc2lvbnMgbm90IHByb3ZpZGVkIGZvciAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX0uYCk7XG4gICAgfVxuICAgIC8vIFVzZSBzcHJlYWQgdG8gYXZvaWQgcmVhZCBvbmx5IGlzc3VlIChlbmNvdW50ZXJlZCBieSBNb3Vtb3VscyB1c2luZyBkaXJlY3RBY2Nlc3MpXG4gICAgY29uc3QgY2xwID0gKHsgLi4ubG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIHx8IHt9IH06IFBhcnNlLkNMUC5QZXJtaXNzaW9uc01hcCk7XG4gICAgLy8gVG8gYXZvaWQgaW5jb25zaXN0ZW5jeSB3ZSBuZWVkIHRvIHJlbW92ZSBhbGwgcmlnaHRzIG9uIGFkZEZpZWxkXG4gICAgY2xwLmFkZEZpZWxkID0ge307XG4gICAgbmV3TG9jYWxTY2hlbWEuc2V0Q0xQKGNscCk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISFkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdIHx8XG4gICAgICAhIShkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSlcbiAgICApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXhOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBpbmRleGVzID0gWydfaWRfJ107XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIGNhc2UgJ19Vc2VyJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJyxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICAgJ3VzZXJuYW1lXzEnLFxuICAgICAgICAgICdlbWFpbF8xJ1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ19Sb2xlJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCduYW1lXzEnKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ19JZGVtcG90ZW5jeSc6XG4gICAgICAgIGluZGV4ZXMucHVzaCgncmVxSWRfMScpO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXhlcy5pbmRleE9mKGluZGV4TmFtZSkgIT09IC0xO1xuICB9XG5cbiAgcGFyYW1zQXJlRXF1YWxzPFQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0+KG9iakE6IFQsIG9iakI6IFQpIHtcbiAgICBjb25zdCBrZXlzQTogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpBKTtcbiAgICBjb25zdCBrZXlzQjogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpCKTtcblxuICAgIC8vIENoZWNrIGtleSBuYW1lXG4gICAgaWYgKGtleXNBLmxlbmd0aCAhPT0ga2V5c0IubGVuZ3RoKSB7IHJldHVybiBmYWxzZTsgfVxuICAgIHJldHVybiBrZXlzQS5ldmVyeShrID0+IG9iakFba10gPT09IG9iakJba10pO1xuICB9XG5cbiAgaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZDogTWlncmF0aW9ucy5GaWVsZFR5cGUpIHtcbiAgICBpZiAoZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUmVsYXRpb24oZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcyk7XG4gICAgfSBlbHNlIGlmIChmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFBvaW50ZXIoZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcywgZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRGaWVsZChmaWVsZE5hbWUsIGZpZWxkLnR5cGUsIGZpZWxkKTtcbiAgICB9XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBR0EsSUFBQUEsT0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsY0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksaUJBQUEsR0FBQUosT0FBQTtBQUNBLElBQUFLLFFBQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLFVBQUEsR0FBQUMsdUJBQUEsQ0FBQVAsT0FBQTtBQUNBLElBQUFRLEtBQUEsR0FBQU4sc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFTLEtBQUEsR0FBQVAsc0JBQUEsQ0FBQUYsT0FBQTtBQUEyQixTQUFBVSx5QkFBQUMsQ0FBQSw2QkFBQUMsT0FBQSxtQkFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxDQUFBLFdBQUFBLENBQUEsR0FBQUcsQ0FBQSxHQUFBRCxDQUFBLEtBQUFGLENBQUE7QUFBQSxTQUFB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LEtBQUssT0FBTztRQUNWRyxPQUFPLENBQUNpRixJQUFJLENBQ1YsMkJBQTJCLEVBQzNCLHdCQUF3QixFQUN4QixZQUFZLEVBQ1osU0FDRixDQUFDO1FBQ0Q7TUFDRixLQUFLLE9BQU87UUFDVmpGLE9BQU8sQ0FBQ2lGLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDdEI7TUFFRixLQUFLLGNBQWM7UUFDakJqRixPQUFPLENBQUNpRixJQUFJLENBQUMsU0FBUyxDQUFDO1FBQ3ZCO0lBQ0o7SUFFQSxPQUFPakYsT0FBTyxDQUFDc0csT0FBTyxDQUFDM0IsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0VBQzFDO0VBRUFRLGVBQWVBLENBQTRCb0IsSUFBTyxFQUFFQyxJQUFPLEVBQUU7SUFDM0QsTUFBTUMsS0FBZSxHQUFHcEksTUFBTSxDQUFDZ0csSUFBSSxDQUFDa0MsSUFBSSxDQUFDO0lBQ3pDLE1BQU1HLEtBQWUsR0FBR3JJLE1BQU0sQ0FBQ2dHLElBQUksQ0FBQ21DLElBQUksQ0FBQzs7SUFFekM7SUFDQSxJQUFJQyxLQUFLLENBQUMxRCxNQUFNLEtBQUsyRCxLQUFLLENBQUMzRCxNQUFNLEVBQUU7TUFBRSxPQUFPLEtBQUs7SUFBRTtJQUNuRCxPQUFPMEQsS0FBSyxDQUFDRSxLQUFLLENBQUNDLENBQUMsSUFBSUwsSUFBSSxDQUFDSyxDQUFDLENBQUMsS0FBS0osSUFBSSxDQUFDSSxDQUFDLENBQUMsQ0FBQztFQUM5QztFQUVBbEMsWUFBWUEsQ0FBQ04sY0FBNEIsRUFBRUUsU0FBaUIsRUFBRUcsS0FBMkIsRUFBRTtJQUN6RixJQUFJQSxLQUFLLENBQUNXLElBQUksS0FBSyxVQUFVLEVBQUU7TUFDN0JoQixjQUFjLENBQUN5QyxXQUFXLENBQUN2QyxTQUFTLEVBQUVHLEtBQUssQ0FBQ1ksV0FBVyxDQUFDO0lBQzFELENBQUMsTUFBTSxJQUFJWixLQUFLLENBQUNXLElBQUksS0FBSyxTQUFTLEVBQUU7TUFDbkNoQixjQUFjLENBQUMwQyxVQUFVLENBQUN4QyxTQUFTLEVBQUVHLEtBQUssQ0FBQ1ksV0FBVyxFQUFFWixLQUFLLENBQUM7SUFDaEUsQ0FBQyxNQUFNO01BQ0xMLGNBQWMsQ0FBQzhCLFFBQVEsQ0FBQzVCLFNBQVMsRUFBRUcsS0FBSyxDQUFDVyxJQUFJLEVBQUVYLEtBQUssQ0FBQztJQUN2RDtFQUNGO0FBQ0Y7QUFBQ3NDLE9BQUEsQ0FBQWpJLGNBQUEsR0FBQUEsY0FBQSIsImlnbm9yZUxpc3QiOltdfQ==