"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BarGroup;
var _classnames = _interopRequireDefault(require("classnames"));
var _group = require("@visx/group");
var _Bar = _interopRequireDefault(require("./Bar"));
var _getBandwidth = _interopRequireDefault(require("../util/getBandwidth"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Generates bar groups as an array of objects and renders `<rect />`s for each datum grouped by `key`. A general setup might look like this:
 *
 * ```js
 * const data = [{
 *  date: date1,
 *  key1: value,
 *  key2: value,
 *  key3: value
 * }, {
 *  date: date2,
 *  key1: value,
 *  key2: value,
 *  key3: value,
 * }];
 *
 * const x0 = d => d.date;
 * const keys = [key1, key2, key3];
 *
 * const x0Scale = scaleBand({
 *  domain: data.map(x0),
 *  padding: 0.2
 * });
 * const x1Scale = scaleBand({
 *  domain: keys,
 *  padding: 0.1
 * });
 * const yScale = scaleLinear({
 *   domain: [0, Math.max(...data.map(d => Math.max(...keys.map(key => d[key]))))]
 * });
 * const color = scaleOrdinal({
 *   domain: keys,
 *   range: [blue, green, purple]
 * });
 * ```
 *
 * Example: [https://airbnb.io/visx/bargroup](https://airbnb.io/visx/bargroup)
 */
function BarGroup(_ref) {
  let {
    data,
    className,
    top,
    left,
    x0,
    x0Scale,
    x1Scale,
    yScale,
    color,
    keys,
    height,
    children,
    ...restProps
  } = _ref;
  const barWidth = (0, _getBandwidth.default)(x1Scale);
  const barGroups = data.map((group, i) => ({
    index: i,
    x0: x0Scale(x0(group)),
    bars: keys.map((key, j) => {
      const value = group[key];
      return {
        index: j,
        key,
        value,
        width: barWidth,
        x: x1Scale(key) || 0,
        y: yScale(value) || 0,
        color: color(key, j),
        height: height - (yScale(value) || 0)
      };
    })
  }));
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children(barGroups)
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: (0, _classnames.default)('visx-bar-group', className),
    top: top,
    left: left,
    children: barGroups.map(barGroup => /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
      left: barGroup.x0,
      children: barGroup.bars.map(bar => /*#__PURE__*/(0, _jsxRuntime.jsx)(_Bar.default, {
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
        fill: bar.color,
        ...restProps
      }, `bar-group-bar-${barGroup.index}-${bar.index}-${bar.value}-${bar.key}`))
    }, `bar-group-${barGroup.index}-${barGroup.x0}`))
  });
}