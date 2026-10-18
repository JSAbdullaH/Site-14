"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Stack;
var _classnames = _interopRequireDefault(require("classnames"));
var _group = require("@visx/group");
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Stack(_ref) {
  let {
    className,
    top,
    left,
    keys,
    data,
    curve,
    defined,
    x,
    x0,
    x1,
    y0,
    y1,
    value,
    order,
    offset,
    color,
    children,
    ...restProps
  } = _ref;
  const stack = (0, _D3ShapeFactories.stack)({
    keys,
    value,
    order,
    offset
  });
  const path = (0, _D3ShapeFactories.area)({
    x,
    x0,
    x1,
    y0,
    y1,
    curve,
    defined
  });
  const stacks = stack(data);
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      stacks,
      path,
      stack
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    top: top,
    left: left,
    children: stacks.map((series, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
      className: (0, _classnames.default)('visx-stack', className),
      d: path(series) || '',
      fill: color?.(series.key, i),
      ...restProps
    }, `stack-${i}-${series.key || ''}`))
  });
}