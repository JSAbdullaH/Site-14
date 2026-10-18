import cx from 'classnames';
import { stack as d3stack } from '@visx/vendor/d3-shape';
import { Group } from '@visx/group';
import { getFirstItem, getSecondItem } from '../util/accessors';
import getBandwidth from '../util/getBandwidth';
import setNumOrAccessor from '../util/setNumberOrNumberAccessor';
import stackOrder from '../util/stackOrder';
import stackOffset from '../util/stackOffset';
import Bar from './Bar';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function BarStackHorizontal(_ref) {
  let {
    data,
    className,
    top,
    left,
    y,
    x0 = getFirstItem,
    x1 = getSecondItem,
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
  const stack = d3stack();
  if (keys) stack.keys(keys);
  if (value) setNumOrAccessor(stack.value, value);
  if (order) stack.order(stackOrder(order));
  if (offset) stack.offset(stackOffset(offset));
  const stacks = stack(data);
  const barHeight = getBandwidth(yScale);
  const barStacks = stacks.map((barStack, i) => {
    const {
      key
    } = barStack;
    return {
      index: i,
      key,
      bars: barStack.map((bar, j) => {
        const barWidth = (xScale(x1(bar)) || 0) - (xScale(x0(bar)) || 0);
        const barX = xScale(x0(bar));
        const barY = 'bandwidth' in yScale ? yScale(y(bar.data)) : Math.max((yScale(y(bar.data)) || 0) - barWidth / 2);
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
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children(barStacks)
  });
  return /*#__PURE__*/_jsx(Group, {
    className: cx('visx-bar-stack-horizontal', className),
    top: top,
    left: left,
    children: barStacks.map(barStack => barStack.bars.map(bar => /*#__PURE__*/_jsx(Bar, {
      x: bar.x,
      y: bar.y,
      height: bar.height,
      width: bar.width,
      fill: bar.color,
      ...restProps
    }, `bar-stack-${barStack.index}-${bar.index}`)))
  });
}