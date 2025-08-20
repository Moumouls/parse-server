"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PagesRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var _Config = _interopRequireDefault(require("../Config"));
var _express = _interopRequireDefault(require("express"));
var _path = _interopRequireDefault(require("path"));
var _fs = require("fs");
var _node = require("parse/node");
var _Utils = _interopRequireDefault(require("../Utils"));
var _mustache = _interopRequireDefault(require("mustache"));
var _Page = _interopRequireDefault(require("../Page"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// All pages with custom page key for reference and file name
const pages = Object.freeze({
  passwordReset: new _Page.default({
    id: 'passwordReset',
    defaultFile: 'password_reset.html'
  }),
  passwordResetSuccess: new _Page.default({
    id: 'passwordResetSuccess',
    defaultFile: 'password_reset_success.html'
  }),
  passwordResetLinkInvalid: new _Page.default({
    id: 'passwordResetLinkInvalid',
    defaultFile: 'password_reset_link_invalid.html'
  }),
  emailVerificationSuccess: new _Page.default({
    id: 'emailVerificationSuccess',
    defaultFile: 'email_verification_success.html'
  }),
  emailVerificationSendFail: new _Page.default({
    id: 'emailVerificationSendFail',
    defaultFile: 'email_verification_send_fail.html'
  }),
  emailVerificationSendSuccess: new _Page.default({
    id: 'emailVerificationSendSuccess',
    defaultFile: 'email_verification_send_success.html'
  }),
  emailVerificationLinkInvalid: new _Page.default({
    id: 'emailVerificationLinkInvalid',
    defaultFile: 'email_verification_link_invalid.html'
  }),
  emailVerificationLinkExpired: new _Page.default({
    id: 'emailVerificationLinkExpired',
    defaultFile: 'email_verification_link_expired.html'
  })
});

// All page parameters for reference to be used as template placeholders or query params
const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl'
});

// The header prefix to add page params as response headers
const pageParamHeaderPrefix = 'x-parse-page-param-';

// The errors being thrown
const errors = Object.freeze({
  jsonFailedFileLoading: 'failed to load JSON file',
  fileOutsideAllowedScope: 'not allowed to read file outside of pages directory'
});
class PagesRouter extends _PromiseRouter.default {
  /**
   * Constructs a PagesRouter.
   * @param {Object} pages The pages options from the Parse Server configuration.
   */
  constructor(pages = {}) {
    super();

    // Set instance properties
    this.pagesConfig = pages;
    this.pagesEndpoint = pages.pagesEndpoint ? pages.pagesEndpoint : 'apps';
    this.pagesPath = pages.pagesPath ? _path.default.resolve('./', pages.pagesPath) : _path.default.resolve(__dirname, '../../public');
    this.loadJsonResource();
    this.mountPagesRoutes();
    this.mountCustomRoutes();
    this.mountStaticRoute();
  }
  verifyEmail(req) {
    const config = req.config;
    const {
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!config) {
      this.invalidRequest();
    }
    if (!token) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.verifyEmail(token).then(() => {
      return this.goToPage(req, pages.emailVerificationSuccess);
    }, () => {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    });
  }
  resendVerificationEmail(req) {
    const config = req.config;
    const username = req.body?.username;
    const token = req.body?.token;
    if (!config) {
      this.invalidRequest();
    }
    if (!username && !token) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }
    const userController = config.userController;
    return userController.resendVerificationEmail(username, req, token).then(() => {
      return this.goToPage(req, pages.emailVerificationSendSuccess);
    }, () => {
      return this.goToPage(req, pages.emailVerificationSendFail);
    });
  }
  passwordReset(req) {
    const config = req.config;
    const params = {
      [pageParams.appId]: req.params.appId,
      [pageParams.appName]: config.appName,
      [pageParams.token]: req.query.token,
      [pageParams.username]: req.query.username,
      [pageParams.publicServerUrl]: config.publicServerURL
    };
    return this.goToPage(req, pages.passwordReset, params);
  }
  requestResetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if (!token) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    return config.userController.checkResetTokenValidity(token).then(() => {
      const params = {
        [pageParams.token]: token,
        [pageParams.appId]: config.applicationId,
        [pageParams.appName]: config.appName
      };
      return this.goToPage(req, pages.passwordReset, params);
    }, () => {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    });
  }
  resetPassword(req) {
    const config = req.config;
    if (!config) {
      this.invalidRequest();
    }
    const {
      new_password,
      token: rawToken
    } = req.body || {};
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;
    if ((!token || !new_password) && req.xhr === false) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }
    if (!token) {
      throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, 'Missing token');
    }
    if (!new_password) {
      throw new _node.Parse.Error(_node.Parse.Error.PASSWORD_MISSING, 'Missing password');
    }
    return config.userController.updatePassword(token, new_password).then(() => {
      return Promise.resolve({
        success: true
      });
    }, err => {
      return Promise.resolve({
        success: false,
        err
      });
    }).then(result => {
      if (req.xhr) {
        if (result.success) {
          return Promise.resolve({
            status: 200,
            response: 'Password successfully reset'
          });
        }
        if (result.err) {
          throw new _node.Parse.Error(_node.Parse.Error.OTHER_CAUSE, `${result.err}`);
        }
      }
      const query = result.success ? {} : {
        [pageParams.token]: token,
        [pageParams.appId]: config.applicationId,
        [pageParams.error]: result.err,
        [pageParams.appName]: config.appName
      };
      if (result?.err === 'The password reset link has expired') {
        delete query[pageParams.token];
        query[pageParams.token] = token;
      }
      const page = result.success ? pages.passwordResetSuccess : pages.passwordReset;
      return this.goToPage(req, page, query, false);
    });
  }

  /**
   * Returns page content if the page is a local file or returns a
   * redirect to a custom page.
   * @param {Object} req The express request.
   * @param {Page} page The page to go to.
   * @param {Object} [params={}] The query parameters to attach to the URL in case of
   * HTTP redirect responses for POST requests, or the placeholders to fill into
   * the response content in case of HTTP content responses for GET requests.
   * @param {Boolean} [responseType] Is true if a redirect response should be forced,
   * false if a content response should be forced, undefined if the response type
   * should depend on the request type by default:
   * - GET request -> content response
   * - POST request -> redirect response (PRG pattern)
   * @returns {Promise<Object>} The PromiseRouter response.
   */
  goToPage(req, page, params = {}, responseType) {
    const config = req.config;

    // Determine redirect either by force, response setting or request method
    const redirect = config.pages.forceRedirect ? true : responseType !== undefined ? responseType : req.method == 'POST';

    // Include default parameters
    const defaultParams = this.getDefaultParams(config);
    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }
    params = Object.assign(params, defaultParams);

    // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> password_reset_success
    const locale = this.getLocale(req);
    params[pageParams.locale] = locale;

    // Compose paths and URLs
    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL);

    // If custom URL is set redirect to it without localization
    const customUrl = config.pages.customUrls[page.id];
    if (customUrl && !_Utils.default.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    }

    // Get JSON placeholders
    let placeholders = {};
    if (config.pages.enableLocalization && config.pages.localizationJsonPath) {
      placeholders = this.getJsonPlaceholders(locale, params);
    }

    // Send response
    if (config.pages.enableLocalization && locale) {
      return _Utils.default.getLocalizedPath(defaultPath, locale).then(({
        path,
        subdir
      }) => redirect ? this.redirectResponse(this.composePageUrl(defaultFile, config.publicServerURL, subdir), params) : this.pageResponse(path, params, placeholders));
    } else {
      return redirect ? this.redirectResponse(defaultUrl, params) : this.pageResponse(defaultPath, params, placeholders);
    }
  }

  /**
   * Serves a request to a static resource and localizes the resource if it
   * is a HTML file.
   * @param {Object} req The request object.
   * @returns {Promise<Object>} The response.
   */
  staticRoute(req) {
    // Get requested path
    const relativePath = req.params['resource'][0];

    // Resolve requested path to absolute path
    const absolutePath = _path.default.resolve(this.pagesPath, relativePath);

    // If the requested file is not a HTML file send its raw content
    if (!absolutePath || !absolutePath.endsWith('.html')) {
      return this.fileResponse(absolutePath);
    }

    // Get parameters
    const params = this.getDefaultParams(req.config);
    const locale = this.getLocale(req);
    if (locale) {
      params.locale = locale;
    }

    // Get JSON placeholders
    const placeholders = this.getJsonPlaceholders(locale, params);
    return this.pageResponse(absolutePath, params, placeholders);
  }

  /**
   * Returns a translation from the JSON resource for a given locale. The JSON
   * resource is parsed according to i18next syntax.
   *
   * Example JSON content:
   * ```js
   *  {
   *    "en": {               // resource for language `en` (English)
   *      "translation": {
   *        "greeting": "Hello!"
   *      }
   *    },
   *    "de": {               // resource for language `de` (German)
   *      "translation": {
   *        "greeting": "Hallo!"
   *      }
   *    }
   *    "de-CH": {            // resource for locale `de-CH` (Swiss German)
   *      "translation": {
   *        "greeting": "Grüezi!"
   *      }
   *    }
   *  }
   * ```
   * @param {String} locale The locale to translate to.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonTranslation(locale) {
    // If there is no JSON resource
    if (this.jsonParameters === undefined) {
      return {};
    }

    // If locale is not set use the fallback locale
    locale = locale || this.pagesConfig.localizationFallbackLocale;

    // Get matching translation by locale, language or fallback locale
    const language = locale.split('-')[0];
    const resource = this.jsonParameters[locale] || this.jsonParameters[language] || this.jsonParameters[this.pagesConfig.localizationFallbackLocale] || {};
    const translation = resource.translation || {};
    return translation;
  }

  /**
   * Returns a translation from the JSON resource for a given locale with
   * placeholders filled in by given parameters.
   * @param {String} locale The locale to translate to.
   * @param {Object} params The parameters to fill into any placeholders
   * within the translations.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonPlaceholders(locale, params = {}) {
    // If localization is disabled or there is no JSON resource
    if (!this.pagesConfig.enableLocalization || !this.pagesConfig.localizationJsonPath) {
      return {};
    }

    // Get JSON placeholders
    let placeholders = this.getJsonTranslation(locale);

    // Fill in any placeholders in the translation; this allows a translation
    // to contain default placeholders like {{appName}} which are filled here
    placeholders = JSON.stringify(placeholders);
    placeholders = _mustache.default.render(placeholders, params);
    placeholders = JSON.parse(placeholders);
    return placeholders;
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @param {Object} [params={}] The parameters to be included in the response
   * header. These will also be used to fill placeholders.
   * @param {Object} [placeholders={}] The placeholders to fill in the content.
   * These will not be included in the response header.
   * @returns {Object} The Promise Router response.
   */
  async pageResponse(path, params = {}, placeholders = {}) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch (e) {
      return this.notFound();
    }

    // Get config placeholders; can be an object, a function or an async function
    let configPlaceholders = typeof this.pagesConfig.placeholders === 'function' ? this.pagesConfig.placeholders(params) : Object.prototype.toString.call(this.pagesConfig.placeholders) === '[object Object]' ? this.pagesConfig.placeholders : {};
    if (configPlaceholders instanceof Promise) {
      configPlaceholders = await configPlaceholders;
    }

    // Fill placeholders
    const allPlaceholders = Object.assign({}, configPlaceholders, placeholders);
    const paramsAndPlaceholders = Object.assign({}, params, allPlaceholders);
    data = _mustache.default.render(data, paramsAndPlaceholders);

    // Add placeholders in header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});
    return {
      text: data,
      headers: headers
    };
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @returns {Object} The PromiseRouter response.
   */
  async fileResponse(path) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch (e) {
      return this.notFound();
    }
    return {
      text: data
    };
  }

  /**
   * Reads and returns the content of a file at a given path. File reading to
   * serve content on the static route is only allowed from the pages
   * directory on downwards.
   * -----------------------------------------------------------------------
   * **WARNING:** All file reads in the PagesRouter must be executed by this
   * wrapper because it also detects and prevents common exploits.
   * -----------------------------------------------------------------------
   * @param {String} filePath The path to the file to read.
   * @returns {Promise<String>} The file content.
   */
  async readFile(filePath) {
    // Normalize path to prevent it from containing any directory changing
    // UNIX patterns which could expose the whole file system, e.g.
    // `http://example.com/parse/apps/../file.txt` requests a file outside
    // of the pages directory scope.
    const normalizedPath = _path.default.normalize(filePath);

    // Abort if the path is outside of the path directory scope
    if (!normalizedPath.startsWith(this.pagesPath)) {
      throw errors.fileOutsideAllowedScope;
    }
    return await _fs.promises.readFile(normalizedPath, 'utf-8');
  }

  /**
   * Loads a language resource JSON file that is used for translations.
   */
  loadJsonResource() {
    if (this.pagesConfig.localizationJsonPath === undefined) {
      return;
    }
    try {
      const json = require(_path.default.resolve('./', this.pagesConfig.localizationJsonPath));
      this.jsonParameters = json;
    } catch (e) {
      throw errors.jsonFailedFileLoading;
    }
  }

  /**
   * Extracts and returns the page default parameters from the Parse Server
   * configuration. These parameters are made accessible in every page served
   * by this router.
   * @param {Object} config The Parse Server configuration.
   * @returns {Object} The default parameters.
   */
  getDefaultParams(config) {
    return config ? {
      [pageParams.appId]: config.appId,
      [pageParams.appName]: config.appName,
      [pageParams.publicServerUrl]: config.publicServerURL
    } : {};
  }

  /**
   * Extracts and returns the locale from an express request.
   * @param {Object} req The express request.
   * @returns {String|undefined} The locale, or undefined if no locale was set.
   */
  getLocale(req) {
    const locale = (req.query || {})[pageParams.locale] || (req.body || {})[pageParams.locale] || (req.params || {})[pageParams.locale] || (req.headers || {})[pageParamHeaderPrefix + pageParams.locale];
    return locale;
  }

  /**
   * Creates a response with http redirect.
   * @param {Object} req The express request.
   * @param {String} path The path of the file to return.
   * @param {Object} params The query parameters to include.
   * @returns {Object} The Promise Router response.
   */
  async redirectResponse(url, params) {
    // Remove any parameters with undefined value
    params = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[p[0]] = p[1];
      }
      return m;
    }, {});

    // Compose URL with parameters in query
    const location = new URL(url);
    Object.entries(params).forEach(p => location.searchParams.set(p[0], p[1]));
    const locationString = location.toString();

    // Add parameters to header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});
    return {
      status: 303,
      location: locationString,
      headers: headers
    };
  }
  defaultPagePath(file) {
    return _path.default.join(this.pagesPath, file);
  }
  composePageUrl(file, publicServerUrl, locale) {
    let url = publicServerUrl;
    url += url.endsWith('/') ? '' : '/';
    url += this.pagesEndpoint + '/';
    url += locale === undefined ? '' : locale + '/';
    url += file;
    return url;
  }
  notFound() {
    return {
      text: 'Not found.',
      status: 404
    };
  }
  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  /**
   * Sets the Parse Server configuration in the request object to make it
   * easily accessible throughtout request processing.
   * @param {Object} req The request.
   * @param {Boolean} failGracefully Is true if failing to set the config should
   * not result in an invalid request response. Default is `false`.
   */
  setConfig(req, failGracefully = false) {
    req.config = _Config.default.get(req.params.appId || req.query.appId);
    if (!req.config && !failGracefully) {
      this.invalidRequest();
    }
    return Promise.resolve();
  }
  mountPagesRoutes() {
    this.route('GET', `/${this.pagesEndpoint}/:appId/verify_email`, req => {
      this.setConfig(req);
    }, req => {
      return this.verifyEmail(req);
    });
    this.route('POST', `/${this.pagesEndpoint}/:appId/resend_verification_email`, req => {
      this.setConfig(req);
    }, req => {
      return this.resendVerificationEmail(req);
    });
    this.route('GET', `/${this.pagesEndpoint}/choose_password`, req => {
      this.setConfig(req);
    }, req => {
      return this.passwordReset(req);
    });
    this.route('POST', `/${this.pagesEndpoint}/:appId/request_password_reset`, req => {
      this.setConfig(req);
    }, req => {
      return this.resetPassword(req);
    });
    this.route('GET', `/${this.pagesEndpoint}/:appId/request_password_reset`, req => {
      this.setConfig(req);
    }, req => {
      return this.requestResetPassword(req);
    });
  }
  mountCustomRoutes() {
    for (const route of this.pagesConfig.customRoutes || []) {
      this.route(route.method, `/${this.pagesEndpoint}/:appId/${route.path}`, req => {
        this.setConfig(req);
      }, async req => {
        const {
          file,
          query = {}
        } = (await route.handler(req)) || {};

        // If route handler did not return a page send 404 response
        if (!file) {
          return this.notFound();
        }

        // Send page response
        const page = new _Page.default({
          id: file,
          defaultFile: file
        });
        return this.goToPage(req, page, query, false);
      });
    }
  }
  mountStaticRoute() {
    this.route('GET', `/${this.pagesEndpoint}/*resource`, req => {
      this.setConfig(req, true);
    }, req => {
      return this.staticRoute(req);
    });
  }
  expressRouter() {
    const router = _express.default.Router();
    router.use('/', super.expressRouter());
    return router;
  }
}
exports.PagesRouter = PagesRouter;
var _default = exports.default = PagesRouter;
module.exports = {
  PagesRouter,
  pageParamHeaderPrefix,
  pageParams,
  pages
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9leHByZXNzIiwiX3BhdGgiLCJfZnMiLCJfbm9kZSIsIl9VdGlscyIsIl9tdXN0YWNoZSIsIl9QYWdlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwicGFnZXMiLCJPYmplY3QiLCJmcmVlemUiLCJwYXNzd29yZFJlc2V0IiwiUGFnZSIsImlkIiwiZGVmYXVsdEZpbGUiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCIsImVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzcyIsImVtYWlsVmVyaWZpY2F0aW9uU2VuZEZhaWwiLCJlbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzIiwiZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCIsImVtYWlsVmVyaWZpY2F0aW9uTGlua0V4cGlyZWQiLCJwYWdlUGFyYW1zIiwiYXBwTmFtZSIsImFwcElkIiwidG9rZW4iLCJ1c2VybmFtZSIsImVycm9yIiwibG9jYWxlIiwicHVibGljU2VydmVyVXJsIiwicGFnZVBhcmFtSGVhZGVyUHJlZml4IiwiZXJyb3JzIiwianNvbkZhaWxlZEZpbGVMb2FkaW5nIiwiZmlsZU91dHNpZGVBbGxvd2VkU2NvcGUiLCJQYWdlc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJjb25zdHJ1Y3RvciIsInBhZ2VzQ29uZmlnIiwicGFnZXNFbmRwb2ludCIsInBhZ2VzUGF0aCIsInBhdGgiLCJyZXNvbHZlIiwiX19kaXJuYW1lIiwibG9hZEpzb25SZXNvdXJjZSIsIm1vdW50UGFnZXNSb3V0ZXMiLCJtb3VudEN1c3RvbVJvdXRlcyIsIm1vdW50U3RhdGljUm91dGUiLCJ2ZXJpZnlFbWFpbCIsInJlcSIsImNvbmZpZyIsInJhd1Rva2VuIiwicXVlcnkiLCJ0b1N0cmluZyIsImludmFsaWRSZXF1ZXN0IiwiZ29Ub1BhZ2UiLCJ1c2VyQ29udHJvbGxlciIsInRoZW4iLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImJvZHkiLCJwYXJhbXMiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZCIsImNoZWNrUmVzZXRUb2tlblZhbGlkaXR5IiwiYXBwbGljYXRpb25JZCIsInJlc2V0UGFzc3dvcmQiLCJuZXdfcGFzc3dvcmQiLCJ4aHIiLCJQYXJzZSIsIkVycm9yIiwiT1RIRVJfQ0FVU0UiLCJQQVNTV09SRF9NSVNTSU5HIiwidXBkYXRlUGFzc3dvcmQiLCJQcm9taXNlIiwic3VjY2VzcyIsImVyciIsInJlc3VsdCIsInN0YXR1cyIsInJlc3BvbnNlIiwicGFnZSIsInJlc3BvbnNlVHlwZSIsInJlZGlyZWN0IiwiZm9yY2VSZWRpcmVjdCIsInVuZGVmaW5lZCIsIm1ldGhvZCIsImRlZmF1bHRQYXJhbXMiLCJnZXREZWZhdWx0UGFyYW1zIiwidmFsdWVzIiwiaW5jbHVkZXMiLCJub3RGb3VuZCIsImFzc2lnbiIsImdldExvY2FsZSIsImRlZmF1bHRQYXRoIiwiZGVmYXVsdFBhZ2VQYXRoIiwiZGVmYXVsdFVybCIsImNvbXBvc2VQYWdlVXJsIiwiY3VzdG9tVXJsIiwiY3VzdG9tVXJscyIsIlV0aWxzIiwiaXNQYXRoIiwicmVkaXJlY3RSZXNwb25zZSIsInBsYWNlaG9sZGVycyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiZ2V0SnNvblBsYWNlaG9sZGVycyIsImdldExvY2FsaXplZFBhdGgiLCJzdWJkaXIiLCJwYWdlUmVzcG9uc2UiLCJzdGF0aWNSb3V0ZSIsInJlbGF0aXZlUGF0aCIsImFic29sdXRlUGF0aCIsImVuZHNXaXRoIiwiZmlsZVJlc3BvbnNlIiwiZ2V0SnNvblRyYW5zbGF0aW9uIiwianNvblBhcmFtZXRlcnMiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsImxhbmd1YWdlIiwic3BsaXQiLCJyZXNvdXJjZSIsInRyYW5zbGF0aW9uIiwiSlNPTiIsInN0cmluZ2lmeSIsIm11c3RhY2hlIiwicmVuZGVyIiwicGFyc2UiLCJkYXRhIiwicmVhZEZpbGUiLCJjb25maWdQbGFjZWhvbGRlcnMiLCJwcm90b3R5cGUiLCJjYWxsIiwiYWxsUGxhY2Vob2xkZXJzIiwicGFyYW1zQW5kUGxhY2Vob2xkZXJzIiwiaGVhZGVycyIsImVudHJpZXMiLCJyZWR1Y2UiLCJtIiwicCIsInRvTG93ZXJDYXNlIiwidGV4dCIsImZpbGVQYXRoIiwibm9ybWFsaXplZFBhdGgiLCJub3JtYWxpemUiLCJzdGFydHNXaXRoIiwiZnMiLCJqc29uIiwidXJsIiwibG9jYXRpb24iLCJVUkwiLCJmb3JFYWNoIiwic2VhcmNoUGFyYW1zIiwic2V0IiwibG9jYXRpb25TdHJpbmciLCJmaWxlIiwiam9pbiIsIm1lc3NhZ2UiLCJzZXRDb25maWciLCJmYWlsR3JhY2VmdWxseSIsIkNvbmZpZyIsImdldCIsInJvdXRlIiwiY3VzdG9tUm91dGVzIiwiaGFuZGxlciIsImV4cHJlc3NSb3V0ZXIiLCJyb3V0ZXIiLCJleHByZXNzIiwiUm91dGVyIiwidXNlIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvUGFnZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzZXMgYXMgZnMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcbmltcG9ydCBtdXN0YWNoZSBmcm9tICdtdXN0YWNoZSc7XG5pbXBvcnQgUGFnZSBmcm9tICcuLi9QYWdlJztcblxuLy8gQWxsIHBhZ2VzIHdpdGggY3VzdG9tIHBhZ2Uga2V5IGZvciByZWZlcmVuY2UgYW5kIGZpbGUgbmFtZVxuY29uc3QgcGFnZXMgPSBPYmplY3QuZnJlZXplKHtcbiAgcGFzc3dvcmRSZXNldDogbmV3IFBhZ2UoeyBpZDogJ3Bhc3N3b3JkUmVzZXQnLCBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0Lmh0bWwnIH0pLFxuICBwYXNzd29yZFJlc2V0U3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldFN1Y2Nlc3MnLFxuICAgIGRlZmF1bHRGaWxlOiAncGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sJyxcbiAgfSksXG4gIHBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAncGFzc3dvcmRSZXNldExpbmtJbnZhbGlkJyxcbiAgICBkZWZhdWx0RmlsZTogJ3Bhc3N3b3JkX3Jlc2V0X2xpbmtfaW52YWxpZC5odG1sJyxcbiAgfSksXG4gIGVtYWlsVmVyaWZpY2F0aW9uU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TdWNjZXNzJyxcbiAgICBkZWZhdWx0RmlsZTogJ2VtYWlsX3ZlcmlmaWNhdGlvbl9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9mYWlsLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzczogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25TZW5kU3VjY2VzcycsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fc2VuZF9zdWNjZXNzLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19pbnZhbGlkLmh0bWwnLFxuICB9KSxcbiAgZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZDogbmV3IFBhZ2Uoe1xuICAgIGlkOiAnZW1haWxWZXJpZmljYXRpb25MaW5rRXhwaXJlZCcsXG4gICAgZGVmYXVsdEZpbGU6ICdlbWFpbF92ZXJpZmljYXRpb25fbGlua19leHBpcmVkLmh0bWwnLFxuICB9KSxcbn0pO1xuXG4vLyBBbGwgcGFnZSBwYXJhbWV0ZXJzIGZvciByZWZlcmVuY2UgdG8gYmUgdXNlZCBhcyB0ZW1wbGF0ZSBwbGFjZWhvbGRlcnMgb3IgcXVlcnkgcGFyYW1zXG5jb25zdCBwYWdlUGFyYW1zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGFwcE5hbWU6ICdhcHBOYW1lJyxcbiAgYXBwSWQ6ICdhcHBJZCcsXG4gIHRva2VuOiAndG9rZW4nLFxuICB1c2VybmFtZTogJ3VzZXJuYW1lJyxcbiAgZXJyb3I6ICdlcnJvcicsXG4gIGxvY2FsZTogJ2xvY2FsZScsXG4gIHB1YmxpY1NlcnZlclVybDogJ3B1YmxpY1NlcnZlclVybCcsXG59KTtcblxuLy8gVGhlIGhlYWRlciBwcmVmaXggdG8gYWRkIHBhZ2UgcGFyYW1zIGFzIHJlc3BvbnNlIGhlYWRlcnNcbmNvbnN0IHBhZ2VQYXJhbUhlYWRlclByZWZpeCA9ICd4LXBhcnNlLXBhZ2UtcGFyYW0tJztcblxuLy8gVGhlIGVycm9ycyBiZWluZyB0aHJvd25cbmNvbnN0IGVycm9ycyA9IE9iamVjdC5mcmVlemUoe1xuICBqc29uRmFpbGVkRmlsZUxvYWRpbmc6ICdmYWlsZWQgdG8gbG9hZCBKU09OIGZpbGUnLFxuICBmaWxlT3V0c2lkZUFsbG93ZWRTY29wZTogJ25vdCBhbGxvd2VkIHRvIHJlYWQgZmlsZSBvdXRzaWRlIG9mIHBhZ2VzIGRpcmVjdG9yeScsXG59KTtcblxuZXhwb3J0IGNsYXNzIFBhZ2VzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgUGFnZXNSb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYWdlcyBUaGUgcGFnZXMgb3B0aW9ucyBmcm9tIHRoZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHBhZ2VzID0ge30pIHtcbiAgICBzdXBlcigpO1xuXG4gICAgLy8gU2V0IGluc3RhbmNlIHByb3BlcnRpZXNcbiAgICB0aGlzLnBhZ2VzQ29uZmlnID0gcGFnZXM7XG4gICAgdGhpcy5wYWdlc0VuZHBvaW50ID0gcGFnZXMucGFnZXNFbmRwb2ludCA/IHBhZ2VzLnBhZ2VzRW5kcG9pbnQgOiAnYXBwcyc7XG4gICAgdGhpcy5wYWdlc1BhdGggPSBwYWdlcy5wYWdlc1BhdGhcbiAgICAgID8gcGF0aC5yZXNvbHZlKCcuLycsIHBhZ2VzLnBhZ2VzUGF0aClcbiAgICAgIDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3B1YmxpYycpO1xuICAgIHRoaXMubG9hZEpzb25SZXNvdXJjZSgpO1xuICAgIHRoaXMubW91bnRQYWdlc1JvdXRlcygpO1xuICAgIHRoaXMubW91bnRDdXN0b21Sb3V0ZXMoKTtcbiAgICB0aGlzLm1vdW50U3RhdGljUm91dGUoKTtcbiAgfVxuXG4gIHZlcmlmeUVtYWlsKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgeyB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25MaW5rSW52YWxpZCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBjb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnZlcmlmeUVtYWlsKHRva2VuKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uU3VjY2Vzcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLmVtYWlsVmVyaWZpY2F0aW9uTGlua0ludmFsaWQpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICByZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gcmVxLmJvZHk/LnVzZXJuYW1lO1xuICAgIGNvbnN0IHRva2VuID0gcmVxLmJvZHk/LnRva2VuO1xuXG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHRoaXMuaW52YWxpZFJlcXVlc3QoKTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJuYW1lICYmICF0b2tlbikge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvbkxpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSwgcmVxLCB0b2tlbikudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5lbWFpbFZlcmlmaWNhdGlvblNlbmRTdWNjZXNzKTtcbiAgICAgIH0sXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMuZW1haWxWZXJpZmljYXRpb25TZW5kRmFpbCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHBhc3N3b3JkUmVzZXQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IHJlcS5wYXJhbXMuYXBwSWQsXG4gICAgICBbcGFnZVBhcmFtcy5hcHBOYW1lXTogY29uZmlnLmFwcE5hbWUsXG4gICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHJlcS5xdWVyeS50b2tlbixcbiAgICAgIFtwYWdlUGFyYW1zLnVzZXJuYW1lXTogcmVxLnF1ZXJ5LnVzZXJuYW1lLFxuICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldCwgcGFyYW1zKTtcbiAgfVxuXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG5cbiAgICBpZiAoIWNvbmZpZykge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEucXVlcnk7XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCF0b2tlbikge1xuICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlcy5wYXNzd29yZFJlc2V0TGlua0ludmFsaWQpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXIuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodG9rZW4pLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBbcGFnZVBhcmFtcy50b2tlbl06IHRva2VuLFxuICAgICAgICAgIFtwYWdlUGFyYW1zLmFwcElkXTogY29uZmlnLmFwcGxpY2F0aW9uSWQsXG4gICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXQsIHBhcmFtcyk7XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nb1RvUGFnZShyZXEsIHBhZ2VzLnBhc3N3b3JkUmVzZXRMaW5rSW52YWxpZCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcblxuICAgIGlmICghY29uZmlnKSB7XG4gICAgICB0aGlzLmludmFsaWRSZXF1ZXN0KCk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBuZXdfcGFzc3dvcmQsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLmJvZHkgfHwge307XG4gICAgY29uc3QgdG9rZW4gPSByYXdUb2tlbiAmJiB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnID8gcmF3VG9rZW4udG9TdHJpbmcoKSA6IHJhd1Rva2VuO1xuXG4gICAgaWYgKCghdG9rZW4gfHwgIW5ld19wYXNzd29yZCkgJiYgcmVxLnhociA9PT0gZmFsc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZXMucGFzc3dvcmRSZXNldExpbmtJbnZhbGlkKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgaWYgKCFuZXdfcGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAnTWlzc2luZyBwYXNzd29yZCcpO1xuICAgIH1cblxuICAgIHJldHVybiBjb25maWcudXNlckNvbnRyb2xsZXJcbiAgICAgIC51cGRhdGVQYXNzd29yZCh0b2tlbiwgbmV3X3Bhc3N3b3JkKVxuICAgICAgLnRoZW4oXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycixcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlcS54aHIpIHtcbiAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgICAgICAgcmVzcG9uc2U6ICdQYXNzd29yZCBzdWNjZXNzZnVsbHkgcmVzZXQnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXN1bHQuZXJyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGAke3Jlc3VsdC5lcnJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXN1bHQuc3VjY2Vzc1xuICAgICAgICAgID8ge31cbiAgICAgICAgICA6IHtcbiAgICAgICAgICAgIFtwYWdlUGFyYW1zLnRva2VuXTogdG9rZW4sXG4gICAgICAgICAgICBbcGFnZVBhcmFtcy5hcHBJZF06IGNvbmZpZy5hcHBsaWNhdGlvbklkLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuZXJyb3JdOiByZXN1bHQuZXJyLFxuICAgICAgICAgICAgW3BhZ2VQYXJhbXMuYXBwTmFtZV06IGNvbmZpZy5hcHBOYW1lLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgaWYgKHJlc3VsdD8uZXJyID09PSAnVGhlIHBhc3N3b3JkIHJlc2V0IGxpbmsgaGFzIGV4cGlyZWQnKSB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5W3BhZ2VQYXJhbXMudG9rZW5dO1xuICAgICAgICAgIHF1ZXJ5W3BhZ2VQYXJhbXMudG9rZW5dID0gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFnZSA9IHJlc3VsdC5zdWNjZXNzID8gcGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgOiBwYWdlcy5wYXNzd29yZFJlc2V0O1xuXG4gICAgICAgIHJldHVybiB0aGlzLmdvVG9QYWdlKHJlcSwgcGFnZSwgcXVlcnksIGZhbHNlKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgcGFnZSBjb250ZW50IGlmIHRoZSBwYWdlIGlzIGEgbG9jYWwgZmlsZSBvciByZXR1cm5zIGFcbiAgICogcmVkaXJlY3QgdG8gYSBjdXN0b20gcGFnZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge1BhZ2V9IHBhZ2UgVGhlIHBhZ2UgdG8gZ28gdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGFyYW1zPXt9XSBUaGUgcXVlcnkgcGFyYW1ldGVycyB0byBhdHRhY2ggdG8gdGhlIFVSTCBpbiBjYXNlIG9mXG4gICAqIEhUVFAgcmVkaXJlY3QgcmVzcG9uc2VzIGZvciBQT1NUIHJlcXVlc3RzLCBvciB0aGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW50b1xuICAgKiB0aGUgcmVzcG9uc2UgY29udGVudCBpbiBjYXNlIG9mIEhUVFAgY29udGVudCByZXNwb25zZXMgZm9yIEdFVCByZXF1ZXN0cy5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbcmVzcG9uc2VUeXBlXSBJcyB0cnVlIGlmIGEgcmVkaXJlY3QgcmVzcG9uc2Ugc2hvdWxkIGJlIGZvcmNlZCxcbiAgICogZmFsc2UgaWYgYSBjb250ZW50IHJlc3BvbnNlIHNob3VsZCBiZSBmb3JjZWQsIHVuZGVmaW5lZCBpZiB0aGUgcmVzcG9uc2UgdHlwZVxuICAgKiBzaG91bGQgZGVwZW5kIG9uIHRoZSByZXF1ZXN0IHR5cGUgYnkgZGVmYXVsdDpcbiAgICogLSBHRVQgcmVxdWVzdCAtPiBjb250ZW50IHJlc3BvbnNlXG4gICAqIC0gUE9TVCByZXF1ZXN0IC0+IHJlZGlyZWN0IHJlc3BvbnNlIChQUkcgcGF0dGVybilcbiAgICogQHJldHVybnMge1Byb21pc2U8T2JqZWN0Pn0gVGhlIFByb21pc2VSb3V0ZXIgcmVzcG9uc2UuXG4gICAqL1xuICBnb1RvUGFnZShyZXEsIHBhZ2UsIHBhcmFtcyA9IHt9LCByZXNwb25zZVR5cGUpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHJlZGlyZWN0IGVpdGhlciBieSBmb3JjZSwgcmVzcG9uc2Ugc2V0dGluZyBvciByZXF1ZXN0IG1ldGhvZFxuICAgIGNvbnN0IHJlZGlyZWN0ID0gY29uZmlnLnBhZ2VzLmZvcmNlUmVkaXJlY3RcbiAgICAgID8gdHJ1ZVxuICAgICAgOiByZXNwb25zZVR5cGUgIT09IHVuZGVmaW5lZFxuICAgICAgICA/IHJlc3BvbnNlVHlwZVxuICAgICAgICA6IHJlcS5tZXRob2QgPT0gJ1BPU1QnO1xuXG4gICAgLy8gSW5jbHVkZSBkZWZhdWx0IHBhcmFtZXRlcnNcbiAgICBjb25zdCBkZWZhdWx0UGFyYW1zID0gdGhpcy5nZXREZWZhdWx0UGFyYW1zKGNvbmZpZyk7XG4gICAgaWYgKE9iamVjdC52YWx1ZXMoZGVmYXVsdFBhcmFtcykuaW5jbHVkZXModW5kZWZpbmVkKSkge1xuICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICB9XG4gICAgcGFyYW1zID0gT2JqZWN0LmFzc2lnbihwYXJhbXMsIGRlZmF1bHRQYXJhbXMpO1xuXG4gICAgLy8gQWRkIGxvY2FsZSB0byBwYXJhbXMgdG8gZW5zdXJlIGl0IGlzIHBhc3NlZCBvbiB3aXRoIGV2ZXJ5IHJlcXVlc3Q7XG4gICAgLy8gdGhhdCBtZWFucywgb25jZSBhIGxvY2FsZSBpcyBzZXQsIGl0IGlzIHBhc3NlZCBvbiB0byBhbnkgZm9sbG93LXVwIHBhZ2UsXG4gICAgLy8gZS5nLiByZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0IC0+IHBhc3N3b3JkX3Jlc2V0IC0+IHBhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3NcbiAgICBjb25zdCBsb2NhbGUgPSB0aGlzLmdldExvY2FsZShyZXEpO1xuICAgIHBhcmFtc1twYWdlUGFyYW1zLmxvY2FsZV0gPSBsb2NhbGU7XG5cbiAgICAvLyBDb21wb3NlIHBhdGhzIGFuZCBVUkxzXG4gICAgY29uc3QgZGVmYXVsdEZpbGUgPSBwYWdlLmRlZmF1bHRGaWxlO1xuICAgIGNvbnN0IGRlZmF1bHRQYXRoID0gdGhpcy5kZWZhdWx0UGFnZVBhdGgoZGVmYXVsdEZpbGUpO1xuICAgIGNvbnN0IGRlZmF1bHRVcmwgPSB0aGlzLmNvbXBvc2VQYWdlVXJsKGRlZmF1bHRGaWxlLCBjb25maWcucHVibGljU2VydmVyVVJMKTtcblxuICAgIC8vIElmIGN1c3RvbSBVUkwgaXMgc2V0IHJlZGlyZWN0IHRvIGl0IHdpdGhvdXQgbG9jYWxpemF0aW9uXG4gICAgY29uc3QgY3VzdG9tVXJsID0gY29uZmlnLnBhZ2VzLmN1c3RvbVVybHNbcGFnZS5pZF07XG4gICAgaWYgKGN1c3RvbVVybCAmJiAhVXRpbHMuaXNQYXRoKGN1c3RvbVVybCkpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0UmVzcG9uc2UoY3VzdG9tVXJsLCBwYXJhbXMpO1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGxldCBwbGFjZWhvbGRlcnMgPSB7fTtcbiAgICBpZiAoY29uZmlnLnBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiAmJiBjb25maWcucGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGgpIHtcbiAgICAgIHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyk7XG4gICAgfVxuXG4gICAgLy8gU2VuZCByZXNwb25zZVxuICAgIGlmIChjb25maWcucGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uICYmIGxvY2FsZSkge1xuICAgICAgcmV0dXJuIFV0aWxzLmdldExvY2FsaXplZFBhdGgoZGVmYXVsdFBhdGgsIGxvY2FsZSkudGhlbigoeyBwYXRoLCBzdWJkaXIgfSkgPT5cbiAgICAgICAgcmVkaXJlY3RcbiAgICAgICAgICA/IHRoaXMucmVkaXJlY3RSZXNwb25zZShcbiAgICAgICAgICAgIHRoaXMuY29tcG9zZVBhZ2VVcmwoZGVmYXVsdEZpbGUsIGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsIHN1YmRpciksXG4gICAgICAgICAgICBwYXJhbXNcbiAgICAgICAgICApXG4gICAgICAgICAgOiB0aGlzLnBhZ2VSZXNwb25zZShwYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycylcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByZWRpcmVjdFxuICAgICAgICA/IHRoaXMucmVkaXJlY3RSZXNwb25zZShkZWZhdWx0VXJsLCBwYXJhbXMpXG4gICAgICAgIDogdGhpcy5wYWdlUmVzcG9uc2UoZGVmYXVsdFBhdGgsIHBhcmFtcywgcGxhY2Vob2xkZXJzKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2VydmVzIGEgcmVxdWVzdCB0byBhIHN0YXRpYyByZXNvdXJjZSBhbmQgbG9jYWxpemVzIHRoZSByZXNvdXJjZSBpZiBpdFxuICAgKiBpcyBhIEhUTUwgZmlsZS5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdCBvYmplY3QuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPE9iamVjdD59IFRoZSByZXNwb25zZS5cbiAgICovXG4gIHN0YXRpY1JvdXRlKHJlcSkge1xuICAgIC8vIEdldCByZXF1ZXN0ZWQgcGF0aFxuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHJlcS5wYXJhbXNbJ3Jlc291cmNlJ11bMF07XG5cbiAgICAvLyBSZXNvbHZlIHJlcXVlc3RlZCBwYXRoIHRvIGFic29sdXRlIHBhdGhcbiAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSBwYXRoLnJlc29sdmUodGhpcy5wYWdlc1BhdGgsIHJlbGF0aXZlUGF0aCk7XG5cbiAgICAvLyBJZiB0aGUgcmVxdWVzdGVkIGZpbGUgaXMgbm90IGEgSFRNTCBmaWxlIHNlbmQgaXRzIHJhdyBjb250ZW50XG4gICAgaWYgKCFhYnNvbHV0ZVBhdGggfHwgIWFic29sdXRlUGF0aC5lbmRzV2l0aCgnLmh0bWwnKSkge1xuICAgICAgcmV0dXJuIHRoaXMuZmlsZVJlc3BvbnNlKGFic29sdXRlUGF0aCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IHBhcmFtZXRlcnNcbiAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmdldERlZmF1bHRQYXJhbXMocmVxLmNvbmZpZyk7XG4gICAgY29uc3QgbG9jYWxlID0gdGhpcy5nZXRMb2NhbGUocmVxKTtcbiAgICBpZiAobG9jYWxlKSB7XG4gICAgICBwYXJhbXMubG9jYWxlID0gbG9jYWxlO1xuICAgIH1cblxuICAgIC8vIEdldCBKU09OIHBsYWNlaG9sZGVyc1xuICAgIGNvbnN0IHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyk7XG5cbiAgICByZXR1cm4gdGhpcy5wYWdlUmVzcG9uc2UoYWJzb2x1dGVQYXRoLCBwYXJhbXMsIHBsYWNlaG9sZGVycyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHRyYW5zbGF0aW9uIGZyb20gdGhlIEpTT04gcmVzb3VyY2UgZm9yIGEgZ2l2ZW4gbG9jYWxlLiBUaGUgSlNPTlxuICAgKiByZXNvdXJjZSBpcyBwYXJzZWQgYWNjb3JkaW5nIHRvIGkxOG5leHQgc3ludGF4LlxuICAgKlxuICAgKiBFeGFtcGxlIEpTT04gY29udGVudDpcbiAgICogYGBganNcbiAgICogIHtcbiAgICogICAgXCJlblwiOiB7ICAgICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxhbmd1YWdlIGBlbmAgKEVuZ2xpc2gpXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiSGVsbG8hXCJcbiAgICogICAgICB9XG4gICAqICAgIH0sXG4gICAqICAgIFwiZGVcIjogeyAgICAgICAgICAgICAgIC8vIHJlc291cmNlIGZvciBsYW5ndWFnZSBgZGVgIChHZXJtYW4pXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiSGFsbG8hXCJcbiAgICogICAgICB9XG4gICAqICAgIH1cbiAgICogICAgXCJkZS1DSFwiOiB7ICAgICAgICAgICAgLy8gcmVzb3VyY2UgZm9yIGxvY2FsZSBgZGUtQ0hgIChTd2lzcyBHZXJtYW4pXG4gICAqICAgICAgXCJ0cmFuc2xhdGlvblwiOiB7XG4gICAqICAgICAgICBcImdyZWV0aW5nXCI6IFwiR3LDvGV6aSFcIlxuICAgKiAgICAgIH1cbiAgICogICAgfVxuICAgKiAgfVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlIHRvIHRyYW5zbGF0ZSB0by5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHRyYW5zbGF0aW9uIG9yIGFuIGVtcHR5IG9iamVjdCBpZiBubyBtYXRjaGluZ1xuICAgKiB0cmFuc2xhdGlvbiB3YXMgZm91bmQuXG4gICAqL1xuICBnZXRKc29uVHJhbnNsYXRpb24obG9jYWxlKSB7XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gSlNPTiByZXNvdXJjZVxuICAgIGlmICh0aGlzLmpzb25QYXJhbWV0ZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICAvLyBJZiBsb2NhbGUgaXMgbm90IHNldCB1c2UgdGhlIGZhbGxiYWNrIGxvY2FsZVxuICAgIGxvY2FsZSA9IGxvY2FsZSB8fCB0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlO1xuXG4gICAgLy8gR2V0IG1hdGNoaW5nIHRyYW5zbGF0aW9uIGJ5IGxvY2FsZSwgbGFuZ3VhZ2Ugb3IgZmFsbGJhY2sgbG9jYWxlXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSBsb2NhbGUuc3BsaXQoJy0nKVswXTtcbiAgICBjb25zdCByZXNvdXJjZSA9XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW2xvY2FsZV0gfHxcbiAgICAgIHRoaXMuanNvblBhcmFtZXRlcnNbbGFuZ3VhZ2VdIHx8XG4gICAgICB0aGlzLmpzb25QYXJhbWV0ZXJzW3RoaXMucGFnZXNDb25maWcubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGVdIHx8XG4gICAgICB7fTtcbiAgICBjb25zdCB0cmFuc2xhdGlvbiA9IHJlc291cmNlLnRyYW5zbGF0aW9uIHx8IHt9O1xuICAgIHJldHVybiB0cmFuc2xhdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdHJhbnNsYXRpb24gZnJvbSB0aGUgSlNPTiByZXNvdXJjZSBmb3IgYSBnaXZlbiBsb2NhbGUgd2l0aFxuICAgKiBwbGFjZWhvbGRlcnMgZmlsbGVkIGluIGJ5IGdpdmVuIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsb2NhbGUgVGhlIGxvY2FsZSB0byB0cmFuc2xhdGUgdG8uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMgdG8gZmlsbCBpbnRvIGFueSBwbGFjZWhvbGRlcnNcbiAgICogd2l0aGluIHRoZSB0cmFuc2xhdGlvbnMuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSB0cmFuc2xhdGlvbiBvciBhbiBlbXB0eSBvYmplY3QgaWYgbm8gbWF0Y2hpbmdcbiAgICogdHJhbnNsYXRpb24gd2FzIGZvdW5kLlxuICAgKi9cbiAgZ2V0SnNvblBsYWNlaG9sZGVycyhsb2NhbGUsIHBhcmFtcyA9IHt9KSB7XG4gICAgLy8gSWYgbG9jYWxpemF0aW9uIGlzIGRpc2FibGVkIG9yIHRoZXJlIGlzIG5vIEpTT04gcmVzb3VyY2VcbiAgICBpZiAoIXRoaXMucGFnZXNDb25maWcuZW5hYmxlTG9jYWxpemF0aW9uIHx8ICF0aGlzLnBhZ2VzQ29uZmlnLmxvY2FsaXphdGlvbkpzb25QYXRoKSB7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuXG4gICAgLy8gR2V0IEpTT04gcGxhY2Vob2xkZXJzXG4gICAgbGV0IHBsYWNlaG9sZGVycyA9IHRoaXMuZ2V0SnNvblRyYW5zbGF0aW9uKGxvY2FsZSk7XG5cbiAgICAvLyBGaWxsIGluIGFueSBwbGFjZWhvbGRlcnMgaW4gdGhlIHRyYW5zbGF0aW9uOyB0aGlzIGFsbG93cyBhIHRyYW5zbGF0aW9uXG4gICAgLy8gdG8gY29udGFpbiBkZWZhdWx0IHBsYWNlaG9sZGVycyBsaWtlIHt7YXBwTmFtZX19IHdoaWNoIGFyZSBmaWxsZWQgaGVyZVxuICAgIHBsYWNlaG9sZGVycyA9IEpTT04uc3RyaW5naWZ5KHBsYWNlaG9sZGVycyk7XG4gICAgcGxhY2Vob2xkZXJzID0gbXVzdGFjaGUucmVuZGVyKHBsYWNlaG9sZGVycywgcGFyYW1zKTtcbiAgICBwbGFjZWhvbGRlcnMgPSBKU09OLnBhcnNlKHBsYWNlaG9sZGVycyk7XG5cbiAgICByZXR1cm4gcGxhY2Vob2xkZXJzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW3BhcmFtcz17fV0gVGhlIHBhcmFtZXRlcnMgdG8gYmUgaW5jbHVkZWQgaW4gdGhlIHJlc3BvbnNlXG4gICAqIGhlYWRlci4gVGhlc2Ugd2lsbCBhbHNvIGJlIHVzZWQgdG8gZmlsbCBwbGFjZWhvbGRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbcGxhY2Vob2xkZXJzPXt9XSBUaGUgcGxhY2Vob2xkZXJzIHRvIGZpbGwgaW4gdGhlIGNvbnRlbnQuXG4gICAqIFRoZXNlIHdpbGwgbm90IGJlIGluY2x1ZGVkIGluIHRoZSByZXNwb25zZSBoZWFkZXIuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHBhZ2VSZXNwb25zZShwYXRoLCBwYXJhbXMgPSB7fSwgcGxhY2Vob2xkZXJzID0ge30pIHtcbiAgICAvLyBHZXQgZmlsZSBjb250ZW50XG4gICAgbGV0IGRhdGE7XG4gICAgdHJ5IHtcbiAgICAgIGRhdGEgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHBhdGgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5vdEZvdW5kKCk7XG4gICAgfVxuXG4gICAgLy8gR2V0IGNvbmZpZyBwbGFjZWhvbGRlcnM7IGNhbiBiZSBhbiBvYmplY3QsIGEgZnVuY3Rpb24gb3IgYW4gYXN5bmMgZnVuY3Rpb25cbiAgICBsZXQgY29uZmlnUGxhY2Vob2xkZXJzID1cbiAgICAgIHR5cGVvZiB0aGlzLnBhZ2VzQ29uZmlnLnBsYWNlaG9sZGVycyA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICA/IHRoaXMucGFnZXNDb25maWcucGxhY2Vob2xkZXJzKHBhcmFtcylcbiAgICAgICAgOiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnMpID09PSAnW29iamVjdCBPYmplY3RdJ1xuICAgICAgICAgID8gdGhpcy5wYWdlc0NvbmZpZy5wbGFjZWhvbGRlcnNcbiAgICAgICAgICA6IHt9O1xuICAgIGlmIChjb25maWdQbGFjZWhvbGRlcnMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICBjb25maWdQbGFjZWhvbGRlcnMgPSBhd2FpdCBjb25maWdQbGFjZWhvbGRlcnM7XG4gICAgfVxuXG4gICAgLy8gRmlsbCBwbGFjZWhvbGRlcnNcbiAgICBjb25zdCBhbGxQbGFjZWhvbGRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBjb25maWdQbGFjZWhvbGRlcnMsIHBsYWNlaG9sZGVycyk7XG4gICAgY29uc3QgcGFyYW1zQW5kUGxhY2Vob2xkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1zLCBhbGxQbGFjZWhvbGRlcnMpO1xuICAgIGRhdGEgPSBtdXN0YWNoZS5yZW5kZXIoZGF0YSwgcGFyYW1zQW5kUGxhY2Vob2xkZXJzKTtcblxuICAgIC8vIEFkZCBwbGFjZWhvbGRlcnMgaW4gaGVhZGVyIHRvIGFsbG93IHBhcnNpbmcgZm9yIHByb2dyYW1tYXRpYyB1c2VcbiAgICAvLyBvZiByZXNwb25zZSwgaW5zdGVhZCBvZiBoYXZpbmcgdG8gcGFyc2UgdGhlIEhUTUwgY29udGVudC5cbiAgICBjb25zdCBoZWFkZXJzID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5yZWR1Y2UoKG0sIHApID0+IHtcbiAgICAgIGlmIChwWzFdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbVtgJHtwYWdlUGFyYW1IZWFkZXJQcmVmaXh9JHtwWzBdLnRvTG93ZXJDYXNlKCl9YF0gPSBwWzFdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG07XG4gICAgfSwge30pO1xuXG4gICAgcmV0dXJuIHsgdGV4dDogZGF0YSwgaGVhZGVyczogaGVhZGVycyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGZpbGUgY29udGVudC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgUHJvbWlzZVJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIGZpbGVSZXNwb25zZShwYXRoKSB7XG4gICAgLy8gR2V0IGZpbGUgY29udGVudFxuICAgIGxldCBkYXRhO1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gYXdhaXQgdGhpcy5yZWFkRmlsZShwYXRoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gdGhpcy5ub3RGb3VuZCgpO1xuICAgIH1cblxuICAgIHJldHVybiB7IHRleHQ6IGRhdGEgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkcyBhbmQgcmV0dXJucyB0aGUgY29udGVudCBvZiBhIGZpbGUgYXQgYSBnaXZlbiBwYXRoLiBGaWxlIHJlYWRpbmcgdG9cbiAgICogc2VydmUgY29udGVudCBvbiB0aGUgc3RhdGljIHJvdXRlIGlzIG9ubHkgYWxsb3dlZCBmcm9tIHRoZSBwYWdlc1xuICAgKiBkaXJlY3Rvcnkgb24gZG93bndhcmRzLlxuICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgKiAqKldBUk5JTkc6KiogQWxsIGZpbGUgcmVhZHMgaW4gdGhlIFBhZ2VzUm91dGVyIG11c3QgYmUgZXhlY3V0ZWQgYnkgdGhpc1xuICAgKiB3cmFwcGVyIGJlY2F1c2UgaXQgYWxzbyBkZXRlY3RzIGFuZCBwcmV2ZW50cyBjb21tb24gZXhwbG9pdHMuXG4gICAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlUGF0aCBUaGUgcGF0aCB0byB0aGUgZmlsZSB0byByZWFkLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxTdHJpbmc+fSBUaGUgZmlsZSBjb250ZW50LlxuICAgKi9cbiAgYXN5bmMgcmVhZEZpbGUoZmlsZVBhdGgpIHtcbiAgICAvLyBOb3JtYWxpemUgcGF0aCB0byBwcmV2ZW50IGl0IGZyb20gY29udGFpbmluZyBhbnkgZGlyZWN0b3J5IGNoYW5naW5nXG4gICAgLy8gVU5JWCBwYXR0ZXJucyB3aGljaCBjb3VsZCBleHBvc2UgdGhlIHdob2xlIGZpbGUgc3lzdGVtLCBlLmcuXG4gICAgLy8gYGh0dHA6Ly9leGFtcGxlLmNvbS9wYXJzZS9hcHBzLy4uL2ZpbGUudHh0YCByZXF1ZXN0cyBhIGZpbGUgb3V0c2lkZVxuICAgIC8vIG9mIHRoZSBwYWdlcyBkaXJlY3Rvcnkgc2NvcGUuXG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBwYXRoLm5vcm1hbGl6ZShmaWxlUGF0aCk7XG5cbiAgICAvLyBBYm9ydCBpZiB0aGUgcGF0aCBpcyBvdXRzaWRlIG9mIHRoZSBwYXRoIGRpcmVjdG9yeSBzY29wZVxuICAgIGlmICghbm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aCh0aGlzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93IGVycm9ycy5maWxlT3V0c2lkZUFsbG93ZWRTY29wZTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXdhaXQgZnMucmVhZEZpbGUobm9ybWFsaXplZFBhdGgsICd1dGYtOCcpO1xuICB9XG5cbiAgLyoqXG4gICAqIExvYWRzIGEgbGFuZ3VhZ2UgcmVzb3VyY2UgSlNPTiBmaWxlIHRoYXQgaXMgdXNlZCBmb3IgdHJhbnNsYXRpb25zLlxuICAgKi9cbiAgbG9hZEpzb25SZXNvdXJjZSgpIHtcbiAgICBpZiAodGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBqc29uID0gcmVxdWlyZShwYXRoLnJlc29sdmUoJy4vJywgdGhpcy5wYWdlc0NvbmZpZy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpO1xuICAgICAgdGhpcy5qc29uUGFyYW1ldGVycyA9IGpzb247XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhyb3cgZXJyb3JzLmpzb25GYWlsZWRGaWxlTG9hZGluZztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIHBhZ2UgZGVmYXVsdCBwYXJhbWV0ZXJzIGZyb20gdGhlIFBhcnNlIFNlcnZlclxuICAgKiBjb25maWd1cmF0aW9uLiBUaGVzZSBwYXJhbWV0ZXJzIGFyZSBtYWRlIGFjY2Vzc2libGUgaW4gZXZlcnkgcGFnZSBzZXJ2ZWRcbiAgICogYnkgdGhpcyByb3V0ZXIuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgVGhlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgZGVmYXVsdCBwYXJhbWV0ZXJzLlxuICAgKi9cbiAgZ2V0RGVmYXVsdFBhcmFtcyhjb25maWcpIHtcbiAgICByZXR1cm4gY29uZmlnXG4gICAgICA/IHtcbiAgICAgICAgW3BhZ2VQYXJhbXMuYXBwSWRdOiBjb25maWcuYXBwSWQsXG4gICAgICAgIFtwYWdlUGFyYW1zLmFwcE5hbWVdOiBjb25maWcuYXBwTmFtZSxcbiAgICAgICAgW3BhZ2VQYXJhbXMucHVibGljU2VydmVyVXJsXTogY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgIH1cbiAgICAgIDoge307XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdHMgYW5kIHJldHVybnMgdGhlIGxvY2FsZSBmcm9tIGFuIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgZXhwcmVzcyByZXF1ZXN0LlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfHVuZGVmaW5lZH0gVGhlIGxvY2FsZSwgb3IgdW5kZWZpbmVkIGlmIG5vIGxvY2FsZSB3YXMgc2V0LlxuICAgKi9cbiAgZ2V0TG9jYWxlKHJlcSkge1xuICAgIGNvbnN0IGxvY2FsZSA9XG4gICAgICAocmVxLnF1ZXJ5IHx8IHt9KVtwYWdlUGFyYW1zLmxvY2FsZV0gfHxcbiAgICAgIChyZXEuYm9keSB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLnBhcmFtcyB8fCB7fSlbcGFnZVBhcmFtcy5sb2NhbGVdIHx8XG4gICAgICAocmVxLmhlYWRlcnMgfHwge30pW3BhZ2VQYXJhbUhlYWRlclByZWZpeCArIHBhZ2VQYXJhbXMubG9jYWxlXTtcbiAgICByZXR1cm4gbG9jYWxlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSByZXNwb25zZSB3aXRoIGh0dHAgcmVkaXJlY3QuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIGV4cHJlc3MgcmVxdWVzdC5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIGZpbGUgdG8gcmV0dXJuLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBxdWVyeSBwYXJhbWV0ZXJzIHRvIGluY2x1ZGUuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBQcm9taXNlIFJvdXRlciByZXNwb25zZS5cbiAgICovXG4gIGFzeW5jIHJlZGlyZWN0UmVzcG9uc2UodXJsLCBwYXJhbXMpIHtcbiAgICAvLyBSZW1vdmUgYW55IHBhcmFtZXRlcnMgd2l0aCB1bmRlZmluZWQgdmFsdWVcbiAgICBwYXJhbXMgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLnJlZHVjZSgobSwgcCkgPT4ge1xuICAgICAgaWYgKHBbMV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBtW3BbMF1dID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIENvbXBvc2UgVVJMIHdpdGggcGFyYW1ldGVycyBpbiBxdWVyeVxuICAgIGNvbnN0IGxvY2F0aW9uID0gbmV3IFVSTCh1cmwpO1xuICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtcykuZm9yRWFjaChwID0+IGxvY2F0aW9uLnNlYXJjaFBhcmFtcy5zZXQocFswXSwgcFsxXSkpO1xuICAgIGNvbnN0IGxvY2F0aW9uU3RyaW5nID0gbG9jYXRpb24udG9TdHJpbmcoKTtcblxuICAgIC8vIEFkZCBwYXJhbWV0ZXJzIHRvIGhlYWRlciB0byBhbGxvdyBwYXJzaW5nIGZvciBwcm9ncmFtbWF0aWMgdXNlXG4gICAgLy8gb2YgcmVzcG9uc2UsIGluc3RlYWQgb2YgaGF2aW5nIHRvIHBhcnNlIHRoZSBIVE1MIGNvbnRlbnQuXG4gICAgY29uc3QgaGVhZGVycyA9IE9iamVjdC5lbnRyaWVzKHBhcmFtcykucmVkdWNlKChtLCBwKSA9PiB7XG4gICAgICBpZiAocFsxXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIG1bYCR7cGFnZVBhcmFtSGVhZGVyUHJlZml4fSR7cFswXS50b0xvd2VyQ2FzZSgpfWBdID0gcFsxXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtO1xuICAgIH0sIHt9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6IDMwMyxcbiAgICAgIGxvY2F0aW9uOiBsb2NhdGlvblN0cmluZyxcbiAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgfTtcbiAgfVxuXG4gIGRlZmF1bHRQYWdlUGF0aChmaWxlKSB7XG4gICAgcmV0dXJuIHBhdGguam9pbih0aGlzLnBhZ2VzUGF0aCwgZmlsZSk7XG4gIH1cblxuICBjb21wb3NlUGFnZVVybChmaWxlLCBwdWJsaWNTZXJ2ZXJVcmwsIGxvY2FsZSkge1xuICAgIGxldCB1cmwgPSBwdWJsaWNTZXJ2ZXJVcmw7XG4gICAgdXJsICs9IHVybC5lbmRzV2l0aCgnLycpID8gJycgOiAnLyc7XG4gICAgdXJsICs9IHRoaXMucGFnZXNFbmRwb2ludCArICcvJztcbiAgICB1cmwgKz0gbG9jYWxlID09PSB1bmRlZmluZWQgPyAnJyA6IGxvY2FsZSArICcvJztcbiAgICB1cmwgKz0gZmlsZTtcbiAgICByZXR1cm4gdXJsO1xuICB9XG5cbiAgbm90Rm91bmQoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRleHQ6ICdOb3QgZm91bmQuJyxcbiAgICAgIHN0YXR1czogNDA0LFxuICAgIH07XG4gIH1cblxuICBpbnZhbGlkUmVxdWVzdCgpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gaW4gdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIG1ha2UgaXRcbiAgICogZWFzaWx5IGFjY2Vzc2libGUgdGhyb3VnaHRvdXQgcmVxdWVzdCBwcm9jZXNzaW5nLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0LlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGZhaWxHcmFjZWZ1bGx5IElzIHRydWUgaWYgZmFpbGluZyB0byBzZXQgdGhlIGNvbmZpZyBzaG91bGRcbiAgICogbm90IHJlc3VsdCBpbiBhbiBpbnZhbGlkIHJlcXVlc3QgcmVzcG9uc2UuIERlZmF1bHQgaXMgYGZhbHNlYC5cbiAgICovXG4gIHNldENvbmZpZyhyZXEsIGZhaWxHcmFjZWZ1bGx5ID0gZmFsc2UpIHtcbiAgICByZXEuY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkIHx8IHJlcS5xdWVyeS5hcHBJZCk7XG4gICAgaWYgKCFyZXEuY29uZmlnICYmICFmYWlsR3JhY2VmdWxseSkge1xuICAgICAgdGhpcy5pbnZhbGlkUmVxdWVzdCgpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBtb3VudFBhZ2VzUm91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC92ZXJpZnlfZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlFbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3Jlc2VuZF92ZXJpZmljYXRpb25fZW1haWxgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXNlbmRWZXJpZmljYXRpb25FbWFpbChyZXEpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS9jaG9vc2VfcGFzc3dvcmRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXNzd29yZFJlc2V0KHJlcSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICBgLyR7dGhpcy5wYWdlc0VuZHBvaW50fS86YXBwSWQvcmVxdWVzdF9wYXNzd29yZF9yZXNldGAsXG4gICAgICByZXEgPT4ge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgfSxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vOmFwcElkL3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgdGhpcy5zZXRDb25maWcocmVxKTtcbiAgICAgIH0sXG4gICAgICByZXEgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXF1ZXN0UmVzZXRQYXNzd29yZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBtb3VudEN1c3RvbVJvdXRlcygpIHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMucGFnZXNDb25maWcuY3VzdG9tUm91dGVzIHx8IFtdKSB7XG4gICAgICB0aGlzLnJvdXRlKFxuICAgICAgICByb3V0ZS5tZXRob2QsXG4gICAgICAgIGAvJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LzphcHBJZC8ke3JvdXRlLnBhdGh9YCxcbiAgICAgICAgcmVxID0+IHtcbiAgICAgICAgICB0aGlzLnNldENvbmZpZyhyZXEpO1xuICAgICAgICB9LFxuICAgICAgICBhc3luYyByZXEgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgZmlsZSwgcXVlcnkgPSB7fSB9ID0gKGF3YWl0IHJvdXRlLmhhbmRsZXIocmVxKSkgfHwge307XG5cbiAgICAgICAgICAvLyBJZiByb3V0ZSBoYW5kbGVyIGRpZCBub3QgcmV0dXJuIGEgcGFnZSBzZW5kIDQwNCByZXNwb25zZVxuICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubm90Rm91bmQoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTZW5kIHBhZ2UgcmVzcG9uc2VcbiAgICAgICAgICBjb25zdCBwYWdlID0gbmV3IFBhZ2UoeyBpZDogZmlsZSwgZGVmYXVsdEZpbGU6IGZpbGUgfSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuZ29Ub1BhZ2UocmVxLCBwYWdlLCBxdWVyeSwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIG1vdW50U3RhdGljUm91dGUoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgYC8ke3RoaXMucGFnZXNFbmRwb2ludH0vKnJlc291cmNlYCxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKHJlcSwgdHJ1ZSk7XG4gICAgICB9LFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGljUm91dGUocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgZXhwcmVzc1JvdXRlcigpIHtcbiAgICBjb25zdCByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuICAgIHJvdXRlci51c2UoJy8nLCBzdXBlci5leHByZXNzUm91dGVyKCkpO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFnZXNSb3V0ZXI7XG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgUGFnZXNSb3V0ZXIsXG4gIHBhZ2VQYXJhbUhlYWRlclByZWZpeCxcbiAgcGFnZVBhcmFtcyxcbiAgcGFnZXMsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxjQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxRQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxLQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxHQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxLQUFBLEdBQUFMLE9BQUE7QUFDQSxJQUFBTSxNQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxTQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUSxLQUFBLEdBQUFULHNCQUFBLENBQUFDLE9BQUE7QUFBMkIsU0FBQUQsdUJBQUFVLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFFM0I7QUFDQSxNQUFNRyxLQUFLLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDO0VBQzFCQyxhQUFhLEVBQUUsSUFBSUMsYUFBSSxDQUFDO0lBQUVDLEVBQUUsRUFBRSxlQUFlO0lBQUVDLFdBQVcs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