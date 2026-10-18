"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BarStack;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Shape = require("@visx/vendor/d3-shape");
var _group = require("@visx/group");
var _accessors = require("../util/accessors");
var _getBandwidth = _interopRequireDefault(require("../util/getBandwidth"));
var _setNumberOrNumberAccessor = _interopRequireDefault(require("../util/setNumberOrNumberAccessor"));
var _stackOrder = _interopRequireDefault(require("../util/stackOrder"));
var _stackOffset = _interopRequireDefault(require("../util/stackOffset"));
var _Bar = _interopRequireDefault(require("./Bar"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function BarStack(_ref) {
  let {
    data,
    className,
    top,
    left,
    x,
    y0 = _accessors.getFirstItem,
    y1 = _accessors.getSecondItem,
    xScale,
    yScale,
    color,
    keys,
    value,
    order,
    offset,
    children,
    ...restProps
  } = _ref;
  const stack = (0, _d3Shape.stack)();
  if (keys) stack.keys(keys);
  if (value) (0, _setNumberOrNumberAccessor.default)(stack.value, value);
  if (order) stack.order((0, _stackOrder.default)(order));
  if (offset) stack.offset((0, _stackOffset.default)(offset));
  const stacks = stack(data);
  const barWidth = (0, _getBandwidth.default)(xScale);
  const barStacks = stacks.map((barStack, i) => {
    const {
      key
    } = barStack;
    return {
      index: i,
      key,
      bars: barStack.map((bar, j) => {
        const barHeight = (yScale(y0(bar)) || 0) - (yScale(y1(bar)) || 0);
        const barY = yScale(y1(bar));
        const barX = 'bandwidth' in xScale ? xScale(x(bar.data)) : Math.max((xScale(x(bar.data)) || 0) - barWidth / 2);
        return {
          bar,
          key,
          index: j,
          height: barHeight,
          width: barWidth,
          x: barX || 0,
          y: barY || 0,
          color: color(barStack.key, j)
        };
      })
    };
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children(barStacks)
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_group.Group, {
    className: (0, _classnames.default)('visx-bar-stack', className),
    top: top,
    left: left,
    children: barStacks.map(barStack => barStack.bars.map(bar => /*#__PURE__*/(0, _jsxRuntime.jsx)(_Bar.default, {
      x: bar.x,
      y: bar.y,
      height: bar.height,
      width: bar.width,
      fill: bar.color,
      ...restProps
    }, `bar-stack-${barStack.index}-${bar.index}`)))
  });
}