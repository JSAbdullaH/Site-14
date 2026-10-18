"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Bar;
var _classnames = _interopRequireDefault(require("classnames"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Bar(_ref) {
  let {
    className,
    innerRef,
    ...restProps
  } = _ref;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("rect", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-bar', className),
    ...restProps
  });
}