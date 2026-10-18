"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BarGroupHorizontal;
var _classnames = _interopRequireDefault(require("classnames"));
var _group = require("@visx/group");
var _Bar = _interopRequireDefault(require("./Bar"));
var _getBandwidth = _interopRequireDefault(require("../util/getBandwidth"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function BarGroupHorizontal(_ref) {
  let {
    data,
    className,
    top,
    left,
    x = (/** val */) => 0,
    y0,
    y0Scale,
    y1Scale,
    xScale,
    color,
    keys,
    width,
    children,
    ...restProps
  } = _ref;
  const barHeight = (0, _getBandwidth.default)(y1Scale);
  const barGroups = data.map((group, i) => ({
    index: i,
    y0: y0Scale(y0(group)) || 0,
    bars: keys.map((key, j) => {
      const value = group[key];
      return {
        index: j,
        key,
        value,
        height: barHeight,
        x: x(value) || 0,
        y: y1Scale(key) || 0,
        color: color(key, j),
        width: xScale(value) || 0
      };
    })
  }));
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children(barGroups)
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: (0, _classnames.default)('visx-bar-group-horizontal', className),
    top: top,
    left: left,
    children: barGroups.map(barGroup => /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
      top: barGroup.y0,
      children: barGroup.bars.map(bar => /*#__PURE__*/(0, _jsxRuntime.jsx)(_Bar.default, {
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
        fill: bar.color,
        ...restProps
      }, `bar-group-bar-${barGroup.index}-${bar.index}-${bar.value}-${bar.key}`))
    }, `bar-group-${barGroup.index}-${barGroup.y0}`))
  });
}