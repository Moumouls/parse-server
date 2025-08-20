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
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiTWlkZGxld2FyZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9ub2RlIiwiX0NvbmZpZyIsIl9sb2dnZXIiLCJfZ2V0UmVxdWlyZVdpbGRjYXJkQ2FjaGUiLCJlIiwiV2Vha01hcCIsInIiLCJ0IiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJoYXMiLCJnZXQiLCJuIiwiX19wcm90b19fIiwiYSIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwidSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImkiLCJzZXQiLCJ0cmlnZ2VycyIsImh0dHAiLCJVdGlscyIsImRvd25sb2FkRmlsZUZyb21VUkkiLCJ1cmkiLCJQcm9taXNlIiwicmVzIiwicmVqIiwicmVzcG9uc2UiLCJzZXREZWZhdWx0RW5jb2RpbmciLCJib2R5IiwiaGVhZGVycyIsIm9uIiwiZGF0YSIsIm1lc3NhZ2UiLCJhZGRGaWxlRGF0YUlmTmVlZGVkIiwiZmlsZSIsIl9zb3VyY2UiLCJmb3JtYXQiLCJiYXNlNjQiLCJfcHJldmlvdXNTYXZlIiwiX2RhdGEiLCJfcmVxdWVzdFRhc2siLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJtYXhVcGxvYWRTaXplIiwicm91dGVyIiwiZXhwcmVzcyIsIlJvdXRlciIsImdldEhhbmRsZXIiLCJtZXRhZGF0YUhhbmRsZXIiLCJwb3N0IiwicmVxIiwibmV4dCIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX0ZJTEVfTkFNRSIsInJhdyIsInR5cGUiLCJsaW1pdCIsImhhbmRsZVBhcnNlSGVhZGVycyIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImNyZWF0ZUhhbmRsZXIiLCJkZWxldGUiLCJlbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwiZGVsZXRlSGFuZGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInBhcmFtcyIsImFwcElkIiwic3RhdHVzIiwiZXJyIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImpzb24iLCJjb2RlIiwiZXJyb3IiLCJmaWxlbmFtZSIsImZpbGVzQ29udHJvbGxlciIsIm1pbWUiLCJjb250ZW50VHlwZSIsImdldFR5cGUiLCJGaWxlIiwidHJpZ2dlclJlc3VsdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZUZpbmQiLCJhdXRoIiwiX25hbWUiLCJpc0ZpbGVTdHJlYW1hYmxlIiwiaGFuZGxlRmlsZVN0cmVhbSIsImNhdGNoIiwiZW5kIiwiZ2V0RmlsZURhdGEiLCJ0b1N0cmluZyIsImFmdGVyRmluZCIsImZvcmNlRG93bmxvYWQiLCJCdWZmZXIiLCJmcm9tIiwibGVuZ3RoIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsInVzZXIiLCJpc01hc3RlciIsImlzTGlua2VkIiwiQW5vbnltb3VzVXRpbHMiLCJmaWxlVXBsb2FkIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZJTEVfU0FWRV9FUlJPUiIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiZW5hYmxlRm9yUHVibGljIiwidmFsaWRhdGVGaWxlbmFtZSIsImZpbGVFeHRlbnNpb25zIiwiaXNWYWxpZEV4dGVuc2lvbiIsImV4dGVuc2lvbiIsInNvbWUiLCJleHQiLCJyZWdleCIsIlJlZ0V4cCIsInRlc3QiLCJpbmNsdWRlcyIsInN1YnN0cmluZyIsImxhc3RJbmRleE9mIiwic3BsaXQiLCJqb2luIiwibWV0YWRhdGEiLCJ0YWdzIiwiZmlsZURhdGEiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsIklOVkFMSURfS0VZX05BTUUiLCJzZXRUYWdzIiwic2V0TWV0YWRhdGEiLCJmaWxlU2l6ZSIsImJ5dGVMZW5ndGgiLCJmaWxlT2JqZWN0IiwiYmVmb3JlU2F2ZSIsInNhdmVSZXN1bHQiLCJ1cmwiLCJuYW1lIiwiYnVmZmVyRGF0YSIsImZpbGVPcHRpb25zIiwiX21ldGFkYXRhIiwiZmlsZVRhZ3MiLCJrZXlzIiwiX3RhZ3MiLCJhc3NpZ24iLCJjcmVhdGVGaWxlUmVzdWx0IiwiY3JlYXRlRmlsZSIsIl91cmwiLCJyZXNvbHZlIiwiYWZ0ZXJTYXZlIiwibG9nZ2VyIiwiYWRhcHRlciIsImdldEZpbGVMb2NhdGlvbiIsImJlZm9yZURlbGV0ZSIsImRlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZSIsIkZJTEVfREVMRVRFX0VSUk9SIiwiZ2V0TWV0YWRhdGEiLCJleHBvcnRzIiwicmFuZ2UiLCJzdGFydCIsIk51bWJlciIsImlzTmFOIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvRmlsZXNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgKiBhcyBNaWRkbGV3YXJlcyBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4uL3RyaWdnZXJzJyk7XG5jb25zdCBodHRwID0gcmVxdWlyZSgnaHR0cCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi9VdGlscycpO1xuXG5jb25zdCBkb3dubG9hZEZpbGVGcm9tVVJJID0gdXJpID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgIGh0dHBcbiAgICAgIC5nZXQodXJpLCByZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLnNldERlZmF1bHRFbmNvZGluZygnYmFzZTY0Jyk7XG4gICAgICAgIGxldCBib2R5ID0gYGRhdGE6JHtyZXNwb25zZS5oZWFkZXJzWydjb250ZW50LXR5cGUnXX07YmFzZTY0LGA7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgZGF0YSA9PiAoYm9keSArPSBkYXRhKSk7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdlbmQnLCAoKSA9PiByZXMoYm9keSkpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCBlID0+IHtcbiAgICAgICAgcmVqKGBFcnJvciBkb3dubG9hZGluZyBmaWxlIGZyb20gJHt1cml9OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH0pO1xuICB9KTtcbn07XG5cbmNvbnN0IGFkZEZpbGVEYXRhSWZOZWVkZWQgPSBhc3luYyBmaWxlID0+IHtcbiAgaWYgKGZpbGUuX3NvdXJjZS5mb3JtYXQgPT09ICd1cmknKSB7XG4gICAgY29uc3QgYmFzZTY0ID0gYXdhaXQgZG93bmxvYWRGaWxlRnJvbVVSSShmaWxlLl9zb3VyY2UudXJpKTtcbiAgICBmaWxlLl9wcmV2aW91c1NhdmUgPSBmaWxlO1xuICAgIGZpbGUuX2RhdGEgPSBiYXNlNjQ7XG4gICAgZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICB9XG4gIHJldHVybiBmaWxlO1xufTtcblxuZXhwb3J0IGNsYXNzIEZpbGVzUm91dGVyIHtcbiAgZXhwcmVzc1JvdXRlcih7IG1heFVwbG9hZFNpemUgPSAnMjBNYicgfSA9IHt9KSB7XG4gICAgdmFyIHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC86ZmlsZW5hbWUnLCB0aGlzLmdldEhhbmRsZXIpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvbWV0YWRhdGEvOmZpbGVuYW1lJywgdGhpcy5tZXRhZGF0YUhhbmRsZXIpO1xuXG4gICAgcm91dGVyLnBvc3QoJy9maWxlcycsIGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBub3QgcHJvdmlkZWQuJykpO1xuICAgIH0pO1xuXG4gICAgcm91dGVyLnBvc3QoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBleHByZXNzLnJhdyh7XG4gICAgICAgIHR5cGU6ICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgbGltaXQ6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KSwgLy8gQWxsb3cgdXBsb2FkcyB3aXRob3V0IENvbnRlbnQtVHlwZSwgb3Igd2l0aCBhbnkgQ29udGVudC1UeXBlLlxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzLFxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uLFxuICAgICAgdGhpcy5jcmVhdGVIYW5kbGVyXG4gICAgKTtcblxuICAgIHJvdXRlci5kZWxldGUoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICBNaWRkbGV3YXJlcy5lbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5kZWxldGVIYW5kbGVyXG4gICAgKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG5cbiAgYXN5bmMgZ2V0SGFuZGxlcihyZXEsIHJlcykge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnSW52YWxpZCBhcHBsaWNhdGlvbiBJRC4nKTtcbiAgICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgZmlsZW5hbWUgPSByZXEucGFyYW1zLmZpbGVuYW1lO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmaWxlc0NvbnRyb2xsZXIgPSBjb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgICAgY29uc3QgbWltZSA9IChhd2FpdCBpbXBvcnQoJ21pbWUnKSkuZGVmYXVsdDtcbiAgICAgIGxldCBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShmaWxlbmFtZSk7XG4gICAgICBsZXQgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lLCB7IGJhc2U2NDogJycgfSwgY29udGVudFR5cGUpO1xuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUZpbmQsXG4gICAgICAgIHsgZmlsZSB9LFxuICAgICAgICBjb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQ/LmZpbGU/Ll9uYW1lKSB7XG4gICAgICAgIGZpbGVuYW1lID0gdHJpZ2dlclJlc3VsdD8uZmlsZT8uX25hbWU7XG4gICAgICAgIGNvbnRlbnRUeXBlID0gbWltZS5nZXRUeXBlKGZpbGVuYW1lKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpKSB7XG4gICAgICAgIGZpbGVzQ29udHJvbGxlci5oYW5kbGVGaWxlU3RyZWFtKGNvbmZpZywgZmlsZW5hbWUsIHJlcSwgcmVzLCBjb250ZW50VHlwZSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICAgIHJlcy5lbmQoJ0ZpbGUgbm90IGZvdW5kLicpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBsZXQgZGF0YSA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5nZXRGaWxlRGF0YShjb25maWcsIGZpbGVuYW1lKS5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgcmVzLmVuZCgnRmlsZSBub3QgZm91bmQuJyk7XG4gICAgICB9KTtcbiAgICAgIGlmICghZGF0YSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0OiBkYXRhLnRvU3RyaW5nKCdiYXNlNjQnKSB9LCBjb250ZW50VHlwZSk7XG4gICAgICBjb25zdCBhZnRlckZpbmQgPSBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlckZpbmQsXG4gICAgICAgIHsgZmlsZSwgZm9yY2VEb3dubG9hZDogZmFsc2UgfSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcblxuICAgICAgaWYgKGFmdGVyRmluZD8uZmlsZSkge1xuICAgICAgICBjb250ZW50VHlwZSA9IG1pbWUuZ2V0VHlwZShhZnRlckZpbmQuZmlsZS5fbmFtZSk7XG4gICAgICAgIGRhdGEgPSBCdWZmZXIuZnJvbShhZnRlckZpbmQuZmlsZS5fZGF0YSwgJ2Jhc2U2NCcpO1xuICAgICAgfVxuXG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuc2V0KCdDb250ZW50LVR5cGUnLCBjb250ZW50VHlwZSk7XG4gICAgICByZXMuc2V0KCdDb250ZW50LUxlbmd0aCcsIGRhdGEubGVuZ3RoKTtcbiAgICAgIGlmIChhZnRlckZpbmQuZm9yY2VEb3dubG9hZCkge1xuICAgICAgICByZXMuc2V0KCdDb250ZW50LURpc3Bvc2l0aW9uJywgYGF0dGFjaG1lbnQ7ZmlsZW5hbWU9JHthZnRlckZpbmQuZmlsZS5fbmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIHJlcy5lbmQoZGF0YSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBmaW5kIGZpbGU6ICR7ZmlsZW5hbWV9LmAsXG4gICAgICB9KTtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjcmVhdGVIYW5kbGVyKHJlcSwgcmVzLCBuZXh0KSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCB1c2VyID0gcmVxLmF1dGgudXNlcjtcbiAgICBjb25zdCBpc01hc3RlciA9IHJlcS5hdXRoLmlzTWFzdGVyO1xuICAgIGNvbnN0IGlzTGlua2VkID0gdXNlciAmJiBQYXJzZS5Bbm9ueW1vdXNVdGlscy5pc0xpbmtlZCh1c2VyKTtcbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICYmIGlzTGlua2VkKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnRmlsZSB1cGxvYWQgYnkgYW5vbnltb3VzIHVzZXIgaXMgZGlzYWJsZWQuJylcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICYmICFpc0xpbmtlZCAmJiB1c2VyKSB7XG4gICAgICBuZXh0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICdGaWxlIHVwbG9hZCBieSBhdXRoZW50aWNhdGVkIHVzZXIgaXMgZGlzYWJsZWQuJ1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWlzTWFzdGVyICYmICFjb25maWcuZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgJiYgIXVzZXIpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ZpbGUgdXBsb2FkIGJ5IHB1YmxpYyBpcyBkaXNhYmxlZC4nKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlcS5nZXQoJ0NvbnRlbnQtdHlwZScpO1xuXG4gICAgaWYgKCFyZXEuYm9keSB8fCAhcmVxLmJvZHkubGVuZ3RoKSB7XG4gICAgICBuZXh0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlcnJvciA9IGZpbGVzQ29udHJvbGxlci52YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKTtcbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVFeHRlbnNpb25zID0gY29uZmlnLmZpbGVVcGxvYWQ/LmZpbGVFeHRlbnNpb25zO1xuICAgIGlmICghaXNNYXN0ZXIgJiYgZmlsZUV4dGVuc2lvbnMpIHtcbiAgICAgIGNvbnN0IGlzVmFsaWRFeHRlbnNpb24gPSBleHRlbnNpb24gPT4ge1xuICAgICAgICByZXR1cm4gZmlsZUV4dGVuc2lvbnMuc29tZShleHQgPT4ge1xuICAgICAgICAgIGlmIChleHQgPT09ICcqJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChleHQpO1xuICAgICAgICAgIGlmIChyZWdleC50ZXN0KGV4dGVuc2lvbikpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlO1xuICAgICAgaWYgKGZpbGVuYW1lICYmIGZpbGVuYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgZXh0ZW5zaW9uID0gZmlsZW5hbWUuc3Vic3RyaW5nKGZpbGVuYW1lLmxhc3RJbmRleE9mKCcuJykgKyAxKTtcbiAgICAgIH0gZWxzZSBpZiAoY29udGVudFR5cGUgJiYgY29udGVudFR5cGUuaW5jbHVkZXMoJy8nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBjb250ZW50VHlwZS5zcGxpdCgnLycpWzFdO1xuICAgICAgfVxuICAgICAgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uPy5zcGxpdCgnICcpPy5qb2luKCcnKTtcblxuICAgICAgaWYgKGV4dGVuc2lvbiAmJiAhaXNWYWxpZEV4dGVuc2lvbihleHRlbnNpb24pKSB7XG4gICAgICAgIG5leHQoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgYEZpbGUgdXBsb2FkIG9mIGV4dGVuc2lvbiAke2V4dGVuc2lvbn0gaXMgZGlzYWJsZWQuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJhc2U2NCA9IHJlcS5ib2R5LnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUsIHsgYmFzZTY0IH0sIGNvbnRlbnRUeXBlKTtcbiAgICBjb25zdCB7IG1ldGFkYXRhID0ge30sIHRhZ3MgPSB7fSB9ID0gcmVxLmZpbGVEYXRhIHx8IHt9O1xuICAgIHRyeSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBVdGlscy5jaGVja1Byb2hpYml0ZWRLZXl3b3Jkcyhjb25maWcsIG1ldGFkYXRhKTtcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgdGFncyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGVycm9yKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZpbGUuc2V0VGFncyh0YWdzKTtcbiAgICBmaWxlLnNldE1ldGFkYXRhKG1ldGFkYXRhKTtcbiAgICBjb25zdCBmaWxlU2l6ZSA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHJlcS5ib2R5KTtcbiAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZSB9O1xuICAgIHRyeSB7XG4gICAgICAvLyBydW4gYmVmb3JlU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgdHJpZ2dlclJlc3VsdCA9IGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGhcbiAgICAgICk7XG4gICAgICBsZXQgc2F2ZVJlc3VsdDtcbiAgICAgIC8vIGlmIGEgbmV3IFBhcnNlRmlsZSBpcyByZXR1cm5lZCBjaGVjayBpZiBpdCdzIGFuIGFscmVhZHkgc2F2ZWQgZmlsZVxuICAgICAgaWYgKHRyaWdnZXJSZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5GaWxlKSB7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZSA9IHRyaWdnZXJSZXN1bHQ7XG4gICAgICAgIGlmICh0cmlnZ2VyUmVzdWx0LnVybCgpKSB7XG4gICAgICAgICAgLy8gc2V0IGZpbGVTaXplIHRvIG51bGwgYmVjYXVzZSB3ZSB3b250IGtub3cgaG93IGJpZyBpdCBpcyBoZXJlXG4gICAgICAgICAgZmlsZU9iamVjdC5maWxlU2l6ZSA9IG51bGw7XG4gICAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICAgIHVybDogdHJpZ2dlclJlc3VsdC51cmwoKSxcbiAgICAgICAgICAgIG5hbWU6IHRyaWdnZXJSZXN1bHQuX25hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gaWYgdGhlIGZpbGUgcmV0dXJuZWQgYnkgdGhlIHRyaWdnZXIgaGFzIGFscmVhZHkgYmVlbiBzYXZlZCBza2lwIHNhdmluZyBhbnl0aGluZ1xuICAgICAgaWYgKCFzYXZlUmVzdWx0KSB7XG4gICAgICAgIC8vIGlmIHRoZSBQYXJzZUZpbGUgcmV0dXJuZWQgaXMgdHlwZSB1cmksIGRvd25sb2FkIHRoZSBmaWxlIGJlZm9yZSBzYXZpbmcgaXRcbiAgICAgICAgYXdhaXQgYWRkRmlsZURhdGFJZk5lZWRlZChmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICAvLyB1cGRhdGUgZmlsZVNpemVcbiAgICAgICAgY29uc3QgYnVmZmVyRGF0YSA9IEJ1ZmZlci5mcm9tKGZpbGVPYmplY3QuZmlsZS5fZGF0YSwgJ2Jhc2U2NCcpO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgoYnVmZmVyRGF0YSk7XG4gICAgICAgIC8vIHByZXBhcmUgZmlsZSBvcHRpb25zXG4gICAgICAgIGNvbnN0IGZpbGVPcHRpb25zID0ge1xuICAgICAgICAgIG1ldGFkYXRhOiBmaWxlT2JqZWN0LmZpbGUuX21ldGFkYXRhLFxuICAgICAgICB9O1xuICAgICAgICAvLyBzb21lIHMzLWNvbXBhdGlibGUgcHJvdmlkZXJzIChEaWdpdGFsT2NlYW4sIExpbm9kZSkgZG8gbm90IGFjY2VwdCB0YWdzXG4gICAgICAgIC8vIHNvIHdlIGRvIG5vdCBpbmNsdWRlIHRoZSB0YWdzIG9wdGlvbiBpZiBpdCBpcyBlbXB0eS5cbiAgICAgICAgY29uc3QgZmlsZVRhZ3MgPVxuICAgICAgICAgIE9iamVjdC5rZXlzKGZpbGVPYmplY3QuZmlsZS5fdGFncykubGVuZ3RoID4gMCA/IHsgdGFnczogZmlsZU9iamVjdC5maWxlLl90YWdzIH0gOiB7fTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihmaWxlT3B0aW9ucywgZmlsZVRhZ3MpO1xuICAgICAgICAvLyBzYXZlIGZpbGVcbiAgICAgICAgY29uc3QgY3JlYXRlRmlsZVJlc3VsdCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5jcmVhdGVGaWxlKFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUsXG4gICAgICAgICAgYnVmZmVyRGF0YSxcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3NvdXJjZS50eXBlLFxuICAgICAgICAgIGZpbGVPcHRpb25zXG4gICAgICAgICk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlIHdpdGggbmV3IGRhdGFcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9uYW1lID0gY3JlYXRlRmlsZVJlc3VsdC5uYW1lO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3VybCA9IGNyZWF0ZUZpbGVSZXN1bHQudXJsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3JlcXVlc3RUYXNrID0gbnVsbDtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlLl9wcmV2aW91c1NhdmUgPSBQcm9taXNlLnJlc29sdmUoZmlsZU9iamVjdC5maWxlKTtcbiAgICAgICAgc2F2ZVJlc3VsdCA9IHtcbiAgICAgICAgICB1cmw6IGNyZWF0ZUZpbGVSZXN1bHQudXJsLFxuICAgICAgICAgIG5hbWU6IGNyZWF0ZUZpbGVSZXN1bHQubmFtZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIC8vIHJ1biBhZnRlclNhdmVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLCBmaWxlT2JqZWN0LCBjb25maWcsIHJlcS5hdXRoKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAxKTtcbiAgICAgIHJlcy5zZXQoJ0xvY2F0aW9uJywgc2F2ZVJlc3VsdC51cmwpO1xuICAgICAgcmVzLmpzb24oc2F2ZVJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3Qgc3RvcmUgZmlsZTogJHtmaWxlT2JqZWN0LmZpbGUuX25hbWV9LmAsXG4gICAgICB9KTtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBmaWxlc0NvbnRyb2xsZXIgfSA9IHJlcS5jb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgLy8gcnVuIGJlZm9yZURlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgY29uc3QgZmlsZSA9IG5ldyBQYXJzZS5GaWxlKGZpbGVuYW1lKTtcbiAgICAgIGZpbGUuX3VybCA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmdldEZpbGVMb2NhdGlvbihyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICBjb25zdCBmaWxlT2JqZWN0ID0geyBmaWxlLCBmaWxlU2l6ZTogbnVsbCB9O1xuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIC8vIGRlbGV0ZSBmaWxlXG4gICAgICBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZGVsZXRlRmlsZShyZXEuY29uZmlnLCBmaWxlbmFtZSk7XG4gICAgICAvLyBydW4gYWZ0ZXJEZWxldGVGaWxlIHRyaWdnZXJcbiAgICAgIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuRmlsZVRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRGVsZXRlLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIHJlcy5zdGF0dXMoMjAwKTtcbiAgICAgIC8vIFRPRE86IHJldHVybiB1c2VmdWwgSlNPTiBoZXJlP1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZGVsZXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgIGNvbnN0IGVycm9yID0gdHJpZ2dlcnMucmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuRklMRV9ERUxFVEVfRVJST1IsXG4gICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZGVsZXRlIGZpbGUuJyxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbWV0YWRhdGFIYW5kbGVyKHJlcSwgcmVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gY29uZmlnO1xuICAgICAgY29uc3QgeyBmaWxlbmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmaWxlc0NvbnRyb2xsZXIuZ2V0TWV0YWRhdGEoZmlsZW5hbWUpO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oZGF0YSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgcmVzLmpzb24oe30pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSB7XG4gIGNvbnN0IHJhbmdlID0gKHJlcS5nZXQoJ1JhbmdlJykgfHwgJy8tLycpLnNwbGl0KCctJyk7XG4gIGNvbnN0IHN0YXJ0ID0gTnVtYmVyKHJhbmdlWzBdKTtcbiAgY29uc3QgZW5kID0gTnVtYmVyKHJhbmdlWzFdKTtcbiAgcmV0dXJuIChcbiAgICAoIWlzTmFOKHN0YXJ0KSB8fCAhaXNOYU4oZW5kKSkgJiYgdHlwZW9mIGZpbGVzQ29udHJvbGxlci5hZGFwdGVyLmhhbmRsZUZpbGVTdHJlYW0gPT09ICdmdW5jdGlvbidcbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsUUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsV0FBQSxHQUFBQyx1QkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsS0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQStCLFNBQUFNLHlCQUFBQyxDQUFBLDZCQUFBQyxPQUFBLG1CQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxPQUFBRixPQUFBLFlBQUFGLHdCQUFBLFlBQUFBLENBQUFDLENBQUEsV0FBQUEsQ0FBQSxHQUFBRyxDQUFBLEdBQUFELENBQUEsS0FBQUYsQ0FBQTtBQUFBLFNBQUFMLHdCQUFBSyxDQUFBLEVBQUFFLENBQUEsU0FBQUEsQ0FBQSxJQUFBRixDQUFBLElBQUFBLENBQUEs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