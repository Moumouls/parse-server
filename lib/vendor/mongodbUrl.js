/*
 * A slightly patched version of node's URL module, with support for `mongodb://` URIs.
 * See https://github.com/nodejs/node for licensing information.
 */

'use strict';

var _punycode = _interopRequireDefault(require("punycode/punycode.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;
exports.Url = Url;
function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/;

// Special case for a simple path URL
const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;

// protocols that can allow "unsafe" and "unwise" chars.
const unsafeProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that never have a hostname.
const hostlessProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that always contain a // bit.
const slashedProtocol = {
  http: true,
  'http:': true,
  https: true,
  'https:': true,
  ftp: true,
  'ftp:': true,
  gopher: true,
  'gopher:': true,
  file: true,
  'file:': true
};
const querystring = require('querystring');

/* istanbul ignore next: improve coverage */
function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url instanceof Url) return url;
  var u = new Url();
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

/* istanbul ignore next: improve coverage */
Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
  if (typeof url !== 'string') {
    throw new TypeError('Parameter "url" must be a string, not ' + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var hasHash = false;
  var start = -1;
  var end = -1;
  var rest = '';
  var lastPos = 0;
  var i = 0;
  for (var inWs = false, split = false; i < url.length; ++i) {
    const code = url.charCodeAt(i);

    // Find first and last non-whitespace characters for trimming
    const isWs = code === 32 /* */ || code === 9 /*\t*/ || code === 13 /*\r*/ || code === 10 /*\n*/ || code === 12 /*\f*/ || code === 160 /*\u00A0*/ || code === 65279; /*\uFEFF*/
    if (start === -1) {
      if (isWs) continue;
      lastPos = start = i;
    } else {
      if (inWs) {
        if (!isWs) {
          end = -1;
          inWs = false;
        }
      } else if (isWs) {
        end = i;
        inWs = true;
      }
    }

    // Only convert backslashes while we haven't seen a split character
    if (!split) {
      switch (code) {
        case 35:
          // '#'
          hasHash = true;
        // Fall through
        case 63:
          // '?'
          split = true;
          break;
        case 92:
          // '\\'
          if (i - lastPos > 0) rest += url.slice(lastPos, i);
          rest += '/';
          lastPos = i + 1;
          break;
      }
    } else if (!hasHash && code === 35 /*#*/) {
      hasHash = true;
    }
  }

  // Check if string was non-empty (including strings with only whitespace)
  if (start !== -1) {
    if (lastPos === start) {
      // We didn't convert any backslashes

      if (end === -1) {
        if (start === 0) rest = url;else rest = url.slice(start);
      } else {
        rest = url.slice(start, end);
      }
    } else if (end === -1 && lastPos < url.length) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos);
    } else if (end !== -1 && lastPos < end) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos, end);
    }
  }
  if (!slashesDenoteHost && !hasHash) {
    // Try fast path regexp
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.slice(1));
        } else {
          this.query = this.search.slice(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }
  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.slice(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || /^\/\/[^@\/]+@[^@\/]+/.test(rest)) {
    var slashes = rest.charCodeAt(0) === 47 /*/*/ && rest.charCodeAt(1) === 47; /*/*/
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.slice(2);
      this.slashes = true;
    }
  }
  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:b path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    var hostEnd = -1;
    var atSign = -1;
    var nonHost = -1;
    for (i = 0; i < rest.length; ++i) {
      switch (rest.charCodeAt(i)) {
        case 9: // '\t'
        case 10: // '\n'
        case 13: // '\r'
        case 32: // ' '
        case 34: // '"'
        case 37: // '%'
        case 39: // '\''
        case 59: // ';'
        case 60: // '<'
        case 62: // '>'
        case 92: // '\\'
        case 94: // '^'
        case 96: // '`'
        case 123: // '{'
        case 124: // '|'
        case 125:
          // '}'
          // Characters that are never ever allowed in a hostname from RFC 2396
          if (nonHost === -1) nonHost = i;
          break;
        case 35: // '#'
        case 47: // '/'
        case 63:
          // '?'
          // Find the first instance of any host-ending characters
          if (nonHost === -1) nonHost = i;
          hostEnd = i;
          break;
        case 64:
          // '@'
          // At this point, either we have an explicit point where the
          // auth portion cannot go past, or the last @ char is the decider.
          atSign = i;
          nonHost = -1;
          break;
      }
      if (hostEnd !== -1) break;
    }
    start = 0;
    if (atSign !== -1) {
      this.auth = decodeURIComponent(rest.slice(0, atSign));
      start = atSign + 1;
    }
    if (nonHost === -1) {
      this.host = rest.slice(start);
      rest = '';
    } else {
      this.host = rest.slice(start, nonHost);
      rest = rest.slice(nonHost);
    }

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    if (typeof this.hostname !== 'string') this.hostname = '';
    var hostname = this.hostname;

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = hostname.charCodeAt(0) === 91 /*[*/ && hostname.charCodeAt(hostname.length - 1) === 93; /*]*/

    // validate a little.
    if (!ipv6Hostname) {
      const result = validateHostname(this, rest, hostname);
      if (result !== undefined) rest = result;
    }

    // hostnames are always lower case.
    this.hostname = this.hostname.toLowerCase();
    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = _punycode.default.toASCII(this.hostname);
    }
    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.slice(1, -1);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {
    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    const result = autoEscapeStr(rest);
    if (result !== undefined) rest = result;
  }
  var questionIdx = -1;
  var hashIdx = -1;
  for (i = 0; i < rest.length; ++i) {
    const code = rest.charCodeAt(i);
    if (code === 35 /*#*/) {
      this.hash = rest.slice(i);
      hashIdx = i;
      break;
    } else if (code === 63 /*?*/ && questionIdx === -1) {
      questionIdx = i;
    }
  }
  if (questionIdx !== -1) {
    if (hashIdx === -1) {
      this.search = rest.slice(questionIdx);
      this.query = rest.slice(questionIdx + 1);
    } else {
      this.search = rest.slice(questionIdx, hashIdx);
      this.query = rest.slice(questionIdx + 1, hashIdx);
    }
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  var firstIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx) ? questionIdx : hashIdx;
  if (firstIdx === -1) {
    if (rest.length > 0) this.pathname = rest;
  } else if (firstIdx > 0) {
    this.pathname = rest.slice(0, firstIdx);
  }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  // to support http.request
  if (this.pathname || this.search) {
    const p = this.pathname || '';
    const s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

/* istanbul ignore next: improve coverage */
function validateHostname(self, rest, hostname) {
  for (var i = 0, lastPos; i <= hostname.length; ++i) {
    var code;
    if (i < hostname.length) code = hostname.charCodeAt(i);
    if (code === 46 /*.*/ || i === hostname.length) {
      if (i - lastPos > 0) {
        if (i - lastPos > 63) {
          self.hostname = hostname.slice(0, lastPos + 63);
          return '/' + hostname.slice(lastPos + 63) + rest;
        }
      }
      lastPos = i + 1;
      continue;
    } else if (code >= 48 /*0*/ && code <= 57 /*9*/ || code >= 97 /*a*/ && code <= 122 /*z*/ || code === 45 /*-*/ || code >= 65 /*A*/ && code <= 90 /*Z*/ || code === 43 /*+*/ || code === 95 /*_*/ || /* BEGIN MONGO URI PATCH */
    code === 44 /*,*/ || code === 58 /*:*/ || /* END MONGO URI PATCH */
    code > 127) {
      continue;
    }
    // Invalid host character
    self.hostname = hostname.slice(0, i);
    if (i < hostname.length) return '/' + hostname.slice(i) + rest;
    break;
  }
}

/* istanbul ignore next: improve coverage */
function autoEscapeStr(rest) {
  var newRest = '';
  var lastPos = 0;
  for (var i = 0; i < rest.length; ++i) {
    // Automatically escape all delimiters and unwise characters from RFC 2396
    // Also escape single quotes in case of an XSS attack
    switch (rest.charCodeAt(i)) {
      case 9:
        // '\t'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%09';
        lastPos = i + 1;
        break;
      case 10:
        // '\n'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0A';
        lastPos = i + 1;
        break;
      case 13:
        // '\r'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0D';
        lastPos = i + 1;
        break;
      case 32:
        // ' '
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%20';
        lastPos = i + 1;
        break;
      case 34:
        // '"'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%22';
        lastPos = i + 1;
        break;
      case 39:
        // '\''
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%27';
        lastPos = i + 1;
        break;
      case 60:
        // '<'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3C';
        lastPos = i + 1;
        break;
      case 62:
        // '>'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3E';
        lastPos = i + 1;
        break;
      case 92:
        // '\\'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5C';
        lastPos = i + 1;
        break;
      case 94:
        // '^'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5E';
        lastPos = i + 1;
        break;
      case 96:
        // '`'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%60';
        lastPos = i + 1;
        break;
      case 123:
        // '{'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7B';
        lastPos = i + 1;
        break;
      case 124:
        // '|'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7C';
        lastPos = i + 1;
        break;
      case 125:
        // '}'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7D';
        lastPos = i + 1;
        break;
    }
  }
  if (lastPos === 0) return;
  if (lastPos < rest.length) return newRest + rest.slice(lastPos);else return newRest;
}

// format a parsed object into a url string
/* istanbul ignore next: improve coverage */
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof obj === 'string') obj = urlParse(obj);else if (typeof obj !== 'object' || obj === null) throw new TypeError('Parameter "urlObj" must be an object, not ' + obj === null ? 'null' : typeof obj);else if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

/* istanbul ignore next: improve coverage */
Url.prototype.format = function () {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeAuth(auth);
    auth += '@';
  }
  var protocol = this.protocol || '';
  var pathname = this.pathname || '';
  var hash = this.hash || '';
  var host = false;
  var query = '';
  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ? this.hostname : '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }
  if (this.query !== null && typeof this.query === 'object') query = querystring.stringify(this.query);
  var search = this.search || query && '?' + query || '';
  if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58 /*:*/) protocol += ':';
  var newPathname = '';
  var lastPos = 0;
  for (var i = 0; i < pathname.length; ++i) {
    switch (pathname.charCodeAt(i)) {
      case 35:
        // '#'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%23';
        lastPos = i + 1;
        break;
      case 63:
        // '?'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%3F';
        lastPos = i + 1;
        break;
    }
  }
  if (lastPos > 0) {
    if (lastPos !== pathname.length) pathname = newPathname + pathname.slice(lastPos);else pathname = newPathname;
  }

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charCodeAt(0) !== 47 /*/*/) pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }
  search = search.replace('#', '%23');
  if (hash && hash.charCodeAt(0) !== 35 /*#*/) hash = '#' + hash;
  if (search && search.charCodeAt(0) !== 63 /*?*/) search = '?' + search;
  return protocol + host + pathname + search + hash;
};

/* istanbul ignore next: improve coverage */
function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

/* istanbul ignore next: improve coverage */
Url.prototype.resolve = function (relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

/* istanbul ignore next: improve coverage */
function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

/* istanbul ignore next: improve coverage */
Url.prototype.resolveObject = function (relative) {
  if (typeof relative === 'string') {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }
  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol') result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] && result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }
    result.href = result.format();
    return result;
  }
  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }
    result.protocol = relative.protocol;
    if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol[relative.protocol]) {
      const relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }
  var isSourceAbs = result.pathname && result.pathname.charAt(0) === '/';
  var isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === '/';
  var mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
  var removeAllDots = mustEndAbs;
  var srcPath = result.pathname && result.pathname.split('/') || [];
  var relPath = relative.pathname && relative.pathname.split('/') || [];
  var psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }
  if (isRelAbs) {
    // it's absolute.
    result.host = relative.host || relative.host === '' ? relative.host : result.host;
    result.hostname = relative.hostname || relative.hostname === '' ? relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occasionally the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === '';

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      spliceOne(srcPath, i);
    } else if (last === '..') {
      spliceOne(srcPath, i);
      up++;
    } else if (up) {
      spliceOne(srcPath, i);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }
  if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }
  if (hasTrailingSlash && srcPath.join('/').substr(-1) !== '/') {
    srcPath.push('');
  }
  var isAbsolute = srcPath[0] === '' || srcPath[0] && srcPath[0].charAt(0) === '/';

  // put the host back
  if (psychotic) {
    if (isAbsolute) {
      result.hostname = result.host = '';
    } else {
      result.hostname = result.host = srcPath.length ? srcPath.shift() : '';
    }
    //occasionally the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }
  mustEndAbs = mustEndAbs || result.host && srcPath.length;
  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }
  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (result.pathname !== null || result.search !== null) {
    result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

/* istanbul ignore next: improve coverage */
Url.prototype.parseHost = function () {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.slice(1);
    }
    host = host.slice(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

// About 1.5x faster than the two-arg version of Array#splice().
/* istanbul ignore next: improve coverage */
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) list[i] = list[k];
  list.pop();
}
var hexTable = new Array(256);
for (var i = 0; i < 256; ++i) hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
/* istanbul ignore next: improve coverage */
function encodeAuth(str) {
  // faster encodeURIComponent alternative for encoding auth uri components
  var out = '';
  var lastPos = 0;
  for (var i = 0; i < str.length; ++i) {
    var c = str.charCodeAt(i);

    // These characters do not need escaping:
    // ! - . _ ~
    // ' ( ) * :
    // digits
    // alpha (uppercase)
    // alpha (lowercase)
    if (c === 0x21 || c === 0x2d || c === 0x2e || c === 0x5f || c === 0x7e || c >= 0x27 && c <= 0x2a || c >= 0x30 && c <= 0x3a || c >= 0x41 && c <= 0x5a || c >= 0x61 && c <= 0x7a) {
      continue;
    }
    if (i - lastPos > 0) out += str.slice(lastPos, i);
    lastPos = i + 1;

    // Other ASCII characters
    if (c < 0x80) {
      out += hexTable[c];
      continue;
    }

    // Multi-byte characters ...
    if (c < 0x800) {
      out += hexTable[0xc0 | c >> 6] + hexTable[0x80 | c & 0x3f];
      continue;
    }
    if (c < 0xd800 || c >= 0xe000) {
      out += hexTable[0xe0 | c >> 12] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
      continue;
    }
    // Surrogate pair
    ++i;
    var c2;
    if (i < str.length) c2 = str.charCodeAt(i) & 0x3ff;else c2 = 0;
    c = 0x10000 + ((c & 0x3ff) << 10 | c2);
    out += hexTable[0xf0 | c >> 18] + hexTable[0x80 | c >> 12 & 0x3f] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
  }
  if (lastPos === 0) return str;
  if (lastPos < str.length) return out + str.slice(lastPos);
  return out;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcHVueWNvZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImV4cG9ydHMiLCJwYXJzZSIsInVybFBhcnNlIiwicmVzb2x2ZSIsInVybFJlc29sdmUiLCJyZXNvbHZlT2JqZWN0IiwidXJsUmVzb2x2ZU9iamVjdCIsImZvcm1hdCIsInVybEZvcm1hdCIsIlVybCIsInByb3RvY29sIiwic2xhc2hlcyIsImF1dGgiLCJob3N0IiwicG9ydCIsImhvc3RuYW1lIiwiaGFzaCIsInNlYXJjaCIsInF1ZXJ5IiwicGF0aG5hbWUiLCJwYXRoIiwiaHJlZiIsInByb3RvY29sUGF0dGVybiIsInBvcnRQYXR0ZXJuIiwic2ltcGxlUGF0aFBhdHRlcm4iLCJ1bnNhZmVQcm90b2NvbCIsImphdmFzY3JpcHQiLCJob3N0bGVzc1Byb3RvY29sIiwic2xhc2hlZFByb3RvY29sIiwiaHR0cCIsImh0dHBzIiwiZnRwIiwiZ29waGVyIiwiZmlsZSIsInF1ZXJ5c3RyaW5nIiwidXJsIiwicGFyc2VRdWVyeVN0cmluZyIsInNsYXNoZXNEZW5vdGVIb3N0IiwidSIsInByb3RvdHlwZSIsIlR5cGVFcnJvciIsImhhc0hhc2giLCJzdGFydCIsImVuZCIsInJlc3QiLCJsYXN0UG9zIiwiaSIsImluV3MiLCJzcGxpdCIsImxlbmd0aCIsImNvZGUiLCJjaGFyQ29kZUF0IiwiaXNXcyIsInNsaWNlIiwic2ltcGxlUGF0aCIsImV4ZWMiLCJwcm90byIsImxvd2VyUHJvdG8iLCJ0b0xvd2VyQ2FzZSIsInRlc3QiLCJob3N0RW5kIiwiYXRTaWduIiwibm9uSG9zdCIsImRlY29kZVVSSUNvbXBvbmVudCIsInBhcnNlSG9zdCIsImlwdjZIb3N0bmFtZSIsInJlc3VsdCIsInZhbGlkYXRlSG9zdG5hbWUiLCJ1bmRlZmluZWQiLCJwdW55Y29kZSIsInRvQVNDSUkiLCJwIiwiaCIsImF1dG9Fc2NhcGVTdHIiLCJxdWVzdGlvbklkeCIsImhhc2hJZHgiLCJmaXJzdElkeCIsInMiLCJzZWxmIiwibmV3UmVzdCIsIm9iaiIsImNhbGwiLCJlbmNvZGVBdXRoIiwiaW5kZXhPZiIsInN0cmluZ2lmeSIsIm5ld1BhdGhuYW1lIiwicmVwbGFjZSIsInNvdXJjZSIsInJlbGF0aXZlIiwicmVsIiwidGtleXMiLCJPYmplY3QiLCJrZXlzIiwidGsiLCJ0a2V5IiwicmtleXMiLCJyayIsInJrZXkiLCJ2IiwiayIsInJlbFBhdGgiLCJzaGlmdCIsInVuc2hpZnQiLCJqb2luIiwiaXNTb3VyY2VBYnMiLCJjaGFyQXQiLCJpc1JlbEFicyIsIm11c3RFbmRBYnMiLCJyZW1vdmVBbGxEb3RzIiwic3JjUGF0aCIsInBzeWNob3RpYyIsInBvcCIsImNvbmNhdCIsImF1dGhJbkhvc3QiLCJsYXN0IiwiaGFzVHJhaWxpbmdTbGFzaCIsInVwIiwic3BsaWNlT25lIiwic3Vic3RyIiwicHVzaCIsImlzQWJzb2x1dGUiLCJsaXN0IiwiaW5kZXgiLCJuIiwiaGV4VGFibGUiLCJBcnJheSIsInRvU3RyaW5nIiwidG9VcHBlckNhc2UiLCJzdHIiLCJvdXQiLCJjIiwiYzIiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvdmVuZG9yL21vbmdvZGJVcmwuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIEEgc2xpZ2h0bHkgcGF0Y2hlZCB2ZXJzaW9uIG9mIG5vZGUncyBVUkwgbW9kdWxlLCB3aXRoIHN1cHBvcnQgZm9yIGBtb25nb2RiOi8vYCBVUklzLlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZSBmb3IgbGljZW5zaW5nIGluZm9ybWF0aW9uLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHB1bnljb2RlIGZyb20gJ3B1bnljb2RlL3B1bnljb2RlLmpzJztcblxuZXhwb3J0cy5wYXJzZSA9IHVybFBhcnNlO1xuZXhwb3J0cy5yZXNvbHZlID0gdXJsUmVzb2x2ZTtcbmV4cG9ydHMucmVzb2x2ZU9iamVjdCA9IHVybFJlc29sdmVPYmplY3Q7XG5leHBvcnRzLmZvcm1hdCA9IHVybEZvcm1hdDtcblxuZXhwb3J0cy5VcmwgPSBVcmw7XG5cbmZ1bmN0aW9uIFVybCgpIHtcbiAgdGhpcy5wcm90b2NvbCA9IG51bGw7XG4gIHRoaXMuc2xhc2hlcyA9IG51bGw7XG4gIHRoaXMuYXV0aCA9IG51bGw7XG4gIHRoaXMuaG9zdCA9IG51bGw7XG4gIHRoaXMucG9ydCA9IG51bGw7XG4gIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICB0aGlzLmhhc2ggPSBudWxsO1xuICB0aGlzLnNlYXJjaCA9IG51bGw7XG4gIHRoaXMucXVlcnkgPSBudWxsO1xuICB0aGlzLnBhdGhuYW1lID0gbnVsbDtcbiAgdGhpcy5wYXRoID0gbnVsbDtcbiAgdGhpcy5ocmVmID0gbnVsbDtcbn1cblxuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbmNvbnN0IHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2k7XG5jb25zdCBwb3J0UGF0dGVybiA9IC86WzAtOV0qJC87XG5cbi8vIFNwZWNpYWwgY2FzZSBmb3IgYSBzaW1wbGUgcGF0aCBVUkxcbmNvbnN0IHNpbXBsZVBhdGhQYXR0ZXJuID0gL14oXFwvXFwvPyg/IVxcLylbXlxcP1xcc10qKShcXD9bXlxcc10qKT8kLztcblxuLy8gcHJvdG9jb2xzIHRoYXQgY2FuIGFsbG93IFwidW5zYWZlXCIgYW5kIFwidW53aXNlXCIgY2hhcnMuXG5jb25zdCB1bnNhZmVQcm90b2NvbCA9IHtcbiAgamF2YXNjcmlwdDogdHJ1ZSxcbiAgJ2phdmFzY3JpcHQ6JzogdHJ1ZSxcbn07XG4vLyBwcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG5jb25zdCBob3N0bGVzc1Byb3RvY29sID0ge1xuICBqYXZhc2NyaXB0OiB0cnVlLFxuICAnamF2YXNjcmlwdDonOiB0cnVlLFxufTtcbi8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuY29uc3Qgc2xhc2hlZFByb3RvY29sID0ge1xuICBodHRwOiB0cnVlLFxuICAnaHR0cDonOiB0cnVlLFxuICBodHRwczogdHJ1ZSxcbiAgJ2h0dHBzOic6IHRydWUsXG4gIGZ0cDogdHJ1ZSxcbiAgJ2Z0cDonOiB0cnVlLFxuICBnb3BoZXI6IHRydWUsXG4gICdnb3BoZXI6JzogdHJ1ZSxcbiAgZmlsZTogdHJ1ZSxcbiAgJ2ZpbGU6JzogdHJ1ZSxcbn07XG5jb25zdCBxdWVyeXN0cmluZyA9IHJlcXVpcmUoJ3F1ZXJ5c3RyaW5nJyk7XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgdmFyIHUgPSBuZXcgVXJsKCk7XG4gIHUucGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCk7XG4gIHJldHVybiB1O1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uICh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1BhcmFtZXRlciBcInVybFwiIG11c3QgYmUgYSBzdHJpbmcsIG5vdCAnICsgdHlwZW9mIHVybCk7XG4gIH1cblxuICAvLyBDb3B5IGNocm9tZSwgSUUsIG9wZXJhIGJhY2tzbGFzaC1oYW5kbGluZyBiZWhhdmlvci5cbiAgLy8gQmFjayBzbGFzaGVzIGJlZm9yZSB0aGUgcXVlcnkgc3RyaW5nIGdldCBjb252ZXJ0ZWQgdG8gZm9yd2FyZCBzbGFzaGVzXG4gIC8vIFNlZTogaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTI1OTE2XG4gIHZhciBoYXNIYXNoID0gZmFsc2U7XG4gIHZhciBzdGFydCA9IC0xO1xuICB2YXIgZW5kID0gLTE7XG4gIHZhciByZXN0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgdmFyIGkgPSAwO1xuICBmb3IgKHZhciBpbldzID0gZmFsc2UsIHNwbGl0ID0gZmFsc2U7IGkgPCB1cmwubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gdXJsLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAvLyBGaW5kIGZpcnN0IGFuZCBsYXN0IG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlcnMgZm9yIHRyaW1taW5nXG4gICAgY29uc3QgaXNXcyA9XG4gICAgICBjb2RlID09PSAzMiAvKiAqLyB8fFxuICAgICAgY29kZSA9PT0gOSAvKlxcdCovIHx8XG4gICAgICBjb2RlID09PSAxMyAvKlxcciovIHx8XG4gICAgICBjb2RlID09PSAxMCAvKlxcbiovIHx8XG4gICAgICBjb2RlID09PSAxMiAvKlxcZiovIHx8XG4gICAgICBjb2RlID09PSAxNjAgLypcXHUwMEEwKi8gfHxcbiAgICAgIGNvZGUgPT09IDY1Mjc5OyAvKlxcdUZFRkYqL1xuICAgIGlmIChzdGFydCA9PT0gLTEpIHtcbiAgICAgIGlmIChpc1dzKSBjb250aW51ZTtcbiAgICAgIGxhc3RQb3MgPSBzdGFydCA9IGk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChpbldzKSB7XG4gICAgICAgIGlmICghaXNXcykge1xuICAgICAgICAgIGVuZCA9IC0xO1xuICAgICAgICAgIGluV3MgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChpc1dzKSB7XG4gICAgICAgIGVuZCA9IGk7XG4gICAgICAgIGluV3MgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE9ubHkgY29udmVydCBiYWNrc2xhc2hlcyB3aGlsZSB3ZSBoYXZlbid0IHNlZW4gYSBzcGxpdCBjaGFyYWN0ZXJcbiAgICBpZiAoIXNwbGl0KSB7XG4gICAgICBzd2l0Y2ggKGNvZGUpIHtcbiAgICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaFxuICAgICAgICBjYXNlIDYzOiAvLyAnPydcbiAgICAgICAgICBzcGxpdCA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICAgIHJlc3QgKz0gJy8nO1xuICAgICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFoYXNIYXNoICYmIGNvZGUgPT09IDM1IC8qIyovKSB7XG4gICAgICBoYXNIYXNoID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBpZiBzdHJpbmcgd2FzIG5vbi1lbXB0eSAoaW5jbHVkaW5nIHN0cmluZ3Mgd2l0aCBvbmx5IHdoaXRlc3BhY2UpXG4gIGlmIChzdGFydCAhPT0gLTEpIHtcbiAgICBpZiAobGFzdFBvcyA9PT0gc3RhcnQpIHtcbiAgICAgIC8vIFdlIGRpZG4ndCBjb252ZXJ0IGFueSBiYWNrc2xhc2hlc1xuXG4gICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHJlc3QgPSB1cmw7XG4gICAgICAgIGVsc2UgcmVzdCA9IHVybC5zbGljZShzdGFydCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0ID0gdXJsLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZW5kID09PSAtMSAmJiBsYXN0UG9zIDwgdXJsLmxlbmd0aCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zKTtcbiAgICB9IGVsc2UgaWYgKGVuZCAhPT0gLTEgJiYgbGFzdFBvcyA8IGVuZCkge1xuICAgICAgLy8gV2UgY29udmVydGVkIHNvbWUgYmFja3NsYXNoZXMgYW5kIGhhdmUgb25seSBwYXJ0IG9mIHRoZSBlbnRpcmUgc3RyaW5nXG4gICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBlbmQpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc2xhc2hlc0Rlbm90ZUhvc3QgJiYgIWhhc0hhc2gpIHtcbiAgICAvLyBUcnkgZmFzdCBwYXRoIHJlZ2V4cFxuICAgIGNvbnN0IHNpbXBsZVBhdGggPSBzaW1wbGVQYXRoUGF0dGVybi5leGVjKHJlc3QpO1xuICAgIGlmIChzaW1wbGVQYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSByZXN0O1xuICAgICAgdGhpcy5ocmVmID0gcmVzdDtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdO1xuICAgICAgaWYgKHNpbXBsZVBhdGhbMl0pIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBzaW1wbGVQYXRoWzJdO1xuICAgICAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnNlYXJjaC5zbGljZSgxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5xdWVyeSA9IHRoaXMuc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSAnJztcbiAgICAgICAgdGhpcy5xdWVyeSA9IHt9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICB9XG5cbiAgdmFyIHByb3RvID0gcHJvdG9jb2xQYXR0ZXJuLmV4ZWMocmVzdCk7XG4gIGlmIChwcm90bykge1xuICAgIHByb3RvID0gcHJvdG9bMF07XG4gICAgdmFyIGxvd2VyUHJvdG8gPSBwcm90by50b0xvd2VyQ2FzZSgpO1xuICAgIHRoaXMucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCAvXlxcL1xcL1teQFxcL10rQFteQFxcL10rLy50ZXN0KHJlc3QpKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LmNoYXJDb2RlQXQoMCkgPT09IDQ3IC8qLyovICYmIHJlc3QuY2hhckNvZGVBdCgxKSA9PT0gNDc7IC8qLyovXG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmIChzbGFzaGVzIHx8IChwcm90byAmJiAhc2xhc2hlZFByb3RvY29sW3Byb3RvXSkpKSB7XG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpiIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICB2YXIgaG9zdEVuZCA9IC0xO1xuICAgIHZhciBhdFNpZ24gPSAtMTtcbiAgICB2YXIgbm9uSG9zdCA9IC0xO1xuICAgIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgICBjYXNlIDk6IC8vICdcXHQnXG4gICAgICAgIGNhc2UgMTA6IC8vICdcXG4nXG4gICAgICAgIGNhc2UgMTM6IC8vICdcXHInXG4gICAgICAgIGNhc2UgMzI6IC8vICcgJ1xuICAgICAgICBjYXNlIDM0OiAvLyAnXCInXG4gICAgICAgIGNhc2UgMzc6IC8vICclJ1xuICAgICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBjYXNlIDU5OiAvLyAnOydcbiAgICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUgZnJvbSBSRkMgMjM5NlxuICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICBjYXNlIDQ3OiAvLyAnLydcbiAgICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3QtZW5kaW5nIGNoYXJhY3RlcnNcbiAgICAgICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIG5vbkhvc3QgPSBpO1xuICAgICAgICAgIGhvc3RFbmQgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDY0OiAvLyAnQCdcbiAgICAgICAgICAvLyBBdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAgICAgICAvLyBhdXRoIHBvcnRpb24gY2Fubm90IGdvIHBhc3QsIG9yIHRoZSBsYXN0IEAgY2hhciBpcyB0aGUgZGVjaWRlci5cbiAgICAgICAgICBhdFNpZ24gPSBpO1xuICAgICAgICAgIG5vbkhvc3QgPSAtMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChob3N0RW5kICE9PSAtMSkgYnJlYWs7XG4gICAgfVxuICAgIHN0YXJ0ID0gMDtcbiAgICBpZiAoYXRTaWduICE9PSAtMSkge1xuICAgICAgdGhpcy5hdXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3Quc2xpY2UoMCwgYXRTaWduKSk7XG4gICAgICBzdGFydCA9IGF0U2lnbiArIDE7XG4gICAgfVxuICAgIGlmIChub25Ib3N0ID09PSAtMSkge1xuICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCk7XG4gICAgICByZXN0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQsIG5vbkhvc3QpO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2Uobm9uSG9zdCk7XG4gICAgfVxuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIGlmICh0eXBlb2YgdGhpcy5ob3N0bmFtZSAhPT0gJ3N0cmluZycpIHRoaXMuaG9zdG5hbWUgPSAnJztcblxuICAgIHZhciBob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWU7XG5cbiAgICAvLyBpZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgIC8vIGFzc3VtZSB0aGF0IGl0J3MgYW4gSVB2NiBhZGRyZXNzLlxuICAgIHZhciBpcHY2SG9zdG5hbWUgPVxuICAgICAgaG9zdG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gOTEgLypbKi8gJiYgaG9zdG5hbWUuY2hhckNvZGVBdChob3N0bmFtZS5sZW5ndGggLSAxKSA9PT0gOTM7IC8qXSovXG5cbiAgICAvLyB2YWxpZGF0ZSBhIGxpdHRsZS5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdmFsaWRhdGVIb3N0bmFtZSh0aGlzLCByZXN0LCBob3N0bmFtZSk7XG4gICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHJlc3QgPSByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gaG9zdG5hbWVzIGFyZSBhbHdheXMgbG93ZXIgY2FzZS5cbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIC8vIElETkEgU3VwcG9ydDogUmV0dXJucyBhIHB1bnljb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgLy8gaGF2ZSBub24tQVNDSUkgY2hhcmFjdGVycywgaS5lLiBpdCBkb2Vzbid0IG1hdHRlciBpZlxuICAgICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgQVNDSUktb25seS5cbiAgICAgIHRoaXMuaG9zdG5hbWUgPSBwdW55Y29kZS50b0FTQ0lJKHRoaXMuaG9zdG5hbWUpO1xuICAgIH1cblxuICAgIHZhciBwID0gdGhpcy5wb3J0ID8gJzonICsgdGhpcy5wb3J0IDogJyc7XG4gICAgdmFyIGggPSB0aGlzLmhvc3RuYW1lIHx8ICcnO1xuICAgIHRoaXMuaG9zdCA9IGggKyBwO1xuXG4gICAgLy8gc3RyaXAgWyBhbmQgXSBmcm9tIHRoZSBob3N0bmFtZVxuICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgaWYgKGlwdjZIb3N0bmFtZSkge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUuc2xpY2UoMSwgLTEpO1xuICAgICAgaWYgKHJlc3RbMF0gIT09ICcvJykge1xuICAgICAgICByZXN0ID0gJy8nICsgcmVzdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBub3cgcmVzdCBpcyBzZXQgdG8gdGhlIHBvc3QtaG9zdCBzdHVmZi5cbiAgLy8gY2hvcCBvZmYgYW55IGRlbGltIGNoYXJzLlxuICBpZiAoIXVuc2FmZVByb3RvY29sW2xvd2VyUHJvdG9dKSB7XG4gICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgIC8vIGVzY2FwZWQsIGV2ZW4gaWYgZW5jb2RlVVJJQ29tcG9uZW50IGRvZXNuJ3QgdGhpbmsgdGhleVxuICAgIC8vIG5lZWQgdG8gYmUuXG4gICAgY29uc3QgcmVzdWx0ID0gYXV0b0VzY2FwZVN0cihyZXN0KTtcbiAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHJlc3QgPSByZXN1bHQ7XG4gIH1cblxuICB2YXIgcXVlc3Rpb25JZHggPSAtMTtcbiAgdmFyIGhhc2hJZHggPSAtMTtcbiAgZm9yIChpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCBjb2RlID0gcmVzdC5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgdGhpcy5oYXNoID0gcmVzdC5zbGljZShpKTtcbiAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjb2RlID09PSA2MyAvKj8qLyAmJiBxdWVzdGlvbklkeCA9PT0gLTEpIHtcbiAgICAgIHF1ZXN0aW9uSWR4ID0gaTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlc3Rpb25JZHggIT09IC0xKSB7XG4gICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgpO1xuICAgICAgdGhpcy5xdWVyeSA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4LCBoYXNoSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSwgaGFzaElkeCk7XG4gICAgfVxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5xdWVyeSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG5cbiAgdmFyIGZpcnN0SWR4ID1cbiAgICBxdWVzdGlvbklkeCAhPT0gLTEgJiYgKGhhc2hJZHggPT09IC0xIHx8IHF1ZXN0aW9uSWR4IDwgaGFzaElkeCkgPyBxdWVzdGlvbklkeCA6IGhhc2hJZHg7XG4gIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICBpZiAocmVzdC5sZW5ndGggPiAwKSB0aGlzLnBhdGhuYW1lID0gcmVzdDtcbiAgfSBlbHNlIGlmIChmaXJzdElkeCA+IDApIHtcbiAgICB0aGlzLnBhdGhuYW1lID0gcmVzdC5zbGljZSgwLCBmaXJzdElkeCk7XG4gIH1cbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtsb3dlclByb3RvXSAmJiB0aGlzLmhvc3RuYW1lICYmICF0aGlzLnBhdGhuYW1lKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9ICcvJztcbiAgfVxuXG4gIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgY29uc3QgcCA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gICAgY29uc3QgcyA9IHRoaXMuc2VhcmNoIHx8ICcnO1xuICAgIHRoaXMucGF0aCA9IHAgKyBzO1xuICB9XG5cbiAgLy8gZmluYWxseSwgcmVjb25zdHJ1Y3QgdGhlIGhyZWYgYmFzZWQgb24gd2hhdCBoYXMgYmVlbiB2YWxpZGF0ZWQuXG4gIHRoaXMuaHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHZhbGlkYXRlSG9zdG5hbWUoc2VsZiwgcmVzdCwgaG9zdG5hbWUpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGxhc3RQb3M7IGkgPD0gaG9zdG5hbWUubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgY29kZTtcbiAgICBpZiAoaSA8IGhvc3RuYW1lLmxlbmd0aCkgY29kZSA9IGhvc3RuYW1lLmNoYXJDb2RlQXQoaSk7XG4gICAgaWYgKGNvZGUgPT09IDQ2IC8qLiovIHx8IGkgPT09IGhvc3RuYW1lLmxlbmd0aCkge1xuICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkge1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiA2Mykge1xuICAgICAgICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBsYXN0UG9zICsgNjMpO1xuICAgICAgICAgIHJldHVybiAnLycgKyBob3N0bmFtZS5zbGljZShsYXN0UG9zICsgNjMpICsgcmVzdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIChjb2RlID49IDQ4IC8qMCovICYmIGNvZGUgPD0gNTcpIC8qOSovIHx8XG4gICAgICAoY29kZSA+PSA5NyAvKmEqLyAmJiBjb2RlIDw9IDEyMikgLyp6Ki8gfHxcbiAgICAgIGNvZGUgPT09IDQ1IC8qLSovIHx8XG4gICAgICAoY29kZSA+PSA2NSAvKkEqLyAmJiBjb2RlIDw9IDkwKSAvKloqLyB8fFxuICAgICAgY29kZSA9PT0gNDMgLyorKi8gfHxcbiAgICAgIGNvZGUgPT09IDk1IC8qXyovIHx8XG4gICAgICAvKiBCRUdJTiBNT05HTyBVUkkgUEFUQ0ggKi9cbiAgICAgIGNvZGUgPT09IDQ0IC8qLCovIHx8XG4gICAgICBjb2RlID09PSA1OCAvKjoqLyB8fFxuICAgICAgLyogRU5EIE1PTkdPIFVSSSBQQVRDSCAqL1xuICAgICAgY29kZSA+IDEyN1xuICAgICkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIEludmFsaWQgaG9zdCBjaGFyYWN0ZXJcbiAgICBzZWxmLmhvc3RuYW1lID0gaG9zdG5hbWUuc2xpY2UoMCwgaSk7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIHJldHVybiAnLycgKyBob3N0bmFtZS5zbGljZShpKSArIHJlc3Q7XG4gICAgYnJlYWs7XG4gIH1cbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIGF1dG9Fc2NhcGVTdHIocmVzdCkge1xuICB2YXIgbmV3UmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIEF1dG9tYXRpY2FsbHkgZXNjYXBlIGFsbCBkZWxpbWl0ZXJzIGFuZCB1bndpc2UgY2hhcmFjdGVycyBmcm9tIFJGQyAyMzk2XG4gICAgLy8gQWxzbyBlc2NhcGUgc2luZ2xlIHF1b3RlcyBpbiBjYXNlIG9mIGFuIFhTUyBhdHRhY2tcbiAgICBzd2l0Y2ggKHJlc3QuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwOSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEwOiAvLyAnXFxuJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwQSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEzOiAvLyAnXFxyJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUwRCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjAnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzNDogLy8gJ1wiJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyMic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM5OiAvLyAnXFwnJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUyNyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDYwOiAvLyAnPCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclM0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MjogLy8gJz4nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTNFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTI6IC8vICdcXFxcJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU1Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDk0OiAvLyAnXidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNUUnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5NjogLy8gJ2AnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTYwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTIzOiAvLyAneydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0InO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjQ6IC8vICd8J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3Qyc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyNTogLy8gJ30nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdEJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKGxhc3RQb3MgPT09IDApIHJldHVybjtcbiAgaWYgKGxhc3RQb3MgPCByZXN0Lmxlbmd0aCkgcmV0dXJuIG5ld1Jlc3QgKyByZXN0LnNsaWNlKGxhc3RQb3MpO1xuICBlbHNlIHJldHVybiBuZXdSZXN0O1xufVxuXG4vLyBmb3JtYXQgYSBwYXJzZWQgb2JqZWN0IGludG8gYSB1cmwgc3RyaW5nXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsRm9ybWF0KG9iaikge1xuICAvLyBlbnN1cmUgaXQncyBhbiBvYmplY3QsIGFuZCBub3QgYSBzdHJpbmcgdXJsLlxuICAvLyBJZiBpdCdzIGFuIG9iaiwgdGhpcyBpcyBhIG5vLW9wLlxuICAvLyB0aGlzIHdheSwgeW91IGNhbiBjYWxsIHVybF9mb3JtYXQoKSBvbiBzdHJpbmdzXG4gIC8vIHRvIGNsZWFuIHVwIHBvdGVudGlhbGx5IHdvbmt5IHVybHMuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnc3RyaW5nJykgb2JqID0gdXJsUGFyc2Uob2JqKTtcbiAgZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAnUGFyYW1ldGVyIFwidXJsT2JqXCIgbXVzdCBiZSBhbiBvYmplY3QsIG5vdCAnICsgb2JqID09PSBudWxsID8gJ251bGwnIDogdHlwZW9mIG9ialxuICAgICk7XG4gIGVsc2UgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkgcmV0dXJuIFVybC5wcm90b3R5cGUuZm9ybWF0LmNhbGwob2JqKTtcblxuICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5mb3JtYXQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8ICcnO1xuICBpZiAoYXV0aCkge1xuICAgIGF1dGggPSBlbmNvZGVBdXRoKGF1dGgpO1xuICAgIGF1dGggKz0gJ0AnO1xuICB9XG5cbiAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCAnJztcbiAgdmFyIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCAnJztcbiAgdmFyIGhhc2ggPSB0aGlzLmhhc2ggfHwgJyc7XG4gIHZhciBob3N0ID0gZmFsc2U7XG4gIHZhciBxdWVyeSA9ICcnO1xuXG4gIGlmICh0aGlzLmhvc3QpIHtcbiAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgfSBlbHNlIGlmICh0aGlzLmhvc3RuYW1lKSB7XG4gICAgaG9zdCA9IGF1dGggKyAodGhpcy5ob3N0bmFtZS5pbmRleE9mKCc6JykgPT09IC0xID8gdGhpcy5ob3N0bmFtZSA6ICdbJyArIHRoaXMuaG9zdG5hbWUgKyAnXScpO1xuICAgIGlmICh0aGlzLnBvcnQpIHtcbiAgICAgIGhvc3QgKz0gJzonICsgdGhpcy5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5ICE9PSBudWxsICYmIHR5cGVvZiB0aGlzLnF1ZXJ5ID09PSAnb2JqZWN0JylcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcblxuICB2YXIgc2VhcmNoID0gdGhpcy5zZWFyY2ggfHwgKHF1ZXJ5ICYmICc/JyArIHF1ZXJ5KSB8fCAnJztcblxuICBpZiAocHJvdG9jb2wgJiYgcHJvdG9jb2wuY2hhckNvZGVBdChwcm90b2NvbC5sZW5ndGggLSAxKSAhPT0gNTggLyo6Ki8pIHByb3RvY29sICs9ICc6JztcblxuICB2YXIgbmV3UGF0aG5hbWUgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGhuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgc3dpdGNoIChwYXRobmFtZS5jaGFyQ29kZUF0KGkpKSB7XG4gICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1BhdGhuYW1lICs9ICclMjMnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdQYXRobmFtZSArPSAnJTNGJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKGxhc3RQb3MgPiAwKSB7XG4gICAgaWYgKGxhc3RQb3MgIT09IHBhdGhuYW1lLmxlbmd0aCkgcGF0aG5hbWUgPSBuZXdQYXRobmFtZSArIHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MpO1xuICAgIGVsc2UgcGF0aG5hbWUgPSBuZXdQYXRobmFtZTtcbiAgfVxuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8ICgoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSkge1xuICAgIGhvc3QgPSAnLy8nICsgKGhvc3QgfHwgJycpO1xuICAgIGlmIChwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSA0NyAvKi8qLykgcGF0aG5hbWUgPSAnLycgKyBwYXRobmFtZTtcbiAgfSBlbHNlIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSAnJztcbiAgfVxuXG4gIHNlYXJjaCA9IHNlYXJjaC5yZXBsYWNlKCcjJywgJyUyMycpO1xuXG4gIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMzUgLyojKi8pIGhhc2ggPSAnIycgKyBoYXNoO1xuICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSA2MyAvKj8qLykgc2VhcmNoID0gJz8nICsgc2VhcmNoO1xuXG4gIHJldHVybiBwcm90b2NvbCArIGhvc3QgKyBwYXRobmFtZSArIHNlYXJjaCArIGhhc2g7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIChyZWxhdGl2ZSkge1xuICByZXR1cm4gdGhpcy5yZXNvbHZlT2JqZWN0KHVybFBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSkpLmZvcm1hdCgpO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmVPYmplY3QgPSBmdW5jdGlvbiAocmVsYXRpdmUpIHtcbiAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgdmFyIHRrZXlzID0gT2JqZWN0LmtleXModGhpcyk7XG4gIGZvciAodmFyIHRrID0gMDsgdGsgPCB0a2V5cy5sZW5ndGg7IHRrKyspIHtcbiAgICB2YXIgdGtleSA9IHRrZXlzW3RrXTtcbiAgICByZXN1bHRbdGtleV0gPSB0aGlzW3RrZXldO1xuICB9XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICB2YXIgcmtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgZm9yICh2YXIgcmsgPSAwOyByayA8IHJrZXlzLmxlbmd0aDsgcmsrKykge1xuICAgICAgdmFyIHJrZXkgPSBya2V5c1tya107XG4gICAgICBpZiAocmtleSAhPT0gJ3Byb3RvY29sJykgcmVzdWx0W3JrZXldID0gcmVsYXRpdmVbcmtleV07XG4gICAgfVxuXG4gICAgLy91cmxQYXJzZSBhcHBlbmRzIHRyYWlsaW5nIC8gdG8gdXJscyBsaWtlIGh0dHA6Ly93d3cuZXhhbXBsZS5jb21cbiAgICBpZiAoc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF0gJiYgcmVzdWx0Lmhvc3RuYW1lICYmICFyZXN1bHQucGF0aG5hbWUpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gcmVzdWx0LnBhdGhuYW1lID0gJy8nO1xuICAgIH1cblxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAocmVsYXRpdmUucHJvdG9jb2wgJiYgcmVsYXRpdmUucHJvdG9jb2wgIT09IHJlc3VsdC5wcm90b2NvbCkge1xuICAgIC8vIGlmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAvLyBmaXJzdCwgaWYgaXQncyBub3QgZmlsZTosIHRoZW4gd2UgTVVTVCBoYXZlIGEgaG9zdCxcbiAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgIC8vIHRvIGJlZ2luIHdpdGgsIHRoZW4gd2UgTVVTVCBoYXZlIGEgcGF0aC5cbiAgICAvLyBpZiBpdCBpcyBmaWxlOiwgdGhlbiB0aGUgaG9zdCBpcyBkcm9wcGVkLFxuICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgIC8vIGFueXRoaW5nIGVsc2UgaXMgYXNzdW1lZCB0byBiZSBhYnNvbHV0ZS5cbiAgICBpZiAoIXNsYXNoZWRQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgICAgZm9yICh2YXIgdiA9IDA7IHYgPCBrZXlzLmxlbmd0aDsgdisrKSB7XG4gICAgICAgIHZhciBrID0ga2V5c1t2XTtcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgICB9XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcmVzdWx0LnByb3RvY29sID0gcmVsYXRpdmUucHJvdG9jb2w7XG4gICAgaWYgKFxuICAgICAgIXJlbGF0aXZlLmhvc3QgJiZcbiAgICAgICEvXmZpbGU6PyQvLnRlc3QocmVsYXRpdmUucHJvdG9jb2wpICYmXG4gICAgICAhaG9zdGxlc3NQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF1cbiAgICApIHtcbiAgICAgIGNvbnN0IHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgfHwgJycpLnNwbGl0KCcvJyk7XG4gICAgICB3aGlsZSAocmVsUGF0aC5sZW5ndGggJiYgIShyZWxhdGl2ZS5ob3N0ID0gcmVsUGF0aC5zaGlmdCgpKSk7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3QpIHJlbGF0aXZlLmhvc3QgPSAnJztcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdG5hbWUpIHJlbGF0aXZlLmhvc3RuYW1lID0gJyc7XG4gICAgICBpZiAocmVsUGF0aFswXSAhPT0gJycpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICBpZiAocmVsUGF0aC5sZW5ndGggPCAyKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKCcvJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCAnJztcbiAgICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGg7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICByZXN1bHQucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgLy8gdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lIHx8IHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHZhciBwID0gcmVzdWx0LnBhdGhuYW1lIHx8ICcnO1xuICAgICAgdmFyIHMgPSByZXN1bHQuc2VhcmNoIHx8ICcnO1xuICAgICAgcmVzdWx0LnBhdGggPSBwICsgcztcbiAgICB9XG4gICAgcmVzdWx0LnNsYXNoZXMgPSByZXN1bHQuc2xhc2hlcyB8fCByZWxhdGl2ZS5zbGFzaGVzO1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICB2YXIgaXNTb3VyY2VBYnMgPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB2YXIgaXNSZWxBYnMgPSByZWxhdGl2ZS5ob3N0IHx8IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJyk7XG4gIHZhciBtdXN0RW5kQWJzID0gaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKTtcbiAgdmFyIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzO1xuICB2YXIgc3JjUGF0aCA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KCcvJykpIHx8IFtdO1xuICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5wcm90b2NvbCAmJiAhc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF07XG5cbiAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSAnJztcbiAgICByZXN1bHQucG9ydCA9IG51bGw7XG4gICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICBpZiAoc3JjUGF0aFswXSA9PT0gJycpIHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDtcbiAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICB9XG4gICAgcmVzdWx0Lmhvc3QgPSAnJztcbiAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gbnVsbDtcbiAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09ICcnKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICB9XG4gICAgICByZWxhdGl2ZS5ob3N0ID0gbnVsbDtcbiAgICB9XG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09ICcnIHx8IHNyY1BhdGhbMF0gPT09ICcnKTtcbiAgfVxuXG4gIGlmIChpc1JlbEFicykge1xuICAgIC8vIGl0J3MgYWJzb2x1dGUuXG4gICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09ICcnID8gcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9XG4gICAgICByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0bmFtZSA9PT0gJycgPyByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgLy8gaXQncyByZWxhdGl2ZVxuICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAocmVsYXRpdmUuc2VhcmNoICE9PSBudWxsICYmIHJlbGF0aXZlLnNlYXJjaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8ganVzdCBwdWxsIG91dCB0aGUgc2VhcmNoLlxuICAgIC8vIGxpa2UgaHJlZj0nP2ZvbycuXG4gICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLnNoaWZ0KCk7XG4gICAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgY29uc3QgYXV0aEluSG9zdCA9XG4gICAgICAgIHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICsgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPVxuICAgICgocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCB8fCBzcmNQYXRoLmxlbmd0aCA+IDEpICYmIChsYXN0ID09PSAnLicgfHwgbGFzdCA9PT0gJy4uJykpIHx8XG4gICAgbGFzdCA9PT0gJyc7XG5cbiAgLy8gc3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gc3JjUGF0aC5sZW5ndGg7IGkgPj0gMDsgaS0tKSB7XG4gICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBzcGxpY2VPbmUoc3JjUGF0aCwgaSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gJycgJiYgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSAnLycpKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09ICcnIHx8IChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSAnLycpO1xuXG4gIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICBpZiAoaXNBYnNvbHV0ZSkge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBzcmNQYXRoLmxlbmd0aCA/IHNyY1BhdGguc2hpZnQoKSA6ICcnO1xuICAgIH1cbiAgICAvL29jY2FzaW9uYWxseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgY29uc3QgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgPyByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgfVxuICByZXN1bHQuYXV0aCA9IHJlbGF0aXZlLmF1dGggfHwgcmVzdWx0LmF1dGg7XG4gIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBob3N0ID0gdGhpcy5ob3N0O1xuICB2YXIgcG9ydCA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gIGlmIChwb3J0KSB7XG4gICAgcG9ydCA9IHBvcnRbMF07XG4gICAgaWYgKHBvcnQgIT09ICc6Jykge1xuICAgICAgdGhpcy5wb3J0ID0gcG9ydC5zbGljZSgxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc2xpY2UoMCwgaG9zdC5sZW5ndGggLSBwb3J0Lmxlbmd0aCk7XG4gIH1cbiAgaWYgKGhvc3QpIHRoaXMuaG9zdG5hbWUgPSBob3N0O1xufTtcblxuLy8gQWJvdXQgMS41eCBmYXN0ZXIgdGhhbiB0aGUgdHdvLWFyZyB2ZXJzaW9uIG9mIEFycmF5I3NwbGljZSgpLlxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHNwbGljZU9uZShsaXN0LCBpbmRleCkge1xuICBmb3IgKHZhciBpID0gaW5kZXgsIGsgPSBpICsgMSwgbiA9IGxpc3QubGVuZ3RoOyBrIDwgbjsgaSArPSAxLCBrICs9IDEpIGxpc3RbaV0gPSBsaXN0W2tdO1xuICBsaXN0LnBvcCgpO1xufVxuXG52YXIgaGV4VGFibGUgPSBuZXcgQXJyYXkoMjU2KTtcbmZvciAodmFyIGkgPSAwOyBpIDwgMjU2OyArK2kpXG4gIGhleFRhYmxlW2ldID0gJyUnICsgKChpIDwgMTYgPyAnMCcgOiAnJykgKyBpLnRvU3RyaW5nKDE2KSkudG9VcHBlckNhc2UoKTtcbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBlbmNvZGVBdXRoKHN0cikge1xuICAvLyBmYXN0ZXIgZW5jb2RlVVJJQ29tcG9uZW50IGFsdGVybmF0aXZlIGZvciBlbmNvZGluZyBhdXRoIHVyaSBjb21wb25lbnRzXG4gIHZhciBvdXQgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAvLyBUaGVzZSBjaGFyYWN0ZXJzIGRvIG5vdCBuZWVkIGVzY2FwaW5nOlxuICAgIC8vICEgLSAuIF8gflxuICAgIC8vICcgKCApICogOlxuICAgIC8vIGRpZ2l0c1xuICAgIC8vIGFscGhhICh1cHBlcmNhc2UpXG4gICAgLy8gYWxwaGEgKGxvd2VyY2FzZSlcbiAgICBpZiAoXG4gICAgICBjID09PSAweDIxIHx8XG4gICAgICBjID09PSAweDJkIHx8XG4gICAgICBjID09PSAweDJlIHx8XG4gICAgICBjID09PSAweDVmIHx8XG4gICAgICBjID09PSAweDdlIHx8XG4gICAgICAoYyA+PSAweDI3ICYmIGMgPD0gMHgyYSkgfHxcbiAgICAgIChjID49IDB4MzAgJiYgYyA8PSAweDNhKSB8fFxuICAgICAgKGMgPj0gMHg0MSAmJiBjIDw9IDB4NWEpIHx8XG4gICAgICAoYyA+PSAweDYxICYmIGMgPD0gMHg3YSlcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG91dCArPSBzdHIuc2xpY2UobGFzdFBvcywgaSk7XG5cbiAgICBsYXN0UG9zID0gaSArIDE7XG5cbiAgICAvLyBPdGhlciBBU0NJSSBjaGFyYWN0ZXJzXG4gICAgaWYgKGMgPCAweDgwKSB7XG4gICAgICBvdXQgKz0gaGV4VGFibGVbY107XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBNdWx0aS1ieXRlIGNoYXJhY3RlcnMgLi4uXG4gICAgaWYgKGMgPCAweDgwMCkge1xuICAgICAgb3V0ICs9IGhleFRhYmxlWzB4YzAgfCAoYyA+PiA2KV0gKyBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGMgPCAweGQ4MDAgfHwgYyA+PSAweGUwMDApIHtcbiAgICAgIG91dCArPVxuICAgICAgICBoZXhUYWJsZVsweGUwIHwgKGMgPj4gMTIpXSArXG4gICAgICAgIGhleFRhYmxlWzB4ODAgfCAoKGMgPj4gNikgJiAweDNmKV0gK1xuICAgICAgICBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8gU3Vycm9nYXRlIHBhaXJcbiAgICArK2k7XG4gICAgdmFyIGMyO1xuICAgIGlmIChpIDwgc3RyLmxlbmd0aCkgYzIgPSBzdHIuY2hhckNvZGVBdChpKSAmIDB4M2ZmO1xuICAgIGVsc2UgYzIgPSAwO1xuICAgIGMgPSAweDEwMDAwICsgKCgoYyAmIDB4M2ZmKSA8PCAxMCkgfCBjMik7XG4gICAgb3V0ICs9XG4gICAgICBoZXhUYWJsZVsweGYwIHwgKGMgPj4gMTgpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDEyKSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgIGhleFRhYmxlWzB4ODAgfCAoYyAmIDB4M2YpXTtcbiAgfVxuICBpZiAobGFzdFBvcyA9PT0gMCkgcmV0dXJuIHN0cjtcbiAgaWYgKGxhc3RQb3MgPCBzdHIubGVuZ3RoKSByZXR1cm4gb3V0ICsgc3RyLnNsaWNlKGxhc3RQb3MpO1xuICByZXR1cm4gb3V0O1xufVxuIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxZQUFZOztBQUVaLElBQUFBLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUE0QyxTQUFBRCx1QkFBQUUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUU1Q0csT0FBTyxDQUFDQyxLQUFLLEdBQUdDLFFBQVE7QUFDeEJGLE9BQU8sQ0FBQ0csT0FBTyxHQUFHQyxVQUFVO0FBQzVCSixPQUFPLENBQUNLLGFBQWEsR0FBR0MsZ0JBQWdCO0FBQ3hDTixPQUFP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