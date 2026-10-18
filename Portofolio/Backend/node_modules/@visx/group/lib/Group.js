"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Group;
var _classnames = _interopRequireDefault(require("classnames"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Group(_ref) {
  let {
    top = 0,
    left = 0,
    transform,
    className,
    children,
    innerRef,
    ...restProps
  } = _ref;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("g", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-group', className),
    transform: transform || `translate(${left}, ${top})`,
    ...restProps,
    children: children
  });
}