"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinePath;
var _classnames = _interopRequireDefault(require("classnames"));
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function LinePath(_ref) {
  let {
    children,
    data = [],
    x,
    y,
    fill = 'transparent',
    className,
    curve,
    innerRef,
    defined = () => true,
    ...restProps
  } = _ref;
  const path = (0, _D3ShapeFactories.line)({
    x,
    y,
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
    className: (0, _classnames.default)('visx-linepath', className),
    d: path(data) || '',
    fill: fill
    // without this a datum surrounded by nulls will not be visible
    // https://github.com/d3/d3-shape#line_defined
    ,
    strokeLinecap: "round",
    ...restProps
  });
}