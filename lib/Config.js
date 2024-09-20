"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;
var _lodash = require("lodash");
var _net = _interopRequireDefault(require("net"));
var _cache = _interopRequireDefault(require("./cache"));
var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));
var _LoggerController = require("./Controllers/LoggerController");
var _package = require("../package.json");
var _Definitions = require("./Options/Definitions");
var _Parse = _interopRequireDefault(require("./cloud-code/Parse.Server"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substring(0, str.length - 1);
  }
  return str;
}
class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);
    if (!cacheInfo) {
      return;
    }
    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    config.version = _package.version;
    return config;
  }
  static put(serverConfiguration) {
    Config.validateOptions(serverConfiguration);
    Config.validateControllers(serverConfiguration);
    _cache.default.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }
  static validateOptions({
    customPages,
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    defaultLimit,
    maxLimit,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    maintenanceKey,
    maintenanceKeyIps,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist,
    allowExpiredAuthDataToken,
    logLevels,
    rateLimit,
    databaseOptions,
    extendSessionOnUse,
    allowClientClassCreation
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }
    if (masterKey === maintenanceKey) {
      throw new Error('masterKey and maintenanceKey should be different');
    }
    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);
    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }
    if (typeof extendSessionOnUse !== 'boolean') {
      throw 'extendSessionOnUse must be a boolean value';
    }
    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }
    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateIps('masterKeyIps', masterKeyIps);
    this.validateIps('maintenanceKeyIps', maintenanceKeyIps);
    this.validateDefaultLimit(defaultLimit);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
    this.validateRateLimit(rateLimit);
    this.validateLogLevels(logLevels);
    this.validateDatabaseOptions(databaseOptions);
    this.validateCustomPages(customPages);
    this.validateAllowClientClassCreation(allowClientClassCreation);
  }
  static validateCustomPages(customPages) {
    if (!customPages) return;
    if (Object.prototype.toString.call(customPages) !== '[object Object]') {
      throw Error('Parse Server option customPages must be an object.');
    }
  }
  static validateControllers({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    const emailAdapter = userController.adapter;
    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }
  }
  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }
  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }
  static validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken) {
    if (typeof allowExpiredAuthDataToken !== 'boolean') {
      throw 'Parse Server option allowExpiredAuthDataToken must be a boolean.';
    }
  }
  static validateAllowClientClassCreation(allowClientClassCreation) {
    if (typeof allowClientClassCreation !== 'boolean') {
      throw 'Parse Server option allowClientClassCreation must be a boolean.';
    }
  }
  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }
    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }
    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }
  static validateSchemaOptions(schema) {
    if (!schema) return;
    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }
    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }
    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }
    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }
    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }
    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }
    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }
    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
    }
  }
  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }
    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }
    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }
    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }
    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }
    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }
    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }
    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }
    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }
    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }
    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }
  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }
    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }
    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }
  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }
      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }
      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }
  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }
      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }
      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }
      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }
      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }
      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }
      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }
      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
      if (passwordPolicy.resetPasswordSuccessOnInvalidEmail && typeof passwordPolicy.resetPasswordSuccessOnInvalidEmail !== 'boolean') {
        throw 'resetPasswordSuccessOnInvalidEmail must be a boolean value';
      }
    }
  }

  // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern
  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }
  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }
    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }
    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }
    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }
    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }
    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }
  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }
      throw e;
    }
    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }
    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }
    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
    if (fileUpload.fileExtensions === undefined) {
      fileUpload.fileExtensions = _Definitions.FileUploadOptions.fileExtensions.default;
    } else if (!Array.isArray(fileUpload.fileExtensions)) {
      throw 'fileUpload.fileExtensions must be an array.';
    }
  }
  static validateIps(field, masterKeyIps) {
    for (let ip of masterKeyIps) {
      if (ip.includes('/')) {
        ip = ip.split('/')[0];
      }
      if (!_net.default.isIP(ip)) {
        throw `The Parse Server option "${field}" contains an invalid IP address "${ip}".`;
      }
    }
  }
  get mount() {
    var mount = this._mount;
    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }
    return mount;
  }
  set mount(newValue) {
    this._mount = newValue;
  }
  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }
  static validateDefaultLimit(defaultLimit) {
    if (defaultLimit == null) {
      defaultLimit = _Definitions.ParseServerOptions.defaultLimit.default;
    }
    if (typeof defaultLimit !== 'number') {
      throw 'Default limit must be a number.';
    }
    if (defaultLimit <= 0) {
      throw 'Default limit must be a value greater than 0.';
    }
  }
  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }
  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }
  static validateLogLevels(logLevels) {
    for (const key of Object.keys(_Definitions.LogLevels)) {
      if (logLevels[key]) {
        if (_LoggerController.logLevels.indexOf(logLevels[key]) === -1) {
          throw `'${key}' must be one of ${JSON.stringify(_LoggerController.logLevels)}`;
        }
      } else {
        logLevels[key] = _Definitions.LogLevels[key].default;
      }
    }
  }
  static validateDatabaseOptions(databaseOptions) {
    if (databaseOptions == undefined) {
      return;
    }
    if (Object.prototype.toString.call(databaseOptions) !== '[object Object]') {
      throw `databaseOptions must be an object`;
    }
    if (databaseOptions.enableSchemaHooks === undefined) {
      databaseOptions.enableSchemaHooks = _Definitions.DatabaseOptions.enableSchemaHooks.default;
    } else if (typeof databaseOptions.enableSchemaHooks !== 'boolean') {
      throw `databaseOptions.enableSchemaHooks must be a boolean`;
    }
    if (databaseOptions.schemaCacheTtl === undefined) {
      databaseOptions.schemaCacheTtl = _Definitions.DatabaseOptions.schemaCacheTtl.default;
    } else if (typeof databaseOptions.schemaCacheTtl !== 'number') {
      throw `databaseOptions.schemaCacheTtl must be a number`;
    }
  }
  static validateRateLimit(rateLimit) {
    if (!rateLimit) {
      return;
    }
    if (Object.prototype.toString.call(rateLimit) !== '[object Object]' && !Array.isArray(rateLimit)) {
      throw `rateLimit must be an array or object`;
    }
    const options = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const option of options) {
      if (Object.prototype.toString.call(option) !== '[object Object]') {
        throw `rateLimit must be an array of objects`;
      }
      if (option.requestPath == null) {
        throw `rateLimit.requestPath must be defined`;
      }
      if (typeof option.requestPath !== 'string') {
        throw `rateLimit.requestPath must be a string`;
      }
      if (option.requestTimeWindow == null) {
        throw `rateLimit.requestTimeWindow must be defined`;
      }
      if (typeof option.requestTimeWindow !== 'number') {
        throw `rateLimit.requestTimeWindow must be a number`;
      }
      if (option.includeInternalRequests && typeof option.includeInternalRequests !== 'boolean') {
        throw `rateLimit.includeInternalRequests must be a boolean`;
      }
      if (option.requestCount == null) {
        throw `rateLimit.requestCount must be defined`;
      }
      if (typeof option.requestCount !== 'number') {
        throw `rateLimit.requestCount must be a number`;
      }
      if (option.errorResponseMessage && typeof option.errorResponseMessage !== 'string') {
        throw `rateLimit.errorResponseMessage must be a string`;
      }
      const options = Object.keys(_Parse.default.RateLimitZone);
      if (option.zone && !options.includes(option.zone)) {
        const formatter = new Intl.ListFormat('en', {
          style: 'short',
          type: 'disjunction'
        });
        throw `rateLimit.zone must be one of ${formatter.format(options)}`;
      }
    }
  }
  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }
  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }
    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }
  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }
  unregisterRateLimiters() {
    var _this$rateLimits;
    let i = (_this$rateLimits = this.rateLimits) === null || _this$rateLimits === void 0 ? void 0 : _this$rateLimits.length;
    while (i--) {
      const limit = this.rateLimits[i];
      if (limit.cloud) {
        this.rateLimits.splice(i, 1);
      }
    }
  }
  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }
  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }
  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }
  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }
  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }
  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }
  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }
  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }
  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }
  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  }

  // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.
  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }
}
exports.Config = Config;
var _default = exports.default = Config;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHJpbmciLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcnNpb24iLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGVPcHRpb25zIiwidmFsaWRhdGVDb250cm9sbGVycyIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwiY3VzdG9tUGFnZXMiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJkZWZhdWx0TGltaXQiLCJtYXhMaW1pdCIsImFjY291bnRMb2Nrb3V0IiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5IiwibWFpbnRlbmFuY2VLZXkiLCJtYWludGVuYW5jZUtleUlwcyIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZmlsZVVwbG9hZCIsInBhZ2VzIiwic2VjdXJpdHkiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwic2NoZW1hIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJsb2dMZXZlbHMiLCJyYXRlTGltaXQiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJFcnJvciIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVJcHMiLCJ2YWxpZGF0ZURlZmF1bHRMaW1pdCIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVMb2dMZXZlbHMiLCJ2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyIsInZhbGlkYXRlQ3VzdG9tUGFnZXMiLCJ2YWxpZGF0ZUFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInVuZGVmaW5lZCIsIkFycmF5IiwiaXNBcnJheSIsImVuYWJsZUNoZWNrIiwiU2VjdXJpdHlPcHRpb25zIiwiaXNCb29sZWFuIiwiZW5hYmxlQ2hlY2tMb2ciLCJkZWZpbml0aW9ucyIsIlNjaGVtYU9wdGlvbnMiLCJzdHJpY3QiLCJkZWxldGVFeHRyYUZpZWxkcyIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJsb2NrU2NoZW1hcyIsImJlZm9yZU1pZ3JhdGlvbiIsImFmdGVyTWlncmF0aW9uIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNPcHRpb25zIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJpc1N0cmluZyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJmaWxlRXh0ZW5zaW9ucyIsImZpZWxkIiwiaXAiLCJpbmNsdWRlcyIsInNwbGl0IiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmFibGVTY2hlbWFIb29rcyIsIkRhdGFiYXNlT3B0aW9ucyIsInNjaGVtYUNhY2hlVHRsIiwib3B0aW9ucyIsIm9wdGlvbiIsInJlcXVlc3RQYXRoIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsInJlcXVlc3RDb3VudCIsImVycm9yUmVzcG9uc2VNZXNzYWdlIiwiUGFyc2VTZXJ2ZXIiLCJSYXRlTGltaXRab25lIiwiem9uZSIsImZvcm1hdHRlciIsIkludGwiLCJMaXN0Rm9ybWF0Iiwic3R5bGUiLCJ0eXBlIiwiZm9ybWF0Iiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJfdGhpcyRyYXRlTGltaXRzIiwiaSIsInJhdGVMaW1pdHMiLCJsaW1pdCIsImNsb3VkIiwic3BsaWNlIiwiaW52YWxpZExpbmtVUkwiLCJpbnZhbGlkTGluayIsImludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZFN1Y2Nlc3MiLCJsaW5rU2VuZEZhaWxVUkwiLCJsaW5rU2VuZEZhaWwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3MiLCJjaG9vc2VQYXNzd29yZFVSTCIsImNob29zZVBhc3N3b3JkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBsb2dMZXZlbHMgYXMgdmFsaWRMb2dMZXZlbHMgfSBmcm9tICcuL0NvbnRyb2xsZXJzL0xvZ2dlckNvbnRyb2xsZXInO1xuaW1wb3J0IHsgdmVyc2lvbiB9IGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQge1xuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIERhdGFiYXNlT3B0aW9ucyxcbiAgRmlsZVVwbG9hZE9wdGlvbnMsXG4gIElkZW1wb3RlbmN5T3B0aW9ucyxcbiAgTG9nTGV2ZWxzLFxuICBQYWdlc09wdGlvbnMsXG4gIFBhcnNlU2VydmVyT3B0aW9ucyxcbiAgU2NoZW1hT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IFBhcnNlU2VydmVyIGZyb20gJy4vY2xvdWQtY29kZS9QYXJzZS5TZXJ2ZXInO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cmluZygwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbmZpZy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoY2FjaGVJbmZvLmRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgY29uZmlnLnZlcnNpb24gPSB2ZXJzaW9uO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBzdGF0aWMgcHV0KHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy52YWxpZGF0ZUNvbnRyb2xsZXJzKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU9wdGlvbnMoe1xuICAgIGN1c3RvbVBhZ2VzLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBkZWZhdWx0TGltaXQsXG4gICAgbWF4TGltaXQsXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICBtYWludGVuYW5jZUtleSxcbiAgICBtYWludGVuYW5jZUtleUlwcyxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGZpbGVVcGxvYWQsXG4gICAgcGFnZXMsXG4gICAgc2VjdXJpdHksXG4gICAgZW5mb3JjZVByaXZhdGVVc2VycyxcbiAgICBzY2hlbWEsXG4gICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCxcbiAgICBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuLFxuICAgIGxvZ0xldmVscyxcbiAgICByYXRlTGltaXQsXG4gICAgZGF0YWJhc2VPcHRpb25zLFxuICAgIGV4dGVuZFNlc3Npb25PblVzZSxcbiAgICBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24sXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBpZiAobWFzdGVyS2V5ID09PSBtYWludGVuYW5jZUtleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIG1haW50ZW5hbmNlS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGV4dGVuZFNlc3Npb25PblVzZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZXh0ZW5kU2Vzc2lvbk9uVXNlIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAocHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdwdWJsaWNTZXJ2ZXJVUkwgc2hvdWxkIGJlIGEgdmFsaWQgSFRUUFMgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cHM6Ly8nO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZUlwcygnbWFzdGVyS2V5SXBzJywgbWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYWludGVuYW5jZUtleUlwcycsIG1haW50ZW5hbmNlS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYSk7XG4gICAgdGhpcy52YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycyk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbik7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gICAgdGhpcy52YWxpZGF0ZVJhdGVMaW1pdChyYXRlTGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGF0YWJhc2VPcHRpb25zKGRhdGFiYXNlT3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZUN1c3RvbVBhZ2VzKGN1c3RvbVBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbik7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVDdXN0b21QYWdlcyhjdXN0b21QYWdlcykge1xuICAgIGlmICghY3VzdG9tUGFnZXMpIHJldHVybjtcblxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoY3VzdG9tUGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgRXJyb3IoJ1BhcnNlIFNlcnZlciBvcHRpb24gY3VzdG9tUGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJyk7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQ29udHJvbGxlcnMoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGNvbnN0IGVtYWlsQWRhcHRlciA9IHVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gICAgaWYgKHZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKSB7XG4gICAgaWYgKHR5cGVvZiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0NsaWVudENsYXNzQ3JlYXRpb24oYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKSB7XG4gICAgaWYgKHR5cGVvZiBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGlzIGNvbmZpZ3VyZWQgdGhlbiBzZXR1cCBhIGNhbGxiYWNrIHRvIHByb2Nlc3MgdGhlIHBhdHRlcm5cbiAgc3RhdGljIHNldHVwUGFzc3dvcmRWYWxpZGF0b3IocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kgJiYgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgcGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciA9IHZhbHVlID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4udGVzdCh2YWx1ZSk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgZW1haWxBZGFwdGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gIH0pIHtcbiAgICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgICAgdGhyb3cgJ0FuIGVtYWlsQWRhcHRlciBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYXBwTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBbiBhcHAgbmFtZSBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcHVibGljU2VydmVyVVJMICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0EgcHVibGljIHNlcnZlciB1cmwgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGlmIChpc05hTihlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikpIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgdHlwZW9mIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2VtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiAhZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKGZpbGVVcGxvYWQgPT0gbnVsbCB8fCB0eXBlb2YgZmlsZVVwbG9hZCAhPT0gJ29iamVjdCcgfHwgZmlsZVVwbG9hZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHRocm93ICdmaWxlVXBsb2FkIG11c3QgYmUgYW4gb2JqZWN0IHZhbHVlLic7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBSZWZlcmVuY2VFcnJvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckFub255bW91c1VzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JQdWJsaWMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID0gRmlsZVVwbG9hZE9wdGlvbnMuZmlsZUV4dGVuc2lvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMpKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSXBzKGZpZWxkLCBtYXN0ZXJLZXlJcHMpIHtcbiAgICBmb3IgKGxldCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmIChpcC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIGlwID0gaXAuc3BsaXQoJy8nKVswXTtcbiAgICAgIH1cbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBUaGUgUGFyc2UgU2VydmVyIG9wdGlvbiBcIiR7ZmllbGR9XCIgY29udGFpbnMgYW4gaW52YWxpZCBJUCBhZGRyZXNzIFwiJHtpcH1cIi5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpIHtcbiAgICBpZiAoZGVmYXVsdExpbWl0ID09IG51bGwpIHtcbiAgICAgIGRlZmF1bHRMaW1pdCA9IFBhcnNlU2VydmVyT3B0aW9ucy5kZWZhdWx0TGltaXQuZGVmYXVsdDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBkZWZhdWx0TGltaXQgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgbnVtYmVyLic7XG4gICAgfVxuICAgIGlmIChkZWZhdWx0TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpIHtcbiAgICBpZiAobWF4TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ01heCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKSB7XG4gICAgaWYgKCFbbnVsbCwgdW5kZWZpbmVkXS5pbmNsdWRlcyhhbGxvd0hlYWRlcnMpKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShhbGxvd0hlYWRlcnMpKSB7XG4gICAgICAgIGFsbG93SGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBoZWFkZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG9ubHkgY29udGFpbiBzdHJpbmdzJztcbiAgICAgICAgICB9IGVsc2UgaWYgKCFoZWFkZXIudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBub3QgY29udGFpbiBlbXB0eSBzdHJpbmdzJztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBiZSBhbiBhcnJheSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKExvZ0xldmVscykpIHtcbiAgICAgIGlmIChsb2dMZXZlbHNba2V5XSkge1xuICAgICAgICBpZiAodmFsaWRMb2dMZXZlbHMuaW5kZXhPZihsb2dMZXZlbHNba2V5XSkgPT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgYCcke2tleX0nIG11c3QgYmUgb25lIG9mICR7SlNPTi5zdHJpbmdpZnkodmFsaWRMb2dMZXZlbHMpfWA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ0xldmVsc1trZXldID0gTG9nTGV2ZWxzW2tleV0uZGVmYXVsdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMoZGF0YWJhc2VPcHRpb25zKSB7XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucyA9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhYmFzZU9wdGlvbnMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucyBtdXN0IGJlIGFuIG9iamVjdGA7XG4gICAgfVxuXG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPSBEYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgfVxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID0gRGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KSB7XG4gICAgaWYgKCFyYXRlTGltaXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHJhdGVMaW1pdCkgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShyYXRlTGltaXQpXG4gICAgKSB7XG4gICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb3Igb2JqZWN0YDtcbiAgICB9XG4gICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob3B0aW9uKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9mIG9iamVjdHNgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0UGF0aCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAmJiB0eXBlb2Ygb3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RDb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0Q291bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAmJiB0eXBlb2Ygb3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmVycm9yUmVzcG9uc2VNZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgY29uc3Qgb3B0aW9ucyA9IE9iamVjdC5rZXlzKFBhcnNlU2VydmVyLlJhdGVMaW1pdFpvbmUpO1xuICAgICAgaWYgKG9wdGlvbi56b25lICYmICFvcHRpb25zLmluY2x1ZGVzKG9wdGlvbi56b25lKSkge1xuICAgICAgICBjb25zdCBmb3JtYXR0ZXIgPSBuZXcgSW50bC5MaXN0Rm9ybWF0KCdlbicsIHsgc3R5bGU6ICdzaG9ydCcsIHR5cGU6ICdkaXNqdW5jdGlvbicgfSk7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuem9uZSBtdXN0IGJlIG9uZSBvZiAke2Zvcm1hdHRlci5mb3JtYXQob3B0aW9ucyl9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgdW5yZWdpc3RlclJhdGVMaW1pdGVycygpIHtcbiAgICBsZXQgaSA9IHRoaXMucmF0ZUxpbWl0cz8ubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIGNvbnN0IGxpbWl0ID0gdGhpcy5yYXRlTGltaXRzW2ldO1xuICAgICAgaWYgKGxpbWl0LmNsb3VkKSB7XG4gICAgICAgIHRoaXMucmF0ZUxpbWl0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIC8vIFRPRE86IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgUGFnZXNSb3V0ZXIgcmVwbGFjZXMgdGhlIFB1YmxpY0FQSVJvdXRlcjtcbiAgLy8gdGhlIChkZWZhdWx0KSBlbmRwb2ludCBoYXMgdG8gYmUgZGVmaW5lZCBpbiBQYWdlc1JvdXRlciBvbmx5LlxuICBnZXQgcGFnZXNFbmRwb2ludCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYWdlcyAmJiB0aGlzLnBhZ2VzLmVuYWJsZVJvdXRlciAmJiB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgID8gdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA6ICdhcHBzJztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25maWc7XG5tb2R1bGUuZXhwb3J0cyA9IENvbmZpZztcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBSUEsSUFBQUEsT0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsSUFBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsTUFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUksbUJBQUEsR0FBQUYsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFLLGlCQUFBLEdBQUFMLE9BQUE7QUFDQSxJQUFBTSxRQUFBLEdBQUFOLE9BQUE7QUFDQSxJQUFBTyxZQUFBLEdBQUFQLE9BQUE7QUFXQSxJQUFBUSxNQUFBLEdBQUFOLHNCQUFBLENBQUFGLE9BQUE7QUFBb0QsU0FBQUUsdUJBQUFPLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFyQnBEO0FBQ0E7QUFDQTs7QUFxQkEsU0FBU0csbUJBQW1CQSxDQUFDQyxHQUFHLEVBQUU7RUFDaEMsSUFBSSxDQUFDQSxHQUFHLEVBQUU7SUFDUixPQUFPQSxHQUFHO0VBQ1o7RUFDQSxJQUFJQSxHQUFHLENBQUNDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUNyQkQsR0FBRyxHQUFHQSxHQUFHLENBQUNFLFNBQVMsQ0FBQyxDQUFDLEVBQUVGLEdBQUcsQ0FBQ0csTUFBTSxHQUFHLENBQUMsQ0FBQztFQUN4QztFQUNBLE9BQU9ILEdBQUc7QUFDWjtBQUVPLE1BQU1JLE1BQU0sQ0FBQztFQUNsQixPQUFPQyxHQUFHQSxDQUFDQyxhQUFxQixFQUFFQyxLQUFhLEVBQUU7SUFDL0MsTUFBTUMsU0FBUyxHQUFHQyxjQUFRLENBQUNKLEdBQUcsQ0FBQ0MsYUFBYSxDQUFDO0lBQzdDLElBQUksQ0FBQ0UsU0FBUyxFQUFFO01BQ2Q7SUFDRjtJQUNBLE1BQU1FLE1BQU0sR0FBRyxJQUFJTixNQUFNLENBQUMsQ0FBQztJ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