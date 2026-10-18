"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Area;
var _classnames = _interopRequireDefault(require("classnames"));
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Area(_ref) {
  let {
    children,
    x,
    x0,
    x1,
    y,
    y0,
    y1,
    data = [],
    defined = () => true,
    className,
    curve,
    innerRef,
    ...restProps
  } = _ref;
  const path = (0, _D3ShapeFactories.area)({
    x,
    x0,
    x1,
    y,
    y0,
    y1,
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
    className: (0, _classnames.default)('visx-area', className),
    d: path(data) || '',
    ...restProps
  });
}