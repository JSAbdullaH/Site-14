"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = GridRadial;
var _classnames = _interopRequireDefault(require("classnames"));
var _shape = require("@visx/shape");
var _group = require("@visx/group");
var _scale = require("@visx/scale");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function GridRadial(_ref) {
  let {
    arcThickness,
    className,
    endAngle = 2 * Math.PI,
    fill = 'transparent',
    fillOpacity = 1,
    left = 0,
    lineClassName,
    lineStyle,
    numTicks = 10,
    scale,
    startAngle = 0,
    stroke = '#eaf0f6',
    strokeWidth = 1,
    strokeDasharray,
    tickValues,
    top = 0,
    ...restProps
  } = _ref;
  const radii = tickValues ?? (0, _scale.getTicks)(scale, numTicks);
  const innerRadius = Math.min(...scale.domain());
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: (0, _classnames.default)('visx-grid-radial', className),
    top: top,
    left: left,
    children: radii.map((radius, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)(_shape.Arc, {
      className: lineClassName,
      startAngle: startAngle,
      endAngle: endAngle,
      innerRadius: scale(arcThickness ? radius - arcThickness : innerRadius),
      outerRadius: scale(radius),
      fill: fill,
      fillOpacity: fillOpacity,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray,
      style: lineStyle,
      ...restProps
    }, `radial-grid-${radius}-${i}`))
  });
}