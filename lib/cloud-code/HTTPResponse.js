"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
/**
 * @typedef Parse.Cloud.HTTPResponse
 * @property {Buffer} buffer The raw byte representation of the response body. Use this to receive binary data. See Buffer for more details.
 * @property {Object} cookies The cookies sent by the server. The keys in this object are the names of the cookies. The values are Parse.Cloud.Cookie objects.
 * @property {Object} data The parsed response body as a JavaScript object. This is only available when the response Content-Type is application/x-www-form-urlencoded or application/json.
 * @property {Object} headers The headers sent by the server. The keys in this object are the names of the headers. We do not support multiple response headers with the same name. In the common case of Set-Cookie headers, please use the cookies field instead.
 * @property {Number} status The status code.
 * @property {String} text The raw text representation of the response body.
 */
class HTTPResponse {
  constructor(response, body) {
    let _text, _data;
    this.status = response.statusCode;
    this.headers = response.headers || {};
    this.cookies = this.headers['set-cookie'];
    if (typeof body == 'string') {
      _text = body;
    } else if (Buffer.isBuffer(body)) {
      this.buffer = body;
    } else if (typeof body == 'object') {
      _data = body;
    }
    const getText = () => {
      if (!_text && this.buffer) {
        _text = this.buffer.toString('utf-8');
      } else if (!_text && _data) {
        _text = JSON.stringify(_data);
      }
      return _text;
    };
    const getData = () => {
      if (!_data) {
        try {
          _data = JSON.parse(getText());
        } catch (e) {
          /* */
        }
      }
      return _data;
    };
    Object.defineProperty(this, 'body', {
      get: () => {
        return body;
      }
    });
    Object.defineProperty(this, 'text', {
      enumerable: true,
      get: getText
    });
    Object.defineProperty(this, 'data', {
      enumerable: true,
      get: getData
    });
  }
}
exports.default = HTTPResponse;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJIVFRQUmVzcG9uc2UiLCJjb25zdHJ1Y3RvciIsInJlc3BvbnNlIiwiYm9keSIsIl90ZXh0IiwiX2RhdGEiLCJzdGF0dXMiLCJzdGF0dXNDb2RlIiwiaGVhZGVycyIsImNvb2tpZXMiLCJCdWZmZXIiLCJpc0J1ZmZlciIsImJ1ZmZlciIsImdldFRleHQiLCJ0b1N0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJnZXREYXRhIiwicGFyc2UiLCJlIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJlbnVtZXJhYmxlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL2Nsb3VkLWNvZGUvSFRUUFJlc3BvbnNlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQHR5cGVkZWYgUGFyc2UuQ2xvdWQuSFRUUFJlc3BvbnNlXG4gKiBAcHJvcGVydHkge0J1ZmZlcn0gYnVmZmVyIFRoZSByYXcgYnl0ZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgcmVzcG9uc2UgYm9keS4gVXNlIHRoaXMgdG8gcmVjZWl2ZSBiaW5hcnkgZGF0YS4gU2VlIEJ1ZmZlciBmb3IgbW9yZSBkZXRhaWxzLlxuICogQHByb3BlcnR5IHtPYmplY3R9IGNvb2tpZXMgVGhlIGNvb2tpZXMgc2VudCBieSB0aGUgc2VydmVyLiBUaGUga2V5cyBpbiB0aGlzIG9iamVjdCBhcmUgdGhlIG5hbWVzIG9mIHRoZSBjb29raWVzLiBUaGUgdmFsdWVzIGFyZSBQYXJzZS5DbG91ZC5Db29raWUgb2JqZWN0cy5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBkYXRhIFRoZSBwYXJzZWQgcmVzcG9uc2UgYm9keSBhcyBhIEphdmFTY3JpcHQgb2JqZWN0LiBUaGlzIGlzIG9ubHkgYXZhaWxhYmxlIHdoZW4gdGhlIHJlc3BvbnNlIENvbnRlbnQtVHlwZSBpcyBhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQgb3IgYXBwbGljYXRpb24vanNvbi5cbiAqIEBwcm9wZXJ0eSB7T2JqZWN0fSBoZWFkZXJzIFRoZSBoZWFkZXJzIHNlbnQgYnkgdGhlIHNlcnZlci4gVGhlIGtleXMgaW4gdGhpcyBvYmplY3QgYXJlIHRoZSBuYW1lcyBvZiB0aGUgaGVhZGVycy4gV2UgZG8gbm90IHN1cHBvcnQgbXVsdGlwbGUgcmVzcG9uc2UgaGVhZGVycyB3aXRoIHRoZSBzYW1lIG5hbWUuIEluIHRoZSBjb21tb24gY2FzZSBvZiBTZXQtQ29va2llIGhlYWRlcnMsIHBsZWFzZSB1c2UgdGhlIGNvb2tpZXMgZmllbGQgaW5zdGVhZC5cbiAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBzdGF0dXMgVGhlIHN0YXR1cyBjb2RlLlxuICogQHByb3BlcnR5IHtTdHJpbmd9IHRleHQgVGhlIHJhdyB0ZXh0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSByZXNwb25zZSBib2R5LlxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBIVFRQUmVzcG9uc2Uge1xuICBjb25zdHJ1Y3RvcihyZXNwb25zZSwgYm9keSkge1xuICAgIGxldCBfdGV4dCwgX2RhdGE7XG4gICAgdGhpcy5zdGF0dXMgPSByZXNwb25zZS5zdGF0dXNDb2RlO1xuICAgIHRoaXMuaGVhZGVycyA9IHJlc3BvbnNlLmhlYWRlcnMgfHwge307XG4gICAgdGhpcy5jb29raWVzID0gdGhpcy5oZWFkZXJzWydzZXQtY29va2llJ107XG5cbiAgICBpZiAodHlwZW9mIGJvZHkgPT0gJ3N0cmluZycpIHtcbiAgICAgIF90ZXh0ID0gYm9keTtcbiAgICB9IGVsc2UgaWYgKEJ1ZmZlci5pc0J1ZmZlcihib2R5KSkge1xuICAgICAgdGhpcy5idWZmZXIgPSBib2R5O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGJvZHkgPT0gJ29iamVjdCcpIHtcbiAgICAgIF9kYXRhID0gYm9keTtcbiAgICB9XG5cbiAgICBjb25zdCBnZXRUZXh0ID0gKCkgPT4ge1xuICAgICAgaWYgKCFfdGV4dCAmJiB0aGlzLmJ1ZmZlcikge1xuICAgICAgICBfdGV4dCA9IHRoaXMuYnVmZmVyLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgfSBlbHNlIGlmICghX3RleHQgJiYgX2RhdGEpIHtcbiAgICAgICAgX3RleHQgPSBKU09OLnN0cmluZ2lmeShfZGF0YSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gX3RleHQ7XG4gICAgfTtcblxuICAgIGNvbnN0IGdldERhdGEgPSAoKSA9PiB7XG4gICAgICBpZiAoIV9kYXRhKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgX2RhdGEgPSBKU09OLnBhcnNlKGdldFRleHQoKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvKiAqL1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gX2RhdGE7XG4gICAgfTtcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnYm9keScsIHtcbiAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICByZXR1cm4gYm9keTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ3RleHQnLCB7XG4gICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgZ2V0OiBnZXRUZXh0LFxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdkYXRhJywge1xuICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgIGdldDogZ2V0RGF0YSxcbiAgICB9KTtcbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDZSxNQUFNQSxZQUFZLENBQUM7RUFDaENDLFdBQVcsQ0FBQ0MsUUFBUSxFQUFFQyxJQUFJLEVBQUU7SUFDMUIsSUFBSUMsS0FBSyxFQUFFQyxLQUFLO0lBQ2hCLElBQUksQ0FBQ0MsTUFBTSxHQUFHSixRQUFRLENBQUNLLFVBQVU7SUFDakMsSUFBSSxDQUFDQyxPQUFPLEdBQUdOLFFBQVEsQ0FBQ00sT0FBTyxJQUFJLENBQUMsQ0FBQztJQUNyQyxJQUFJLENBQUNDLE9BQU8sR0FBRyxJQUFJLENBQUNELE9BQU8sQ0FBQyxZQUFZLENBQUM7SUFFekMsSUFBSSxPQUFPTCxJQUFJLElBQUksUUFBUSxFQUFFO01BQzNCQyxLQUFLLEdBQUdELElBQUk7SUFDZCxDQUFDLE1BQU0sSUFBSU8sTUFBTSxDQUFDQyxRQUFRLENBQUNSLElBQUksQ0FBQyxFQUFFO01BQ2hDLElBQUksQ0FBQ1MsTUFBTSxHQUFHVCxJQUFJO0lBQ3BCLENBQUMsTUFBTSxJQUFJLE9BQU9BLElBQUksSUFBSSxRQUFRLEVBQUU7TUFDbENFLEtBQUssR0FBR0YsSUFBSTtJQUNkO0lBRUEsTUFBTVUsT0FBTyxHQUFHLE1BQU07TUFDcEIsSUFBSSxDQUFDVCxLQUFLLElBQUksSUFBSSxDQUFDUSxNQUFNLEVBQUU7UUFDekJSLEtBQUssR0FBRyxJQUFJLENBQUNRLE1BQU0sQ0FBQ0UsUUFBUSxDQUFDLE9BQU8sQ0FBQztNQUN2QyxDQUFDLE1BQU0sSUFBSSxDQUFDVixLQUFLLElBQUlDLEtBQUssRUFBRTtRQUMxQkQsS0FBSyxHQUFHVyxJQUFJLENBQUNDLFNBQVMsQ0FBQ1gsS0FBSyxDQUFDO01BQy9CO01BQ0EsT0FBT0QsS0FBSztJQUNkLENBQUM7SUFFRCxNQUFNYSxPQUFPLEdBQUcsTUFBTTtNQUNwQixJQUFJLENBQUNaLEtBQUssRUFBRTtRQUNWLElBQUk7VUFDRkEsS0FBSyxHQUFHVSxJQUFJLENBQUNHLEtBQUssQ0FBQ0wsT0FBTyxFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDLE9BQU9NLENBQUMsRUFBRTtVQUNWO1FBQUE7TUFFSjtNQUNBLE9BQU9kLEtBQUs7SUFDZCxDQUFDO0lBRURlLE1BQU0sQ0FBQ0MsY0FBYyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUU7TUFDbENDLEdBQUcsRUFBRSxNQUFNO1FBQ1QsT0FBT25CLElBQUk7TUFDYjtJQUNGLENBQUMsQ0FBQztJQUVGaUIsTUFBTSxDQUFDQyxjQUFjLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtNQUNsQ0UsVUFBVSxFQUFFLElBQUk7TUFDaEJELEdBQUcsRUFBRVQ7SUFDUCxDQUFDLENBQUM7SUFFRk8sTUFBTSxDQUFDQyxjQUFjLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtNQUNsQ0UsVUFBVSxFQUFFLElBQUk7TUFDaEJELEdBQUcsRUFBRUw7SUFDUCxDQUFDLENBQUM7RUFDSjtBQUNGO0FBQUMifQ==