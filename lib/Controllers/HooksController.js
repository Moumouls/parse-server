"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.HooksController = void 0;
var triggers = _interopRequireWildcard(require("../triggers"));
var Parse = _interopRequireWildcard(require("parse/node"));
var _request = _interopRequireDefault(require("../request"));
var _logger = require("../logger");
var _http = _interopRequireDefault(require("http"));
var _https = _interopRequireDefault(require("https"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
// -disable-next
// -disable-next
const DefaultHooksCollectionName = '_Hooks';
const HTTPAgents = {
  http: new _http.default.Agent({
    keepAlive: true
  }),
  https: new _https.default.Agent({
    keepAlive: true
  })
};
class HooksController {
  constructor(applicationId, databaseController, webhookKey) {
    this._applicationId = applicationId;
    this._webhookKey = webhookKey;
    this.database = databaseController;
  }
  load() {
    return this._getHooks().then(hooks => {
      hooks = hooks || [];
      hooks.forEach(hook => {
        this.addHookToTriggers(hook);
      });
    });
  }
  getFunction(functionName) {
    return this._getHooks({
      functionName: functionName
    }).then(results => results[0]);
  }
  getFunctions() {
    return this._getHooks({
      functionName: {
        $exists: true
      }
    });
  }
  getTrigger(className, triggerName) {
    return this._getHooks({
      className: className,
      triggerName: triggerName
    }).then(results => results[0]);
  }
  getTriggers() {
    return this._getHooks({
      className: {
        $exists: true
      },
      triggerName: {
        $exists: true
      }
    });
  }
  deleteFunction(functionName) {
    triggers.removeFunction(functionName, this._applicationId);
    return this._removeHooks({
      functionName: functionName
    });
  }
  deleteTrigger(className, triggerName) {
    triggers.removeTrigger(triggerName, className, this._applicationId);
    return this._removeHooks({
      className: className,
      triggerName: triggerName
    });
  }
  _getHooks(query = {}) {
    return this.database.find(DefaultHooksCollectionName, query).then(results => {
      return results.map(result => {
        delete result.objectId;
        return result;
      });
    });
  }
  _removeHooks(query) {
    return this.database.destroy(DefaultHooksCollectionName, query).then(() => {
      return Promise.resolve({});
    });
  }
  saveHook(hook) {
    var query;
    if (hook.functionName && hook.url) {
      query = {
        functionName: hook.functionName
      };
    } else if (hook.triggerName && hook.className && hook.url) {
      query = {
        className: hook.className,
        triggerName: hook.triggerName
      };
    } else {
      throw new Parse.Error(143, 'invalid hook declaration');
    }
    return this.database.update(DefaultHooksCollectionName, query, hook, {
      upsert: true
    }).then(() => {
      return Promise.resolve(hook);
    });
  }
  addHookToTriggers(hook) {
    var wrappedFunction = wrapToHTTPRequest(hook, this._webhookKey);
    wrappedFunction.url = hook.url;
    if (hook.className) {
      triggers.addTrigger(hook.triggerName, hook.className, wrappedFunction, this._applicationId);
    } else {
      triggers.addFunction(hook.functionName, wrappedFunction, null, this._applicationId);
    }
  }
  addHook(hook) {
    this.addHookToTriggers(hook);
    return this.saveHook(hook);
  }
  createOrUpdateHook(aHook) {
    var hook;
    if (aHook && aHook.functionName && aHook.url) {
      hook = {};
      hook.functionName = aHook.functionName;
      hook.url = aHook.url;
    } else if (aHook && aHook.className && aHook.url && aHook.triggerName && triggers.Types[aHook.triggerName]) {
      hook = {};
      hook.className = aHook.className;
      hook.url = aHook.url;
      hook.triggerName = aHook.triggerName;
    } else {
      throw new Parse.Error(143, 'invalid hook declaration');
    }
    return this.addHook(hook);
  }
  createHook(aHook) {
    if (aHook.functionName) {
      return this.getFunction(aHook.functionName).then(result => {
        if (result) {
          throw new Parse.Error(143, `function name: ${aHook.functionName} already exists`);
        } else {
          return this.createOrUpdateHook(aHook);
        }
      });
    } else if (aHook.className && aHook.triggerName) {
      return this.getTrigger(aHook.className, aHook.triggerName).then(result => {
        if (result) {
          throw new Parse.Error(143, `class ${aHook.className} already has trigger ${aHook.triggerName}`);
        }
        return this.createOrUpdateHook(aHook);
      });
    }
    throw new Parse.Error(143, 'invalid hook declaration');
  }
  updateHook(aHook) {
    if (aHook.functionName) {
      return this.getFunction(aHook.functionName).then(result => {
        if (result) {
          return this.createOrUpdateHook(aHook);
        }
        throw new Parse.Error(143, `no function named: ${aHook.functionName} is defined`);
      });
    } else if (aHook.className && aHook.triggerName) {
      return this.getTrigger(aHook.className, aHook.triggerName).then(result => {
        if (result) {
          return this.createOrUpdateHook(aHook);
        }
        throw new Parse.Error(143, `class ${aHook.className} does not exist`);
      });
    }
    throw new Parse.Error(143, 'invalid hook declaration');
  }
}
exports.HooksController = HooksController;
function wrapToHTTPRequest(hook, key) {
  return req => {
    const jsonBody = {};
    for (var i in req) {
      // Parse Server config is not serializable
      if (i === 'config') continue;
      jsonBody[i] = req[i];
    }
    if (req.object) {
      jsonBody.object = req.object.toJSON();
      jsonBody.object.className = req.object.className;
    }
    if (req.original) {
      jsonBody.original = req.original.toJSON();
      jsonBody.original.className = req.original.className;
    }
    const jsonRequest = {
      url: hook.url,
      headers: {
        'Content-Type': 'application/json'
      },
      body: jsonBody,
      method: 'POST'
    };
    const agent = hook.url.startsWith('https') ? HTTPAgents['https'] : HTTPAgents['http'];
    jsonRequest.agent = agent;
    if (key) {
      jsonRequest.headers['X-Parse-Webhook-Key'] = key;
    } else {
      _logger.logger.warn('Making outgoing webhook request without webhookKey being set!');
    }
    return (0, _request.default)(jsonRequest).then(response => {
      let err;
      let result;
      let body = response.data;
      if (body) {
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            err = {
              error: 'Malformed response',
              code: -1,
              partialResponse: body.substring(0, 100)
            };
          }
        }
        if (!err) {
          result = body.success;
          err = body.error;
        }
      }
      if (err) {
        throw err;
      } else if (hook.triggerName === 'beforeSave') {
        if (typeof result === 'object') {
          delete result.createdAt;
          delete result.updatedAt;
          delete result.className;
        }
        return {
          object: result
        };
      } else {
        return result;
      }
    });
  };
}
var _default = exports.default = HooksController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmlnZ2VycyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwicmVxdWlyZSIsIlBhcnNlIiwiX3JlcXVlc3QiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZ2dlciIsIl9odHRwIiwiX2h0dHBzIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJlIiwiV2Vha01hcCIsInIiLCJ0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0IiwiRGVmYXVsdEhvb2tzQ29sbGVjdGlvbk5hbWUiLCJIVFRQQWdlbnRzIiwiaHR0cCIsIkFnZW50Iiwia2VlcEFsaXZlIiwiaHR0cHMiLCJIb29rc0NvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFwcGxpY2F0aW9uSWQiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJ3ZWJob29rS2V5IiwiX2FwcGxpY2F0aW9uSWQiLCJfd2ViaG9va0tleSIsImRhdGFiYXNlIiwibG9hZCIsIl9nZXRIb29rcyIsInRoZW4iLCJob29rcyIsImZvckVhY2giLCJob29rIiwiYWRkSG9va1RvVHJpZ2dlcnMiLCJnZXRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInJlc3VsdHMiLCJnZXRGdW5jdGlvbnMiLCIkZXhpc3RzIiwiZ2V0VHJpZ2dlciIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwiZ2V0VHJpZ2dlcnMiLCJkZWxldGVGdW5jdGlvbiIsInJlbW92ZUZ1bmN0aW9uIiwiX3JlbW92ZUhvb2tzIiwiZGVsZXRlVHJpZ2dlciIsInJlbW92ZVRyaWdnZXIiLCJxdWVyeSIsImZpbmQiLCJtYXAiLCJyZXN1bHQiLCJvYmplY3RJZCIsImRlc3Ryb3kiLCJQcm9taXNlIiwicmVzb2x2ZSIsInNhdmVIb29rIiwidXJsIiwiRXJyb3IiLCJ1cGRhdGUiLCJ1cHNlcnQiLCJ3cmFwcGVkRnVuY3Rpb24iLCJ3cmFwVG9IVFRQUmVxdWVzdCIsImFkZFRyaWdnZXIiLCJhZGRGdW5jdGlvbiIsImFkZEhvb2siLCJjcmVhdGVPclVwZGF0ZUhvb2siLCJhSG9vayIsIlR5cGVzIiwiY3JlYXRlSG9vayIsInVwZGF0ZUhvb2siLCJleHBvcnRzIiwia2V5IiwicmVxIiwianNvbkJvZHkiLCJvYmplY3QiLCJ0b0pTT04iLCJvcmlnaW5hbCIsImpzb25SZXF1ZXN0IiwiaGVhZGVycyIsImJvZHkiLCJtZXRob2QiLCJhZ2VudCIsInN0YXJ0c1dpdGgiLCJsb2dnZXIiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiZXJyIiwiZGF0YSIsIkpTT04iLCJwYXJzZSIsImVycm9yIiwiY29kZSIsInBhcnRpYWxSZXNwb25zZSIsInN1YnN0cmluZyIsInN1Y2Nlc3MiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9Ib29rc0NvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqIEBmbG93IHdlYWsgKi9cblxuaW1wb3J0ICogYXMgdHJpZ2dlcnMgZnJvbSAnLi4vdHJpZ2dlcnMnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgKiBhcyBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IHJlcXVlc3QgZnJvbSAnLi4vcmVxdWVzdCc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgaHR0cHMgZnJvbSAnaHR0cHMnO1xuXG5jb25zdCBEZWZhdWx0SG9va3NDb2xsZWN0aW9uTmFtZSA9ICdfSG9va3MnO1xuY29uc3QgSFRUUEFnZW50cyA9IHtcbiAgaHR0cDogbmV3IGh0dHAuQWdlbnQoeyBrZWVwQWxpdmU6IHRydWUgfSksXG4gIGh0dHBzOiBuZXcgaHR0cHMuQWdlbnQoeyBrZWVwQWxpdmU6IHRydWUgfSksXG59O1xuXG5leHBvcnQgY2xhc3MgSG9va3NDb250cm9sbGVyIHtcbiAgX2FwcGxpY2F0aW9uSWQ6IHN0cmluZztcbiAgX3dlYmhvb2tLZXk6IHN0cmluZztcbiAgZGF0YWJhc2U6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhcHBsaWNhdGlvbklkOiBzdHJpbmcsIGRhdGFiYXNlQ29udHJvbGxlciwgd2ViaG9va0tleSkge1xuICAgIHRoaXMuX2FwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkO1xuICAgIHRoaXMuX3dlYmhvb2tLZXkgPSB3ZWJob29rS2V5O1xuICAgIHRoaXMuZGF0YWJhc2UgPSBkYXRhYmFzZUNvbnRyb2xsZXI7XG4gIH1cblxuICBsb2FkKCkge1xuICAgIHJldHVybiB0aGlzLl9nZXRIb29rcygpLnRoZW4oaG9va3MgPT4ge1xuICAgICAgaG9va3MgPSBob29rcyB8fCBbXTtcbiAgICAgIGhvb2tzLmZvckVhY2goaG9vayA9PiB7XG4gICAgICAgIHRoaXMuYWRkSG9va1RvVHJpZ2dlcnMoaG9vayk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSkge1xuICAgIHJldHVybiB0aGlzLl9nZXRIb29rcyh7IGZ1bmN0aW9uTmFtZTogZnVuY3Rpb25OYW1lIH0pLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzWzBdKTtcbiAgfVxuXG4gIGdldEZ1bmN0aW9ucygpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0SG9va3MoeyBmdW5jdGlvbk5hbWU6IHsgJGV4aXN0czogdHJ1ZSB9IH0pO1xuICB9XG5cbiAgZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJOYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldEhvb2tzKHtcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJOYW1lLFxuICAgIH0pLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzWzBdKTtcbiAgfVxuXG4gIGdldFRyaWdnZXJzKCkge1xuICAgIHJldHVybiB0aGlzLl9nZXRIb29rcyh7XG4gICAgICBjbGFzc05hbWU6IHsgJGV4aXN0czogdHJ1ZSB9LFxuICAgICAgdHJpZ2dlck5hbWU6IHsgJGV4aXN0czogdHJ1ZSB9LFxuICAgIH0pO1xuICB9XG5cbiAgZGVsZXRlRnVuY3Rpb24oZnVuY3Rpb25OYW1lKSB7XG4gICAgdHJpZ2dlcnMucmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCB0aGlzLl9hcHBsaWNhdGlvbklkKTtcbiAgICByZXR1cm4gdGhpcy5fcmVtb3ZlSG9va3MoeyBmdW5jdGlvbk5hbWU6IGZ1bmN0aW9uTmFtZSB9KTtcbiAgfVxuXG4gIGRlbGV0ZVRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyTmFtZSkge1xuICAgIHRyaWdnZXJzLnJlbW92ZVRyaWdnZXIodHJpZ2dlck5hbWUsIGNsYXNzTmFtZSwgdGhpcy5fYXBwbGljYXRpb25JZCk7XG4gICAgcmV0dXJuIHRoaXMuX3JlbW92ZUhvb2tzKHtcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJOYW1lLFxuICAgIH0pO1xuICB9XG5cbiAgX2dldEhvb2tzKHF1ZXJ5ID0ge30pIHtcbiAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5maW5kKERlZmF1bHRIb29rc0NvbGxlY3Rpb25OYW1lLCBxdWVyeSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJldHVybiByZXN1bHRzLm1hcChyZXN1bHQgPT4ge1xuICAgICAgICBkZWxldGUgcmVzdWx0Lm9iamVjdElkO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBfcmVtb3ZlSG9va3MocXVlcnkpIHtcbiAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5kZXN0cm95KERlZmF1bHRIb29rc0NvbGxlY3Rpb25OYW1lLCBxdWVyeSkudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHNhdmVIb29rKGhvb2spIHtcbiAgICB2YXIgcXVlcnk7XG4gICAgaWYgKGhvb2suZnVuY3Rpb25OYW1lICYmIGhvb2sudXJsKSB7XG4gICAgICBxdWVyeSA9IHsgZnVuY3Rpb25OYW1lOiBob29rLmZ1bmN0aW9uTmFtZSB9O1xuICAgIH0gZWxzZSBpZiAoaG9vay50cmlnZ2VyTmFtZSAmJiBob29rLmNsYXNzTmFtZSAmJiBob29rLnVybCkge1xuICAgICAgcXVlcnkgPSB7IGNsYXNzTmFtZTogaG9vay5jbGFzc05hbWUsIHRyaWdnZXJOYW1lOiBob29rLnRyaWdnZXJOYW1lIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsICdpbnZhbGlkIGhvb2sgZGVjbGFyYXRpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZGF0YWJhc2VcbiAgICAgIC51cGRhdGUoRGVmYXVsdEhvb2tzQ29sbGVjdGlvbk5hbWUsIHF1ZXJ5LCBob29rLCB7IHVwc2VydDogdHJ1ZSB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGhvb2spO1xuICAgICAgfSk7XG4gIH1cblxuICBhZGRIb29rVG9UcmlnZ2Vycyhob29rKSB7XG4gICAgdmFyIHdyYXBwZWRGdW5jdGlvbiA9IHdyYXBUb0hUVFBSZXF1ZXN0KGhvb2ssIHRoaXMuX3dlYmhvb2tLZXkpO1xuICAgIHdyYXBwZWRGdW5jdGlvbi51cmwgPSBob29rLnVybDtcbiAgICBpZiAoaG9vay5jbGFzc05hbWUpIHtcbiAgICAgIHRyaWdnZXJzLmFkZFRyaWdnZXIoaG9vay50cmlnZ2VyTmFtZSwgaG9vay5jbGFzc05hbWUsIHdyYXBwZWRGdW5jdGlvbiwgdGhpcy5fYXBwbGljYXRpb25JZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyaWdnZXJzLmFkZEZ1bmN0aW9uKGhvb2suZnVuY3Rpb25OYW1lLCB3cmFwcGVkRnVuY3Rpb24sIG51bGwsIHRoaXMuX2FwcGxpY2F0aW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIGFkZEhvb2soaG9vaykge1xuICAgIHRoaXMuYWRkSG9va1RvVHJpZ2dlcnMoaG9vayk7XG4gICAgcmV0dXJuIHRoaXMuc2F2ZUhvb2soaG9vayk7XG4gIH1cblxuICBjcmVhdGVPclVwZGF0ZUhvb2soYUhvb2spIHtcbiAgICB2YXIgaG9vaztcbiAgICBpZiAoYUhvb2sgJiYgYUhvb2suZnVuY3Rpb25OYW1lICYmIGFIb29rLnVybCkge1xuICAgICAgaG9vayA9IHt9O1xuICAgICAgaG9vay5mdW5jdGlvbk5hbWUgPSBhSG9vay5mdW5jdGlvbk5hbWU7XG4gICAgICBob29rLnVybCA9IGFIb29rLnVybDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgYUhvb2sgJiZcbiAgICAgIGFIb29rLmNsYXNzTmFtZSAmJlxuICAgICAgYUhvb2sudXJsICYmXG4gICAgICBhSG9vay50cmlnZ2VyTmFtZSAmJlxuICAgICAgdHJpZ2dlcnMuVHlwZXNbYUhvb2sudHJpZ2dlck5hbWVdXG4gICAgKSB7XG4gICAgICBob29rID0ge307XG4gICAgICBob29rLmNsYXNzTmFtZSA9IGFIb29rLmNsYXNzTmFtZTtcbiAgICAgIGhvb2sudXJsID0gYUhvb2sudXJsO1xuICAgICAgaG9vay50cmlnZ2VyTmFtZSA9IGFIb29rLnRyaWdnZXJOYW1lO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTQzLCAnaW52YWxpZCBob29rIGRlY2xhcmF0aW9uJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuYWRkSG9vayhob29rKTtcbiAgfVxuXG4gIGNyZWF0ZUhvb2soYUhvb2spIHtcbiAgICBpZiAoYUhvb2suZnVuY3Rpb25OYW1lKSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRGdW5jdGlvbihhSG9vay5mdW5jdGlvbk5hbWUpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsIGBmdW5jdGlvbiBuYW1lOiAke2FIb29rLmZ1bmN0aW9uTmFtZX0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVPclVwZGF0ZUhvb2soYUhvb2spO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGFIb29rLmNsYXNzTmFtZSAmJiBhSG9vay50cmlnZ2VyTmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VHJpZ2dlcihhSG9vay5jbGFzc05hbWUsIGFIb29rLnRyaWdnZXJOYW1lKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxNDMsXG4gICAgICAgICAgICBgY2xhc3MgJHthSG9vay5jbGFzc05hbWV9IGFscmVhZHkgaGFzIHRyaWdnZXIgJHthSG9vay50cmlnZ2VyTmFtZX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVPclVwZGF0ZUhvb2soYUhvb2spO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgJ2ludmFsaWQgaG9vayBkZWNsYXJhdGlvbicpO1xuICB9XG5cbiAgdXBkYXRlSG9vayhhSG9vaykge1xuICAgIGlmIChhSG9vay5mdW5jdGlvbk5hbWUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldEZ1bmN0aW9uKGFIb29rLmZ1bmN0aW9uTmFtZSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlT3JVcGRhdGVIb29rKGFIb29rKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTQzLCBgbm8gZnVuY3Rpb24gbmFtZWQ6ICR7YUhvb2suZnVuY3Rpb25OYW1lfSBpcyBkZWZpbmVkYCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGFIb29rLmNsYXNzTmFtZSAmJiBhSG9vay50cmlnZ2VyTmFtZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VHJpZ2dlcihhSG9vay5jbGFzc05hbWUsIGFIb29rLnRyaWdnZXJOYW1lKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVPclVwZGF0ZUhvb2soYUhvb2spO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsIGBjbGFzcyAke2FIb29rLmNsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3RgKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTQzLCAnaW52YWxpZCBob29rIGRlY2xhcmF0aW9uJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcFRvSFRUUFJlcXVlc3QoaG9vaywga2V5KSB7XG4gIHJldHVybiByZXEgPT4ge1xuICAgIGNvbnN0IGpzb25Cb2R5ID0ge307XG4gICAgZm9yICh2YXIgaSBpbiByZXEpIHtcbiAgICAgIC8vIFBhcnNlIFNlcnZlciBjb25maWcgaXMgbm90IHNlcmlhbGl6YWJsZVxuICAgICAgaWYgKGkgPT09ICdjb25maWcnKSBjb250aW51ZTtcbiAgICAgIGpzb25Cb2R5W2ldID0gcmVxW2ldO1xuICAgIH1cbiAgICBpZiAocmVxLm9iamVjdCkge1xuICAgICAganNvbkJvZHkub2JqZWN0ID0gcmVxLm9iamVjdC50b0pTT04oKTtcbiAgICAgIGpzb25Cb2R5Lm9iamVjdC5jbGFzc05hbWUgPSByZXEub2JqZWN0LmNsYXNzTmFtZTtcbiAgICB9XG4gICAgaWYgKHJlcS5vcmlnaW5hbCkge1xuICAgICAganNvbkJvZHkub3JpZ2luYWwgPSByZXEub3JpZ2luYWwudG9KU09OKCk7XG4gICAgICBqc29uQm9keS5vcmlnaW5hbC5jbGFzc05hbWUgPSByZXEub3JpZ2luYWwuY2xhc3NOYW1lO1xuICAgIH1cbiAgICBjb25zdCBqc29uUmVxdWVzdDogYW55ID0ge1xuICAgICAgdXJsOiBob29rLnVybCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBqc29uQm9keSxcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIH07XG5cbiAgICBjb25zdCBhZ2VudCA9IGhvb2sudXJsLnN0YXJ0c1dpdGgoJ2h0dHBzJykgPyBIVFRQQWdlbnRzWydodHRwcyddIDogSFRUUEFnZW50c1snaHR0cCddO1xuICAgIGpzb25SZXF1ZXN0LmFnZW50ID0gYWdlbnQ7XG5cbiAgICBpZiAoa2V5KSB7XG4gICAgICBqc29uUmVxdWVzdC5oZWFkZXJzWydYLVBhcnNlLVdlYmhvb2stS2V5J10gPSBrZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dlci53YXJuKCdNYWtpbmcgb3V0Z29pbmcgd2ViaG9vayByZXF1ZXN0IHdpdGhvdXQgd2ViaG9va0tleSBiZWluZyBzZXQhJyk7XG4gICAgfVxuICAgIHJldHVybiByZXF1ZXN0KGpzb25SZXF1ZXN0KS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGxldCBlcnI7XG4gICAgICBsZXQgcmVzdWx0O1xuICAgICAgbGV0IGJvZHkgPSByZXNwb25zZS5kYXRhO1xuICAgICAgaWYgKGJvZHkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBib2R5ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBib2R5ID0gSlNPTi5wYXJzZShib2R5KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBlcnIgPSB7XG4gICAgICAgICAgICAgIGVycm9yOiAnTWFsZm9ybWVkIHJlc3BvbnNlJyxcbiAgICAgICAgICAgICAgY29kZTogLTEsXG4gICAgICAgICAgICAgIHBhcnRpYWxSZXNwb25zZTogYm9keS5zdWJzdHJpbmcoMCwgMTAwKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICghZXJyKSB7XG4gICAgICAgICAgcmVzdWx0ID0gYm9keS5zdWNjZXNzO1xuICAgICAgICAgIGVyciA9IGJvZHkuZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSBlbHNlIGlmIChob29rLnRyaWdnZXJOYW1lID09PSAnYmVmb3JlU2F2ZScpIHtcbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgZGVsZXRlIHJlc3VsdC5jcmVhdGVkQXQ7XG4gICAgICAgICAgZGVsZXRlIHJlc3VsdC51cGRhdGVkQXQ7XG4gICAgICAgICAgZGVsZXRlIHJlc3VsdC5jbGFzc05hbWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2JqZWN0OiByZXN1bHQgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IEhvb2tzQ29udHJvbGxlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBRUEsSUFBQUEsUUFBQSxHQUFBQyx1QkFBQSxDQUFBQyxPQUFBO0FBRUEsSUFBQUMsS0FBQSxHQUFBRix1QkFBQSxDQUFBQyxPQUFBO0FBRUEsSUFBQUUsUUFBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssS0FBQSxHQUFBRixzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQU0sTUFBQSxHQUFBSCxzQkFBQSxDQUFBSCxPQUFBO0FBQTBCLFNBQUFHLHVCQUFBSSxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxD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Q0FBQyxHQUFHckUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHQSxVQUFVLENBQUMsTUFBTSxDQUFDO0lBQ3JGZ0UsV0FBVyxDQUFDSSxLQUFLLEdBQUdBLEtBQUs7SUFFekIsSUFBSVYsR0FBRyxFQUFFO01BQ1BNLFdBQVcsQ0FBQ0MsT0FBTyxDQUFDLHFCQUFxQixDQUFDLEdBQUdQLEdBQUc7SUFDbEQsQ0FBQyxNQUFNO01BQ0xZLGNBQU0sQ0FBQ0MsSUFBSSxDQUFDLCtEQUErRCxDQUFDO0lBQzlFO0lBQ0EsT0FBTyxJQUFBQyxnQkFBTyxFQUFDUixXQUFXLENBQUMsQ0FBQ2pELElBQUksQ0FBQzBELFFBQVEsSUFBSTtNQUMzQyxJQUFJQyxHQUFHO01BQ1AsSUFBSXJDLE1BQU07TUFDVixJQUFJNkIsSUFBSSxHQUFHTyxRQUFRLENBQUNFLElBQUk7TUFDeEIsSUFBSVQsSUFBSSxFQUFFO1FBQ1IsSUFBSSxPQUFPQSxJQUFJLEtBQUssUUFBUSxFQUFFO1VBQzVCLElBQUk7WUFDRkEsSUFBSSxHQUFHVSxJQUFJLENBQUNDLEtBQUssQ0FBQ1gsSUFBSSxDQUFDO1VBQ3pCLENBQUMsQ0FBQyxPQUFPcEYsQ0FBQyxFQUFFO1lBQ1Y0RixHQUFHLEdBQUc7Y0FDSkksS0FBSyxFQUFFLG9CQUFvQjtjQUMzQkMsSUFBSSxFQUFFLENBQUMsQ0FBQztjQUNSQyxlQUFlLEVBQUVkLElBQUksQ0FBQ2UsU0FBUyxDQUFDLENBQUMsRUFBRSxHQUFHO1lBQ3hDLENBQUM7VUFDSDtRQUNGO1FBQ0EsSUFBSSxDQUFDUCxHQUFHLEVBQUU7VUFDUnJDLE1BQU0sR0FBRzZCLElBQUksQ0FBQ2dCLE9BQU87VUFDckJSLEdBQUcsR0FBR1IsSUFBSSxDQUFDWSxLQUFLO1FBQ2xCO01BQ0Y7TUFDQSxJQUFJSixHQUFHLEVBQUU7UUFDUCxNQUFNQSxHQUFHO01BQ1gsQ0FBQyxNQUFNLElBQUl4RCxJQUFJLENBQUNTLFdBQVcsS0FBSyxZQUFZLEVBQUU7UUFDNUMsSUFBSSxPQUFPVSxNQUFNLEtBQUssUUFBUSxFQUFFO1VBQzlCLE9BQU9BLE1BQU0sQ0FBQzhDLFNBQVM7VUFDdkIsT0FBTzlDLE1BQU0sQ0FBQytDLFNBQVM7VUFDdkIsT0FBTy9DLE1BQU0sQ0FBQ1gsU0FBUztRQUN6QjtRQUNBLE9BQU87VUFBRW1DLE1BQU0sRUFBRXhCO1FBQU8sQ0FBQztNQUMzQixDQUFDLE1BQU07UUFDTCxPQUFPQSxNQUFNO01BQ2Y7SUFDRixDQUFDLENBQUM7RUFDSixDQUFDO0FBQ0g7QUFBQyxJQUFBZ0QsUUFBQSxHQUFBNUIsT0FBQSxDQUFBN0UsT0FBQSxHQUVjeUIsZUFBZSIsImlnbm9yZUxpc3QiOltdfQ==