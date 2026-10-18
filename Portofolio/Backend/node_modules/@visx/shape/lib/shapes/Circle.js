"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Circle;
var _classnames = _interopRequireDefault(require("classnames"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Circle(_ref) {
  let {
    className,
    innerRef,
    ...restProps
  } = _ref;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("circle", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-circle', className),
    ...restProps
  });
}