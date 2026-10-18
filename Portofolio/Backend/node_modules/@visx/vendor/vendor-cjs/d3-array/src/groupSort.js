"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = groupSort;
var _ascending = _interopRequireDefault(require("./ascending.js"));
var _group = _interopRequireWildcard(require("./group.js"));
var _sort = _interopRequireDefault(require("./sort.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function groupSort(values, reduce, key) {
  return (reduce.length !== 2 ? (0, _sort.default)((0, _group.rollup)(values, reduce, key), ([ak, av], [bk, bv]) => (0, _ascending.default)(av, bv) || (0, _ascending.default)(ak, bk)) : (0, _sort.default)((0, _group.default)(values, key), ([ak, av], [bk, bv]) => reduce(av, bv) || (0, _ascending.default)(ak, bk))).map(([key]) => key);
}