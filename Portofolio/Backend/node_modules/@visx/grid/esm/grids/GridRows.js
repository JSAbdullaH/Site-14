import cx from 'classnames';
import { Line } from '@visx/shape';
import { Group } from '@visx/group';
import { Point } from '@visx/point';
import { getTicks, coerceNumber } from '@visx/scale';
import getScaleBandwidth from '../utils/getScaleBandwidth';
import { jsx as _jsx } from "react/jsx-runtime";
export default function GridRows(_ref) {
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
  const ticks = tickValues ?? getTicks(scale, numTicks);
  const scaleOffset = (offset ?? 0) + getScaleBandwidth(scale) / 2;
  const tickLines = ticks.map((d, index) => {
    const y = (coerceNumber(scale(d)) ?? 0) + scaleOffset;
    return {
      index,
      from: new Point({
        x: 0,
        y
      }),
      to: new Point({
        x: width,
        y
      })
    };
  });
  return /*#__PURE__*/_jsx(Group, {
    className: cx('visx-rows', className),
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
      return /*#__PURE__*/_jsx(Line, {
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