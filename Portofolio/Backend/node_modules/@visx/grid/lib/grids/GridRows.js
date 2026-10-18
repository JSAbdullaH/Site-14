"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = GridRows;
var _classnames = _interopRequireDefault(require("classnames"));
var _shape = require("@visx/shape");
var _group = require("@visx/group");
var _point = require("@visx/point");
var _scale = require("@visx/scale");
var _getScaleBandwidth = _interopRequireDefault(require("../utils/getScaleBandwidth"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function GridRows(_ref) {
  let {
    top = 0,
    left = 0,
    scale,
    width,
    stroke = '#eaf0f6',
    strokeWidth = 1,
    strokeDasharray,
    className,
    children,
    numTicks = 10,
    lineStyle,
    offset,
    tickValues,
    ...restProps
  } = _ref;
  const ticks = tickValues ?? (0, _scale.getTicks)(scale, numTicks);
  const scaleOffset = (offset ?? 0) + (0, _getScaleBandwidth.default)(scale) / 2;
  const tickLines = ticks.map((d, index) => {
    const y = ((0, _scale.coerceNumber)(scale(d)) ?? 0) + scaleOffset;
    return {
      index,
      from: new _point.Point({
        x: 0,
        y
      }),
      to: new _point.Point({
        x: width,
        y
      })
    };
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: (0, _classnames.default)('visx-rows', className),
    top: top,
    left: left,
    children: children ? children({
      lines: tickLines
    }) : tickLines.map(_ref2 => {
      let {
        from,
        to,
        index
      } = _ref2;
      return /*#__PURE__*/(0, _jsxRuntime.jsx)(_shape.Line, {
        from: from,
        to: to,
        stroke: stroke,
        strokeWidth: strokeWidth,
        strokeDasharray: strokeDasharray,
        style: lineStyle,
        ...restProps
      }, `row-line-${index}`);
    })
  });
}