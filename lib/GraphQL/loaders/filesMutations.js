"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.handleUpload = void 0;
var _graphql = require("graphql");
var _http = require("http");
var _mime = require("mime");
var _graphqlRelay = require("graphql-relay");
var _node = _interopRequireDefault(require("parse/node"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var _logger = _interopRequireDefault(require("../../logger"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// Handle GraphQL file upload and proxy file upload to GraphQL server url specified in config;
// `createFile` is not directly called by Parse Server to leverage standard file upload mechanism
const handleUpload = async (upload, config) => {
  const {
    createReadStream,
    filename,
    mimetype
  } = await upload;
  const headers = _objectSpread({}, config.headers);
  delete headers['accept-encoding'];
  delete headers['accept'];
  delete headers['connection'];
  delete headers['host'];
  delete headers['content-length'];
  const stream = createReadStream();
  try {
    const ext = (0, _mime.getExtension)(mimetype);
    const fullFileName = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
    const serverUrl = new URL(config.serverURL);
    const fileInfo = await new Promise((resolve, reject) => {
      const req = (0, _http.request)({
        hostname: serverUrl.hostname,
        port: serverUrl.port,
        path: `${serverUrl.pathname}/files/${fullFileName}`,
        method: 'POST',
        headers
      }, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new _node.default.Error(_node.default.error, data));
          }
        });
      });
      stream.pipe(req);
      stream.on('end', () => {
        req.end();
      });
    });
    return {
      fileInfo
    };
  } catch (e) {
    stream.destroy();
    _logger.default.error('Error creating a file: ', e);
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`);
  }
};
exports.handleUpload = handleUpload;
const load = parseGraphQLSchema => {
  const createMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'CreateFile',
    description: 'The createFile mutation can be used to create and upload a new file.',
    inputFields: {
      upload: {
        description: 'This is the new file to be created and uploaded.',
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.GraphQLUpload)
      }
    },
    outputFields: {
      fileInfo: {
        description: 'This is the created file info.',
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.FILE_INFO)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          upload
        } = args;
        const {
          config
        } = context;
        return handleUpload(upload, config);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(createMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createFile', createMutation, true, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfaHR0cCIsIl9taW1lIiwiX2dyYXBocWxSZWxheSIsIl9ub2RlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9sb2dnZXIiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJlIiwiV2Vha01hcCIsInIiLCJ0IiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJuIiwiX19wcm90b19fIiwiYSIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwidSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImkiLCJzZXQiLCJvd25LZXlzIiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsIl90b1Byb3BlcnR5S2V5IiwidmFsdWUiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsIl90b1ByaW1pdGl2ZSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiVHlwZUVycm9yIiwiU3RyaW5nIiwiTnVtYmVyIiwiaGFuZGxlVXBsb2FkIiwidXBsb2FkIiwiY29uZmlnIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZpbGVuYW1lIiwibWltZXR5cGUiLCJoZWFkZXJzIiwic3RyZWFtIiwiZXh0IiwiZ2V0RXh0ZW5zaW9uIiwiZnVsbEZpbGVOYW1lIiwiZW5kc1dpdGgiLCJzZXJ2ZXJVcmwiLCJVUkwiLCJzZXJ2ZXJVUkwiLCJmaWxlSW5mbyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicmVxIiwicmVxdWVzdCIsImhvc3RuYW1lIiwicG9ydCIsInBhdGgiLCJwYXRobmFtZSIsIm1ldGhvZCIsInJlcyIsImRhdGEiLCJvbiIsImNodW5rIiwiSlNPTiIsInBhcnNlIiwiUGFyc2UiLCJFcnJvciIsImVycm9yIiwicGlwZSIsImVuZCIsImRlc3Ryb3kiLCJsb2dnZXIiLCJGSUxFX1NBVkVfRVJST1IiLCJleHBvcnRzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImNyZWF0ZU11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTFVwbG9hZCIsIm91dHB1dEZpZWxkcyIsIkZJTEVfSU5GTyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHJlcXVlc3QgfSBmcm9tICdodHRwJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbiB9IGZyb20gJ21pbWUnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG4vLyBIYW5kbGUgR3JhcGhRTCBmaWxlIHVwbG9hZCBhbmQgcHJveHkgZmlsZSB1cGxvYWQgdG8gR3JhcGhRTCBzZXJ2ZXIgdXJsIHNwZWNpZmllZCBpbiBjb25maWc7XG4vLyBgY3JlYXRlRmlsZWAgaXMgbm90IGRpcmVjdGx5IGNhbGxlZCBieSBQYXJzZSBTZXJ2ZXIgdG8gbGV2ZXJhZ2Ugc3RhbmRhcmQgZmlsZSB1cGxvYWQgbWVjaGFuaXNtXG5jb25zdCBoYW5kbGVVcGxvYWQgPSBhc3luYyAodXBsb2FkLCBjb25maWcpID0+IHtcbiAgY29uc3QgeyBjcmVhdGVSZWFkU3RyZWFtLCBmaWxlbmFtZSwgbWltZXR5cGUgfSA9IGF3YWl0IHVwbG9hZDtcbiAgY29uc3QgaGVhZGVycyA9IHsgLi4uY29uZmlnLmhlYWRlcnMgfTtcbiAgZGVsZXRlIGhlYWRlcnNbJ2FjY2VwdC1lbmNvZGluZyddO1xuICBkZWxldGUgaGVhZGVyc1snYWNjZXB0J107XG4gIGRlbGV0ZSBoZWFkZXJzWydjb25uZWN0aW9uJ107XG4gIGRlbGV0ZSBoZWFkZXJzWydob3N0J107XG4gIGRlbGV0ZSBoZWFkZXJzWydjb250ZW50LWxlbmd0aCddO1xuICBjb25zdCBzdHJlYW0gPSBjcmVhdGVSZWFkU3RyZWFtKCk7XG4gIHRyeSB7XG4gICAgY29uc3QgZXh0ID0gZ2V0RXh0ZW5zaW9uKG1pbWV0eXBlKTtcbiAgICBjb25zdCBmdWxsRmlsZU5hbWUgPSBmaWxlbmFtZS5lbmRzV2l0aChgLiR7ZXh0fWApID8gZmlsZW5hbWUgOiBgJHtmaWxlbmFtZX0uJHtleHR9YDtcbiAgICBjb25zdCBzZXJ2ZXJVcmwgPSBuZXcgVVJMKGNvbmZpZy5zZXJ2ZXJVUkwpO1xuICAgIGNvbnN0IGZpbGVJbmZvID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgcmVxID0gcmVxdWVzdChcbiAgICAgICAge1xuICAgICAgICAgIGhvc3RuYW1lOiBzZXJ2ZXJVcmwuaG9zdG5hbWUsXG4gICAgICAgICAgcG9ydDogc2VydmVyVXJsLnBvcnQsXG4gICAgICAgICAgcGF0aDogYCR7c2VydmVyVXJsLnBhdGhuYW1lfS9maWxlcy8ke2Z1bGxGaWxlTmFtZX1gLFxuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnMsXG4gICAgICAgIH0sXG4gICAgICAgIHJlcyA9PiB7XG4gICAgICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiB7XG4gICAgICAgICAgICBkYXRhICs9IGNodW5rO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGRhdGEpKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5lcnJvciwgZGF0YSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICApO1xuICAgICAgc3RyZWFtLnBpcGUocmVxKTtcbiAgICAgIHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICByZXEuZW5kKCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZUluZm8sXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN0cmVhbS5kZXN0cm95KCk7XG4gICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsIGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlbmFtZX0uYCk7XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBjcmVhdGVNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgIG5hbWU6ICdDcmVhdGVGaWxlJyxcbiAgICBkZXNjcmlwdGlvbjogJ1RoZSBjcmVhdGVGaWxlIG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhbmQgdXBsb2FkIGEgbmV3IGZpbGUuJyxcbiAgICBpbnB1dEZpZWxkczoge1xuICAgICAgdXBsb2FkOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbmV3IGZpbGUgdG8gYmUgY3JlYXRlZCBhbmQgdXBsb2FkZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuR3JhcGhRTFVwbG9hZCksXG4gICAgICB9LFxuICAgIH0sXG4gICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICBmaWxlSW5mbzoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgZmlsZSBpbmZvLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXBsb2FkIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi50eXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbignY3JlYXRlRmlsZScsIGNyZWF0ZU11dGF0aW9uLCB0cnVlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQsIGhhbmRsZVVwbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxLQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxhQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFDLHNCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTSxtQkFBQSxHQUFBQyx1QkFBQSxDQUFBUCxPQUFBO0FBQ0EsSUFBQVEsT0FBQSxHQUFBSCxzQkFBQSxDQUFBTCxPQUFBO0FBQWtDLFNBQUFTLHlCQUFBQyxDQUFBLDZCQUFBQyxPQUFBLG1CQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLENBQUEsV0FBQUEsQ0FBQSxHQUFBRyxDQUFBLEdBQUFELENBQUEsS0FBQUYsQ0FBQTtBQUFBLFNBQUFILHdCQUFBRyxDQUFBLEVBQUFFLENBQUEsU0FBQUEsQ0FBQSxJQUFBRixDQUFBLElBQUFBLENBQUEsQ0FBQUksVUFBQSxTQUFBSixDQUFBLGVBQUFBLENBQUEsdUJBQUFBLENBQUEseUJBQUFBLENBQUEsV0FBQUssT0FBQSxFQUFBTCxDQUFBLFFBQUFHLENBQUEsR0FBQUosd0JBQUEsQ0FBQUcsQ0FBQSxPQUFBQyxDQUFBLElBQUFBLENBQUEsQ0FBQUcsR0FBQSxDQUFBTixDQUFBLFVBQUFHLENBQUEsQ0FBQUksR0FBQSxDQUFBUCxDQUFBLE9BQUFRLENBQUEsS0FBQUMsU0FBQSxVQUFBQyxDQUFBLEdBQUFDLE1BQUEsQ0FBQUMsY0FBQSxJQUFBRCxNQUFBLENBQUFFLHdCQUFBLFdBQUFDLENBQUEsSUFBQWQsQ0FBQSxvQkFBQWMsQ0FBQSxPQUFBQyxj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