"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.FilesController = void 0;
var _cryptoUtils = require("../cryptoUtils");
var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));
var _FilesAdapter = require("../Adapters/Files/FilesAdapter");
var _path = _interopRequireDefault(require("path"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// FilesController.js

const Parse = require('parse').Parse;
const legacyFilesRegex = new RegExp('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-.*');
class FilesController extends _AdaptableController.default {
  getFileData(config, filename) {
    return this.adapter.getFileData(filename);
  }
  async createFile(config, filename, data, contentType, options) {
    const extname = _path.default.extname(filename);
    const hasExtension = extname.length > 0;
    const mime = (await import('mime')).default;
    if (!hasExtension && contentType && mime.getExtension(contentType)) {
      filename = filename + '.' + mime.getExtension(contentType);
    } else if (hasExtension && !contentType) {
      contentType = mime.getType(filename);
    }
    if (!this.options.preserveFileName) {
      filename = (0, _cryptoUtils.randomHexString)(32) + '_' + filename;
    }
    const location = await this.adapter.getFileLocation(config, filename);
    await this.adapter.createFile(filename, data, contentType, options);
    return {
      url: location,
      name: filename
    };
  }
  deleteFile(config, filename) {
    return this.adapter.deleteFile(filename);
  }
  getMetadata(filename) {
    if (typeof this.adapter.getMetadata === 'function') {
      return this.adapter.getMetadata(filename);
    }
    return Promise.resolve({});
  }

  /**
   * Find file references in REST-format object and adds the url key
   * with the current mount point and app id.
   * Object may be a single object or list of REST-format objects.
   */
  async expandFilesInObject(config, object) {
    if (object instanceof Array) {
      const promises = object.map(obj => this.expandFilesInObject(config, obj));
      await Promise.all(promises);
      return;
    }
    if (typeof object !== 'object') {
      return;
    }
    for (const key in object) {
      const fileObject = object[key];
      if (fileObject && fileObject['__type'] === 'File') {
        if (fileObject['url']) {
          continue;
        }
        const filename = fileObject['name'];
        // all filenames starting with "tfss-" should be from files.parsetfss.com
        // all filenames starting with a "-" seperated UUID should be from files.parse.com
        // all other filenames have been migrated or created from Parse Server
        if (config.fileKey === undefined) {
          fileObject['url'] = await this.adapter.getFileLocation(config, filename);
        } else {
          if (filename.indexOf('tfss-') === 0) {
            fileObject['url'] = 'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else if (legacyFilesRegex.test(filename)) {
            fileObject['url'] = 'http://files.parse.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else {
            fileObject['url'] = await this.adapter.getFileLocation(config, filename);
          }
        }
      }
    }
  }
  expectedAdapterType() {
    return _FilesAdapter.FilesAdapter;
  }
  handleFileStream(config, filename, req, res, contentType) {
    return this.adapter.handleFileStream(filename, req, res, contentType);
  }
  validateFilename(filename) {
    if (typeof this.adapter.validateFilename === 'function') {
      const error = this.adapter.validateFilename(filename);
      if (typeof error !== 'string') {
        return error;
      }
      return new Parse.Error(Parse.Error.INVALID_FILE_NAME, error);
    }
    return (0, _FilesAdapter.validateFilename)(filename);
  }
}
exports.FilesController = FilesController;
var _default = exports.default = FilesController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX0ZpbGVzQWRhcHRlciIsIl9wYXRoIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiUGFyc2UiLCJsZWdhY3lGaWxlc1JlZ2V4IiwiUmVnRXhwIiwiRmlsZXNDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImdldEZpbGVEYXRhIiwiY29uZmlnIiwiZmlsZW5hbWUiLCJhZGFwdGVyIiwiY3JlYXRlRmlsZSIsImRhdGEiLCJjb250ZW50VHlwZSIsIm9wdGlvbnMiLCJleHRuYW1lIiwicGF0aCIsImhhc0V4dGVuc2lvbiIsImxlbmd0aCIsIm1pbWUiLCJnZXRFeHRlbnNpb24iLCJnZXRUeXBlIiwicHJlc2VydmVGaWxlTmFtZSIsInJhbmRvbUhleFN0cmluZyIsImxvY2F0aW9uIiwiZ2V0RmlsZUxvY2F0aW9uIiwidXJsIiwibmFtZSIsImRlbGV0ZUZpbGUiLCJnZXRNZXRhZGF0YSIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm9iamVjdCIsIkFycmF5IiwicHJvbWlzZXMiLCJtYXAiLCJvYmoiLCJhbGwiLCJrZXkiLCJmaWxlT2JqZWN0IiwiZmlsZUtleSIsInVuZGVmaW5lZCIsImluZGV4T2YiLCJlbmNvZGVVUklDb21wb25lbnQiLCJ0ZXN0IiwiZXhwZWN0ZWRBZGFwdGVyVHlwZSIsIkZpbGVzQWRhcHRlciIsImhhbmRsZUZpbGVTdHJlYW0iLCJyZXEiLCJyZXMiLCJ2YWxpZGF0ZUZpbGVuYW1lIiwiZXJyb3IiLCJFcnJvciIsIklOVkFMSURfRklMRV9OQU1FIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL0ZpbGVzQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlc0NvbnRyb2xsZXIuanNcbmltcG9ydCB7IHJhbmRvbUhleFN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCBBZGFwdGFibGVDb250cm9sbGVyIGZyb20gJy4vQWRhcHRhYmxlQ29udHJvbGxlcic7XG5pbXBvcnQgeyB2YWxpZGF0ZUZpbGVuYW1lLCBGaWxlc0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9GaWxlcy9GaWxlc0FkYXB0ZXInO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlJykuUGFyc2U7XG5cbmNvbnN0IGxlZ2FjeUZpbGVzUmVnZXggPSBuZXcgUmVnRXhwKFxuICAnXlswLTlhLWZBLUZdezh9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezR9LVswLTlhLWZBLUZdezEyfS0uKidcbik7XG5cbmV4cG9ydCBjbGFzcyBGaWxlc0NvbnRyb2xsZXIgZXh0ZW5kcyBBZGFwdGFibGVDb250cm9sbGVyIHtcbiAgZ2V0RmlsZURhdGEoY29uZmlnLCBmaWxlbmFtZSkge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZ2V0RmlsZURhdGEoZmlsZW5hbWUpO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlRmlsZShjb25maWcsIGZpbGVuYW1lLCBkYXRhLCBjb250ZW50VHlwZSwgb3B0aW9ucykge1xuICAgIGNvbnN0IGV4dG5hbWUgPSBwYXRoLmV4dG5hbWUoZmlsZW5hbWUpO1xuXG4gICAgY29uc3QgaGFzRXh0ZW5zaW9uID0gZXh0bmFtZS5sZW5ndGggPiAwO1xuICAgIGNvbnN0IG1pbWUgPSAoYXdhaXQgaW1wb3J0KCdtaW1lJykpLmRlZmF1bHRcbiAgICBpZiAoIWhhc0V4dGVuc2lvbiAmJiBjb250ZW50VHlwZSAmJiBtaW1lLmdldEV4dGVuc2lvbihjb250ZW50VHlwZSkpIHtcbiAgICAgIGZpbGVuYW1lID0gZmlsZW5hbWUgKyAnLicgKyBtaW1lLmdldEV4dGVuc2lvbihjb250ZW50VHlwZSk7XG4gICAgfSBlbHNlIGlmIChoYXNFeHRlbnNpb24gJiYgIWNvbnRlbnRUeXBlKSB7XG4gICAgICBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMucHJlc2VydmVGaWxlTmFtZSkge1xuICAgICAgZmlsZW5hbWUgPSByYW5kb21IZXhTdHJpbmcoMzIpICsgJ18nICsgZmlsZW5hbWU7XG4gICAgfVxuXG4gICAgY29uc3QgbG9jYXRpb24gPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpO1xuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5jcmVhdGVGaWxlKGZpbGVuYW1lLCBkYXRhLCBjb250ZW50VHlwZSwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHVybDogbG9jYXRpb24sXG4gICAgICBuYW1lOiBmaWxlbmFtZSxcbiAgICB9XG4gIH1cblxuICBkZWxldGVGaWxlKGNvbmZpZywgZmlsZW5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUZpbGUoZmlsZW5hbWUpO1xuICB9XG5cbiAgZ2V0TWV0YWRhdGEoZmlsZW5hbWUpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuYWRhcHRlci5nZXRNZXRhZGF0YSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5nZXRNZXRhZGF0YShmaWxlbmFtZSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbmQgZmlsZSByZWZlcmVuY2VzIGluIFJFU1QtZm9ybWF0IG9iamVjdCBhbmQgYWRkcyB0aGUgdXJsIGtleVxuICAgKiB3aXRoIHRoZSBjdXJyZW50IG1vdW50IHBvaW50IGFuZCBhcHAgaWQuXG4gICAqIE9iamVjdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0IG9yIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cy5cbiAgICovXG4gIGFzeW5jIGV4cGFuZEZpbGVzSW5PYmplY3QoY29uZmlnLCBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIGNvbnN0IHByb21pc2VzID0gb2JqZWN0Lm1hcChvYmogPT4gdGhpcy5leHBhbmRGaWxlc0luT2JqZWN0KGNvbmZpZywgb2JqKSk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICAgIGNvbnN0IGZpbGVPYmplY3QgPSBvYmplY3Rba2V5XTtcbiAgICAgIGlmIChmaWxlT2JqZWN0ICYmIGZpbGVPYmplY3RbJ19fdHlwZSddID09PSAnRmlsZScpIHtcbiAgICAgICAgaWYgKGZpbGVPYmplY3RbJ3VybCddKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBmaWxlT2JqZWN0WyduYW1lJ107XG4gICAgICAgIC8vIGFsbCBmaWxlbmFtZXMgc3RhcnRpbmcgd2l0aCBcInRmc3MtXCIgc2hvdWxkIGJlIGZyb20gZmlsZXMucGFyc2V0ZnNzLmNvbVxuICAgICAgICAvLyBhbGwgZmlsZW5hbWVzIHN0YXJ0aW5nIHdpdGggYSBcIi1cIiBzZXBlcmF0ZWQgVVVJRCBzaG91bGQgYmUgZnJvbSBmaWxlcy5wYXJzZS5jb21cbiAgICAgICAgLy8gYWxsIG90aGVyIGZpbGVuYW1lcyBoYXZlIGJlZW4gbWlncmF0ZWQgb3IgY3JlYXRlZCBmcm9tIFBhcnNlIFNlcnZlclxuICAgICAgICBpZiAoY29uZmlnLmZpbGVLZXkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGZpbGVPYmplY3RbJ3VybCddID0gYXdhaXQgdGhpcy5hZGFwdGVyLmdldEZpbGVMb2NhdGlvbihjb25maWcsIGZpbGVuYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoZmlsZW5hbWUuaW5kZXhPZigndGZzcy0nKSA9PT0gMCkge1xuICAgICAgICAgICAgZmlsZU9iamVjdFsndXJsJ10gPVxuICAgICAgICAgICAgICAnaHR0cDovL2ZpbGVzLnBhcnNldGZzcy5jb20vJyArIGNvbmZpZy5maWxlS2V5ICsgJy8nICsgZW5jb2RlVVJJQ29tcG9uZW50KGZpbGVuYW1lKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGxlZ2FjeUZpbGVzUmVnZXgudGVzdChmaWxlbmFtZSkpIHtcbiAgICAgICAgICAgIGZpbGVPYmplY3RbJ3VybCddID1cbiAgICAgICAgICAgICAgJ2h0dHA6Ly9maWxlcy5wYXJzZS5jb20vJyArIGNvbmZpZy5maWxlS2V5ICsgJy8nICsgZW5jb2RlVVJJQ29tcG9uZW50KGZpbGVuYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmlsZU9iamVjdFsndXJsJ10gPSBhd2FpdCB0aGlzLmFkYXB0ZXIuZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGV4cGVjdGVkQWRhcHRlclR5cGUoKSB7XG4gICAgcmV0dXJuIEZpbGVzQWRhcHRlcjtcbiAgfVxuXG4gIGhhbmRsZUZpbGVTdHJlYW0oY29uZmlnLCBmaWxlbmFtZSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKSB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5oYW5kbGVGaWxlU3RyZWFtKGZpbGVuYW1lLCByZXEsIHJlcywgY29udGVudFR5cGUpO1xuICB9XG5cbiAgdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5hZGFwdGVyLnZhbGlkYXRlRmlsZW5hbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gdGhpcy5hZGFwdGVyLnZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpO1xuICAgICAgaWYgKHR5cGVvZiBlcnJvciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0ZJTEVfTkFNRSwgZXJyb3IpO1xuICAgIH1cbiAgICByZXR1cm4gdmFsaWRhdGVGaWxlbmFtZShmaWxlbmFtZSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgRmlsZXNDb250cm9sbGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxJQUFBQSxZQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxvQkFBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsYUFBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQXdCLFNBQUFFLHVCQUFBRyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBSnhCOztBQUtBLE1BQU1HLEtBQUssR0FBR1IsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDUSxLQUFLO0FBRXBDLE1BQU1DLGdCQUFnQixHQUFHLElBQUlDLE1BQU0sQ0FDakMsaUZBQ0YsQ0FBQztBQUVNLE1BQU1DLGVBQWUsU0FBU0MsNEJBQW1CLENBQUM7RUFDdkRDLFdBQVdBLENBQUNDLE1BQU0sRUFBRUMsUUFBUSxFQUFFO0lBQzVCLE9BQU8sSUFBSSxDQUFDQyxPQUFPLENBQUNILFdBQVcsQ0FBQ0UsUUFBUSxDQUFDO0VBQzNDO0VBRUEsTUFBTUUsVUFBVUEsQ0FBQ0gsTUFBTSxFQUFFQyxRQUFRLEVBQUVHLElBQUksRUFBRUMsV0FBVyxFQUFFQyxPQUFPLEVBQUU7SUFDN0QsTUFBTUMsT0FBTyxHQUFHQyxhQUFJLENBQUNELE9BQU8sQ0FBQ04sUUFBUSxDQUFDO0lBRXRDLE1BQU1RLFlBQVksR0FBR0YsT0FBTyxDQUFDRyxN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NkJBQTZCLEdBQUdoQyxNQUFNLENBQUNpQyxPQUFPLEdBQUcsR0FBRyxHQUFHRyxrQkFBa0IsQ0FBQ25DLFFBQVEsQ0FBQztVQUN2RixDQUFDLE1BQU0sSUFBSU4sZ0JBQWdCLENBQUMwQyxJQUFJLENBQUNwQyxRQUFRLENBQUMsRUFBRTtZQUMxQytCLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FDZix5QkFBeUIsR0FBR2hDLE1BQU0sQ0FBQ2lDLE9BQU8sR0FBRyxHQUFHLEdBQUdHLGtCQUFrQixDQUFDbkMsUUFBUSxDQUFDO1VBQ25GLENBQUMsTUFBTTtZQUNMK0IsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDOUIsT0FBTyxDQUFDZSxlQUFlLENBQUNqQixNQUFNLEVBQUVDLFFBQVEsQ0FBQztVQUMxRTtRQUNGO01BQ0Y7SUFDRjtFQUNGO0VBRUFxQyxtQkFBbUJBLENBQUEsRUFBRztJQUNwQixPQUFPQywwQkFBWTtFQUNyQjtFQUVBQyxnQkFBZ0JBLENBQUN4QyxNQUFNLEVBQUVDLFFBQVEsRUFBRXdDLEdBQUcsRUFBRUMsR0FBRyxFQUFFckMsV0FBVyxFQUFFO0lBQ3hELE9BQU8sSUFBSSxDQUFDSCxPQUFPLENBQUNzQyxnQkFBZ0IsQ0FBQ3ZDLFFBQVEsRUFBRXdDLEdBQUcsRUFBRUMsR0FBRyxFQUFFckMsV0FBVyxDQUFDO0VBQ3ZFO0VBRUFzQyxnQkFBZ0JBLENBQUMxQyxRQUFRLEVBQUU7SUFDekIsSUFBSSxPQUFPLElBQUksQ0FBQ0MsT0FBTyxDQUFDeUMsZ0JBQWdCLEtBQUssVUFBVSxFQUFFO01BQ3ZELE1BQU1DLEtBQUssR0FBRyxJQUFJLENBQUMxQyxPQUFPLENBQUN5QyxnQkFBZ0IsQ0FBQzFDLFFBQVEsQ0FBQztNQUNyRCxJQUFJLE9BQU8yQyxLQUFLLEtBQUssUUFBUSxFQUFFO1FBQzdCLE9BQU9BLEtBQUs7TUFDZDtNQUNBLE9BQU8sSUFBSWxELEtBQUssQ0FBQ21ELEtBQUssQ0FBQ25ELEtBQUssQ0FBQ21ELEtBQUssQ0FBQ0MsaUJBQWlCLEVBQUVGLEtBQUssQ0FBQztJQUM5RDtJQUNBLE9BQU8sSUFBQUQsOEJBQWdCLEVBQUMxQyxRQUFRLENBQUM7RUFDbkM7QUFDRjtBQUFDOEMsT0FBQSxDQUFBbEQsZUFBQSxHQUFBQSxlQUFBO0FBQUEsSUFBQW1ELFFBQUEsR0FBQUQsT0FBQSxDQUFBdEQsT0FBQSxHQUVjSSxlQUFlIiwiaWdub3JlTGlzdCI6W119