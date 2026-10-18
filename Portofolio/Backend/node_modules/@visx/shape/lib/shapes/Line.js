"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Line;
var _classnames = _interopRequireDefault(require("classnames"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Line(_ref) {
  let {
    from = {
      x: 0,
      y: 0
    },
    to = {
      x: 1,
      y: 1
    },
    fill = 'transparent',
    className,
    innerRef,
    ...restProps
  } = _ref;
  const isRectilinear = from.x === to.x || from.y === to.y;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("line", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-line', className),
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    fill: fill,
    shapeRendering: isRectilinear ? 'crispEdges' : 'auto',
    ...restProps
  });
}