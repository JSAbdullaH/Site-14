"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = GridPolar;
var _classnames = _interopRequireDefault(require("classnames"));
var _group = require("@visx/group");
var _GridAngle = _interopRequireDefault(require("./GridAngle"));
var _GridRadial = _interopRequireDefault(require("./GridRadial"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function GridPolar(_ref) {
  let {
    arcThickness,
    className,
    classNameAngle,
    classNameRadial,
    endAngle,
    fillRadial,
    innerRadius,
    left,
    lineClassNameAngle,
    lineClassNameRadial,
    lineStyleAngle,
    lineStyleRadial,
    numTicksAngle,
    numTicksRadial,
    outerRadius,
    scaleAngle,
    scaleRadial,
    startAngle,
    strokeAngle,
    strokeRadial,
    strokeWidthAngle,
    strokeWidthRadial,
    strokeDasharrayAngle,
    strokeDasharrayRadial,
    tickValuesAngle,
    tickValuesRadial,
    top
  } = _ref;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_group.Group, {
    className: (0, _classnames.default)('visx-grid-polar', className),
    top: top,
    left: left,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_GridAngle.default, {
      className: classNameAngle,
      innerRadius: innerRadius,
      lineClassName: lineClassNameAngle,
      lineStyle: lineStyleAngle,
      numTicks: numTicksAngle,
      outerRadius: outerRadius,
      scale: scaleAngle,
      stroke: strokeAngle,
      strokeWidth: strokeWidthAngle,
      strokeDasharray: strokeDasharrayAngle,
      tickValues: tickValuesAngle
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_GridRadial.default, {
      arcThickness: arcThickness,
      className: classNameRadial,
      endAngle: endAngle,
      fill: fillRadial,
      lineClassName: lineClassNameRadial,
      lineStyle: lineStyleRadial,
      numTicks: numTicksRadial,
      scale: scaleRadial,
      startAngle: startAngle,
      stroke: strokeRadial,
      strokeWidth: strokeWidthRadial,
      strokeDasharray: strokeDasharrayRadial,
      tickValues: tickValuesRadial
    })]
  });
}