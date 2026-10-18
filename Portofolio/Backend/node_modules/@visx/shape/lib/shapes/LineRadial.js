"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LineRadial;
var _classnames = _interopRequireDefault(require("classnames"));
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function LineRadial(_ref) {
  let {
    className,
    angle,
    radius,
    defined,
    curve,
    data = [],
    innerRef,
    children,
    fill = 'transparent',
    ...restProps
  } = _ref;
  const path = (0, _D3ShapeFactories.radialLine)({
    angle,
    radius,
    defined,
    curve
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-line-radial', className),
    d: path(data) || '',
    fill: fill,
    ...restProps
  });
}