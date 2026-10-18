"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
var _index = require("../../../vendor-cjs/d3-color/src/index.js");
var _rgb = _interopRequireDefault(require("./rgb.js"));
var _array = require("./array.js");
var _date = _interopRequireDefault(require("./date.js"));
var _number = _interopRequireDefault(require("./number.js"));
var _object = _interopRequireDefault(require("./object.js"));
var _string = _interopRequireDefault(require("./string.js"));
var _constant = _interopRequireDefault(require("./constant.js"));
var _numberArray = _interopRequireWildcard(require("./numberArray.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _default(a, b) {
  var t = typeof b,
    c;
  return b == null || t === "boolean" ? (0, _constant.default)(b) : (t === "number" ? _number.default : t === "string" ? (c = (0, _index.color)(b)) ? (b = c, _rgb.default) : _string.default : b instanceof _index.color ? _rgb.default : b instanceof Date ? _date.default : (0, _numberArray.isNumberArray)(b) ? _numberArray.default : Array.isArray(b) ? _array.genericArray : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? _object.default : _number.default)(a, b);
}