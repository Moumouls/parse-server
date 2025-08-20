"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = void 0;
var _express = _interopRequireDefault(require("express"));
var Middlewares = _interopRequireWildcard(require("../middlewares"));
var _node = _interopRequireDefault(require("parse/node"));
var _Config = _interopRequireDefault(require("../Config"));
var _logger = _interopRequireDefault(require("../logger"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const triggers = require('../triggers');
const http = require('http');
const Utils = require('../Utils');
const downloadFileFromURI = uri => {
  return new Promise((res, rej) => {
    http.get(uri, response => {
      response.setDefaultEncoding('base64');
      let body = `data:${response.headers['content-type']};base64,`;
      response.on('data', data => body += data);
      response.on('end', () => res(body));
    }).on('error', e => {
      rej(`Error downloading file from ${uri}: ${e.message}`);
    });
  });
};
const addFileDataIfNeeded = async file => {
  if (file._source.format === 'uri') {
    const base64 = await downloadFileFromURI(file._source.uri);
    file._previousSave = file;
    file._data = base64;
    file._requestTask = null;
  }
  return file;
};
class FilesRouter {
  expressRouter({
    maxUploadSize = '20Mb'
  } = {}) {
    var router = _express.default.Router();
    router.get('/files/:appId/:filename', this.getHandler);
    router.get('/files/:appId/metadata/:filename', this.metadataHandler);
    router.post('/files', function (req, res, next) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });
    router.post('/files/:filename', _express.default.raw({
      type: () => {
        return true;
      },
      limit: maxUploadSize
    }),
    // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, Middlewares.handleParseSession, this.createHandler);
    router.delete('/files/:filename', Middlewares.handleParseHeaders, Middlewares.handleParseSession, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }
  async getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);
    if (!config) {
      res.status(403);
      const err = new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'Invalid application ID.');
      res.json({
        code: err.code,
        error: err.message
      });
      return;
    }
    let filename = req.params.filename;
    try {
      const filesController = config.filesController;
      const mime = (await import('mime')).default;
      let contentType = mime.getType(filename);
      let file = new _node.default.File(filename, {
        base64: ''
      }, contentType);
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeFind, {
        file
      }, config, req.auth);
      if (triggerResult?.file?._name) {
        filename = triggerResult?.file?._name;
        contentType = mime.getType(filename);
      }
      if (isFileStreamable(req, filesController)) {
        filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
          res.status(404);
          res.set('Content-Type', 'text/plain');
          res.end('File not found.');
        });
        return;
      }
      let data = await filesController.getFileData(config, filename).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
      if (!data) {
        return;
      }
      file = new _node.default.File(filename, {
        base64: data.toString('base64')
      }, contentType);
      const afterFind = await triggers.maybeRunFileTrigger(triggers.Types.afterFind, {
        file,
        forceDownload: false
      }, config, req.auth);
      if (afterFind?.file) {
        contentType = mime.getType(afterFind.file._name);
        data = Buffer.from(afterFind.file._data, 'base64');
      }
      res.status(200);
      res.set('Content-Type', contentType);
      res.set('Content-Length', data.length);
      if (afterFind.forceDownload) {
        res.set('Content-Disposition', `attachment;filename=${afterFind.file._name}`);
      }
      res.end(data);
    } catch (e) {
      const err = triggers.resolveError(e, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: `Could not find file: ${filename}.`
      });
      res.status(403);
      res.json({
        code: err.code,
        error: err.message
      });
    }
  }
  async createHandler(req, res, next) {
    const config = req.config;
    const user = req.auth.user;
    const isMaster = req.auth.isMaster;
    const isLinked = user && _node.default.AnonymousUtils.isLinked(user);
    if (!isMaster && !config.fileUpload.enableForAnonymousUser && isLinked) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForAuthenticatedUser && !isLinked && user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by authenticated user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForPublic && !user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.'));
      return;
    }
    const filesController = config.filesController;
    const {
      filename
    } = req.params;
    const contentType = req.get('Content-type');
    if (!req.body || !req.body.length) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }
    const error = filesController.validateFilename(filename);
    if (error) {
      next(error);
      return;
    }
    const fileExtensions = config.fileUpload?.fileExtensions;
    if (!isMaster && fileExtensions) {
      const isValidExtension = extension => {
        return fileExtensions.some(ext => {
          if (ext === '*') {
            return true;
          }
          const regex = new RegExp(ext);
          if (regex.test(extension)) {
            return true;
          }
        });
      };
      let extension = contentType;
      if (filename && filename.includes('.')) {
        extension = filename.substring(filename.lastIndexOf('.') + 1);
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = extension?.split(' ')?.join('');
      if (extension && !isValidExtension(extension)) {
        next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `File upload of extension ${extension} is disabled.`));
        return;
      }
    }
    const base64 = req.body.toString('base64');
    const file = new _node.default.File(filename, {
      base64
    }, contentType);
    const {
      metadata = {},
      tags = {}
    } = req.fileData || {};
    try {
      // Scan request data for denied keywords
      Utils.checkProhibitedKeywords(config, metadata);
      Utils.checkProhibitedKeywords(config, tags);
    } catch (error) {
      next(new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, error));
      return;
    }
    file.setTags(tags);
    file.setMetadata(metadata);
    const fileSize = Buffer.byteLength(req.body);
    const fileObject = {
      file,
      fileSize
    };
    try {
      // run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeSave, fileObject, config, req.auth);
      let saveResult;
      // if a new ParseFile is returned check if it's an already saved file
      if (triggerResult instanceof _node.default.File) {
        fileObject.file = triggerResult;
        if (triggerResult.url()) {
          // set fileSize to null because we wont know how big it is here
          fileObject.fileSize = null;
          saveResult = {
            url: triggerResult.url(),
            name: triggerResult._name
          };
        }
      }
      // if the file returned by the trigger has already been saved skip saving anything
      if (!saveResult) {
        // if the ParseFile returned is type uri, download the file before saving it
        await addFileDataIfNeeded(fileObject.file);
        // update fileSize
        const bufferData = Buffer.from(fileObject.file._data, 'base64');
        fileObject.fileSize = Buffer.byteLength(bufferData);
        // prepare file options
        const fileOptions = {
          metadata: fileObject.file._metadata
        };
        // some s3-compatible providers (DigitalOcean, Linode) do not accept tags
        // so we do not include the tags option if it is empty.
        const fileTags = Object.keys(fileObject.file._tags).length > 0 ? {
          tags: fileObject.file._tags
        } : {};
        Object.assign(fileOptions, fileTags);
        // save file
        const createFileResult = await filesController.createFile(config, fileObject.file._name, bufferData, fileObject.file._source.type, fileOptions);
        // update file with new data
        fileObject.file._name = createFileResult.name;
        fileObject.file._url = createFileResult.url;
        fileObject.file._requestTask = null;
        fileObject.file._previousSave = Promise.resolve(fileObject.file);
        saveResult = {
          url: createFileResult.url,
          name: createFileResult.name
        };
      }
      // run afterSaveFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterSave, fileObject, config, req.auth);
      res.status(201);
      res.set('Location', saveResult.url);
      res.json(saveResult);
    } catch (e) {
      _logger.default.error('Error creating a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_SAVE_ERROR,
        message: `Could not store file: ${fileObject.file._name}.`
      });
      next(error);
    }
  }
  async deleteHandler(req, res, next) {
    try {
      const {
        filesController
      } = req.config;
      const {
        filename
      } = req.params;
      // run beforeDeleteFile trigger
      const file = new _node.default.File(filename);
      file._url = await filesController.adapter.getFileLocation(req.config, filename);
      const fileObject = {
        file,
        fileSize: null
      };
      await triggers.maybeRunFileTrigger(triggers.Types.beforeDelete, fileObject, req.config, req.auth);
      // delete file
      await filesController.deleteFile(req.config, filename);
      // run afterDeleteFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterDelete, fileObject, req.config, req.auth);
      res.status(200);
      // TODO: return useful JSON here?
      res.end();
    } catch (e) {
      _logger.default.error('Error deleting a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_DELETE_ERROR,
        message: 'Could not delete file.'
      });
      next(error);
    }
  }
  async metadataHandler(req, res) {
    try {
      const config = _Config.default.get(req.params.appId);
      const {
        filesController
      } = config;
      const {
        filename
      } = req.params;
      const data = await filesController.getMetadata(filename);
      res.status(200);
      res.json(data);
    } catch (e) {
      res.status(200);
      res.json({});
    }
  }
}
exports.FilesRouter = FilesRouter;
function isFileStreamable(req, filesController) {
  const range = (req.get('Range') || '/-/').split('-');
  const start = Number(range[0]);
  const end = Number(range[1]);
  return (!isNaN(start) || !isNaN(end)) && typeof filesController.adapter.handleFileStream === 'function';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiTWlkZGxld2FyZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9ub2RlIiwiX0NvbmZpZyIsIl9sb2dnZXIiLCJlIiwidCIsIldlYWtNYXAiLCJyIiwibiIsIl9fZXNNb2R1bGUiLCJvIiwiaSIsImYiLCJfX3Byb3RvX18iLCJkZWZhdWx0IiwiaGFzIiwiZ2V0Iiwic2V0IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ0cmlnZ2VycyIsImh0dHAiLCJVdGlscyIsImRvd25sb2FkRmlsZUZyb21VUkkiLCJ1cmkiLCJQcm9taXNlIiwicmVzIiwicmVqIiwicmVzcG9uc2UiLCJzZXREZWZhdWx0RW5jb2RpbmciLCJib2R5IiwiaGVhZGVycyIsIm9uIiwiZGF0YSIsIm1lc3NhZ2UiLCJhZGRGaWxlRGF0YUlmTmVlZGVkIiwiZmlsZSIsIl9zb3VyY2UiLCJmb3JtYXQiLCJiYXNlNjQiLCJfcHJldmlvdXNTYXZlIiwiX2RhdGEiLCJfcmVxdWVzdFRhc2siLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJtYXhVcGxvYWRTaXplIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsImdldEhhbmRsZXIiLCJtZXRhZGF0YUhhbmRsZXIiLCJwb3N0IiwicmVxIiwibmV4dCIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsInJhdyIsInR5cGUiLCJsaW1pdCIsImhhbmRsZVBhcnNlSGVhZGVycyIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImNyZWF0ZUhhbmRsZXIiLCJkZWxldGUiLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZGVsZXRlSGFuZGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInBhcmFtcyIsImFwcElkIiwic3RhdHVzIiwiZXJyIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImpzb24iLCJjb2RlIiwiZXJyb3IiLCJmaWxlbmFtZSIsImZpbGVzQ29udHJvbGxlciIsIm1pbWUiLCJjb250ZW50VHlwZSIsImdldFR5cGUiLCJGaWxlIiwidHJpZ2dlclJlc3VsdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJhdXRoIiwiX25hbWUiLCJpc0ZpbGVTdHJlYW1hYmxlIiwiaGFuZGxlRmlsZVN0cmVhbSIsImNhdGNoIiwiZW5kIiwiZ2V0RmlsZURhdGEiLCJ0b1N0cmluZyIsImFmdGVyRmluZCIsImZvcmNlRG93bmxvYWQiLCJCdWZmZXIiLCJmcm9tIiwibGVuZ3RoIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsInVzZXIiLCJpc01hc3RlciIsImlzTGlua2VkIiwiQW5vbnltb3VzVXRpbHMiLCJmaWxlVXBsb2FkIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZJTEVfU0FWRV9FUlJPUiIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiZW5hYmxlRm9yUHVibGljIiwidmFsaWRhdGVGaWxlbmFtZSIsImZpbGVFeHRlbnNpb25zIiwiaXNWYWxpZEV4dGVuc2lvbiIsImV4dGVuc2lvbiIsInNvbWUiLCJleHQiLCJyZWdleCIsIlJlZ0V4cCIsInRlc3QiLCJpbmNsdWRlcyIsInN1YnN0cmluZyIsImxhc3RJbmRleE9mIiwic3BsaXQiLCJqb2luIiwibWV0YWRhdGEiLCJ0YWdzIiwiZmlsZURhdGEiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsIklOVkFMSURfS0VZX05BTUUiLCJzZXRUYWdzIiwic2V0TWV0YWRhdGEiLCJmaWxlU2l6ZSIsImJ5dGVMZW5ndGgiLCJmaWxlT2JqZWN0IiwiYmVmb3JlU2F2ZSIsInNhdmVSZXN1bHQiLCJ1cmwiLCJuYW1lIiwiYnVmZmVyRGF0YSIsImZpbGVPcHRpb25zIiwiX21ldGFkYXRhIiwiZmlsZVRhZ3MiLCJrZXlzIiwiX3RhZ3MiLCJhc3NpZ24iLCJjcmVhdGVGaWxlUmVzdWx0IiwiY3JlYXRlRmlsZSIsIl91cmwiLCJyZXNvbHZlIiwiYWZ0ZXJTYXZlIiwibG9nZ2VyIiwiYWRhcHRlciIsImdldEZpbGVMb2NhdGlvbiIsImJlZm9yZURlbGV0ZSIsImRlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZSIsIkZJTEVfREVMRVRFX0VSUk9SIiwiZ2V0TWV0YWRhdGEiLCJleHBvcnRzIiwicmFuZ2UiLCJzdGFydCIsIk51bWJlciIsImlzTmFOIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvRmlsZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgKiBhcyBNaWRkbGV3YXJlcyBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4uL3RyaWdnZXJzJyk7XG5jb25zdCBodHRwID0gcmVxdWlyZSgnaHR0cCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi9VdGlscycpO1xuXG5jb25zdCBkb3dubG9hZEZpbGVGcm9tVVJJID0gdXJpID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgIGh0dHBcbiAgICAgIC5nZXQodXJpLCByZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLnNldERlZmF1bHRFbmNvZGluZygnYmFzZTY0Jyk7XG4gICAgICAgIGxldCBib2R5ID0gYGRhdGE6JHtyZXNwb25zZS5oZWFkZXJzWydjb250ZW50LXR5cGUnXX07YmFzZTY0LGA7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgZGF0YSA9PiAoYm9keSArPSBkYXRhKSk7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdlbmQnLCAoKSA9PiByZXMoYm9keSkpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCBlID0+IHtcbiAgICAgICAgcmVqKGBFcnJvciBkb3dubG9hZGluZyBmaWxlIGZyb20gJHt1cml9OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH0pO1xuICB9KTtcbn07XG5cbmNvbnN0IGFkZEZpbGVEYXRhSWZOZWVkZWQgPSBhc3luYyBmaWxlID0+IHtcbiAgaWYgKGZpbGUuX3NvdXJjZS5mb3JtYXQgPT09ICd1cmknKSB7XG4gICAgY29uc3QgYmFzZTY0ID0gYXdhaXQgZG93bmxvYWRGaWxlRnJvbVVSSShmaWxlLl9zb3VyY2UudXJpKTtcbiAgICBmaWxlLl9wcmV2aW91c1NhdmUgPSBmaWxlO1xuICAgIGZpbGUuX2RhdGEgPSBiYXNlNjQ7XG4gICAgZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICB9XG4gIHJldHVybiBmaWxlO1xufTtcblxuZXhwb3J0IGNsYXNzIEZpbGVzUm91dGVyIHtcbiAgZXhwcmVzc1JvdXRlcih7IG1heFVwbG9hZFNpemUgPSAnMjBNYicgfSA9IHt9KSB7XG4gICAgdmFyIHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC86ZmlsZW5hbWUnLCB0aGlzLmdldEhhbmRsZXIpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvbWV0YWRhdGEvOmZpbGVuYW1lJywgdGhpcy5tZXRhZGF0YUhhbmRsZXIpO1xuXG4gICAgcm91dGVyLnBvc3QoJy9maWxlcycsIGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBub3QgcHJvdmlkZWQuJykpO1xuICAgIH0pO1xuXG4gICAgcm91dGVyLnBvc3QoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBleHByZXNzLnJhdyh7XG4gICAgICAgIHR5cGU6ICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgbGltaXQ6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KSwgLy8gQWxsb3cgdXBsb2FkcyB3aXRob3V0IENvbnRlbnQtVHlwZSwgb3Igd2l0aCBhbnkgQ29udGVudC1UeXBlLlxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzLFxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uLFxuICAgICAgdGhpcy5jcmVhdGVIYW5kbGVyXG4gICAgKTtcblxuICAgIHJvdXRlci5kZWxldGUoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICBNaWRkbGV3YXJlcy5lbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5kZWxldGVIYW5kbGVyXG4gICAgKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG5cbiAgYXN5bmMgZ2V0SGFuZGxlcihyZXEsIHJlcykge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnSW52YWxpZCBhcHBsaWNhdGlvbiBJRC4nKTtcbiAgICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgZmlsZW5hbWUgPSByZXEucGFyYW1zLmZpbGVuYW1lO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgICAgY29uc3QgbWltZSA9IChhd2FpdCBpbXBvcnQoJ21pbWUnKSkuZGVmYXVsdDtcbiAgICAgIGxldCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgICBsZXQgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lLCB7IGJhc2U2NDogJycgfSwgY29udGVudFR5cGUpO1xuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUZpbmQsXG4gICAgICAgIHsgZmlsZSB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQ/LmZpbGU/Ll9uYW1lKSB7XG4gICAgICAgIGZpbGVuYW1lID0gdHJpZ2dlclJlc3VsdD8uZmlsZT8uX25hbWU7XG4gICAgICAgIGNvbnRlbnRUeXBlID0gbWltZS5nZXRUeXBlKGZpbGVuYW1lKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICAgIGZpbGVzQ29udHJvbGxlci5oYW5kbGVGaWxlU3RyZWFtKGNvbmZpZywgZmlsZW5hbWUsIHJlcSwgcmVzLCBjb250ZW50VHlwZSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgZGF0YSA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5nZXRGaWxlRGF0YShjb25maWcsIGZpbGVuYW1lKS5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgcmVzLmVuZCgnRmlsZSBub3QgZm91bmQuJyk7XG4gICAgICB9KTtcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0OiBkYXRhLnRvU3RyaW5nKCdiYXNlNjQnKSB9LCBjb250ZW50VHlwZSk7XG4gICAgICBjb25zdCBhZnRlckZpbmQgPSBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICAgIHsgZmlsZSwgZm9yY2VEb3dubG9hZDogZmFsc2UgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcblxuICAgICAgaWYgKGFmdGVyRmluZD8uZmlsZSkge1xuICAgICAgICBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShhZnRlckZpbmQuZmlsZS5fbmFtZSk7XG4gICAgICAgIGRhdGEgPSBCdWZmZXIuZnJvbShhZnRlckZpbmQuZmlsZS5fZGF0YSwgJ2Jhc2U2NCcpO1xuICAgICAgfVxuXG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCBjb250ZW50VHlwZSk7XG4gICAgICByZXMuc2V0KCdDb250ZW50LUxlbmd0aCcsIGRhdGEubGVuZ3RoKTtcbiAgICAgIGlmIChhZnRlckZpbmQuZm9yY2VEb3dubG9hZCkge1xuICAgICAgICByZXMuc2V0KCdDb250ZW50LURpc3Bvc2l0aW9uJywgYGF0dGFjaG1lbnQ7ZmlsZW5hbWU9JHthZnRlckZpbmQuZmlsZS5fbmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIHJlcy5lbmQoZGF0YSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBmaW5kIGZpbGU6ICR7ZmlsZW5hbWV9LmAsXG4gICAgICB9KTtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjcmVhdGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VyID0gcmVxLmF1dGgudXNlcjtcbiAgICBjb25zdCBpc01hc3RlciA9IHJlcS5hdXRoLmlzTWFzdGVyO1xuICAgIGNvbnN0IGlzTGlua2VkID0gdXNlciAmJiBQYXJzZS5Bbm9ueW1vdXNVdGlscy5pc0xpbmtlZCh1c2VyKTtcbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICYmIGlzTGlua2VkKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnRmlsZSB1cGxvYWQgYnkgYW5vbnltb3VzIHVzZXIgaXMgZGlzYWJsZWQuJylcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICYmICFpc0xpbmtlZCAmJiB1c2VyKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICdGaWxlIHVwbG9hZCBieSBhdXRoZW50aWNhdGVkIHVzZXIgaXMgZGlzYWJsZWQuJ1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgJiYgIXVzZXIpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IHB1YmxpYyBpcyBkaXNhYmxlZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlcS5nZXQoJ0NvbnRlbnQtdHlwZScpO1xuXG4gICAgaWYgKCFyZXEuYm9keSB8fCAhcmVxLmJvZHkubGVuZ3RoKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlcnJvciA9IGZpbGVzQ29udHJvbGxlci52YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKTtcbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVFeHRlbnNpb25zID0gY29uZmlnLmZpbGVVcGxvYWQ/LmZpbGVFeHRlbnNpb25zO1xuICAgIGlmICghaXNNYXN0ZXIgJiYgZmlsZUV4dGVuc2lvbnMpIHtcbiAgICAgIGNvbnN0IGlzVmFsaWRFeHRlbnNpb24gPSBleHRlbnNpb24gPT4ge1xuICAgICAgICByZXR1cm4gZmlsZUV4dGVuc2lvbnMuc29tZShleHQgPT4ge1xuICAgICAgICAgIGlmIChleHQgPT09ICcqJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChleHQpO1xuICAgICAgICAgIGlmIChyZWdleC50ZXN0KGV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlO1xuICAgICAgaWYgKGZpbGVuYW1lICYmIGZpbGVuYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgZXh0ZW5zaW9uID0gZmlsZW5hbWUuc3Vic3RyaW5nKGZpbGVuYW1lLmxhc3RJbmRleE9mKCcuJykgKyAxKTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBjb250ZW50VHlwZS5zcGxpdCgnLycpWzFdO1xuICAgICAgfVxuICAgICAgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uPy5zcGxpdCgnICcpPy5qb2luKCcnKTtcblxuICAgICAgaWYgKGV4dGVuc2lvbiAmJiAhaXNWYWxpZEV4dGVuc2lvbihleHRlbnNpb24pKSB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYEZpbGUgdXBsb2FkIG9mIGV4dGVuc2lvbiAke2V4dGVuc2lvbn0gaXMgZGlzYWJsZWQuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJhc2U2NCA9IHJlcS5ib2R5LnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0IH0sIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCB7IG1ldGFkYXRhID0ge30sIHRhZ3MgPSB7fSB9ID0gcmVxLmZpbGVEYXRhIHx8IHt9O1xuICAgIHRyeSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIG1ldGFkYXRhKTtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgdGFncyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZpbGUuc2V0VGFncyh0YWdzKTtcbiAgICBmaWxlLnNldE1ldGFkYXRhKG1ldGFkYXRhKTtcbiAgICBjb25zdCBmaWxlU2l6ZSA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHJlcS5ib2R5KTtcbiAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZSB9O1xuICAgIHRyeSB7XG4gICAgICAvLyBydW4gYmVmb3JlU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGhcbiAgICAgICk7XG4gICAgICBsZXQgc2F2ZVJlc3VsdDtcbiAgICAgIC8vIGlmIGEgbmV3IFBhcnNlRmlsZSBpcyByZXR1cm5lZCBjaGVjayBpZiBpdCdzIGFuIGFscmVhZHkgc2F2ZWQgZmlsZVxuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5GaWxlKSB7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZSA9IHRyaWdnZXJSZXN1bHQ7XG4gICAgICAgIGlmICh0cmlnZ2VyUmVzdWx0LnVybCgpKSB7XG4gICAgICAgICAgLy8gc2V0IGZpbGVTaXplIHRvIG51bGwgYmVjYXVzZSB3ZSB3b250IGtub3cgaG93IGJpZyBpdCBpcyBoZXJlXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlU2l6ZSA9IG51bGw7XG4gICAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICAgIHVybDogdHJpZ2dlclJlc3VsdC51cmwoKSxcbiAgICAgICAgICAgIG5hbWU6IHRyaWdnZXJSZXN1bHQuX25hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlIGZpbGUgcmV0dXJuZWQgYnkgdGhlIHRyaWdnZXIgaGFzIGFscmVhZHkgYmVlbiBzYXZlZCBza2lwIHNhdmluZyBhbnl0aGluZ1xuICAgICAgaWYgKCFzYXZlUmVzdWx0KSB7XG4gICAgICAgIC8vIGlmIHRoZSBQYXJzZUZpbGUgcmV0dXJuZWQgaXMgdHlwZSB1cmksIGRvd25sb2FkIHRoZSBmaWxlIGJlZm9yZSBzYXZpbmcgaXRcbiAgICAgICAgYXdhaXQgYWRkRmlsZURhdGFJZk5lZWRlZChmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICAvLyB1cGRhdGUgZmlsZVNpemVcbiAgICAgICAgY29uc3QgYnVmZmVyRGF0YSA9IEJ1ZmZlci5mcm9tKGZpbGVPYmplY3QuZmlsZS5fZGF0YSwgJ2Jhc2U2NCcpO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgoYnVmZmVyRGF0YSk7XG4gICAgICAgIC8vIHByZXBhcmUgZmlsZSBvcHRpb25zXG4gICAgICAgIGNvbnN0IGZpbGVPcHRpb25zID0ge1xuICAgICAgICAgIG1ldGFkYXRhOiBmaWxlT2JqZWN0LmZpbGUuX21ldGFkYXRhLFxuICAgICAgICB9O1xuICAgICAgICAvLyBzb21lIHMzLWNvbXBhdGlibGUgcHJvdmlkZXJzIChEaWdpdGFsT2NlYW4sIExpbm9kZSkgZG8gbm90IGFjY2VwdCB0YWdzXG4gICAgICAgIC8vIHNvIHdlIGRvIG5vdCBpbmNsdWRlIHRoZSB0YWdzIG9wdGlvbiBpZiBpdCBpcyBlbXB0eS5cbiAgICAgICAgY29uc3QgZmlsZVRhZ3MgPVxuICAgICAgICAgIE9iamVjdC5rZXlzKGZpbGVPYmplY3QuZmlsZS5fdGFncykubGVuZ3RoID4gMCA/IHsgdGFnczogZmlsZU9iamVjdC5maWxlLl90YWdzIH0gOiB7fTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihmaWxlT3B0aW9ucywgZmlsZVRhZ3MpO1xuICAgICAgICAvLyBzYXZlIGZpbGVcbiAgICAgICAgY29uc3QgY3JlYXRlRmlsZVJlc3VsdCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlKFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUsXG4gICAgICAgICAgYnVmZmVyRGF0YSxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3NvdXJjZS50eXBlLFxuICAgICAgICAgIGZpbGVPcHRpb25zXG4gICAgICAgICk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlIHdpdGggbmV3IGRhdGFcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9uYW1lID0gY3JlYXRlRmlsZVJlc3VsdC5uYW1lO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3VybCA9IGNyZWF0ZUZpbGVSZXN1bHQudXJsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3JlcXVlc3RUYXNrID0gbnVsbDtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9wcmV2aW91c1NhdmUgPSBQcm9taXNlLnJlc29sdmUoZmlsZU9iamVjdC5maWxlKTtcbiAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICB1cmw6IGNyZWF0ZUZpbGVSZXN1bHQudXJsLFxuICAgICAgICAgIG5hbWU6IGNyZWF0ZUZpbGVSZXN1bHQubmFtZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIC8vIHJ1biBhZnRlclNhdmVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLCBmaWxlT2JqZWN0LCBjb25maWcsIHJlcS5hdXRoKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAxKTtcbiAgICAgIHJlcy5zZXQoJ0xvY2F0aW9uJywgc2F2ZVJlc3VsdC51cmwpO1xuICAgICAgcmVzLmpzb24oc2F2ZVJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlT2JqZWN0LmZpbGUuX25hbWV9LmAsXG4gICAgICB9KTtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IHJlcS5jb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgLy8gcnVuIGJlZm9yZURlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lKTtcbiAgICAgIGZpbGUuX3VybCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmdldEZpbGVMb2NhdGlvbihyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZTogbnVsbCB9O1xuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIC8vIGRlbGV0ZSBmaWxlXG4gICAgICBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZGVsZXRlRmlsZShyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICAvLyBydW4gYWZ0ZXJEZWxldGVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIC8vIFRPRE86IHJldHVybiB1c2VmdWwgSlNPTiBoZXJlP1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZGVsZXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9ERUxFVEVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZGVsZXRlIGZpbGUuJyxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWV0YWRhdGFIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gY29uZmlnO1xuICAgICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZ2V0TWV0YWRhdGEoZmlsZW5hbWUpO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oZGF0YSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oe30pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSB7XG4gIGNvbnN0IHJhbmdlID0gKHJlcS5nZXQoJ1JhbmdlJykgfHwgJy8tLycpLnNwbGl0KCctJyk7XG4gIGNvbnN0IHN0YXJ0ID0gTnVtYmVyKHJhbmdlWzBdKTtcbiAgY29uc3QgZW5kID0gTnVtYmVyKHJhbmdlWzFdKTtcbiAgcmV0dXJuIChcbiAgICAoIWlzTmFOKHN0YXJ0KSB8fCAhaXNOYU4oZW5kKSkgJiYgdHlwZW9mIGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmhhbmRsZUZpbGVTdHJlYW0gPT09ICdmdW5jdGlvbidcbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsV0FBQSxHQUFBQyx1QkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsS0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFFLHdCQUFBSSxDQUFBLEVBQUFDLENBQUEsNkJBQUFDLE9BQUEsTUFBQUMsQ0FBQSxPQUFBRCxPQUFBLElBQUFFLENBQUEsT0FBQUYsT0FBQSxZQUFBTix1QkFBQSxZQUFBQSxDQUFBSSxDQUFBLEVBQUFDLENBQUEsU0FBQUEsQ0FBQSxJQUFBRCxDQUFBLElBQUFBLENBQUEsQ0FBQUssVUFBQSxTQUFBTCxDQUFBLE1BQUFNLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLEtBQUFDLFNBQUEsUUFBQUMsT0FBQSxFQUFBVixD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