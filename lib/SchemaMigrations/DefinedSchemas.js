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
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0F1dGgiLCJfcmVzdCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiX3RvUHJvcGVydHlLZXkiLCJ2YWx1ZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJTdHJpbmciLCJOdW1iZXIiLCJQYXJzZSIsIkRlZmluZWRTY2hlbWFzIiwiY29uc3RydWN0b3IiLCJzY2hlbWFPcHRpb25zIiwiY29uZmlnIiwibG9jYWxTY2hlbWFzIiwiQ29uZmlnIiwiYXBwSWQiLCJkZWZpbml0aW9ucyIsIkFycmF5IiwiaXNBcnJheSIsInJldHJpZXMiLCJtYXhSZXRyaWVzIiwic2F2ZVNjaGVtYVRvREIiLCJzY2hlbWEiLCJwYXlsb2FkIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2ZpZWxkcyIsImluZGV4ZXMiLCJfaW5kZXhlcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9jbHAiLCJpbnRlcm5hbENyZWF0ZVNjaGVtYSIsInJlc2V0U2NoZW1hT3BzIiwidXBkYXRlU2NoZW1hVG9EQiIsImludGVybmFsVXBkYXRlU2NoZW1hIiwiZXhlY3V0ZSIsImxvZ2dlciIsImluZm8iLCJiZWZvcmVNaWdyYXRpb24iLCJQcm9taXNlIiwicmVzb2x2ZSIsImV4ZWN1dGVNaWdyYXRpb25zIiwiYWZ0ZXJNaWdyYXRpb24iLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJzY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiYWxsQ2xvdWRTY2hlbWFzIiwiZ2V0QWxsQ2xhc3NlcyIsImNsZWFyVGltZW91dCIsImFsbCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJTY2hlbWEiLCJoYW5kbGVDTFAiLCJyZXNwb25zZSIsInJlc3QiLCJjcmVhdGUiLCJBdXRoIiwibWFzdGVyIiwiZGVsIiwib2JqZWN0SWQiLCJmaW5kIiwic2MiLCJ1cGRhdGVTY2hlbWEiLCJzYXZlU2NoZW1hIiwibmV3TG9jYWxTY2hlbWEiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZpZWxkIiwiaGFuZGxlRmllbGRzIiwiaW5kZXhOYW1lIiwiaXNQcm90ZWN0ZWRJbmRleCIsImFkZEluZGV4IiwiZmllbGRzVG9EZWxldGUiLCJmaWVsZHNUb1JlY3JlYXRlIiwiZmllbGRzV2l0aENoYW5nZWRQYXJhbXMiLCJsb2NhbEZpZWxkIiwicGFyYW1zQXJlRXF1YWxzIiwidHlwZSIsInRhcmdldENsYXNzIiwiZnJvbSIsInRvIiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJkZWxldGVGaWVsZCIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJmaWVsZEluZm8iLCJpbmRleGVzVG9BZGQiLCJkZWxldGVJbmRleCIsImluZGV4IiwiZGVidWciLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBAZmxvdy1kaXNhYmxlLW5leHQgQ2Fubm90IHJlc29sdmUgbW9kdWxlIGBwYXJzZS9ub2RlYC5cbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCB7IGludGVybmFsQ3JlYXRlU2NoZW1hLCBpbnRlcm5hbFVwZGF0ZVNjaGVtYSB9IGZyb20gJy4uL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucywgc3lzdGVtQ2xhc3NlcyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgKiBhcyBNaWdyYXRpb25zIGZyb20gJy4vTWlncmF0aW9ucyc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuXG5leHBvcnQgY2xhc3MgRGVmaW5lZFNjaGVtYXMge1xuICBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucztcbiAgc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zO1xuICBsb2NhbFNjaGVtYXM6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYVtdO1xuICByZXRyaWVzOiBudW1iZXI7XG4gIG1heFJldHJpZXM6IG51bWJlcjtcbiAgYWxsQ2xvdWRTY2hlbWFzOiBQYXJzZS5TY2hlbWFbXTtcblxuICBjb25zdHJ1Y3RvcihzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnMsIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBbXTtcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnLmFwcElkKTtcbiAgICB0aGlzLnNjaGVtYU9wdGlvbnMgPSBzY2hlbWFPcHRpb25zO1xuICAgIGlmIChzY2hlbWFPcHRpb25zICYmIHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSkge1xuICAgICAgICB0aHJvdyBgXCJzY2hlbWEuZGVmaW5pdGlvbnNcIiBtdXN0IGJlIGFuIGFycmF5IG9mIHNjaGVtYXNgO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnM7XG4gICAgfVxuXG4gICAgdGhpcy5yZXRyaWVzID0gMDtcbiAgICB0aGlzLm1heFJldHJpZXMgPSAzO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbENyZWF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgcmVzZXRTY2hlbWFPcHMoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICAvLyBSZXNldCBvcHMgbGlrZSBTREtcbiAgICBzY2hlbWEuX2ZpZWxkcyA9IHt9O1xuICAgIHNjaGVtYS5faW5kZXhlcyA9IHt9O1xuICB9XG5cbiAgLy8gU2ltdWxhdGUgdXBkYXRlIGxpa2UgdGhlIFNES1xuICAvLyBXZSBjYW5ub3QgdXNlIFNESyBzaW5jZSByb3V0ZXMgYXJlIGRpc2FibGVkXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYVRvREIoc2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbFVwZGF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucycpO1xuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYmVmb3JlTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG5cbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMgQ29tcGxldGVkJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZU1pZ3JhdGlvbnMoKSB7XG4gICAgbGV0IHRpbWVvdXQgPSBudWxsO1xuICAgIHRyeSB7XG4gICAgICAvLyBTZXQgdXAgYSB0aW1lIG91dCBpbiBwcm9kdWN0aW9uXG4gICAgICAvLyBpZiB3ZSBmYWlsIHRvIGdldCBzY2hlbWFcbiAgICAgIC8vIHBtMiBvciBLOHMgYW5kIG1hbnkgb3RoZXIgcHJvY2VzcyBtYW5hZ2VycyB3aWxsIHRyeSB0byByZXN0YXJ0IHRoZSBwcm9jZXNzXG4gICAgICAvLyBhZnRlciB0aGUgZXhpdFxuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignVGltZW91dCBvY2N1cnJlZCBkdXJpbmcgZXhlY3V0aW9uIG9mIG1pZ3JhdGlvbnMuIEV4aXRpbmcuLi4nKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH0sIDIwMDAwKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHQtbGluZVxuICAgICAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgICAgIHRoaXMuYWxsQ2xvdWRTY2hlbWFzID0gYXdhaXQgc2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCk7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbCh0aGlzLmxvY2FsU2NoZW1hcy5tYXAoYXN5bmMgbG9jYWxTY2hlbWEgPT4gdGhpcy5zYXZlT3JVcGRhdGUobG9jYWxTY2hlbWEpKSk7XG5cbiAgICAgIHRoaXMuY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpO1xuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0aW1lb3V0KSBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBpZiAodGhpcy5yZXRyaWVzIDwgdGhpcy5tYXhSZXRyaWVzKSB7XG4gICAgICAgIHRoaXMucmV0cmllcysrO1xuICAgICAgICAvLyBmaXJzdCByZXRyeSAxc2VjLCAyc2VjLCAzc2VjIHRvdGFsIDZzZWMgcmV0cnkgc2VxdWVuY2VcbiAgICAgICAgLy8gcmV0cnkgd2lsbCBvbmx5IGhhcHBlbiBpbiBjYXNlIG9mIGRlcGxveWluZyBtdWx0aSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICAgICAgLy8gYXQgdGhlIHNhbWUgdGltZS4gTW9kZXJuIHN5c3RlbXMgbGlrZSBrOCBhdm9pZCB0aGlzIGJ5IGRvaW5nIHJvbGxpbmcgdXBkYXRlc1xuICAgICAgICBhd2FpdCB0aGlzLndhaXQoMTAwMCAqIHRoaXMucmV0cmllcyk7XG4gICAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZU1pZ3JhdGlvbnMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAhPT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNsb3VkU2NoZW1hcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBsb2NhbFNjaGVtYXMgPSB0aGlzLmxvY2FsU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbWlzc2luZ1NjaGVtYXMgPSBjbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgYyA9PiAhbG9jYWxTY2hlbWFzLmluY2x1ZGVzKGMpICYmICFzeXN0ZW1DbGFzc2VzLmluY2x1ZGVzKGMpXG4gICAgKTtcblxuICAgIGlmIChuZXcgU2V0KGxvY2FsU2NoZW1hcykuc2l6ZSAhPT0gbG9jYWxTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgVGhlIGxpc3Qgb2Ygc2NoZW1hcyBwcm92aWRlZCBjb250YWlucyBkdXBsaWNhdGVkIFwiY2xhc3NOYW1lXCIgIFwiJHtsb2NhbFNjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICYmIG1pc3NpbmdTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIHNjaGVtYXMgYXJlIGN1cnJlbnRseSBwcmVzZW50IGluIHRoZSBkYXRhYmFzZSwgYnV0IG5vdCBleHBsaWNpdGx5IGRlZmluZWQgaW4gYSBzY2hlbWE6IFwiJHttaXNzaW5nU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIiwgXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJlcXVpcmVkIGZvciB0ZXN0aW5nIHB1cnBvc2VcbiAgd2FpdCh0aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRpbWUpKTtcbiAgfVxuXG4gIGFzeW5jIGVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vblByb3ZpZGVkQ2xhc3NlcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGNsb3VkU2NoZW1hID0+XG4gICAgICAgICF0aGlzLmxvY2FsU2NoZW1hcy5zb21lKGxvY2FsU2NoZW1hID0+IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xvdWRTY2hlbWEuY2xhc3NOYW1lKVxuICAgICk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBub25Qcm92aWRlZENsYXNzZXMubWFwKGFzeW5jIHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5oYW5kbGVDTFAoc2NoZW1hLCBwYXJzZVNjaGVtYSk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihwYXJzZVNjaGVtYSk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBmYWtlIHNlc3Npb24gc2luY2UgUGFyc2UgZG8gbm90IGNyZWF0ZSB0aGUgX1Nlc3Npb24gdW50aWxcbiAgLy8gYSBzZXNzaW9uIGlzIGNyZWF0ZWRcbiAgYXN5bmMgY3JlYXRlRGVsZXRlU2Vzc2lvbigpIHtcbiAgICBjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCByZXN0LmNyZWF0ZSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7fSk7XG4gICAgYXdhaXQgcmVzdC5kZWwodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywgcmVzcG9uc2Uub2JqZWN0SWQpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIGR1cmluZyB1cGRhdGUgb2Ygc2NoZW1hIGZvciB0eXBlICR7Y2xvdWRTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYShsb2NhbFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciB3aGlsZSBzYXZpbmcgU2NoZW1hIGZvciB0eXBlICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzICYmICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcblxuICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgaWYgKCFjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZmllbGRzVG9SZWNyZWF0ZToge1xuICAgICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgICBmcm9tOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICAgIHRvOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICB9W10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuZmllbGRzKVxuICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5maWVsZHMgfHwgIWxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgZmllbGRzVG9EZWxldGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsRmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmllbGQgaGFzIGEgY2hhbmdlZCB0eXBlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMoXG4gICAgICAgICAgICB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH1cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkc1RvUmVjcmVhdGUucHVzaCh7XG4gICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICBmcm9tOiB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgdG86IHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbWV0aGluZyBjaGFuZ2VkIG90aGVyIHRoYW4gdGhlIHR5cGUgKGxpa2UgcmVxdWlyZWQsIGRlZmF1bHRWYWx1ZSlcbiAgICAgICAgaWYgKCF0aGlzLnBhcmFtc0FyZUVxdWFscyhmaWVsZCwgbG9jYWxGaWVsZCkpIHtcbiAgICAgICAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9EZWxldGUuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9EZWxldGUubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgZmllbGRzIGV4aXN0IGluIHRoZSBkYXRhYmFzZSBmb3IgXCIke1xuICAgICAgICAgIGxvY2FsU2NoZW1hLmNsYXNzTmFtZVxuICAgICAgICB9XCIsIGJ1dCBhcmUgbWlzc2luZyBpbiB0aGUgc2NoZW1hIDogXCIke2ZpZWxkc1RvRGVsZXRlLmpvaW4oJ1wiICxcIicpfVwiYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkLmZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGRJbmZvID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkSW5mby5maWVsZE5hbWVdO1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZEluZm8uZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb1JlY3JlYXRlLmxlbmd0aCkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgY29uc3QgZnJvbSA9XG4gICAgICAgICAgZmllbGQuZnJvbS50eXBlICsgKGZpZWxkLmZyb20udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLmZyb20udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG4gICAgICAgIGNvbnN0IHRvID0gZmllbGQudG8udHlwZSArIChmaWVsZC50by50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQudG8udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG5cbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYFRoZSBmaWVsZCBcIiR7ZmllbGQuZmllbGROYW1lfVwiIHR5cGUgZGlmZmVyIGJldHdlZW4gdGhlIHNjaGVtYSBhbmQgdGhlIGRhdGFiYXNlIGZvciBcIiR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiOyBTY2hlbWEgaXMgZGVmaW5lZCBhcyBcIiR7dG99XCIgYW5kIGN1cnJlbnQgZGF0YWJhc2UgdHlwZSBpcyBcIiR7ZnJvbX1cImBcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEluZGV4ZXNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoIWNsb3VkU2NoZW1hLmluZGV4ZXMgfHwgIWNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkgJiZcbiAgICAgICAgICAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhlc1RvQWRkID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIGlmIChjbG91ZFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIGlmICghbG9jYWxTY2hlbWEuaW5kZXhlcyB8fCAhbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMobG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLCBjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgICAgaW5kZXhlc1RvQWRkLnB1c2goe1xuICAgICAgICAgICAgICAgIGluZGV4TmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleDogbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgIC8vIEFwcGx5IGNoYW5nZXNcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIC8vIEFwcGx5IG5ldy9jaGFuZ2VkIGluZGV4ZXNcbiAgICBpZiAoaW5kZXhlc1RvQWRkLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgVXBkYXRpbmcgaW5kZXhlcyBmb3IgXCIke25ld0xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIiA6ICAke2luZGV4ZXNUb0FkZC5qb2luKCcgLCcpfWBcbiAgICAgICk7XG4gICAgICBpbmRleGVzVG9BZGQuZm9yRWFjaChvID0+IG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KG8uaW5kZXhOYW1lLCBvLmluZGV4KSk7XG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZUNMUChcbiAgICBsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLFxuICAgIG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsXG4gICAgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYVxuICApIHtcbiAgICBpZiAoIWxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAmJiAhY2xvdWRTY2hlbWEpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBjbGFzc0xldmVsUGVybWlzc2lvbnMgbm90IHByb3ZpZGVkIGZvciAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX0uYCk7XG4gICAgfVxuICAgIC8vIFVzZSBzcHJlYWQgdG8gYXZvaWQgcmVhZCBvbmx5IGlzc3VlIChlbmNvdW50ZXJlZCBieSBNb3Vtb3VscyB1c2luZyBkaXJlY3RBY2Nlc3MpXG4gICAgY29uc3QgY2xwID0gKHsgLi4ubG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH0gfHwge306IFBhcnNlLkNMUC5QZXJtaXNzaW9uc01hcCk7XG4gICAgLy8gVG8gYXZvaWQgaW5jb25zaXN0ZW5jeSB3ZSBuZWVkIHRvIHJlbW92ZSBhbGwgcmlnaHRzIG9uIGFkZEZpZWxkXG4gICAgY2xwLmFkZEZpZWxkID0ge307XG4gICAgbmV3TG9jYWxTY2hlbWEuc2V0Q0xQKGNscCk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISFkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdIHx8XG4gICAgICAhIShkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSlcbiAgICApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXhOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBpbmRleGVzID0gWydfaWRfJ107XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIGNhc2UgJ19Vc2VyJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJyxcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICAgJ3VzZXJuYW1lXzEnLFxuICAgICAgICAgICdlbWFpbF8xJ1xuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ19Sb2xlJzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCduYW1lXzEnKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ19JZGVtcG90ZW5jeSc6XG4gICAgICAgIGluZGV4ZXMucHVzaCgncmVxSWRfMScpO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXhlcy5pbmRleE9mKGluZGV4TmFtZSkgIT09IC0xO1xuICB9XG5cbiAgcGFyYW1zQXJlRXF1YWxzPFQ6IHsgW2tleTogc3RyaW5nXTogYW55IH0+KG9iakE6IFQsIG9iakI6IFQpIHtcbiAgICBjb25zdCBrZXlzQTogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpBKTtcbiAgICBjb25zdCBrZXlzQjogc3RyaW5nW10gPSBPYmplY3Qua2V5cyhvYmpCKTtcblxuICAgIC8vIENoZWNrIGtleSBuYW1lXG4gICAgaWYgKGtleXNBLmxlbmd0aCAhPT0ga2V5c0IubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGtleXNBLmV2ZXJ5KGsgPT4gb2JqQVtrXSA9PT0gb2JqQltrXSk7XG4gIH1cblxuICBoYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSwgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkOiBNaWdyYXRpb25zLkZpZWxkVHlwZSkge1xuICAgIGlmIChmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRSZWxhdGlvbihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzKTtcbiAgICB9IGVsc2UgaWYgKGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUG9pbnRlcihmaWVsZE5hbWUsIGZpZWxkLnRhcmdldENsYXNzLCBmaWVsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEZpZWxkKGZpZWxkTmFtZSwgZmllbGQudHlwZSwgZmllbGQpO1xuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFHQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxjQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxpQkFBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssUUFBQSxHQUFBTCxPQUFBO0FBQ0EsSUFBQU0sVUFBQSxHQUFBQyx1QkFBQSxD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