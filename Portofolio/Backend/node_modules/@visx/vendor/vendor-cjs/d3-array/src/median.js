"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = median;
exports.medianIndex = medianIndex;
var _quantile = _interopRequireWildcard(require("./quantile.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function median(values, valueof) {
  return (0, _quantile.default)(values, 0.5, valueof);
}
function medianIndex(values, valueof) {
  return (0, _quantile.quantileIndex)(values, 0.5, valueof);
}