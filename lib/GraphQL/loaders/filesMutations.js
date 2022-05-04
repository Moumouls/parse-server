"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.handleUpload = exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _node = _interopRequireDefault(require("parse/node"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _logger = _interopRequireDefault(require("../../logger"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function toBuffer(ab) {
  const buf = Buffer.alloc(ab.byteLength);
  const view = new Uint8Array(ab);

  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }

  return buf;
}

const handleUpload = async (upload, config) => {
  const data = toBuffer(await upload.arrayBuffer());
  console.log(data.length);
  const fileName = upload.name;
  const type = upload.type;

  if (!data || !data.length) {
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  }

  if (fileName.length > 128) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  if (!fileName.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }

  try {
    return {
      fileInfo: await config.filesController.createFile(config, fileName, data, type)
    };
  } catch (e) {
    _logger.default.error('Error creating a file: ', e);

    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${fileName}.`);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidG9CdWZmZXIiLCJhYiIsImJ1ZiIsIkJ1ZmZlciIsImFsbG9jIiwiYnl0ZUxlbmd0aCIsInZpZXciLCJVaW50OEFycmF5IiwiaSIsImxlbmd0aCIsImhhbmRsZVVwbG9hZCIsInVwbG9hZCIsImNvbmZpZyIsImRhdGEiLCJhcnJheUJ1ZmZlciIsImNvbnNvbGUiLCJsb2ciLCJmaWxlTmFtZSIsIm5hbWUiLCJ0eXBlIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsIklOVkFMSURfRklMRV9OQU1FIiwibWF0Y2giLCJmaWxlSW5mbyIsImZpbGVzQ29udHJvbGxlciIsImNyZWF0ZUZpbGUiLCJlIiwibG9nZ2VyIiwiZXJyb3IiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiY3JlYXRlTXV0YXRpb24iLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiR3JhcGhRTE5vbk51bGwiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR3JhcGhRTFVwbG9hZCIsIm91dHB1dEZpZWxkcyIsIkZJTEVfSU5GTyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLFNBQVNBLFFBQVQsQ0FBa0JDLEVBQWxCLEVBQXNCO0FBQ3BCLFFBQU1DLEdBQUcsR0FBR0MsTUFBTSxDQUFDQyxLQUFQLENBQWFILEVBQUUsQ0FBQ0ksVUFBaEIsQ0FBWjtBQUNBLFFBQU1DLElBQUksR0FBRyxJQUFJQyxVQUFKLENBQWVOLEVBQWYsQ0FBYjs7QUFDQSxPQUFLLElBQUlPLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFD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RDtBQUNGO0FBdkJpRCxHQUE3QixDQUF2QjtBQTBCQUksRUFBQUEsa0JBQWtCLENBQUNhLGNBQW5CLENBQWtDWixjQUFjLENBQUNTLElBQWYsQ0FBb0JJLEtBQXBCLENBQTBCM0IsSUFBMUIsQ0FBK0I0QixNQUFqRSxFQUF5RSxJQUF6RSxFQUErRSxJQUEvRTtBQUNBZixFQUFBQSxrQkFBa0IsQ0FBQ2EsY0FBbkIsQ0FBa0NaLGNBQWMsQ0FBQ2QsSUFBakQsRUFBdUQsSUFBdkQsRUFBNkQsSUFBN0Q7QUFDQWEsRUFBQUEsa0JBQWtCLENBQUNnQixrQkFBbkIsQ0FBc0MsWUFBdEMsRUFBb0RmLGNBQXBELEVBQW9FLElBQXBFLEVBQTBFLElBQTFFO0FBQ0QsQ0E5QkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuXG5mdW5jdGlvbiB0b0J1ZmZlcihhYikge1xuICBjb25zdCBidWYgPSBCdWZmZXIuYWxsb2MoYWIuYnl0ZUxlbmd0aCk7XG4gIGNvbnN0IHZpZXcgPSBuZXcgVWludDhBcnJheShhYik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYnVmLmxlbmd0aDsgKytpKSB7XG4gICAgYnVmW2ldID0gdmlld1tpXTtcbiAgfVxuICByZXR1cm4gYnVmO1xufVxuXG5jb25zdCBoYW5kbGVVcGxvYWQgPSBhc3luYyAodXBsb2FkLCBjb25maWcpID0+IHtcbiAgY29uc3QgZGF0YSA9IHRvQnVmZmVyKGF3YWl0IHVwbG9hZC5hcnJheUJ1ZmZlcigpKTtcbiAgY29uc29sZS5sb2coZGF0YS5sZW5ndGgpO1xuICBjb25zdCBmaWxlTmFtZSA9IHVwbG9hZC5uYW1lO1xuICBjb25zdCB0eXBlID0gdXBsb2FkLnR5cGU7XG5cbiAgaWYgKCFkYXRhIHx8ICFkYXRhLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpO1xuICB9XG5cbiAgaWYgKGZpbGVOYW1lLmxlbmd0aCA+IDEyOCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgJ0ZpbGVuYW1lIHRvbyBsb25nLicpO1xuICB9XG5cbiAgaWYgKCFmaWxlTmFtZS5tYXRjaCgvXltfYS16QS1aMC05XVthLXpBLVowLTlAXFwuXFwgfl8tXSokLykpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMuJyk7XG4gIH1cblxuICB0cnkge1xuICAgIHJldHVybiB7XG4gICAgICBmaWxlSW5mbzogYXdhaXQgY29uZmlnLmZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlKGNvbmZpZywgZmlsZU5hbWUsIGRhdGEsIHR5cGUpLFxuICAgIH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgYENvdWxkIG5vdCBzdG9yZSBmaWxlOiAke2ZpbGVOYW1lfS5gKTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGNvbnN0IGNyZWF0ZU11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgbmFtZTogJ0NyZWF0ZUZpbGUnLFxuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGNyZWF0ZUZpbGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCB1cGxvYWQgYSBuZXcgZmlsZS4nLFxuICAgIGlucHV0RmllbGRzOiB7XG4gICAgICB1cGxvYWQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgZmlsZSB0byBiZSBjcmVhdGVkIGFuZCB1cGxvYWRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5HcmFwaFFMVXBsb2FkKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGZpbGVJbmZvOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBmaWxlIGluZm8uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1cGxvYWQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgICByZXR1cm4gaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjcmVhdGVGaWxlJywgY3JlYXRlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCwgaGFuZGxlVXBsb2FkIH07XG4iXX0=