"use strict";

var _Check = require("../Check");
var _CheckGroup = _interopRequireDefault(require("../CheckGroup"));
var _Config = _interopRequireDefault(require("../../Config"));
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * The security checks group for Parse Server configuration.
 * Checks common Parse Server parameters such as access keys.
 * @memberof module:SecurityCheck
 */
class CheckGroupServerConfig extends _CheckGroup.default {
  setName() {
    return 'Parse Server Configuration';
  }
  setChecks() {
    const config = _Config.default.get(_node.default.applicationId);
    return [new _Check.Check({
      title: 'Secure master key',
      warning: 'The Parse Server master key is insecure and vulnerable to brute force attacks.',
      solution: 'Choose a longer and/or more complex master key with a combination of upper- and lowercase characters, numbers and special characters.',
      check: () => {
        const masterKey = config.masterKey;
        const hasUpperCase = /[A-Z]/.test(masterKey);
        const hasLowerCase = /[a-z]/.test(masterKey);
        const hasNumbers = /\d/.test(masterKey);
        const hasNonAlphasNumerics = /\W/.test(masterKey);
        // Ensure length
        if (masterKey.length < 14) {
          throw 1;
        }
        // Ensure at least 3 out of 4 requirements passed
        if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Security log disabled',
      warning: 'Security checks in logs may expose vulnerabilities to anyone with access to logs.',
      solution: "Change Parse Server configuration to 'security.enableCheckLog: false'.",
      check: () => {
        if (config.security && config.security.enableCheckLog) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Client class creation disabled',
      warning: 'Attackers are allowed to create new classes without restriction and flood the database.',
      solution: "Change Parse Server configuration to 'allowClientClassCreation: false'.",
      check: () => {
        if (config.allowClientClassCreation || config.allowClientClassCreation == null) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Users are created without public access',
      warning: 'Users with public read access are exposed to anyone who knows their object IDs, or to anyone who can query the Parse.User class.',
      solution: "Change Parse Server configuration to 'enforcePrivateUsers: true'.",
      check: () => {
        if (!config.enforcePrivateUsers) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'Insecure auth adapters disabled',
      warning: "Attackers may explore insecure auth adapters' vulnerabilities and log in on behalf of another user.",
      solution: "Change Parse Server configuration to 'enableInsecureAuthAdapters: false'.",
      check: () => {
        if (config.enableInsecureAuthAdapters !== false) {
          throw 1;
        }
      }
    }), new _Check.Check({
      title: 'GraphQL public introspection disabled',
      warning: 'GraphQL public introspection is enabled, which allows anyone to access the GraphQL schema.',
      solution: "Change Parse Server configuration to 'graphQLPublicIntrospection: false'. You will need to use master key or maintenance key to access the GraphQL schema.",
      check: () => {
        if (config.graphQLPublicIntrospection !== false) {
          throw 1;
        }
      }
    })];
  }
}
module.exports = CheckGroupServerConfig;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfQ2hlY2siLCJyZXF1aXJlIiwiX0NoZWNrR3JvdXAiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX0NvbmZpZyIsIl9ub2RlIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiQ2hlY2tHcm91cFNlcnZlckNvbmZpZyIsIkNoZWNrR3JvdXAiLCJzZXROYW1lIiwic2V0Q2hlY2tzIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiQ2hlY2siLCJ0aXRsZSIsIndhcm5pbmciLCJzb2x1dGlvbiIsImNoZWNrIiwibWFzdGVyS2V5IiwiaGFzVXBwZXJDYXNlIiwidGVzdCIsImhhc0xvd2VyQ2FzZSIsImhhc051bWJlcnMiLCJoYXNOb25BbHBoYXNOdW1lcmljcyIsImxlbmd0aCIsInNlY3VyaXR5IiwiZW5hYmxlQ2hlY2tMb2ciLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwiZW5hYmxlSW5zZWN1cmVBdXRoQWRhcHRlcnMiLCJncmFwaFFMUHVibGljSW50cm9zcGVjdGlvbiIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvU2VjdXJpdHkvQ2hlY2tHcm91cHMvQ2hlY2tHcm91cFNlcnZlckNvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDaGVjayB9IGZyb20gJy4uL0NoZWNrJztcbmltcG9ydCBDaGVja0dyb3VwIGZyb20gJy4uL0NoZWNrR3JvdXAnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG4vKipcbiAqIFRoZSBzZWN1cml0eSBjaGVja3MgZ3JvdXAgZm9yIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uLlxuICogQ2hlY2tzIGNvbW1vbiBQYXJzZSBTZXJ2ZXIgcGFyYW1ldGVycyBzdWNoIGFzIGFjY2VzcyBrZXlzLlxuICogQG1lbWJlcm9mIG1vZHVsZTpTZWN1cml0eUNoZWNrXG4gKi9cbmNsYXNzIENoZWNrR3JvdXBTZXJ2ZXJDb25maWcgZXh0ZW5kcyBDaGVja0dyb3VwIHtcbiAgc2V0TmFtZSgpIHtcbiAgICByZXR1cm4gJ1BhcnNlIFNlcnZlciBDb25maWd1cmF0aW9uJztcbiAgfVxuICBzZXRDaGVja3MoKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICByZXR1cm4gW1xuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdTZWN1cmUgbWFzdGVyIGtleScsXG4gICAgICAgIHdhcm5pbmc6ICdUaGUgUGFyc2UgU2VydmVyIG1hc3RlciBrZXkgaXMgaW5zZWN1cmUgYW5kIHZ1bG5lcmFibGUgdG8gYnJ1dGUgZm9yY2UgYXR0YWNrcy4nLFxuICAgICAgICBzb2x1dGlvbjpcbiAgICAgICAgICAnQ2hvb3NlIGEgbG9uZ2VyIGFuZC9vciBtb3JlIGNvbXBsZXggbWFzdGVyIGtleSB3aXRoIGEgY29tYmluYXRpb24gb2YgdXBwZXItIGFuZCBsb3dlcmNhc2UgY2hhcmFjdGVycywgbnVtYmVycyBhbmQgc3BlY2lhbCBjaGFyYWN0ZXJzLicsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbWFzdGVyS2V5ID0gY29uZmlnLm1hc3RlcktleTtcbiAgICAgICAgICBjb25zdCBoYXNVcHBlckNhc2UgPSAvW0EtWl0vLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNMb3dlckNhc2UgPSAvW2Etel0vLnRlc3QobWFzdGVyS2V5KTtcbiAgICAgICAgICBjb25zdCBoYXNOdW1iZXJzID0gL1xcZC8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIGNvbnN0IGhhc05vbkFscGhhc051bWVyaWNzID0gL1xcVy8udGVzdChtYXN0ZXJLZXkpO1xuICAgICAgICAgIC8vIEVuc3VyZSBsZW5ndGhcbiAgICAgICAgICBpZiAobWFzdGVyS2V5Lmxlbmd0aCA8IDE0KSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgYXQgbGVhc3QgMyBvdXQgb2YgNCByZXF1aXJlbWVudHMgcGFzc2VkXG4gICAgICAgICAgaWYgKGhhc1VwcGVyQ2FzZSArIGhhc0xvd2VyQ2FzZSArIGhhc051bWJlcnMgKyBoYXNOb25BbHBoYXNOdW1lcmljcyA8IDMpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyaXR5IGxvZyBkaXNhYmxlZCcsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1NlY3VyaXR5IGNoZWNrcyBpbiBsb2dzIG1heSBleHBvc2UgdnVsbmVyYWJpbGl0aWVzIHRvIGFueW9uZSB3aXRoIGFjY2VzcyB0byBsb2dzLicsXG4gICAgICAgIHNvbHV0aW9uOiBcIkNoYW5nZSBQYXJzZSBTZXJ2ZXIgY29uZmlndXJhdGlvbiB0byAnc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2c6IGZhbHNlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoY29uZmlnLnNlY3VyaXR5ICYmIGNvbmZpZy5zZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIG5ldyBDaGVjayh7XG4gICAgICAgIHRpdGxlOiAnQ2xpZW50IGNsYXNzIGNyZWF0aW9uIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICAnQXR0YWNrZXJzIGFyZSBhbGxvd2VkIHRvIGNyZWF0ZSBuZXcgY2xhc3NlcyB3aXRob3V0IHJlc3RyaWN0aW9uIGFuZCBmbG9vZCB0aGUgZGF0YWJhc2UuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdhbGxvd0NsaWVudENsYXNzQ3JlYXRpb246IGZhbHNlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiB8fCBjb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1VzZXJzIGFyZSBjcmVhdGVkIHdpdGhvdXQgcHVibGljIGFjY2VzcycsXG4gICAgICAgIHdhcm5pbmc6XG4gICAgICAgICAgJ1VzZXJzIHdpdGggcHVibGljIHJlYWQgYWNjZXNzIGFyZSBleHBvc2VkIHRvIGFueW9uZSB3aG8ga25vd3MgdGhlaXIgb2JqZWN0IElEcywgb3IgdG8gYW55b25lIHdobyBjYW4gcXVlcnkgdGhlIFBhcnNlLlVzZXIgY2xhc3MuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdlbmZvcmNlUHJpdmF0ZVVzZXJzOiB0cnVlJy5cIixcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIWNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbmV3IENoZWNrKHtcbiAgICAgICAgdGl0bGU6ICdJbnNlY3VyZSBhdXRoIGFkYXB0ZXJzIGRpc2FibGVkJyxcbiAgICAgICAgd2FybmluZzpcbiAgICAgICAgICBcIkF0dGFja2VycyBtYXkgZXhwbG9yZSBpbnNlY3VyZSBhdXRoIGFkYXB0ZXJzJyB2dWxuZXJhYmlsaXRpZXMgYW5kIGxvZyBpbiBvbiBiZWhhbGYgb2YgYW5vdGhlciB1c2VyLlwiLFxuICAgICAgICBzb2x1dGlvbjogXCJDaGFuZ2UgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24gdG8gJ2VuYWJsZUluc2VjdXJlQXV0aEFkYXB0ZXJzOiBmYWxzZScuXCIsXG4gICAgICAgIGNoZWNrOiAoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5lbmFibGVJbnNlY3VyZUF1dGhBZGFwdGVycyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRocm93IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ0dyYXBoUUwgcHVibGljIGludHJvc3BlY3Rpb24gZGlzYWJsZWQnLFxuICAgICAgICB3YXJuaW5nOiAnR3JhcGhRTCBwdWJsaWMgaW50cm9zcGVjdGlvbiBpcyBlbmFibGVkLCB3aGljaCBhbGxvd3MgYW55b25lIHRvIGFjY2VzcyB0aGUgR3JhcGhRTCBzY2hlbWEuJyxcbiAgICAgICAgc29sdXRpb246IFwiQ2hhbmdlIFBhcnNlIFNlcnZlciBjb25maWd1cmF0aW9uIHRvICdncmFwaFFMUHVibGljSW50cm9zcGVjdGlvbjogZmFsc2UnLiBZb3Ugd2lsbCBuZWVkIHRvIHVzZSBtYXN0ZXIga2V5IG9yIG1haW50ZW5hbmNlIGtleSB0byBhY2Nlc3MgdGhlIEdyYXBoUUwgc2NoZW1hLlwiLFxuICAgICAgICBjaGVjazogKCkgPT4ge1xuICAgICAgICAgIGlmIChjb25maWcuZ3JhcGhRTFB1YmxpY0ludHJvc3BlY3Rpb24gIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja0dyb3VwU2VydmVyQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLElBQUFBLE1BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFdBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FB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