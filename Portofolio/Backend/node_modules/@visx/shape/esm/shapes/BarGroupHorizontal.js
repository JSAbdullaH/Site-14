import cx from 'classnames';
import { Group } from '@visx/group';
import Bar from './Bar';
import getBandwidth from '../util/getBandwidth';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function BarGroupHorizontal(_ref) {
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
  const barHeight = getBandwidth(y1Scale);
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
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children(barGroups)
  });
  return /*#__PURE__*/_jsx(Group, {
    className: cx('visx-bar-group-horizontal', className),
    top: top,
    left: left,
    children: barGroups.map(barGroup => /*#__PURE__*/_jsx(Group, {
      top: barGroup.y0,
      children: barGroup.bars.map(bar => /*#__PURE__*/_jsx(Bar, {
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