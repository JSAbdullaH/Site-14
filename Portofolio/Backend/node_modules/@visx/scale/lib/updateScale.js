"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _scaleOperator = _interopRequireWildcard(require("./operators/scaleOperator"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
/* eslint-disable no-redeclare */
/* eslint-disable @typescript-eslint/no-unused-vars */

const applyAllOperators = (0, _scaleOperator.default)(..._scaleOperator.ALL_OPERATORS);

// Overload function signature for more strict typing, e.g.,
// If the scale is a ScaleLinear, the config is a linear config.

// Actual implementation

function updateScale(scale, config) {
  return applyAllOperators(scale.copy(), config);
}
var _default = exports.default = updateScale;