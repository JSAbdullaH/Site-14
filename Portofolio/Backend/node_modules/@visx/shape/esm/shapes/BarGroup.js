import cx from 'classnames';
import { Group } from '@visx/group';
import Bar from './Bar';
import getBandwidth from '../util/getBandwidth';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
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
export default function BarGroup(_ref) {
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
  const barWidth = getBandwidth(x1Scale);
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
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children(barGroups)
  });
  return /*#__PURE__*/_jsx(Group, {
    className: cx('visx-bar-group', className),
    top: top,
    left: left,
    children: barGroups.map(barGroup => /*#__PURE__*/_jsx(Group, {
      left: barGroup.x0,
      children: barGroup.bars.map(bar => /*#__PURE__*/_jsx(Bar, {
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