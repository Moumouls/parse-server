"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _commander = require("commander");
var _path = _interopRequireDefault(require("path"));
var _Deprecator = _interopRequireDefault(require("../../Deprecator/Deprecator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/* eslint-disable no-console */

let _definitions;
let _reverseDefinitions;
let _defaults;
_commander.Command.prototype.loadDefinitions = function (definitions) {
  _definitions = definitions;
  Object.keys(definitions).reduce((program, opt) => {
    if (typeof definitions[opt] == 'object') {
      const additionalOptions = definitions[opt];
      if (additionalOptions.required === true) {
        return program.option(`--${opt} <${opt}>`, additionalOptions.help, additionalOptions.action);
      } else {
        return program.option(`--${opt} [${opt}]`, additionalOptions.help, additionalOptions.action);
      }
    }
    return program.option(`--${opt} [${opt}]`);
  }, this);
  _reverseDefinitions = Object.keys(definitions).reduce((object, key) => {
    let value = definitions[key];
    if (typeof value == 'object') {
      value = value.env;
    }
    if (value) {
      object[value] = key;
    }
    return object;
  }, {});
  _defaults = Object.keys(definitions).reduce((defs, opt) => {
    if (_definitions[opt].default !== undefined) {
      defs[opt] = _definitions[opt].default;
    }
    return defs;
  }, {});

  /* istanbul ignore next */
  this.on('--help', function () {
    console.log('  Configure From Environment:');
    console.log('');
    Object.keys(_reverseDefinitions).forEach(key => {
      console.log(`    $ ${key}='${_reverseDefinitions[key]}'`);
    });
    console.log('');
  });
};
function parseEnvironment(env = {}) {
  return Object.keys(_reverseDefinitions).reduce((options, key) => {
    if (env[key]) {
      const originalKey = _reverseDefinitions[key];
      let action = option => option;
      if (typeof _definitions[originalKey] === 'object') {
        action = _definitions[originalKey].action || action;
      }
      options[_reverseDefinitions[key]] = action(env[key]);
    }
    return options;
  }, {});
}
function parseConfigFile(program) {
  let options = {};
  if (program.args.length > 0) {
    let jsonPath = program.args[0];
    jsonPath = _path.default.resolve(jsonPath);
    const jsonConfig = require(jsonPath);
    if (jsonConfig.apps) {
      if (jsonConfig.apps.length > 1) {
        throw 'Multiple apps are not supported';
      }
      options = jsonConfig.apps[0];
    } else {
      options = jsonConfig;
    }
    Object.keys(options).forEach(key => {
      const value = options[key];
      if (!_definitions[key]) {
        throw `error: unknown option ${key}`;
      }
      const action = _definitions[key].action;
      if (action) {
        options[key] = action(value);
      }
    });
    console.log(`Configuration loaded from ${jsonPath}`);
  }
  return options;
}
_commander.Command.prototype.setValuesIfNeeded = function (options) {
  Object.keys(options).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(this, key)) {
      this[key] = options[key];
    }
  });
};
_commander.Command.prototype._parse = _commander.Command.prototype.parse;
_commander.Command.prototype.parse = function (args, env) {
  this._parse(args);
  // Parse the environment first
  const envOptions = parseEnvironment(env);
  const fromFile = parseConfigFile(this);
  // Load the env if not passed from command line
  this.setValuesIfNeeded(envOptions);
  // Load from file to override
  this.setValuesIfNeeded(fromFile);
  // Scan for deprecated Parse Server options
  _Deprecator.default.scanParseServerOptions(this);
  // Last set the defaults
  this.setValuesIfNeeded(_defaults);
};
_commander.Command.prototype.getOptions = function () {
  return Object.keys(_definitions).reduce((options, key) => {
    if (typeof this[key] !== 'undefined') {
      options[key] = this[key];
    }
    return options;
  }, {});
};
const commander = new _commander.Command();
commander.storeOptionsAsProperties();
commander.allowExcessArguments();
var _default = exports.default = commander;
/* eslint-enable no-console */
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY29tbWFuZGVyIiwicmVxdWlyZSIsIl9wYXRoIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EZXByZWNhdG9yIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiX2RlZmluaXRpb25zIiwiX3JldmVyc2VEZWZpbml0aW9ucyIsIl9kZWZhdWx0cyIsIkNvbW1hbmQiLCJwcm90b3R5cGUiLCJsb2FkRGVmaW5pdGlvbnMiLCJkZWZpbml0aW9ucyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJwcm9ncmFtIiwib3B0IiwiYWRkaXRpb25hbE9wdGlvbnMiLCJyZXF1aXJlZCIsIm9wdGlvbiIsImhlbHAiLCJhY3Rpb24iLCJvYmplY3QiLCJrZXkiLCJ2YWx1ZSIsImVudiIsImRlZnMiLCJ1bmRlZmluZWQiLCJvbiIsImNvbnNvbGUiLCJsb2ciLCJmb3JFYWNoIiwicGFyc2VFbnZpcm9ubWVudCIsIm9wdGlvbnMiLCJvcmlnaW5hbEtleSIsInBhcnNlQ29uZmlnRmlsZSIsImFyZ3MiLCJsZW5ndGgiLCJqc29uUGF0aCIsInBhdGgiLCJyZXNvbHZlIiwianNvbkNvbmZpZyIsImFwcHMiLCJzZXRWYWx1ZXNJZk5lZWRlZCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIl9wYXJzZSIsInBhcnNlIiwiZW52T3B0aW9ucyIsImZyb21GaWxlIiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJnZXRPcHRpb25zIiwiY29tbWFuZGVyIiwic3RvcmVPcHRpb25zQXNQcm9wZXJ0aWVzIiwiYWxsb3dFeGNlc3NBcmd1bWVudHMiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvY2xpL3V0aWxzL2NvbW1hbmRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi4vLi4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcblxubGV0IF9kZWZpbml0aW9ucztcbmxldCBfcmV2ZXJzZURlZmluaXRpb25zO1xubGV0IF9kZWZhdWx0cztcblxuQ29tbWFuZC5wcm90b3R5cGUubG9hZERlZmluaXRpb25zID0gZnVuY3Rpb24gKGRlZmluaXRpb25zKSB7XG4gIF9kZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXG4gIE9iamVjdC5rZXlzKGRlZmluaXRpb25zKS5yZWR1Y2UoKHByb2dyYW0sIG9wdCkgPT4ge1xuICAgIGlmICh0eXBlb2YgZGVmaW5pdGlvbnNbb3B0XSA9PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSBkZWZpbml0aW9uc1tvcHRdO1xuICAgICAgaWYgKGFkZGl0aW9uYWxPcHRpb25zLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBwcm9ncmFtLm9wdGlvbihcbiAgICAgICAgICBgLS0ke29wdH0gPCR7b3B0fT5gLFxuICAgICAgICAgIGFkZGl0aW9uYWxPcHRpb25zLmhlbHAsXG4gICAgICAgICAgYWRkaXRpb25hbE9wdGlvbnMuYWN0aW9uXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gcHJvZ3JhbS5vcHRpb24oXG4gICAgICAgICAgYC0tJHtvcHR9IFske29wdH1dYCxcbiAgICAgICAgICBhZGRpdGlvbmFsT3B0aW9ucy5oZWxwLFxuICAgICAgICAgIGFkZGl0aW9uYWxPcHRpb25zLmFjdGlvblxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcHJvZ3JhbS5vcHRpb24oYC0tJHtvcHR9IFske29wdH1dYCk7XG4gIH0sIHRoaXMpO1xuXG4gIF9yZXZlcnNlRGVmaW5pdGlvbnMgPSBPYmplY3Qua2V5cyhkZWZpbml0aW9ucykucmVkdWNlKChvYmplY3QsIGtleSkgPT4ge1xuICAgIGxldCB2YWx1ZSA9IGRlZmluaXRpb25zW2tleV07XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jykge1xuICAgICAgdmFsdWUgPSB2YWx1ZS5lbnY7XG4gICAgfVxuICAgIGlmICh2YWx1ZSkge1xuICAgICAgb2JqZWN0W3ZhbHVlXSA9IGtleTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfSwge30pO1xuXG4gIF9kZWZhdWx0cyA9IE9iamVjdC5rZXlzKGRlZmluaXRpb25zKS5yZWR1Y2UoKGRlZnMsIG9wdCkgPT4ge1xuICAgIGlmIChfZGVmaW5pdGlvbnNbb3B0XS5kZWZhdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGRlZnNbb3B0XSA9IF9kZWZpbml0aW9uc1tvcHRdLmRlZmF1bHQ7XG4gICAgfVxuICAgIHJldHVybiBkZWZzO1xuICB9LCB7fSk7XG5cbiAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgdGhpcy5vbignLS1oZWxwJywgZnVuY3Rpb24gKCkge1xuICAgIGNvbnNvbGUubG9nKCcgIENvbmZpZ3VyZSBGcm9tIEVudmlyb25tZW50OicpO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICBPYmplY3Qua2V5cyhfcmV2ZXJzZURlZmluaXRpb25zKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhgICAgICQgJHtrZXl9PScke19yZXZlcnNlRGVmaW5pdGlvbnNba2V5XX0nYCk7XG4gICAgfSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHBhcnNlRW52aXJvbm1lbnQoZW52ID0ge30pIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKF9yZXZlcnNlRGVmaW5pdGlvbnMpLnJlZHVjZSgob3B0aW9ucywga2V5KSA9PiB7XG4gICAgaWYgKGVudltrZXldKSB7XG4gICAgICBjb25zdCBvcmlnaW5hbEtleSA9IF9yZXZlcnNlRGVmaW5pdGlvbnNba2V5XTtcbiAgICAgIGxldCBhY3Rpb24gPSBvcHRpb24gPT4gb3B0aW9uO1xuICAgICAgaWYgKHR5cGVvZiBfZGVmaW5pdGlvbnNbb3JpZ2luYWxLZXldID09PSAnb2JqZWN0Jykge1xuICAgICAgICBhY3Rpb24gPSBfZGVmaW5pdGlvbnNbb3JpZ2luYWxLZXldLmFjdGlvbiB8fCBhY3Rpb247XG4gICAgICB9XG4gICAgICBvcHRpb25zW19yZXZlcnNlRGVmaW5pdGlvbnNba2V5XV0gPSBhY3Rpb24oZW52W2tleV0pO1xuICAgIH1cbiAgICByZXR1cm4gb3B0aW9ucztcbiAgfSwge30pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUNvbmZpZ0ZpbGUocHJvZ3JhbSkge1xuICBsZXQgb3B0aW9ucyA9IHt9O1xuICBpZiAocHJvZ3JhbS5hcmdzLmxlbmd0aCA+IDApIHtcbiAgICBsZXQganNvblBhdGggPSBwcm9ncmFtLmFyZ3NbMF07XG4gICAganNvblBhdGggPSBwYXRoLnJlc29sdmUoanNvblBhdGgpO1xuICAgIGNvbnN0IGpzb25Db25maWcgPSByZXF1aXJlKGpzb25QYXRoKTtcbiAgICBpZiAoanNvbkNvbmZpZy5hcHBzKSB7XG4gICAgICBpZiAoanNvbkNvbmZpZy5hcHBzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgJ011bHRpcGxlIGFwcHMgYXJlIG5vdCBzdXBwb3J0ZWQnO1xuICAgICAgfVxuICAgICAgb3B0aW9ucyA9IGpzb25Db25maWcuYXBwc1swXTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3B0aW9ucyA9IGpzb25Db25maWc7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9wdGlvbnMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gb3B0aW9uc1trZXldO1xuICAgICAgaWYgKCFfZGVmaW5pdGlvbnNba2V5XSkge1xuICAgICAgICB0aHJvdyBgZXJyb3I6IHVua25vd24gb3B0aW9uICR7a2V5fWA7XG4gICAgICB9XG4gICAgICBjb25zdCBhY3Rpb24gPSBfZGVmaW5pdGlvbnNba2V5XS5hY3Rpb247XG4gICAgICBpZiAoYWN0aW9uKSB7XG4gICAgICAgIG9wdGlvbnNba2V5XSA9IGFjdGlvbih2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc29sZS5sb2coYENvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gJHtqc29uUGF0aH1gKTtcbiAgfVxuICByZXR1cm4gb3B0aW9ucztcbn1cblxuQ29tbWFuZC5wcm90b3R5cGUuc2V0VmFsdWVzSWZOZWVkZWQgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhvcHRpb25zKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcywga2V5KSkge1xuICAgICAgdGhpc1trZXldID0gb3B0aW9uc1trZXldO1xuICAgIH1cbiAgfSk7XG59O1xuXG5Db21tYW5kLnByb3RvdHlwZS5fcGFyc2UgPSBDb21tYW5kLnByb3RvdHlwZS5wYXJzZTtcblxuQ29tbWFuZC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbiAoYXJncywgZW52KSB7XG4gIHRoaXMuX3BhcnNlKGFyZ3MpO1xuICAvLyBQYXJzZSB0aGUgZW52aXJvbm1lbnQgZmlyc3RcbiAgY29uc3QgZW52T3B0aW9ucyA9IHBhcnNlRW52aXJvbm1lbnQoZW52KTtcbiAgY29uc3QgZnJvbUZpbGUgPSBwYXJzZUNvbmZpZ0ZpbGUodGhpcyk7XG4gIC8vIExvYWQgdGhlIGVudiBpZiBub3QgcGFzc2VkIGZyb20gY29tbWFuZCBsaW5lXG4gIHRoaXMuc2V0VmFsdWVzSWZOZWVkZWQoZW52T3B0aW9ucyk7XG4gIC8vIExvYWQgZnJvbSBmaWxlIHRvIG92ZXJyaWRlXG4gIHRoaXMuc2V0VmFsdWVzSWZOZWVkZWQoZnJvbUZpbGUpO1xuICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyh0aGlzKTtcbiAgLy8gTGFzdCBzZXQgdGhlIGRlZmF1bHRzXG4gIHRoaXMuc2V0VmFsdWVzSWZOZWVkZWQoX2RlZmF1bHRzKTtcbn07XG5cbkNvbW1hbmQucHJvdG90eXBlLmdldE9wdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhfZGVmaW5pdGlvbnMpLnJlZHVjZSgob3B0aW9ucywga2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiB0aGlzW2tleV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSB0aGlzW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHRpb25zO1xuICB9LCB7fSk7XG59O1xuXG5jb25zdCBjb21tYW5kZXIgPSBuZXcgQ29tbWFuZCgpXG5jb21tYW5kZXIuc3RvcmVPcHRpb25zQXNQcm9wZXJ0aWVzKCk7XG5jb21tYW5kZXIuYWxsb3dFeGNlc3NBcmd1bWVudHMoKTtcbmV4cG9ydCBkZWZhdWx0IGNvbW1hbmRlcjtcbi8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxJQUFBQSxVQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxXQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFBcUQsU0FBQUUsdUJBQUFFLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFIckQ7O0FBS0EsSUFBSUcsWUFBWTtBQUNoQixJQUFJQyxtQkFBbUI7QUFDdkIsSUFBSUMsU0FBUztBQUViQyxrQkFBTyxDQUFDQyxTQUFTLENBQUNDLGVBQWUsR0FBRyxVQUFVQyxXQUFXLEVBQUU7RUFDekROLFlBQVksR0FBR00sV0FBVztFQUUxQkMsTUFBTSxDQUFDQyxJQUFJLENBQUNGLFdBQVcsQ0FBQyxDQUFDRyxNQUFNLENBQUMsQ0FBQ0MsT0FBTyxFQUFFQyxHQUFHLEtBQUs7SUFDaEQsSUFBSSxPQUFPTCxXQUFXLENBQUNL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