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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
      if (timeout) clearTimeout(timeout);
      if (this.retries < this.maxRetries) {
        this.retries++;
        // first retry 1sec, 2sec, 3sec total 6sec retry sequence
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
    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {};
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0F1dGgiLCJfcmVzdCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm9iaiIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJQYXJzZSIsIkRlZmluZWRTY2hlbWFzIiwiY29uc3RydWN0b3IiLCJzY2hlbWFPcHRpb25zIiwiY29uZmlnIiwibG9jYWxTY2hlbWFzIiwiQ29uZmlnIiwiYXBwSWQiLCJkZWZpbml0aW9ucyIsIkFycmF5IiwiaXNBcnJheSIsInJldHJpZXMiLCJtYXhSZXRyaWVzIiwic2F2ZVNjaGVtYVRvREIiLCJzY2hlbWEiLCJwYXlsb2FkIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2ZpZWxkcyIsImluZGV4ZXMiLCJfaW5kZXhlcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9jbHAiLCJpbnRlcm5hbENyZWF0ZVNjaGVtYSIsInJlc2V0U2NoZW1hT3BzIiwidXBkYXRlU2NoZW1hVG9EQiIsImludGVybmFsVXBkYXRlU2NoZW1hIiwiZXhlY3V0ZSIsImxvZ2dlciIsImluZm8iLCJiZWZvcmVNaWdyYXRpb24iLCJQcm9taXNlIiwicmVzb2x2ZSIsImV4ZWN1dGVNaWdyYXRpb25zIiwiYWZ0ZXJNaWdyYXRpb24iLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJzY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiYWxsQ2xvdWRTY2hlbWFzIiwiZ2V0QWxsQ2xhc3NlcyIsImNsZWFyVGltZW91dCIsImFsbCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJTY2hlbWEiLCJoYW5kbGVDTFAiLCJyZXNwb25zZSIsInJlc3QiLCJjcmVhdGUiLCJBdXRoIiwibWFzdGVyIiwiZGVsIiwib2JqZWN0SWQiLCJmaW5kIiwic2MiLCJ1cGRhdGVTY2hlbWEiLCJzYXZlU2NoZW1hIiwibmV3TG9jYWxTY2hlbWEiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZpZWxkIiwiaGFuZGxlRmllbGRzIiwiaW5kZXhOYW1lIiwiaXNQcm90ZWN0ZWRJbmRleCIsImFkZEluZGV4IiwiZmllbGRzVG9EZWxldGUiLCJmaWVsZHNUb1JlY3JlYXRlIiwiZmllbGRzV2l0aENoYW5nZWRQYXJhbXMiLCJsb2NhbEZpZWxkIiwicGFyYW1zQXJlRXF1YWxzIiwidHlwZSIsInRhcmdldENsYXNzIiwiZnJvbSIsInRvIiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJkZWxldGVGaWVsZCIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJmaWVsZEluZm8iLCJpbmRleGVzVG9BZGQiLCJkZWxldGVJbmRleCIsImluZGV4IiwiZGVidWciLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBAZmxvdy1kaXNhYmxlLW5leHQgQ2Fubm90IHJlc29sdmUgbW9kdWxlIGBwYXJzZS9ub2RlYC5cbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCB7IGludGVybmFsQ3JlYXRlU2NoZW1hLCBpbnRlcm5hbFVwZGF0ZVNjaGVtYSB9IGZyb20gJy4uL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucywgc3lzdGVtQ2xhc3NlcyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgKiBhcyBNaWdyYXRpb25zIGZyb20gJy4vTWlncmF0aW9ucyc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuXG5leHBvcnQgY2xhc3MgRGVmaW5lZFNjaGVtYXMge1xuICBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zO1xuICBsb2NhbFNjaGVtYXM6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYVtdO1xuICByZXRyaWVzOiBudW1iZXI7XG4gIG1heFJldHJpZXM6IG51bWJlcjtcbiAgYWxsQ2xvdWRTY2hlbWFzOiBQYXJzZS5TY2hlbWFbXTtcblxuICBjb25zdHJ1Y3RvcihzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnMsIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBbXTtcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnLmFwcElkKTtcbiAgICB0aGlzLnNjaGVtYU9wdGlvbnMgPSBzY2hlbWFPcHRpb25zO1xuICAgIGlmIChzY2hlbWFPcHRpb25zICYmIHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSkge1xuICAgICAgICB0aHJvdyBgXCJzY2hlbWEuZGVmaW5pdGlvbnNcIiBtdXN0IGJlIGFuIGFycmF5IG9mIHNjaGVtYXNgO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnM7XG4gICAgfVxuXG4gICAgdGhpcy5yZXRyaWVzID0gMDtcbiAgICB0aGlzLm1heFJldHJpZXMgPSAzO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbENyZWF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgcmVzZXRTY2hlbWFPcHMoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICAvLyBSZXNldCBvcHMgbGlrZSBTREtcbiAgICBzY2hlbWEuX2ZpZWxkcyA9IHt9O1xuICAgIHNjaGVtYS5faW5kZXhlcyA9IHt9O1xuICB9XG5cbiAgLy8gU2ltdWxhdGUgdXBkYXRlIGxpa2UgdGhlIFNES1xuICAvLyBXZSBjYW5ub3QgdXNlIFNESyBzaW5jZSByb3V0ZXMgYXJlIGRpc2FibGVkXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbFVwZGF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucycpO1xuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG5cbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMgQ29tcGxldGVkJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZU1pZ3JhdGlvbnMoKSB7XG4gICAgbGV0IHRpbWVvdXQgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICAvLyBTZXQgdXAgYSB0aW1lIG91dCBpbiBwcm9kdWN0aW9uXG4gICAgICAvLyBpZiB3ZSBmYWlsIHRvIGdldCBzY2hlbWFcbiAgICAgIC8vIHBtMiBvciBLOHMgYW5kIG1hbnkgb3RoZXIgcHJvY2VzcyBtYW5hZ2VycyB3aWxsIHRyeSB0byByZXN0YXJ0IHRoZSBwcm9jZXNzXG4gICAgICAvLyBhZnRlciB0aGUgZXhpdFxuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignVGltZW91dCBvY2N1cnJlZCBkdXJpbmcgZXhlY3V0aW9uIG9mIG1pZ3JhdGlvbnMuIEV4aXRpbmcuLi4nKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH0sIDIwMDAwKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHQtbGluZVxuICAgICAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgICAgIHRoaXMuYWxsQ2xvdWRTY2hlbWFzID0gYXdhaXQgc2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCk7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbCh0aGlzLmxvY2FsU2NoZW1hcy5tYXAoYXN5bmMgbG9jYWxTY2hlbWEgPT4gdGhpcy5zYXZlT3JVcGRhdGUobG9jYWxTY2hlbWEpKSk7XG5cbiAgICAgIHRoaXMuY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpO1xuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0aW1lb3V0KSBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBpZiAodGhpcy5yZXRyaWVzIDwgdGhpcy5tYXhSZXRyaWVzKSB7XG4gICAgICAgIHRoaXMucmV0cmllcysrO1xuICAgICAgICAvLyBmaXJzdCByZXRyeSAxc2VjLCAyc2VjLCAzc2VjIHRvdGFsIDZzZWMgcmV0cnkgc2VxdWVuY2VcbiAgICAgICAgLy8gcmV0cnkgd2lsbCBvbmx5IGhhcHBlbiBpbiBjYXNlIG9mIGRlcGxveWluZyBtdWx0aSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICAgICAgLy8gYXQgdGhlIHNhbWUgdGltZS4gTW9kZXJuIHN5c3RlbXMgbGlrZSBrOCBhdm9pZCB0aGlzIGJ5IGRvaW5nIHJvbGxpbmcgdXBkYXRlc1xuICAgICAgICBhd2FpdCB0aGlzLndhaXQoMTAwMCAqIHRoaXMucmV0cmllcyk7XG4gICAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZU1pZ3JhdGlvbnMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAhPT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNsb3VkU2NoZW1hcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBsb2NhbFNjaGVtYXMgPSB0aGlzLmxvY2FsU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbWlzc2luZ1NjaGVtYXMgPSBjbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgYyA9PiAhbG9jYWxTY2hlbWFzLmluY2x1ZGVzKGMpICYmICFzeXN0ZW1DbGFzc2VzLmluY2x1ZGVzKGMpXG4gICAgKTtcblxuICAgIGlmIChuZXcgU2V0KGxvY2FsU2NoZW1hcykuc2l6ZSAhPT0gbG9jYWxTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgVGhlIGxpc3Qgb2Ygc2NoZW1hcyBwcm92aWRlZCBjb250YWlucyBkdXBsaWNhdGVkIFwiY2xhc3NOYW1lXCIgIFwiJHtsb2NhbFNjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICYmIG1pc3NpbmdTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIHNjaGVtYXMgYXJlIGN1cnJlbnRseSBwcmVzZW50IGluIHRoZSBkYXRhYmFzZSwgYnV0IG5vdCBleHBsaWNpdGx5IGRlZmluZWQgaW4gYSBzY2hlbWE6IFwiJHttaXNzaW5nU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIiwgXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJlcXVpcmVkIGZvciB0ZXN0aW5nIHB1cnBvc2VcbiAgd2FpdCh0aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRpbWUpKTtcbiAgfVxuXG4gIGFzeW5jIGVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vblByb3ZpZGVkQ2xhc3NlcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGNsb3VkU2NoZW1hID0+XG4gICAgICAgICF0aGlzLmxvY2FsU2NoZW1hcy5zb21lKGxvY2FsU2NoZW1hID0+IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xvdWRTY2hlbWEuY2xhc3NOYW1lKVxuICAgICk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBub25Qcm92aWRlZENsYXNzZXMubWFwKGFzeW5jIHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5oYW5kbGVDTFAoc2NoZW1hLCBwYXJzZVNjaGVtYSk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihwYXJzZVNjaGVtYSk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBmYWtlIHNlc3Npb24gc2luY2UgUGFyc2UgZG8gbm90IGNyZWF0ZSB0aGUgX1Nlc3Npb24gdW50aWxcbiAgLy8gYSBzZXNzaW9uIGlzIGNyZWF0ZWRcbiAgYXN5bmMgY3JlYXRlRGVsZXRlU2Vzc2lvbigpIHtcbiAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCByZXN0LmNyZWF0ZSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7fSk7XG4gICAgYXdhaXQgcmVzdC5kZWwodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywgcmVzcG9uc2Uub2JqZWN0SWQpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIGR1cmluZyB1cGRhdGUgb2Ygc2NoZW1hIGZvciB0eXBlICR7Y2xvdWRTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYShsb2NhbFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciB3aGlsZSBzYXZpbmcgU2NoZW1hIGZvciB0eXBlICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzICYmICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcblxuICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgaWYgKCFjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZmllbGRzVG9SZWNyZWF0ZToge1xuICAgICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgICBmcm9tOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICAgIHRvOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICB9W10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuZmllbGRzKVxuICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5maWVsZHMgfHwgIWxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgZmllbGRzVG9EZWxldGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsRmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmllbGQgaGFzIGEgY2hhbmdlZCB0eXBlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMoXG4gICAgICAgICAgICB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH1cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkc1RvUmVjcmVhdGUucHVzaCh7XG4gICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICBmcm9tOiB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgdG86IHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbWV0aGluZyBjaGFuZ2VkIG90aGVyIHRoYW4gdGhlIHR5cGUgKGxpa2UgcmVxdWlyZWQsIGRlZmF1bHRWYWx1ZSlcbiAgICAgICAgaWYgKCF0aGlzLnBhcmFtc0FyZUVxdWFscyhmaWVsZCwgbG9jYWxGaWVsZCkpIHtcbiAgICAgICAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9EZWxldGUuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9EZWxldGUubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgZmllbGRzIGV4aXN0IGluIHRoZSBkYXRhYmFzZSBmb3IgXCIke1xuICAgICAgICAgIGxvY2FsU2NoZW1hLmNsYXNzTmFtZVxuICAgICAgICB9XCIsIGJ1dCBhcmUgbWlzc2luZyBpbiB0aGUgc2NoZW1hIDogXCIke2ZpZWxkc1RvRGVsZXRlLmpvaW4oJ1wiICxcIicpfVwiYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkLmZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGRJbmZvID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkSW5mby5maWVsZE5hbWVdO1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZEluZm8uZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb1JlY3JlYXRlLmxlbmd0aCkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgY29uc3QgZnJvbSA9XG4gICAgICAgICAgZmllbGQuZnJvbS50eXBlICsgKGZpZWxkLmZyb20udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLmZyb20udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG4gICAgICAgIGNvbnN0IHRvID0gZmllbGQudG8udHlwZSArIChmaWVsZC50by50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQudG8udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG5cbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYFRoZSBmaWVsZCBcIiR7ZmllbGQuZmllbGROYW1lfVwiIHR5cGUgZGlmZmVyIGJldHdlZW4gdGhlIHNjaGVtYSBhbmQgdGhlIGRhdGFiYXNlIGZvciBcIiR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiOyBTY2hlbWEgaXMgZGVmaW5lZCBhcyBcIiR7dG99XCIgYW5kIGN1cnJlbnQgZGF0YWJhc2UgdHlwZSBpcyBcIiR7ZnJvbX1cImBcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEluZGV4ZXNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoIWNsb3VkU2NoZW1hLmluZGV4ZXMgfHwgIWNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkgJiZcbiAgICAgICAgICAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhlc1RvQWRkID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIGlmIChjbG91ZFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIGlmICghbG9jYWxTY2hlbWEuaW5kZXhlcyB8fCAhbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMobG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLCBjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgICAgaW5kZXhlc1RvQWRkLnB1c2goe1xuICAgICAgICAgICAgICAgIGluZGV4TmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleDogbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgIC8vIEFwcGx5IGNoYW5nZXNcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIC8vIEFwcGx5IG5ldy9jaGFuZ2VkIGluZGV4ZXNcbiAgICBpZiAoaW5kZXhlc1RvQWRkLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgVXBkYXRpbmcgaW5kZXhlcyBmb3IgXCIke25ld0xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIiA6ICAke2luZGV4ZXNUb0FkZC5qb2luKCcgLCcpfWBcbiAgICAgICk7XG4gICAgICBpbmRleGVzVG9BZGQuZm9yRWFjaChvID0+IG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KG8uaW5kZXhOYW1lLCBvLmluZGV4KSk7XG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZUNMUChcbiAgICBsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLFxuICAgIG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsXG4gICAgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYVxuICApIHtcbiAgICBpZiAoIWxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAmJiAhY2xvdWRTY2hlbWEpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBjbGFzc0xldmVsUGVybWlzc2lvbnMgbm90IHByb3ZpZGVkIGZvciAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX0uYCk7XG4gICAgfVxuICAgIC8vIFVzZSBzcHJlYWQgdG8gYXZvaWQgcmVhZCBvbmx5IGlzc3VlIChlbmNvdW50ZXJlZCBieSBNb3Vtb3VscyB1c2luZyBkaXJlY3RBY2Nlc3MpXG4gICAgY29uc3QgY2xwID0gKHsgLi4ubG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH0gfHwge306IFBhcnNlLkNMUC5QZXJtaXNzaW9uc01hcCk7XG4gICAgLy8gVG8gYXZvaWQgaW5jb25zaXN0ZW5jeSB3ZSBuZWVkIHRvIHJlbW92ZSBhbGwgcmlnaHRzIG9uIGFkZEZpZWxkXG4gICAgY2xwLmFkZEZpZWxkID0ge307XG4gICAgbmV3TG9jYWxTY2hlbWEuc2V0Q0xQKGNscCk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISFkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdIHx8XG4gICAgICAhIShkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSlcbiAgICApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXhOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBpbmRleGVzID0gWydfaWRfJ107XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIGNhc2UgJ19Vc2VyJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJyxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICAgJ3VzZXJuYW1lXzEnLFxuICAgICAgICAgICdlbWFpbF8xJ1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ19Sb2xlJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCduYW1lXzEnKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ19JZGVtcG90ZW5jeSc6XG4gICAgICAgIGluZGV4ZXMucHVzaCgncmVxSWRfMScpO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXhlcy5pbmRleE9mKGluZGV4TmFtZSkgIT09IC0xO1xuICB9XG5cbiAgcGFyYW1zQXJlRXF1YWxzPFQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0+KG9iakE6IFQsIG9iakI6IFQpIHtcbiAgICBjb25zdCBrZXlzQTogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpBKTtcbiAgICBjb25zdCBrZXlzQjogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpCKTtcblxuICAgIC8vIENoZWNrIGtleSBuYW1lXG4gICAgaWYgKGtleXNBLmxlbmd0aCAhPT0ga2V5c0IubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGtleXNBLmV2ZXJ5KGsgPT4gb2JqQVtrXSA9PT0gb2JqQltrXSk7XG4gIH1cblxuICBoYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSwgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkOiBNaWdyYXRpb25zLkZpZWxkVHlwZSkge1xuICAgIGlmIChmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRSZWxhdGlvbihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzKTtcbiAgICB9IGVsc2UgaWYgKGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUG9pbnRlcihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzLCBmaWVsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEZpZWxkKGZpZWxkTmFtZSwgZmllbGQudHlwZSwgZmllbGQpO1xuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFHQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxpQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssUUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sVUFBQSxH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