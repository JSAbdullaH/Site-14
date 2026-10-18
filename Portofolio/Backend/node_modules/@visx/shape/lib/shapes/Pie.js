"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Pie;
var _classnames = _interopRequireDefault(require("classnames"));
var _group = require("@visx/group");
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Pie(_ref) {
  let {
    className,
    top,
    left,
    data = [],
    centroid,
    innerRadius = 0,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius,
    pieSort,
    pieSortValues,
    pieValue,
    children,
    fill = '',
    ...restProps
  } = _ref;
  const path = (0, _D3ShapeFactories.arc)({
    innerRadius,
    outerRadius,
    cornerRadius,
    padRadius
  });
  const pie = (0, _D3ShapeFactories.pie)({
    startAngle,
    endAngle,
    padAngle,
    value: pieValue,
    sort: pieSort,
    sortValues: pieSortValues
  });
  const arcs = pie(data);
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      arcs,
      path,
      pie
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: "visx-pie-arcs-group",
    top: top,
    left: left,
    children: arcs.map((arc, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("g", {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
        className: (0, _classnames.default)('visx-pie-arc', className),
        d: path(arc) || '',
        fill: fill == null || typeof fill === 'string' ? fill : fill(arc),
        ...restProps
      }), centroid?.(path.centroid(arc), arc)]
    }, `pie-arc-${i}`))
  });
}