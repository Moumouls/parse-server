"use strict";

const fs = require('fs');
function getDatabaseOptionsFromURI(uri) {
  const databaseOptions = {};
  const parsedURI = new URL(uri);
  const queryParams = parseQueryParams(parsedURI.searchParams.toString());
  databaseOptions.host = parsedURI.hostname || 'localhost';
  databaseOptions.port = parsedURI.port ? parseInt(parsedURI.port) : 5432;
  databaseOptions.database = parsedURI.pathname ? parsedURI.pathname.substr(1) : undefined;
  databaseOptions.user = parsedURI.username;
  databaseOptions.password = parsedURI.password;
  if (queryParams.ssl && queryParams.ssl.toLowerCase() === 'true') {
    databaseOptions.ssl = true;
  }
  if (queryParams.ca || queryParams.pfx || queryParams.cert || queryParams.key || queryParams.passphrase || queryParams.rejectUnauthorized || queryParams.secureOptions) {
    databaseOptions.ssl = {};
    if (queryParams.ca) {
      databaseOptions.ssl.ca = fs.readFileSync(queryParams.ca).toString();
    }
    if (queryParams.pfx) {
      databaseOptions.ssl.pfx = fs.readFileSync(queryParams.pfx).toString();
    }
    if (queryParams.cert) {
      databaseOptions.ssl.cert = fs.readFileSync(queryParams.cert).toString();
    }
    if (queryParams.key) {
      databaseOptions.ssl.key = fs.readFileSync(queryParams.key).toString();
    }
    if (queryParams.passphrase) {
      databaseOptions.ssl.passphrase = queryParams.passphrase;
    }
    if (queryParams.rejectUnauthorized) {
      databaseOptions.ssl.rejectUnauthorized = queryParams.rejectUnauthorized.toLowerCase() === 'true' ? true : false;
    }
    if (queryParams.secureOptions) {
      databaseOptions.ssl.secureOptions = parseInt(queryParams.secureOptions);
    }
  }
  databaseOptions.binary = queryParams.binary && queryParams.binary.toLowerCase() === 'true' ? true : false;
  databaseOptions.client_encoding = queryParams.client_encoding;
  databaseOptions.application_name = queryParams.application_name;
  databaseOptions.fallback_application_name = queryParams.fallback_application_name;
  if (queryParams.poolSize) {
    databaseOptions.max = parseInt(queryParams.poolSize) || 10;
  }
  if (queryParams.max) {
    databaseOptions.max = parseInt(queryParams.max) || 10;
  }
  if (queryParams.query_timeout) {
    databaseOptions.query_timeout = parseInt(queryParams.query_timeout);
  }
  if (queryParams.idleTimeoutMillis) {
    databaseOptions.idleTimeoutMillis = parseInt(queryParams.idleTimeoutMillis);
  }
  if (queryParams.keepAlive) {
    databaseOptions.keepAlive = queryParams.keepAlive.toLowerCase() === 'true' ? true : false;
  }
  return databaseOptions;
}
function parseQueryParams(queryString) {
  queryString = queryString || '';
  return queryString.split('&').reduce((p, c) => {
    const parts = c.split('=');
    p[decodeURIComponent(parts[0])] = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('=')) : '';
    return p;
  }, {});
}
module.exports = {
  parseQueryParams: parseQueryParams,
  getDatabaseOptionsFromURI: getDatabaseOptionsFromURI
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmcyIsInJlcXVpcmUiLCJnZXREYXRhYmFzZU9wdGlvbnNGcm9tVVJJIiwidXJpIiwiZGF0YWJhc2VPcHRpb25zIiwicGFyc2VkVVJJIiwiVVJMIiwicXVlcnlQYXJhbXMiLCJwYXJzZVF1ZXJ5UGFyYW1zIiwic2VhcmNoUGFyYW1zIiwidG9TdHJpbmciLCJob3N0IiwiaG9zdG5hbWUiLCJwb3J0IiwicGFyc2VJbnQiLCJkYXRhYmFzZSIsInBhdGhuYW1lIiwic3Vic3RyIiwidW5kZWZpbmVkIiwidXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJzc2wiLCJ0b0xvd2VyQ2FzZSIsImNhIiwicGZ4IiwiY2VydCIsImtleSIsInBhc3NwaHJhc2UiLCJyZWplY3RVbmF1dGhvcml6ZWQiLCJzZWN1cmVPcHRpb25zIiwicmVhZEZpbGVTeW5jIiwiYmluYXJ5IiwiY2xpZW50X2VuY29kaW5nIiwiYXBwbGljYXRpb25fbmFtZSIsImZhbGxiYWNrX2FwcGxpY2F0aW9uX25hbWUiLCJwb29sU2l6ZSIsIm1heCIsInF1ZXJ5X3RpbWVvdXQiLCJpZGxlVGltZW91dE1pbGxpcyIsImtlZXBBbGl2ZSIsInF1ZXJ5U3RyaW5nIiwic3BsaXQiLCJyZWR1Y2UiLCJwIiwiYyIsInBhcnRzIiwiZGVjb2RlVVJJQ29tcG9uZW50IiwibGVuZ3RoIiwic2xpY2UiLCJqb2luIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzQ29uZmlnUGFyc2VyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbmZ1bmN0aW9uIGdldERhdGFiYXNlT3B0aW9uc0Zyb21VUkkodXJpKSB7XG4gIGNvbnN0IGRhdGFiYXNlT3B0aW9ucyA9IHt9O1xuXG4gIGNvbnN0IHBhcnNlZFVSSSA9IG5ldyBVUkwodXJpKTtcbiAgY29uc3QgcXVlcnlQYXJhbXMgPSBwYXJzZVF1ZXJ5UGFyYW1zKHBhcnNlZFVSSS5zZWFyY2hQYXJhbXMudG9TdHJpbmcoKSk7XG5cbiAgZGF0YWJhc2VPcHRpb25zLmhvc3QgPSBwYXJzZWRVUkkuaG9zdG5hbWUgfHwgJ2xvY2FsaG9zdCc7XG4gIGRhdGFiYXNlT3B0aW9ucy5wb3J0ID0gcGFyc2VkVVJJLnBvcnQgPyBwYXJzZUludChwYXJzZWRVUkkucG9ydCkgOiA1NDMyO1xuICBkYXRhYmFzZU9wdGlvbnMuZGF0YWJhc2UgPSBwYXJzZWRVUkkucGF0aG5hbWUgPyBwYXJzZWRVUkkucGF0aG5hbWUuc3Vic3RyKDEpIDogdW5kZWZpbmVkO1xuXG4gIGRhdGFiYXNlT3B0aW9ucy51c2VyID0gcGFyc2VkVVJJLnVzZXJuYW1lO1xuICBkYXRhYmFzZU9wdGlvbnMucGFzc3dvcmQgPSBwYXJzZWRVUkkucGFzc3dvcmQ7XG5cbiAgaWYgKHF1ZXJ5UGFyYW1zLnNzbCAmJiBxdWVyeVBhcmFtcy5zc2wudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnKSB7XG4gICAgZGF0YWJhc2VPcHRpb25zLnNzbCA9IHRydWU7XG4gIH1cblxuICBpZiAoXG4gICAgcXVlcnlQYXJhbXMuY2EgfHxcbiAgICBxdWVyeVBhcmFtcy5wZnggfHxcbiAgICBxdWVyeVBhcmFtcy5jZXJ0IHx8XG4gICAgcXVlcnlQYXJhbXMua2V5IHx8XG4gICAgcXVlcnlQYXJhbXMucGFzc3BocmFzZSB8fFxuICAgIHF1ZXJ5UGFyYW1zLnJlamVjdFVuYXV0aG9yaXplZCB8fFxuICAgIHF1ZXJ5UGFyYW1zLnNlY3VyZU9wdGlvbnNcbiAgKSB7XG4gICAgZGF0YWJhc2VPcHRpb25zLnNzbCA9IHt9O1xuICAgIGlmIChxdWVyeVBhcmFtcy5jYSkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNzbC5jYSA9IGZzLnJlYWRGaWxlU3luYyhxdWVyeVBhcmFtcy5jYSkudG9TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5UGFyYW1zLnBmeCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNzbC5wZnggPSBmcy5yZWFkRmlsZVN5bmMocXVlcnlQYXJhbXMucGZ4KS50b1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAocXVlcnlQYXJhbXMuY2VydCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNzbC5jZXJ0ID0gZnMucmVhZEZpbGVTeW5jKHF1ZXJ5UGFyYW1zLmNlcnQpLnRvU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChxdWVyeVBhcmFtcy5rZXkpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5zc2wua2V5ID0gZnMucmVhZEZpbGVTeW5jKHF1ZXJ5UGFyYW1zLmtleSkudG9TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5UGFyYW1zLnBhc3NwaHJhc2UpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5zc2wucGFzc3BocmFzZSA9IHF1ZXJ5UGFyYW1zLnBhc3NwaHJhc2U7XG4gICAgfVxuICAgIGlmIChxdWVyeVBhcmFtcy5yZWplY3RVbmF1dGhvcml6ZWQpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5zc2wucmVqZWN0VW5hdXRob3JpemVkID1cbiAgICAgICAgcXVlcnlQYXJhbXMucmVqZWN0VW5hdXRob3JpemVkLnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJyA/IHRydWUgOiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5UGFyYW1zLnNlY3VyZU9wdGlvbnMpIHtcbiAgICAgIGRhdGFiYXNlT3B0aW9ucy5zc2wuc2VjdXJlT3B0aW9ucyA9IHBhcnNlSW50KHF1ZXJ5UGFyYW1zLnNlY3VyZU9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIGRhdGFiYXNlT3B0aW9ucy5iaW5hcnkgPVxuICAgIHF1ZXJ5UGFyYW1zLmJpbmFyeSAmJiBxdWVyeVBhcmFtcy5iaW5hcnkudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnID8gdHJ1ZSA6IGZhbHNlO1xuXG4gIGRhdGFiYXNlT3B0aW9ucy5jbGllbnRfZW5jb2RpbmcgPSBxdWVyeVBhcmFtcy5jbGllbnRfZW5jb2Rpbmc7XG4gIGRhdGFiYXNlT3B0aW9ucy5hcHBsaWNhdGlvbl9uYW1lID0gcXVlcnlQYXJhbXMuYXBwbGljYXRpb25fbmFtZTtcbiAgZGF0YWJhc2VPcHRpb25zLmZhbGxiYWNrX2FwcGxpY2F0aW9uX25hbWUgPSBxdWVyeVBhcmFtcy5mYWxsYmFja19hcHBsaWNhdGlvbl9uYW1lO1xuXG4gIGlmIChxdWVyeVBhcmFtcy5wb29sU2l6ZSkge1xuICAgIGRhdGFiYXNlT3B0aW9ucy5tYXggPSBwYXJzZUludChxdWVyeVBhcmFtcy5wb29sU2l6ZSkgfHwgMTA7XG4gIH1cbiAgaWYgKHF1ZXJ5UGFyYW1zLm1heCkge1xuICAgIGRhdGFiYXNlT3B0aW9ucy5tYXggPSBwYXJzZUludChxdWVyeVBhcmFtcy5tYXgpIHx8IDEwO1xuICB9XG4gIGlmIChxdWVyeVBhcmFtcy5xdWVyeV90aW1lb3V0KSB7XG4gICAgZGF0YWJhc2VPcHRpb25zLnF1ZXJ5X3RpbWVvdXQgPSBwYXJzZUludChxdWVyeVBhcmFtcy5xdWVyeV90aW1lb3V0KTtcbiAgfVxuICBpZiAocXVlcnlQYXJhbXMuaWRsZVRpbWVvdXRNaWxsaXMpIHtcbiAgICBkYXRhYmFzZU9wdGlvbnMuaWRsZVRpbWVvdXRNaWxsaXMgPSBwYXJzZUludChxdWVyeVBhcmFtcy5pZGxlVGltZW91dE1pbGxpcyk7XG4gIH1cbiAgaWYgKHF1ZXJ5UGFyYW1zLmtlZXBBbGl2ZSkge1xuICAgIGRhdGFiYXNlT3B0aW9ucy5rZWVwQWxpdmUgPSBxdWVyeVBhcmFtcy5rZWVwQWxpdmUudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnID8gdHJ1ZSA6IGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGRhdGFiYXNlT3B0aW9ucztcbn1cblxuZnVuY3Rpb24gcGFyc2VRdWVyeVBhcmFtcyhxdWVyeVN0cmluZykge1xuICBxdWVyeVN0cmluZyA9IHF1ZXJ5U3RyaW5nIHx8ICcnO1xuXG4gIHJldHVybiBxdWVyeVN0cmluZy5zcGxpdCgnJicpLnJlZHVjZSgocCwgYykgPT4ge1xuICAgIGNvbnN0IHBhcnRzID0gYy5zcGxpdCgnPScpO1xuICAgIHBbZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzBdKV0gPVxuICAgICAgcGFydHMubGVuZ3RoID4gMSA/IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0cy5zbGljZSgxKS5qb2luKCc9JykpIDogJyc7XG4gICAgcmV0dXJuIHA7XG4gIH0sIHt9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHBhcnNlUXVlcnlQYXJhbXM6IHBhcnNlUXVlcnlQYXJhbXMsXG4gIGdldERhdGFiYXNlT3B0aW9uc0Zyb21VUkk6IGdldERhdGFiYXNlT3B0aW9uc0Zyb21VUkksXG59O1xuIl0sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU1BLEVBQUUsR0FBR0MsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN4QixTQUFTQyx5QkFBeUJBLENBQUNDLEdBQUcsRUFBRTtFQUN0QyxNQUFNQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO0VBRTFCLE1BQU1DLFNBQVMsR0FBRyxJQUFJQyxHQUFHLENBQUNILEdBQUcsQ0FBQztFQUM5QixNQUFNSSxXQUFXLEdBQUdDLGdCQUFnQixDQUFDSCxTQUFTLENBQUNJLFlBQVksQ0FBQ0MsUUFBUSxDQUFDLENBQUMsQ0FBQztFQUV2RU4sZUFBZSxDQUFDTyxJQUFJLEdBQUdOLFNBQVMsQ0FBQ08sUUFBUSxJQUFJLFdBQVc7RUFDeERSLGVBQWUsQ0FBQ1MsSUFBSSxHQUFHUixTQUFTLENBQUNRLElBQUksR0FBR0MsUUFBUSxDQUFDVCxTQUFTLENBQUNRLElBQUksQ0FBQyxHQUFHLElBQUk7RUFDdkVULGVBQWUsQ0FBQ1csUUFBUSxHQUFHVixTQUFTLENBQUNXLFFBQVEsR0FBR1gsU0FBUyxDQUFDVyxRQUFRLENBQUNDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBR0MsU0FBUztFQUV4RmQsZUFBZSxDQUFDZSxJQUFJLEdBQUdkLFNBQVMsQ0FBQ2UsUUFBUTtFQUN6Q2hCLGVBQWUsQ0FBQ2lCLFFBQVEsR0FBR2hCLFNBQVMsQ0FBQ2dCLFFBQVE7RUFFN0MsSUFBSWQsV0FBVyxDQUFDZSxHQUFHLElBQUlmLFdBQVcsQ0FBQ2UsR0FBRyxDQUFDQyxXQUFXLENBQUMsQ0FBQyxLQUFLLE1BQU0sRUFBRTtJQUMvRG5CLGVBQWUsQ0FBQ2tCLEdBQUcsR0FBRyxJQUFJO0VBQzVCO0VBRUEsSUFDRWYsV0FBVyxDQUFDaUIsRUFBRSxJQUNkakIsV0FBVyxDQUFDa0IsR0FBRyxJQUNmbEIsV0FBVyxDQUFDbUIsSUFBSSxJQUNoQm5CLFdBQVcsQ0FBQ29CLEdBQUcsSUFDZnBCLFdBQVcsQ0FBQ3FCLFVBQVUsSUFDdEJyQixXQUFXLENBQUNzQixrQkFBa0IsSUFDOUJ0QixXQUFXLENBQUN1QixhQUFhLEVBQ3pCO0lBQ0ExQixlQUFlLENBQUNrQixHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ3hCLElBQUlmLFdBQVcsQ0FBQ2lCLEVBQUUsRUFBRTtNQUNsQnBCLGVBQWUsQ0FBQ2tCLEdBQUcsQ0FBQ0UsRUFBRSxHQUFHeEIsRUFBRSxDQUFDK0IsWUFBWSxDQUFDeEIsV0FBVyxDQUFDaUIsRUFBRSxDQUFDLENBQUNkLFFBQVEsQ0FBQyxDQUFDO0lBQ3JFO0lBQ0EsSUFBSUgsV0FBVyxDQUFDa0IsR0FBRyxFQUFFO01BQ25CckIsZUFBZSxDQUFDa0IsR0FBRyxDQUFDRyxHQUFHLEdBQUd6QixFQUFFLENBQUMrQixZQUFZLENBQUN4QixXQUFXLENBQUNrQixHQUFHLENBQUMsQ0FBQ2YsUUFBUSxDQUFDLENBQUM7SUFDdkU7SUFDQSxJQUFJSCxXQUFXLENBQUNtQixJQUFJLEVBQUU7TUFDcEJ0QixlQUFlLENBQUNrQixHQUFHLENBQUNJLElBQUksR0FBRzFCLEVBQUUsQ0FBQytCLFlBQVksQ0FBQ3hCLFdBQVcsQ0FBQ21CLElBQUksQ0FBQyxDQUFDaEIsUUFBUSxDQUFDLENBQUM7SUFDekU7SUFDQSxJQUFJSCxXQUFXLENBQUNvQixHQUFHLEVBQUU7TUFDbkJ2QixlQUFlLENBQUNrQixHQUFHLENBQUNLLEdBQUcsR0FBRzNCLEVBQUUsQ0FBQytCLFlBQVksQ0FBQ3hCLFdBQVcsQ0FBQ29CLEdBQUcsQ0FBQyxDQUFDakIsUUFBUSxDQUFDLENBQUM7SUFDdkU7SUFDQSxJQUFJSCxXQUFXLENBQUNxQixVQUFVLEVBQUU7TUFDMUJ4QixlQUFlLENBQUNrQixHQUFHLENBQUNNLFVBQVUsR0FBR3JCLFdBQVcsQ0FBQ3FCLFVBQVU7SUFDekQ7SUFDQSxJQUFJckIsV0FBVyxDQUFDc0Isa0JBQWtCLEVBQUU7TUFDbEN6QixlQUFlLENBQUNrQixHQUFHLENBQUNPLGtCQUFrQixHQUNwQ3RCLFdBQVcsQ0FBQ3NCLGtCQUFrQixDQUFDTixXQUFXLENBQUMsQ0FBQyxLQUFLLE1BQU0sR0FBRyxJQUFJLEdBQUcsS0FBSztJQUMxRTtJQUNBLElBQUloQixXQUFXLENBQUN1QixhQUFhLEVBQUU7TUFDN0IxQixlQUFlLENBQUNrQixHQUFHLENBQUNRLGFBQWEsR0FBR2hCLFFBQVEsQ0FBQ1AsV0FBVyxDQUFDdUIsYUFBYSxDQUFDO0lBQ3pFO0VBQ0Y7RUFFQTFCLGVBQWUsQ0FBQzRCLE1BQU0sR0FDcEJ6QixXQUFXLENBQUN5QixNQUFNLElBQUl6QixXQUFXLENBQUN5QixNQUFNLENBQUNULFdBQVcsQ0FBQyxDQUFDLEtBQUssTUFBTSxHQUFHLElBQUksR0FBRyxLQUFLO0VBRWxGbkIsZUFBZSxDQUFDNkIsZUFBZSxHQUFHMUIsV0FBVyxDQUFDMEIsZUFBZTtFQUM3RDdCLGVBQWUsQ0FBQzhCLGdCQUFnQixHQUFHM0IsV0FBVyxDQUFDMkIsZ0JBQWdCO0VBQy9EOUIsZUFBZSxDQUFDK0IseUJBQXlCLEdBQUc1QixXQUFXLENBQUM0Qix5QkFBeUI7RUFFakYsSUFBSTVCLFdBQVcsQ0FBQzZCLFFBQVEsRUFBRTtJQUN4QmhDLGVBQWUsQ0FBQ2lDLEdBQUcsR0FBR3ZCLFFBQVEsQ0FBQ1AsV0FBVyxDQUFDNkIsUUFBUSxDQUFDLElBQUksRUFBRTtFQUM1RDtFQUNBLElBQUk3QixXQUFXLENBQUM4QixHQUFHLEVBQUU7SUFDbkJqQyxlQUFlLENBQUNpQyxHQUFHLEdBQUd2QixRQUFRLENBQUNQLFdBQVcsQ0FBQzhCLEdBQUcsQ0FBQyxJQUFJLEVBQUU7RUFDdkQ7RUFDQSxJQUFJOUIsV0FBVyxDQUFDK0IsYUFBYSxFQUFFO0lBQzdCbEMsZUFBZSxDQUFDa0MsYUFBYSxHQUFHeEIsUUFBUSxDQUFDUCxXQUFXLENBQUMrQixhQUFhLENBQUM7RUFDckU7RUFDQSxJQUFJL0IsV0FBVyxDQUFDZ0MsaUJBQWlCLEVBQUU7SUFDakNuQyxlQUFlLENBQUNtQyxpQkFBaUIsR0FBR3pCLFFBQVEsQ0FBQ1AsV0FBVyxDQUFDZ0MsaUJBQWlCLENBQUM7RUFDN0U7RUFDQSxJQUFJaEMsV0FBVyxDQUFDaUMsU0FBUyxFQUFFO0lBQ3pCcEMsZUFBZSxDQUFDb0MsU0FBUyxHQUFHakMsV0FBVyxDQUFDaUMsU0FBUyxDQUFDakIsV0FBVyxDQUFDLENBQUMsS0FBSyxNQUFNLEdBQUcsSUFBSSxHQUFHLEtBQUs7RUFDM0Y7RUFFQSxPQUFPbkIsZUFBZTtBQUN4QjtBQUVBLFNBQVNJLGdCQUFnQkEsQ0FBQ2lDLFdBQVcsRUFBRTtFQUNyQ0EsV0FBVyxHQUFHQSxXQUFXLElBQUksRUFBRTtFQUUvQixPQUFPQSxXQUFXLENBQUNDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQ0MsTUFBTSxDQUFDLENBQUNDLENBQUMsRUFBRUMsQ0FBQyxLQUFLO0lBQzdDLE1BQU1DLEtBQUssR0FBR0QsQ0FBQyxDQUFDSCxLQUFLLENBQUMsR0FBRyxDQUFDO0lBQzFCRSxDQUFDLENBQUNHLGtCQUFrQixDQUFDRCxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUM3QkEsS0FBSyxDQUFDRSxNQUFNLEdBQUcsQ0FBQyxHQUFHRCxrQkFBa0IsQ0FBQ0QsS0FBSyxDQUFDRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUNDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUU7SUFDdEUsT0FBT04sQ0FBQztFQUNWLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNSO0FBRUFPLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHO0VBQ2Y1QyxnQkFBZ0IsRUFBRUEsZ0JBQWdCO0VBQ2xDTix5QkFBeUIsRUFBRUE7QUFDN0IsQ0FBQyIsImlnbm9yZUxpc3QiOltdfQ==