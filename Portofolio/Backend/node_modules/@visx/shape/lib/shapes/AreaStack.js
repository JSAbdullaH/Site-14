"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = AreaStack;
var _classnames = _interopRequireDefault(require("classnames"));
var _Stack = _interopRequireDefault(require("./Stack"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function AreaStack(_ref) {
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
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_Stack.default, {
    className: className,
    top: top,
    left: left,
    keys: keys,
    data: data,
    curve: curve,
    defined: defined,
    x: x,
    x0: x0,
    x1: x1,
    y0: y0,
    y1: y1,
    value: value,
    order: order,
    offset: offset,
    color: color,
    ...restProps,
    children: children || (_ref2 => {
      let {
        stacks,
        path
      } = _ref2;
      return stacks.map((series, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
        className: (0, _classnames.default)('visx-area-stack', className),
        d: path(series) || '',
        fill: color?.(series.key, i),
        ...restProps
      }, `area-stack-${i}-${series.key || ''}`));
    })
  });
}