"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CloudCodeRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var _node = _interopRequireDefault(require("parse/node"));
var _rest = _interopRequireDefault(require("../rest"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const triggers = require('../triggers');
const middleware = require('../middlewares');
function formatJobSchedule(job_schedule) {
  if (typeof job_schedule.startAfter === 'undefined') {
    job_schedule.startAfter = new Date().toISOString();
  }
  return job_schedule;
}
function validateJobSchedule(config, job_schedule) {
  const jobs = triggers.getJobs(config.applicationId) || {};
  if (job_schedule.jobName && !jobs[job_schedule.jobName]) {
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Cannot Schedule a job that is not deployed');
  }
}
class CloudCodeRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/cloud_code/jobs', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.getJobs);
    this.route('GET', '/cloud_code/jobs/data', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.getJobsData);
    this.route('POST', '/cloud_code/jobs', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.createJob);
    this.route('PUT', '/cloud_code/jobs/:objectId', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.editJob);
    this.route('DELETE', '/cloud_code/jobs/:objectId', middleware.promiseEnforceMasterKeyAccess, CloudCodeRouter.deleteJob);
  }
  static getJobs(req) {
    return _rest.default.find(req.config, req.auth, '_JobSchedule', {}, {}).then(scheduledJobs => {
      return {
        response: scheduledJobs.results
      };
    });
  }
  static getJobsData(req) {
    const config = req.config;
    const jobs = triggers.getJobs(config.applicationId) || {};
    return _rest.default.find(req.config, req.auth, '_JobSchedule', {}, {}).then(scheduledJobs => {
      return {
        response: {
          in_use: scheduledJobs.results.map(job => job.jobName),
          jobs: Object.keys(jobs)
        }
      };
    });
  }
  static createJob(req) {
    const {
      job_schedule
    } = req.body;
    validateJobSchedule(req.config, job_schedule);
    return _rest.default.create(req.config, req.auth, '_JobSchedule', formatJobSchedule(job_schedule), req.client, req.info.context);
  }
  static editJob(req) {
    const {
      objectId
    } = req.params;
    const {
      job_schedule
    } = req.body;
    validateJobSchedule(req.config, job_schedule);
    return _rest.default.update(req.config, req.auth, '_JobSchedule', {
      objectId
    }, formatJobSchedule(job_schedule), undefined, req.info.context).then(response => {
      return {
        response
      };
    });
  }
  static deleteJob(req) {
    const {
      objectId
    } = req.params;
    return _rest.default.del(req.config, req.auth, '_JobSchedule', objectId, req.info.context).then(response => {
      return {
        response
      };
    });
  }
}
exports.CloudCodeRouter = CloudCodeRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX25vZGUiLCJfcmVzdCIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInRyaWdnZXJzIiwibWlkZGxld2FyZSIsImZvcm1hdEpvYlNjaGVkdWxlIiwiam9iX3NjaGVkdWxlIiwic3RhcnRBZnRlciIsIkRhdGUiLCJ0b0lTT1N0cmluZyIsInZhbGlkYXRlSm9iU2NoZWR1bGUiLCJjb25maWciLCJqb2JzIiwiZ2V0Sm9icyIsImFwcGxpY2F0aW9uSWQiLCJqb2JOYW1lIiwiUGFyc2UiLCJFcnJvciIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsIkNsb3VkQ29kZVJvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJnZXRKb2JzRGF0YSIsImNyZWF0ZUpvYiIsImVkaXRKb2IiLCJkZWxldGVKb2IiLCJyZXEiLCJyZXN0IiwiZmluZCIsImF1dGgiLCJ0aGVuIiwic2NoZWR1bGVkSm9icyIsInJlc3BvbnNlIiwicmVzdWx0cyIsImluX3VzZSIsIm1hcCIsImpvYiIsIk9iamVjdCIsImtleXMiLCJib2R5IiwiY3JlYXRlIiwiY2xpZW50IiwiaW5mbyIsImNvbnRleHQiLCJvYmplY3RJZCIsInBhcmFtcyIsInVwZGF0ZSIsInVuZGVmaW5lZCIsImRlbCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9DbG91ZENvZGVSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmNvbnN0IHRyaWdnZXJzID0gcmVxdWlyZSgnLi4vdHJpZ2dlcnMnKTtcbmNvbnN0IG1pZGRsZXdhcmUgPSByZXF1aXJlKCcuLi9taWRkbGV3YXJlcycpO1xuXG5mdW5jdGlvbiBmb3JtYXRKb2JTY2hlZHVsZShqb2Jfc2NoZWR1bGUpIHtcbiAgaWYgKHR5cGVvZiBqb2Jfc2NoZWR1bGUuc3RhcnRBZnRlciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBqb2Jfc2NoZWR1bGUuc3RhcnRBZnRlciA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgfVxuICByZXR1cm4gam9iX3NjaGVkdWxlO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUpvYlNjaGVkdWxlKGNvbmZpZywgam9iX3NjaGVkdWxlKSB7XG4gIGNvbnN0IGpvYnMgPSB0cmlnZ2Vycy5nZXRKb2JzKGNvbmZpZy5hcHBsaWNhdGlvbklkKSB8fCB7fTtcbiAgaWYgKGpvYl9zY2hlZHVsZS5qb2JOYW1lICYmICFqb2JzW2pvYl9zY2hlZHVsZS5qb2JOYW1lXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdDYW5ub3QgU2NoZWR1bGUgYSBqb2IgdGhhdCBpcyBub3QgZGVwbG95ZWQnXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQ2xvdWRDb2RlUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnR0VUJyxcbiAgICAgICcvY2xvdWRfY29kZS9qb2JzJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICBDbG91ZENvZGVSb3V0ZXIuZ2V0Sm9ic1xuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9jbG91ZF9jb2RlL2pvYnMvZGF0YScsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgQ2xvdWRDb2RlUm91dGVyLmdldEpvYnNEYXRhXG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ1BPU1QnLFxuICAgICAgJy9jbG91ZF9jb2RlL2pvYnMnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIENsb3VkQ29kZVJvdXRlci5jcmVhdGVKb2JcbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUFVUJyxcbiAgICAgICcvY2xvdWRfY29kZS9qb2JzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgQ2xvdWRDb2RlUm91dGVyLmVkaXRKb2JcbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnREVMRVRFJyxcbiAgICAgICcvY2xvdWRfY29kZS9qb2JzLzpvYmplY3RJZCcsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgQ2xvdWRDb2RlUm91dGVyLmRlbGV0ZUpvYlxuICAgICk7XG4gIH1cblxuICBzdGF0aWMgZ2V0Sm9icyhyZXEpIHtcbiAgICByZXR1cm4gcmVzdC5maW5kKHJlcS5jb25maWcsIHJlcS5hdXRoLCAnX0pvYlNjaGVkdWxlJywge30sIHt9KS50aGVuKHNjaGVkdWxlZEpvYnMgPT4ge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzcG9uc2U6IHNjaGVkdWxlZEpvYnMucmVzdWx0cyxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBzdGF0aWMgZ2V0Sm9ic0RhdGEocmVxKSB7XG4gICAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgICBjb25zdCBqb2JzID0gdHJpZ2dlcnMuZ2V0Sm9icyhjb25maWcuYXBwbGljYXRpb25JZCkgfHwge307XG4gICAgcmV0dXJuIHJlc3QuZmluZChyZXEuY29uZmlnLCByZXEuYXV0aCwgJ19Kb2JTY2hlZHVsZScsIHt9LCB7fSkudGhlbihzY2hlZHVsZWRKb2JzID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgaW5fdXNlOiBzY2hlZHVsZWRKb2JzLnJlc3VsdHMubWFwKGpvYiA9PiBqb2Iuam9iTmFtZSksXG4gICAgICAgICAgam9iczogT2JqZWN0LmtleXMoam9icyksXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIGNyZWF0ZUpvYihyZXEpIHtcbiAgICBjb25zdCB7IGpvYl9zY2hlZHVsZSB9ID0gcmVxLmJvZHk7XG4gICAgdmFsaWRhdGVKb2JTY2hlZHVsZShyZXEuY29uZmlnLCBqb2Jfc2NoZWR1bGUpO1xuICAgIHJldHVybiByZXN0LmNyZWF0ZShcbiAgICAgIHJlcS5jb25maWcsXG4gICAgICByZXEuYXV0aCxcbiAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgZm9ybWF0Sm9iU2NoZWR1bGUoam9iX3NjaGVkdWxlKSxcbiAgICAgIHJlcS5jbGllbnQsXG4gICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgKTtcbiAgfVxuXG4gIHN0YXRpYyBlZGl0Sm9iKHJlcSkge1xuICAgIGNvbnN0IHsgb2JqZWN0SWQgfSA9IHJlcS5wYXJhbXM7XG4gICAgY29uc3QgeyBqb2Jfc2NoZWR1bGUgfSA9IHJlcS5ib2R5O1xuICAgIHZhbGlkYXRlSm9iU2NoZWR1bGUocmVxLmNvbmZpZywgam9iX3NjaGVkdWxlKTtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLnVwZGF0ZShcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICB7IG9iamVjdElkIH0sXG4gICAgICAgIGZvcm1hdEpvYlNjaGVkdWxlKGpvYl9zY2hlZHVsZSksXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3BvbnNlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cblxuICBzdGF0aWMgZGVsZXRlSm9iKHJlcSkge1xuICAgIGNvbnN0IHsgb2JqZWN0SWQgfSA9IHJlcS5wYXJhbXM7XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5kZWwocmVxLmNvbmZpZywgcmVxLmF1dGgsICdfSm9iU2NoZWR1bGUnLCBvYmplY3RJZCwgcmVxLmluZm8uY29udGV4dClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLGNBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUEyQixTQUFBRCx1QkFBQUksQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUMzQixNQUFNRyxRQUFRLEdBQUdOLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDdkMsTUFBTU8sVUFBVSxHQUFHUCxPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFFNUMsU0FBU1EsaUJBQWlCQSxDQUFDQyxZQUFZLEVBQUU7RUFDdkMsSUFBSSxPQUFPQSxZQUFZLENBQUNDLFVBQVUsS0FBSyxXQUFXLEVBQUU7SUFDbERELFlBQVksQ0FBQ0MsVUFBVSxHQUFHLElBQUlDLElBQUksQ0FBQyxDQUFDLENBQUNDLFdBQVcsQ0FBQyxDQUFDO0VBQ3BEO0VBQ0EsT0FBT0gsWUFBWTtBQUNyQjtBQUVBLFNBQVNJLG1CQUFtQkEsQ0FBQ0MsTUFBTSxFQUFFTCxZQUFZLEVBQUU7RUFDakQsTUFBTU0sSUFBSSxHQUFHVCxRQUFRLENBQUNVLE9BQU8s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