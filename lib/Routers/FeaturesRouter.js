"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FeaturesRouter = void 0;
var _package = require("../../package.json");
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var middleware = _interopRequireWildcard(require("../middlewares"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class FeaturesRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/serverInfo', middleware.promiseEnforceMasterKeyAccess, req => {
      var _config$security;
      const {
        config
      } = req;
      const features = {
        globalConfig: {
          create: true,
          read: true,
          update: true,
          delete: true
        },
        hooks: {
          create: true,
          read: true,
          update: true,
          delete: true
        },
        cloudCode: {
          jobs: true
        },
        logs: {
          level: true,
          size: true,
          order: true,
          until: true,
          from: true
        },
        push: {
          immediatePush: config.hasPushSupport,
          scheduledPush: config.hasPushScheduledSupport,
          storedPushData: config.hasPushSupport,
          pushAudiences: true,
          localization: true
        },
        schemas: {
          addField: true,
          removeField: true,
          addClass: true,
          removeClass: true,
          clearAllDataFromClass: true,
          exportClass: false,
          editClassLevelPermissions: true,
          editPointerPermissions: true
        },
        settings: {
          securityCheck: !!((_config$security = config.security) !== null && _config$security !== void 0 && _config$security.enableCheck)
        }
      };
      return {
        response: {
          features: features,
          parseServerVersion: _package.version
        }
      };
    });
  }
}
exports.FeaturesRouter = FeaturesRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcGFja2FnZSIsInJlcXVpcmUiLCJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJtaWRkbGV3YXJlIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJlIiwiV2Vha01hcCIsInIiLCJ0IiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJuIiwiX19wcm90b19fIiwiYSIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwidSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImkiLCJzZXQiLCJGZWF0dXJlc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJyZXEiLCJfY29uZmlnJHNlY3VyaXR5IiwiY29uZmlnIiwiZmVhdHVyZXMiLCJnbG9iYWxDb25maWciLCJjcmVhdGUiLCJyZWFkIiwidXBkYXRlIiwiZGVsZXRlIiwiaG9va3MiLCJjbG91ZENvZGUiLCJqb2JzIiwibG9ncyIsImxldmVsIiwic2l6ZSIsIm9yZGVyIiwidW50aWwiLCJmcm9tIiwicHVzaCIsImltbWVkaWF0ZVB1c2giLCJoYXNQdXNoU3VwcG9ydCIsInNjaGVkdWxlZFB1c2giLCJoYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCIsInN0b3JlZFB1c2hEYXRhIiwicHVzaEF1ZGllbmNlcyIsImxvY2FsaXphdGlvbiIsInNjaGVtYXMiLCJhZGRGaWVsZCIsInJlbW92ZUZpZWxkIiwiYWRkQ2xhc3MiLCJyZW1vdmVDbGFzcyIsImNsZWFyQWxsRGF0YUZyb21DbGFzcyIsImV4cG9ydENsYXNzIiwiZWRpdENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImVkaXRQb2ludGVyUGVybWlzc2lvbnMiLCJzZXR0aW5ncyIsInNlY3VyaXR5Q2hlY2siLCJzZWN1cml0eSIsImVuYWJsZUNoZWNrIiwicmVzcG9uc2UiLCJwYXJzZVNlcnZlclZlcnNpb24iLCJ2ZXJzaW9uIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHZlcnNpb24gfSBmcm9tICcuLi8uLi9wYWNrYWdlLmpzb24nO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIEZlYXR1cmVzUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvc2VydmVySW5mbycsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIHJlcSA9PiB7XG4gICAgICBjb25zdCB7IGNvbmZpZyB9ID0gcmVxO1xuICAgICAgY29uc3QgZmVhdHVyZXMgPSB7XG4gICAgICAgIGdsb2JhbENvbmZpZzoge1xuICAgICAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICAgICAgICByZWFkOiB0cnVlLFxuICAgICAgICAgIHVwZGF0ZTogdHJ1ZSxcbiAgICAgICAgICBkZWxldGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGhvb2tzOiB7XG4gICAgICAgICAgY3JlYXRlOiB0cnVlLFxuICAgICAgICAgIHJlYWQ6IHRydWUsXG4gICAgICAgICAgdXBkYXRlOiB0cnVlLFxuICAgICAgICAgIGRlbGV0ZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgY2xvdWRDb2RlOiB7XG4gICAgICAgICAgam9iczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgbG9nczoge1xuICAgICAgICAgIGxldmVsOiB0cnVlLFxuICAgICAgICAgIHNpemU6IHRydWUsXG4gICAgICAgICAgb3JkZXI6IHRydWUsXG4gICAgICAgICAgdW50aWw6IHRydWUsXG4gICAgICAgICAgZnJvbTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgcHVzaDoge1xuICAgICAgICAgIGltbWVkaWF0ZVB1c2g6IGNvbmZpZy5oYXNQdXNoU3VwcG9ydCxcbiAgICAgICAgICBzY2hlZHVsZWRQdXNoOiBjb25maWcuaGFzUHVzaFNjaGVkdWxlZFN1cHBvcnQsXG4gICAgICAgICAgc3RvcmVkUHVzaERhdGE6IGNvbmZpZy5oYXNQdXNoU3VwcG9ydCxcbiAgICAgICAgICBwdXNoQXVkaWVuY2VzOiB0cnVlLFxuICAgICAgICAgIGxvY2FsaXphdGlvbjogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NoZW1hczoge1xuICAgICAgICAgIGFkZEZpZWxkOiB0cnVlLFxuICAgICAgICAgIHJlbW92ZUZpZWxkOiB0cnVlLFxuICAgICAgICAgIGFkZENsYXNzOiB0cnVlLFxuICAgICAgICAgIHJlbW92ZUNsYXNzOiB0cnVlLFxuICAgICAgICAgIGNsZWFyQWxsRGF0YUZyb21DbGFzczogdHJ1ZSxcbiAgICAgICAgICBleHBvcnRDbGFzczogZmFsc2UsXG4gICAgICAgICAgZWRpdENsYXNzTGV2ZWxQZXJtaXNzaW9uczogdHJ1ZSxcbiAgICAgICAgICBlZGl0UG9pbnRlclBlcm1pc3Npb25zOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzZXR0aW5nczoge1xuICAgICAgICAgIHNlY3VyaXR5Q2hlY2s6ICEhY29uZmlnLnNlY3VyaXR5Py5lbmFibGVDaGVjayxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgZmVhdHVyZXM6IGZlYXR1cmVzLFxuICAgICAgICAgIHBhcnNlU2VydmVyVmVyc2lvbjogdmVyc2lvbixcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxP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