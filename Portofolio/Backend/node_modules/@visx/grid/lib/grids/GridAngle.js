"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = GridAngle;
var _classnames = _interopRequireDefault(require("classnames"));
var _shape = require("@visx/shape");
var _group = require("@visx/group");
var _scale = require("@visx/scale");
var _point = require("@visx/point");
var _polarToCartesian = _interopRequireDefault(require("../utils/polarToCartesian"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function GridAngle(_ref) {
  let {
    className,
    innerRadius = 0,
    left = 0,
    lineClassName,
    lineStyle,
    numTicks = 10,
    outerRadius = 0,
    scale,
    stroke = '#eaf0f6',
    strokeDasharray,
    strokeWidth = 1,
    tickValues,
    top = 0,
    children,
    // Explicitly extract children so it doesn't get spread to Line
    ...restProps
  } = _ref;
  const ticks = tickValues ?? (0, _scale.getTicks)(scale, numTicks);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: (0, _classnames.default)('visx-grid-angle', className),
    top: top,
    left: left,
    children: ticks.map((tick, i) => {
      const angle = ((0, _scale.coerceNumber)(scale(tick)) ?? Math.PI / 2) - Math.PI / 2;
      return /*#__PURE__*/(0, _jsxRuntime.jsx)(_shape.Line, {
        className: lineClassName,
        from: new _point.Point((0, _polarToCartesian.default)({
          angle,
          radius: innerRadius
        })),
        to: new _point.Point((0, _polarToCartesian.default)({
          angle,
          radius: outerRadius
        })),
        stroke: stroke,
        strokeWidth: strokeWidth,
        strokeDasharray: strokeDasharray,
        style: lineStyle,
        ...restProps
      }, `polar-grid-${tick}-${i}`);
    })
  });
}