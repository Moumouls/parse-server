"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLServer = void 0;

var _cors = _interopRequireDefault(require("cors"));

var _node = require("@graphql-yoga/node");

var _graphql = require("graphql");

var _subscriptionsTransportWs = require("subscriptions-transport-ws");

var _middlewares = require("../middlewares");

var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));

var _logger = _interopRequireDefault(require("../logger"));

var _ParseGraphQLSchema = require("./ParseGraphQLSchema");

var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseGraphQLServer {
  constructor(parseServer, config) {
    this.parseServer = parseServer || (0, _requiredParameter.default)('You must provide a parseServer instance!');

    if (!config || !config.graphQLPath) {
      (0, _requiredParameter.default)('You must provide a config.graphQLPath!');
    }

    this.config = config;
    this.parseGraphQLController = this.parseServer.config.parseGraphQLController;
    this.log = this.parseServer.config && this.parseServer.config.loggerController || _logger.default;
    this.parseGraphQLSchema = new _ParseGraphQLSchema.ParseGraphQLSchema({
      parseGraphQLController: this.parseGraphQLController,
      databaseController: this.parseServer.config.databaseController,
      log: this.log,
      graphQLCustomTypeDefs: this.config.graphQLCustomTypeDefs,
      appId: this.parseServer.config.appId
    });
  }

  async _getGraphQLOptions() {
    try {
      return {
        schema: await this.parseGraphQLSchema.load(),
        context: ({
          req: {
            info,
            config,
            auth
          }
        }) => ({
          info,
          config,
          auth
        }),
        multipart: {
          fileSize: this._transformMaxUploadSizeToBytes(this.parseServer.config.maxUploadSize || '20mb')
        }
      };
    } catch (e) {
      this.log.error(e.stack || typeof e.toString === 'function' && e.toString() || e);
      throw e;
    }
  }

  async _getServer() {
    const schemaRef = this.parseGraphQLSchema.graphQLSchema;
    const newSchemaRef = await this.parseGraphQLSchema.load();

    if (schemaRef === newSchemaRef && this._server) {
      return this._server;
    }

    const options = await this._getGraphQLOptions();
    this._server = (0, _node.createServer)(options);
    return this._server;
  }

  _transformMaxUploadSizeToBytes(maxUploadSize) {
    const unitMap = {
      kb: 1,
      mb: 2,
      gb: 3
    };
    return Number(maxUploadSize.slice(0, -2)) * Math.pow(1024, unitMap[maxUploadSize.slice(-2).toLowerCase()]);
  }

  applyGraphQL(app) {
    if (!app || !app.use) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }

    app.use(this.config.graphQLPath, (0, _cors.default)());
    app.use(this.config.graphQLPath, _middlewares.handleParseHeaders);
    app.use(this.config.graphQLPath, _middlewares.handleParseErrors);
    app.use(this.config.graphQLPath, async (req, res) => {
      const server = await this._getServer();
      return server(req, res);
    });
  }

  applyPlayground(app) {
    if (!app || !app.get) {
      (0, _requiredParameter.default)('You must provide an Express.js app instance!');
    }

    app.get(this.config.playgroundPath || (0, _requiredParameter.default)('You must provide a config.playgroundPath to applyPlayground!'), (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.write((0, _node.renderGraphiQL)({
        endpoint: this.config.graphQLPath,
        subscriptionEndpoint: this.config.subscriptionsPath,
        headers: {
          'X-Parse-Application-Id': this.parseServer.config.appId,
          'X-Parse-Master-Key': this.parseServer.config.masterKey
        }
      }));
      res.end();
    });
  }

  createSubscriptions(server) {
    _subscriptionsTransportWs.SubscriptionServer.create({
      execute: _graphql.execute,
      subscribe: _graphql.subscribe,
      onOperation: async (_message, params, webSocket) => Object.assign({}, params, await this._getGraphQLOptions(webSocket.upgradeReq))
    }, {
      server,
      path: this.config.subscriptionsPath || (0, _requiredParameter.default)('You must provide a config.subscriptionsPath to createSubscriptions!')
    });
  }

  setGraphQLConfig(graphQLConfig) {
    return this.parseGraphQLController.updateGraphQLConfig(graphQLConfig);
  }

}

exports.ParseGraphQLServer = ParseGraphQLServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlci5qcyJdLCJuYW1lcyI6WyJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInBhcnNlU2VydmVyIiwiY29uZmlnIiwiZ3JhcGhRTFBhdGgiLCJwYXJzZUdyYXBoUUxDb250cm9sbGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJQYXJzZUdyYXBoUUxTY2hlbWEiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJhcHBJZCIsIl9nZXRHcmFwaFFMT3B0aW9ucyIsInNjaGVtYSIsImxvYWQiLCJjb250ZXh0IiwicmVxIiwiaW5mbyIsImF1dGgiLCJtdWx0aXBhcnQiLCJmaWxlU2l6ZSIsIl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyIsIm1heFVwbG9hZFNpemUiLCJlIiwiZXJyb3IiLCJzdGFjayIsInRvU3RyaW5nIiwiX2dldFNlcnZlciIsInNjaGVtYVJlZiIsImdyYXBoUUxTY2hlbWEiLCJuZXdTY2hlbWFSZWYiLCJfc2VydmVyIiwib3B0aW9ucyIsInVuaXRNYXAiLCJrYiIsIm1iIiwiZ2IiLCJOdW1iZXIiLCJzbGljZSIsIk1hdGgiLCJwb3ciLCJ0b0xvd2VyQ2FzZSIsImFwcGx5R3JhcGhRTCIsImFwcCIsInVzZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsImhhbmRsZVBhcnNlRXJyb3JzIiwicmVzIiwic2VydmVyIiwiYXBwbHlQbGF5Z3JvdW5kIiwiZ2V0IiwicGxheWdyb3VuZFBhdGgiLCJfcmVxIiwic2V0SGVhZGVyIiwid3JpdGUiLCJlbmRwb2ludCIsInN1YnNjcmlwdGlvbkVuZHBvaW50Iiwic3Vic2NyaXB0aW9uc1BhdGgiLCJoZWFkZXJzIiwibWFzdGVyS2V5IiwiZW5kIiwiY3JlYXRlU3Vic2NyaXB0aW9ucyIsIlN1YnNjcmlwdGlvblNlcnZlciIsImNyZWF0ZSIsImV4ZWN1dGUiLCJzdWJzY3JpYmUiLCJvbk9wZXJhdGlvbiIsIl9tZXNzYWdlIiwicGFyYW1zIiwid2ViU29ja2V0IiwiT2JqZWN0IiwiYXNzaWduIiwidXBncmFkZVJlcSIsInBhdGgiLCJzZXRHcmFwaFFMQ29uZmlnIiwiZ3JhcGhRTENvbmZpZyIsInVwZGF0ZUdyYXBoUUxDb25maWciXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxrQkFBTixDQUF5QjtBQUd2QkMsRUFBQUEsV0FBVyxDQUFDQyxXQUFELEVBQWNDLE1BQWQsRUFBc0I7QUFDL0IsU0FBS0QsV0FBTCxHQUFtQkEsV0FBVyxJQUFJLGdDQUFrQiwwQ0FBbEIsQ0FBbEM7O0FBQ0EsUUFBSSxDQUFDQyxNQUFELElBQVcsQ0FBQ0EsTUFBTSxDQUFDQyxXQUF2QixFQUFvQztBQUNsQyxzQ0FBa0Isd0NBQWxCO0FBQ0Q7O0FBQ0QsU0FBS0QsTUFBTCxHQUFjQSxNQUFkO0FBQ0EsU0FBS0Usc0JBQUwsR0FBOEIsS0FBS0gsV0FBTCxDQUFpQkMsTUFBakIsQ0FBd0JFLHNCQUF0RDtBQUNBLFNBQUtDLEdBQUwsR0FDRyxLQUFLSixXQUFMLENBQWlCQyxNQUFqQixJQUEyQixLQUFLRCxXQUFMLENBQWlCQyxNQUFqQixDQUF3QkksZ0JBQXBELElBQXlFQyxlQUQzRTtBQUVBLFNBQUtDLGtCQUFMLEdBQTBCLElBQUlDLHNDQUFKLENBQXVCO0FBQy9DTCxNQUFBQSxzQkFBc0IsRUFBRSxLQUFLQSxzQkFEa0I7QUFFL0NNLE1BQUFBLGtCQUFrQixFQUFFLEtBQUtULFdBQUwsQ0FBaUJDLE1BQWpCLENBQXdCUSxrQkFGRztBQUcvQ0wsTUFBQUEsR0FBRyxFQUFFLEtBQUtBLEdBSHFDO0FBSS9DTSxNQUFBQSxxQkFBcUIsRUFBRSxLQUFLVCxNQUFMLENBQVlTLHFCQUpZO0FBSy9DQyxNQUFBQSxLQUFLLEVBQUUsS0FBS1gs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QUFTLENBQUNHLFVBQWxDLENBQWhDO0FBSkosS0FERixFQU9FO0FBQ0V4QixNQUFBQSxNQURGO0FBRUV5QixNQUFBQSxJQUFJLEVBQ0YsS0FBS3hFLE1BQUwsQ0FBWXdELGlCQUFaLElBQ0EsZ0NBQWtCLHFFQUFsQjtBQUpKLEtBUEY7QUFjRDs7QUFFRGlCLEVBQUFBLGdCQUFnQixDQUFDQyxhQUFELEVBQTZDO0FBQzNELFdBQU8sS0FBS3hFLHNCQUFMLENBQTRCeUUsbUJBQTVCLENBQWdERCxhQUFoRCxDQUFQO0FBQ0Q7O0FBM0hzQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBjb3JzTWlkZGxld2FyZSBmcm9tICdjb3JzJztcbmltcG9ydCB7IGNyZWF0ZVNlcnZlciwgcmVuZGVyR3JhcGhpUUwgfSBmcm9tICdAZ3JhcGhxbC15b2dhL25vZGUnO1xuaW1wb3J0IHsgZXhlY3V0ZSwgc3Vic2NyaWJlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb25TZXJ2ZXIgfSBmcm9tICdzdWJzY3JpcHRpb25zLXRyYW5zcG9ydC13cyc7XG5pbXBvcnQgeyBoYW5kbGVQYXJzZUVycm9ycywgaGFuZGxlUGFyc2VIZWFkZXJzIH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4uL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfSBmcm9tICcuL1BhcnNlR3JhcGhRTFNjaGVtYSc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcblxuY2xhc3MgUGFyc2VHcmFwaFFMU2VydmVyIHtcbiAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcblxuICBjb25zdHJ1Y3RvcihwYXJzZVNlcnZlciwgY29uZmlnKSB7XG4gICAgdGhpcy5wYXJzZVNlcnZlciA9IHBhcnNlU2VydmVyIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgcGFyc2VTZXJ2ZXIgaW5zdGFuY2UhJyk7XG4gICAgaWYgKCFjb25maWcgfHwgIWNvbmZpZy5ncmFwaFFMUGF0aCkge1xuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcuZ3JhcGhRTFBhdGghJyk7XG4gICAgfVxuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlciA9IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLnBhcnNlR3JhcGhRTENvbnRyb2xsZXI7XG4gICAgdGhpcy5sb2cgPVxuICAgICAgKHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnICYmIHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIpIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxTY2hlbWEgPSBuZXcgUGFyc2VHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXI6IHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogdGhpcy5wYXJzZVNlcnZlci5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgbG9nOiB0aGlzLmxvZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogdGhpcy5jb25maWcuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgYXBwSWQ6IHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLmFwcElkLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEdyYXBoUUxPcHRpb25zKCkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzY2hlbWE6IGF3YWl0IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmxvYWQoKSxcbiAgICAgICAgY29udGV4dDogKHsgcmVxOiB7IGluZm8sIGNvbmZpZywgYXV0aCB9IH0pID0+ICh7XG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgfSksXG4gICAgICAgIG11bHRpcGFydDoge1xuICAgICAgICAgIGZpbGVTaXplOiB0aGlzLl90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyhcbiAgICAgICAgICAgIHRoaXMucGFyc2VTZXJ2ZXIuY29uZmlnLm1heFVwbG9hZFNpemUgfHwgJzIwbWInXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoZS5zdGFjayB8fCAodHlwZW9mIGUudG9TdHJpbmcgPT09ICdmdW5jdGlvbicgJiYgZS50b1N0cmluZygpKSB8fCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2dldFNlcnZlcigpIHtcbiAgICBjb25zdCBzY2hlbWFSZWYgPSB0aGlzLnBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hO1xuICAgIGNvbnN0IG5ld1NjaGVtYVJlZiA9IGF3YWl0IHRoaXMucGFyc2VHcmFwaFFMU2NoZW1hLmxvYWQoKTtcbiAgICBpZiAoc2NoZW1hUmVmID09PSBuZXdTY2hlbWFSZWYgJiYgdGhpcy5fc2VydmVyKSB7XG4gICAgICByZXR1cm4gdGhpcy5fc2VydmVyO1xuICAgIH1cbiAgICBjb25zdCBvcHRpb25zID0gYXdhaXQgdGhpcy5fZ2V0R3JhcGhRTE9wdGlvbnMoKTtcbiAgICB0aGlzLl9zZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHRoaXMuX3NlcnZlcjtcbiAgfVxuXG4gIF90cmFuc2Zvcm1NYXhVcGxvYWRTaXplVG9CeXRlcyhtYXhVcGxvYWRTaXplKSB7XG4gICAgY29uc3QgdW5pdE1hcCA9IHtcbiAgICAgIGtiOiAxLFxuICAgICAgbWI6IDIsXG4gICAgICBnYjogMyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgIE51bWJlcihtYXhVcGxvYWRTaXplLnNsaWNlKDAsIC0yKSkgKlxuICAgICAgTWF0aC5wb3coMTAyNCwgdW5pdE1hcFttYXhVcGxvYWRTaXplLnNsaWNlKC0yKS50b0xvd2VyQ2FzZSgpXSlcbiAgICApO1xuICB9XG5cbiAgYXBwbHlHcmFwaFFMKGFwcCkge1xuICAgIGlmICghYXBwIHx8ICFhcHAudXNlKSB7XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBFeHByZXNzLmpzIGFwcCBpbnN0YW5jZSEnKTtcbiAgICB9XG5cbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBjb3JzTWlkZGxld2FyZSgpKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBoYW5kbGVQYXJzZUhlYWRlcnMpO1xuICAgIGFwcC51c2UodGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsIGhhbmRsZVBhcnNlRXJyb3JzKTtcbiAgICBhcHAudXNlKHRoaXMuY29uZmlnLmdyYXBoUUxQYXRoLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuX2dldFNlcnZlcigpO1xuICAgICAgcmV0dXJuIHNlcnZlcihyZXEsIHJlcyk7XG4gICAgfSk7XG4gIH1cblxuICBhcHBseVBsYXlncm91bmQoYXBwKSB7XG4gICAgaWYgKCFhcHAgfHwgIWFwcC5nZXQpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIEV4cHJlc3MuanMgYXBwIGluc3RhbmNlIScpO1xuICAgIH1cbiAgICBhcHAuZ2V0KFxuICAgICAgdGhpcy5jb25maWcucGxheWdyb3VuZFBhdGggfHxcbiAgICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb25maWcucGxheWdyb3VuZFBhdGggdG8gYXBwbHlQbGF5Z3JvdW5kIScpLFxuICAgICAgKF9yZXEsIHJlcykgPT4ge1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9odG1sJyk7XG4gICAgICAgIHJlcy53cml0ZShcbiAgICAgICAgICByZW5kZXJHcmFwaGlRTCh7XG4gICAgICAgICAgICBlbmRwb2ludDogdGhpcy5jb25maWcuZ3JhcGhRTFBhdGgsXG4gICAgICAgICAgICBzdWJzY3JpcHRpb25FbmRwb2ludDogdGhpcy5jb25maWcuc3Vic2NyaXB0aW9uc1BhdGgsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICdYLVBhcnNlLUFwcGxpY2F0aW9uLUlkJzogdGhpcy5wYXJzZVNlcnZlci5jb25maWcuYXBwSWQsXG4gICAgICAgICAgICAgICdYLVBhcnNlLU1hc3Rlci1LZXknOiB0aGlzLnBhcnNlU2VydmVyLmNvbmZpZy5tYXN0ZXJLZXksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICAgIHJlcy5lbmQoKTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgY3JlYXRlU3Vic2NyaXB0aW9ucyhzZXJ2ZXIpIHtcbiAgICBTdWJzY3JpcHRpb25TZXJ2ZXIuY3JlYXRlKFxuICAgICAge1xuICAgICAgICBleGVjdXRlLFxuICAgICAgICBzdWJzY3JpYmUsXG4gICAgICAgIG9uT3BlcmF0aW9uOiBhc3luYyAoX21lc3NhZ2UsIHBhcmFtcywgd2ViU29ja2V0KSA9PlxuICAgICAgICAgIE9iamVjdC5hc3NpZ24oe30sIHBhcmFtcywgYXdhaXQgdGhpcy5fZ2V0R3JhcGhRTE9wdGlvbnMod2ViU29ja2V0LnVwZ3JhZGVSZXEpKSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgcGF0aDpcbiAgICAgICAgICB0aGlzLmNvbmZpZy5zdWJzY3JpcHRpb25zUGF0aCB8fFxuICAgICAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgY29uZmlnLnN1YnNjcmlwdGlvbnNQYXRoIHRvIGNyZWF0ZVN1YnNjcmlwdGlvbnMhJyksXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHNldEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKTogUHJvbWlzZSB7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VHcmFwaFFMQ29udHJvbGxlci51cGRhdGVHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9O1xuIl19