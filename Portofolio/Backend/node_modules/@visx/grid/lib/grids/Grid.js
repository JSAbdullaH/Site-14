"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Grid;
var _classnames = _interopRequireDefault(require("classnames"));
var _group = require("@visx/group");
var _GridRows = _interopRequireDefault(require("./GridRows"));
var _GridColumns = _interopRequireDefault(require("./GridColumns"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Grid(_ref) {
  let {
    top,
    left,
    xScale,
    yScale,
    width,
    height,
    className,
    stroke,
    strokeWidth,
    strokeDasharray,
    numTicksRows,
    numTicksColumns,
    rowLineStyle,
    columnLineStyle,
    xOffset,
    yOffset,
    rowTickValues,
    columnTickValues,
    ...restProps
  } = _ref;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_group.Group, {
    className: (0, _classnames.default)('visx-grid', className),
    top: top,
    left: left,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_GridRows.default, {
      className: className,
      scale: yScale,
      width: width,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray,
      numTicks: numTicksRows,
      lineStyle: rowLineStyle,
      offset: yOffset,
      tickValues: rowTickValues,
      ...restProps
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_GridColumns.default, {
      className: className,
      scale: xScale,
      height: height,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray,
      numTicks: numTicksColumns,
      lineStyle: columnLineStyle,
      offset: xOffset,
      tickValues: columnTickValues,
      ...restProps
    })]
  });
}