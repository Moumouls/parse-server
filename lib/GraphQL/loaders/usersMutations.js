"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));
var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));
var _defaultGraphQLTypes = require("./defaultGraphQLTypes");
var _usersQueries = require("./usersQueries");
var _mutation = require("../transformers/mutation");
var _node = _interopRequireDefault(require("parse/node"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const usersRouter = new _UsersRouter.default();
const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }
  const signUpMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SignUp',
    description: 'The signUp mutation can be used to create and sign up a new user.',
    inputFields: {
      fields: {
        descriptions: 'These are the fields of the new user to be created and signed up.',
        type: parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          fields
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          originalFields: args.fields,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', parseFields, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) {
          viewer.user.authDataResponse = authDataResponse;
        }
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(signUpMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(signUpMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('signUp', signUpMutation, true, true);
  const logInWithMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogInWith',
    description: 'The logInWith mutation can be used to signup, login user with 3rd party authentication system. This mutation create a user if the authData do not correspond to an existing one.',
    inputFields: {
      authData: {
        descriptions: 'This is the auth data of your custom auth provider',
        type: new _graphql.GraphQLNonNull(_defaultGraphQLTypes.OBJECT)
      },
      fields: {
        descriptions: 'These are the fields of the user to be created/updated and logged in.',
        type: new _graphql.GraphQLInputObjectType({
          name: 'UserLoginWithInput',
          fields: () => {
            const classGraphQLCreateFields = parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType.getFields();
            return Object.keys(classGraphQLCreateFields).reduce((fields, fieldName) => {
              if (fieldName !== 'password' && fieldName !== 'username' && fieldName !== 'authData') {
                fields[fieldName] = classGraphQLCreateFields[fieldName];
              }
              return fields;
            }, {});
          }
        })
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the new user that was created, signed up and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          fields,
          authData
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const parseFields = await (0, _mutation.transformTypes)('create', fields, {
          className: '_User',
          parseGraphQLSchema,
          originalFields: args.fields,
          req: {
            config,
            auth,
            info
          }
        });
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = await objectsMutations.createObject('_User', {
          ...parseFields,
          authData
        }, config, auth, info);
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) {
          viewer.user.authDataResponse = authDataResponse;
        }
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInWithMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInWithMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logInWith', logInWithMutation, true, true);
  const logInMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogIn',
    description: 'The logIn mutation can be used to log in an existing user.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      authData: {
        description: 'Auth data payload, needed if some required auth adapters are configured.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    outputFields: {
      viewer: {
        description: 'This is the existing user that was logged in and returned as a viewer.',
        type: new _graphql.GraphQLNonNull(parseGraphQLSchema.viewerType)
      }
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const {
          username,
          password,
          authData
        } = (0, _deepcopy.default)(args);
        const {
          config,
          auth,
          info
        } = context;
        const {
          sessionToken,
          objectId,
          authDataResponse
        } = (await usersRouter.handleLogIn({
          body: {
            username,
            password,
            authData
          },
          query: {},
          config,
          auth,
          info
        })).response;
        context.info.sessionToken = sessionToken;
        const viewer = await (0, _usersQueries.getUserFromSessionToken)(context, mutationInfo, 'viewer.user.', objectId);
        if (authDataResponse && viewer.user) {
          viewer.user.authDataResponse = authDataResponse;
        }
        return {
          viewer
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logInMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logInMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logIn', logInMutation, true, true);
  const logOutMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'LogOut',
    description: 'The logOut mutation can be used to log out an existing user.',
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async (_args, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleLogOut({
          config,
          auth,
          info
        });
        return {
          ok: true
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(logOutMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(logOutMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('logOut', logOutMutation, true, true);
  const resetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ResetPassword',
    description: 'The resetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      const {
        config,
        auth,
        info
      } = context;
      await usersRouter.handleResetRequest({
        body: {
          email
        },
        config,
        auth,
        info
      });
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(resetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('resetPassword', resetPasswordMutation, true, true);
  const confirmResetPasswordMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'ConfirmResetPassword',
    description: 'The confirmResetPassword mutation can be used to reset the password of an existing user.',
    inputFields: {
      username: {
        descriptions: 'Username of the user that have received the reset email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        descriptions: 'New password of the user',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      token: {
        descriptions: 'Reset token that was emailed to the user',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      password,
      token
    }, context) => {
      const {
        config
      } = context;
      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'you must provide a password');
      }
      if (!token) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'you must provide a token');
      }
      const userController = config.userController;
      await userController.updatePassword(token, password);
      return {
        ok: true
      };
    }
  });
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(confirmResetPasswordMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('confirmResetPassword', confirmResetPasswordMutation, true, true);
  const sendVerificationEmailMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'SendVerificationEmail',
    description: 'The sendVerificationEmail mutation can be used to send the verification email again.',
    inputFields: {
      email: {
        descriptions: 'Email of the user that should receive the verification email',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    outputFields: {
      ok: {
        description: "It's always true.",
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
      }
    },
    mutateAndGetPayload: async ({
      email
    }, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleVerificationEmailRequest({
          body: {
            email
          },
          config,
          auth,
          info
        });
        return {
          ok: true
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(sendVerificationEmailMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('sendVerificationEmail', sendVerificationEmailMutation, true, true);
  const challengeMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'Challenge',
    description: 'The challenge mutation can be used to initiate an authentication challenge when an auth adapter needs it.',
    inputFields: {
      username: {
        description: 'This is the username used to log in the user.',
        type: _graphql.GraphQLString
      },
      password: {
        description: 'This is the password used to log in the user.',
        type: _graphql.GraphQLString
      },
      authData: {
        description: 'Auth data allow to preidentify the user if the auth adapter needs preidentification.',
        type: _defaultGraphQLTypes.OBJECT
      },
      challengeData: {
        description: 'Challenge data payload, can be used to post data to auth providers to auth providers if they need data for the response.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    outputFields: {
      challengeData: {
        description: 'Challenge response from configured auth adapters.',
        type: _defaultGraphQLTypes.OBJECT
      }
    },
    mutateAndGetPayload: async (input, context) => {
      try {
        const {
          config,
          auth,
          info
        } = context;
        const {
          response
        } = await usersRouter.handleChallenge({
          body: input,
          config,
          auth,
          info
        });
        return response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(challengeMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(challengeMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('challenge', challengeMutation, true, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2RlZXBjb3B5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9Vc2Vyc1JvdXRlciIsIm9iamVjdHNNdXRhdGlvbnMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9kZWZhdWx0R3JhcGhRTFR5cGVzIiwiX3VzZXJzUXVlcmllcyIsIl9tdXRhdGlvbiIsIl9ub2RlIiwiZSIsInQiLCJXZWFrTWFwIiwiciIsIm4iLCJfX2VzTW9kdWxlIiwibyIsImkiLCJmIiwiX19wcm90b19fIiwiZGVmYXVsdCIsImhhcyIsImdldCIsInNldCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJpc1VzZXJzQ2xhc3NEaXNhYmxlZCIsInNpZ25VcE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwiZGVzY3JpcHRpb25zIiwidHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJvdXRwdXRGaWVsZHMiLCJ2aWV3ZXIiLCJHcmFwaFFMTm9uTnVsbCIsInZpZXdlclR5cGUiLCJtdXRhdGVBbmRHZXRQYXlsb2FkIiwiYXJncyIsImNvbnRleHQiLCJtdXRhdGlvbkluZm8iLCJkZWVwY29weSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJ0cmFuc2Zvcm1UeXBlcyIsImNsYXNzTmFtZSIsIm9yaWdpbmFsRmllbGRzIiwicmVxIiwic2Vzc2lvblRva2VuIiwib2JqZWN0SWQiLCJhdXRoRGF0YVJlc3BvbnNlIiwiY3JlYXRlT2JqZWN0IiwiZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4iLCJ1c2VyIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwibG9nSW5XaXRoTXV0YXRpb24iLCJhdXRoRGF0YSIsIk9CSkVDVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJrZXlzIiwicmVkdWNlIiwiZmllbGROYW1lIiwibG9nSW5NdXRhdGlvbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dE11dGF0aW9uIiwib2siLCJHcmFwaFFMQm9vbGVhbiIsIl9hcmdzIiwiaGFuZGxlTG9nT3V0IiwicmVzZXRQYXNzd29yZE11dGF0aW9uIiwiZW1haWwiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uIiwidG9rZW4iLCJQYXJzZSIsIkVycm9yIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9USEVSX0NBVVNFIiwidXNlckNvbnRyb2xsZXIiLCJ1cGRhdGVQYXNzd29yZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiY2hhbGxlbmdlTXV0YXRpb24iLCJjaGFsbGVuZ2VEYXRhIiwiaGFuZGxlQ2hhbGxlbmdlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxTdHJpbmcsIEdyYXBoUUxCb29sZWFuLCBHcmFwaFFMSW5wdXRPYmplY3RUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IFVzZXJzUm91dGVyIGZyb20gJy4uLy4uL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0IHsgT0JKRUNUIH0gZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuIH0gZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5jb25zdCB1c2Vyc1JvdXRlciA9IG5ldyBVc2Vyc1JvdXRlcigpO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5pc1VzZXJzQ2xhc3NEaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHNpZ25VcE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ1NpZ25VcCcsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgc2lnblVwIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgc2lnbiB1cCBhIG5ldyB1c2VyLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgbmV3IHVzZXIgdG8gYmUgY3JlYXRlZCBhbmQgc2lnbmVkIHVwLicsXG4gICAgICAgIHR5cGU6IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyB1c2VyIHRoYXQgd2FzIGNyZWF0ZWQsIHNpZ25lZCB1cCBhbmQgcmV0dXJuZWQgYXMgYSB2aWV3ZXIuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzLFxuICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcblxuICAgICAgICBjb250ZXh0LmluZm8uc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuICAgICAgICBjb25zdCB2aWV3ZXIgPSBhd2FpdCBnZXRVc2VyRnJvbVNlc3Npb25Ub2tlbihcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG11dGF0aW9uSW5mbyxcbiAgICAgICAgICAndmlld2VyLnVzZXIuJyxcbiAgICAgICAgICBvYmplY3RJZFxuICAgICAgICApO1xuICAgICAgICBpZiAoYXV0aERhdGFSZXNwb25zZSAmJiB2aWV3ZXIudXNlcikgeyB2aWV3ZXIudXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTsgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZpZXdlcixcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShzaWduVXBNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNpZ25VcE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdzaWduVXAnLCBzaWduVXBNdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gIGNvbnN0IGxvZ0luV2l0aE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luV2l0aCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGxvZ0luV2l0aCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWdudXAsIGxvZ2luIHVzZXIgd2l0aCAzcmQgcGFydHkgYXV0aGVudGljYXRpb24gc3lzdGVtLiBUaGlzIG11dGF0aW9uIGNyZWF0ZSBhIHVzZXIgaWYgdGhlIGF1dGhEYXRhIGRvIG5vdCBjb3JyZXNwb25kIHRvIGFuIGV4aXN0aW5nIG9uZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGlzIGlzIHRoZSBhdXRoIGRhdGEgb2YgeW91ciBjdXN0b20gYXV0aCBwcm92aWRlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChPQkpFQ1QpLFxuICAgICAgfSxcbiAgICAgIGZpZWxkczoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyBvZiB0aGUgdXNlciB0byBiZSBjcmVhdGVkL3VwZGF0ZWQgYW5kIGxvZ2dlZCBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgICAgICAgbmFtZTogJ1VzZXJMb2dpbldpdGhJbnB1dCcsXG4gICAgICAgICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHMgPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgICAnX1VzZXInXG4gICAgICAgICAgICBdLmNsYXNzR3JhcGhRTENyZWF0ZVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoY2xhc3NHcmFwaFFMQ3JlYXRlRmllbGRzKS5yZWR1Y2UoKGZpZWxkcywgZmllbGROYW1lKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdwYXNzd29yZCcgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICd1c2VybmFtZScgJiZcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgIT09ICdhdXRoRGF0YSdcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBjbGFzc0dyYXBoUUxDcmVhdGVGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgICAgfSwge30pO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgdmlld2VyOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IHVzZXIgdGhhdCB3YXMgY3JlYXRlZCwgc2lnbmVkIHVwIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgb3JpZ2luYWxGaWVsZHM6IGFyZ3MuZmllbGRzLFxuICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBzZXNzaW9uVG9rZW4sIG9iamVjdElkLCBhdXRoRGF0YVJlc3BvbnNlIH0gPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgLi4ucGFyc2VGaWVsZHMsIGF1dGhEYXRhIH0sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHZpZXdlciA9IGF3YWl0IGdldFVzZXJGcm9tU2Vzc2lvblRva2VuKFxuICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgbXV0YXRpb25JbmZvLFxuICAgICAgICAgICd2aWV3ZXIudXNlci4nLFxuICAgICAgICAgIG9iamVjdElkXG4gICAgICAgICk7XG4gICAgICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlICYmIHZpZXdlci51c2VyKSB7IHZpZXdlci51c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlOyB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdmlld2VyLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luV2l0aE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5XaXRoTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luV2l0aCcsIGxvZ0luV2l0aE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCBsb2dJbk11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0xvZ0luJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dJbiBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgaW4gYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVzZXJuYW1lIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBhc3N3b3JkIHVzZWQgdG8gbG9nIGluIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0F1dGggZGF0YSBwYXlsb2FkLCBuZWVkZWQgaWYgc29tZSByZXF1aXJlZCBhdXRoIGFkYXB0ZXJzIGFyZSBjb25maWd1cmVkLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIHZpZXdlcjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGV4aXN0aW5nIHVzZXIgdGhhdCB3YXMgbG9nZ2VkIGluIGFuZCByZXR1cm5lZCBhcyBhIHZpZXdlci4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkLCBhdXRoRGF0YSB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGNvbnN0IHsgc2Vzc2lvblRva2VuLCBvYmplY3RJZCwgYXV0aERhdGFSZXNwb25zZSB9ID0gKFxuICAgICAgICAgIGF3YWl0IHVzZXJzUm91dGVyLmhhbmRsZUxvZ0luKHtcbiAgICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICB9KVxuICAgICAgICApLnJlc3BvbnNlO1xuXG4gICAgICAgIGNvbnRleHQuaW5mby5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgY29uc3Qgdmlld2VyID0gYXdhaXQgZ2V0VXNlckZyb21TZXNzaW9uVG9rZW4oXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICBtdXRhdGlvbkluZm8sXG4gICAgICAgICAgJ3ZpZXdlci51c2VyLicsXG4gICAgICAgICAgb2JqZWN0SWRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UgJiYgdmlld2VyLnVzZXIpIHsgdmlld2VyLnVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7IH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2aWV3ZXIsXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nSW5NdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ0luTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ0luJywgbG9nSW5NdXRhdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG5cbiAgY29uc3QgbG9nT3V0TXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnTG9nT3V0JyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBsb2dPdXQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIG91dCBhbiBleGlzdGluZyB1c2VyLicsXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChfYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nT3V0KHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGxvZ091dE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUobG9nT3V0TXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2xvZ091dCcsIGxvZ091dE11dGF0aW9uLCB0cnVlLCB0cnVlKTtcblxuICBjb25zdCByZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnUmVzZXRQYXNzd29yZCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIHJlc2V0UGFzc3dvcmQgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gcmVzZXQgdGhlIHBhc3N3b3JkIG9mIGFuIGV4aXN0aW5nIHVzZXIuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgZW1haWw6IHtcbiAgICAgICAgZGVzY3JpcHRpb25zOiAnRW1haWwgb2YgdGhlIHVzZXIgdGhhdCBzaG91bGQgcmVjZWl2ZSB0aGUgcmVzZXQgZW1haWwnLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBvazoge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJJdCdzIGFsd2F5cyB0cnVlLlwiLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jICh7IGVtYWlsIH0sIGNvbnRleHQpID0+IHtcbiAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVSZXNldFJlcXVlc3Qoe1xuICAgICAgICBib2R5OiB7XG4gICAgICAgICAgZW1haWwsXG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mbyxcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShyZXNldFBhc3N3b3JkTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ3Jlc2V0UGFzc3dvcmQnLCByZXNldFBhc3N3b3JkTXV0YXRpb24sIHRydWUsIHRydWUpO1xuXG4gIGNvbnN0IGNvbmZpcm1SZXNldFBhc3N3b3JkTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ29uZmlybVJlc2V0UGFzc3dvcmQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjb25maXJtUmVzZXRQYXNzd29yZCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byByZXNldCB0aGUgcGFzc3dvcmQgb2YgYW4gZXhpc3RpbmcgdXNlci4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1c2VybmFtZToge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdVc2VybmFtZSBvZiB0aGUgdXNlciB0aGF0IGhhdmUgcmVjZWl2ZWQgdGhlIHJlc2V0IGVtYWlsJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ05ldyBwYXNzd29yZCBvZiB0aGUgdXNlcicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgICB0b2tlbjoge1xuICAgICAgICBkZXNjcmlwdGlvbnM6ICdSZXNldCB0b2tlbiB0aGF0IHdhcyBlbWFpbGVkIHRvIHRoZSB1c2VyJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgb2s6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IFwiSXQncyBhbHdheXMgdHJ1ZS5cIixcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoeyBwYXNzd29yZCwgdG9rZW4gfSwgY29udGV4dCkgPT4ge1xuICAgICAgY29uc3QgeyBjb25maWcgfSA9IGNvbnRleHQ7XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhIHBhc3N3b3JkJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ3lvdSBtdXN0IHByb3ZpZGUgYSB0b2tlbicpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IGNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIGF3YWl0IHVzZXJDb250cm9sbGVyLnVwZGF0ZVBhc3N3b3JkKHRva2VuLCBwYXNzd29yZCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsXG4gICAgdHJ1ZSxcbiAgICB0cnVlXG4gICk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25maXJtUmVzZXRQYXNzd29yZE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdjb25maXJtUmVzZXRQYXNzd29yZCcsXG4gICAgY29uZmlybVJlc2V0UGFzc3dvcmRNdXRhdGlvbixcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICBjb25zdCBzZW5kVmVyaWZpY2F0aW9uRW1haWxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdTZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBzZW5kVmVyaWZpY2F0aW9uRW1haWwgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gc2VuZCB0aGUgdmVyaWZpY2F0aW9uIGVtYWlsIGFnYWluLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIGVtYWlsOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ0VtYWlsIG9mIHRoZSB1c2VyIHRoYXQgc2hvdWxkIHJlY2VpdmUgdGhlIHZlcmlmaWNhdGlvbiBlbWFpbCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIG9rOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkl0J3MgYWx3YXlzIHRydWUuXCIsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKHsgZW1haWwgfSwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHtcbiAgICAgICAgICBib2R5OiB7XG4gICAgICAgICAgICBlbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgc2VuZFZlcmlmaWNhdGlvbkVtYWlsTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICdzZW5kVmVyaWZpY2F0aW9uRW1haWwnLFxuICAgIHNlbmRWZXJpZmljYXRpb25FbWFpbE11dGF0aW9uLFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIGNvbnN0IGNoYWxsZW5nZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NoYWxsZW5nZScsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNoYWxsZW5nZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBpbml0aWF0ZSBhbiBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2Ugd2hlbiBhbiBhdXRoIGFkYXB0ZXIgbmVlZHMgaXQuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyBpbiB0aGUgdXNlci4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcGFzc3dvcmQgdXNlZCB0byBsb2cgaW4gdGhlIHVzZXIuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIH0sXG4gICAgICBhdXRoRGF0YToge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQXV0aCBkYXRhIGFsbG93IHRvIHByZWlkZW50aWZ5IHRoZSB1c2VyIGlmIHRoZSBhdXRoIGFkYXB0ZXIgbmVlZHMgcHJlaWRlbnRpZmljYXRpb24uJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ0NoYWxsZW5nZSBkYXRhIHBheWxvYWQsIGNhbiBiZSB1c2VkIHRvIHBvc3QgZGF0YSB0byBhdXRoIHByb3ZpZGVycyB0byBhdXRoIHByb3ZpZGVycyBpZiB0aGV5IG5lZWQgZGF0YSBmb3IgdGhlIHJlc3BvbnNlLicsXG4gICAgICAgIHR5cGU6IE9CSkVDVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGNoYWxsZW5nZURhdGE6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGFsbGVuZ2UgcmVzcG9uc2UgZnJvbSBjb25maWd1cmVkIGF1dGggYWRhcHRlcnMuJyxcbiAgICAgICAgdHlwZTogT0JKRUNULFxuICAgICAgfSxcbiAgICB9LFxuICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChpbnB1dCwgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgY29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlQ2hhbGxlbmdlKHtcbiAgICAgICAgICBib2R5OiBpbnB1dCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNoYWxsZW5nZU11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2hhbGxlbmdlTXV0YXRpb24udHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oJ2NoYWxsZW5nZScsIGNoYWxsZW5nZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsU0FBQSxHQUFBQyxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksWUFBQSxHQUFBRCxzQkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUssZ0JBQUEsR0FBQUMsdUJBQUEsQ0FBQU4sT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFQLE9BQUE7QUFDQSxJQUFBUSxhQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxTQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxL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