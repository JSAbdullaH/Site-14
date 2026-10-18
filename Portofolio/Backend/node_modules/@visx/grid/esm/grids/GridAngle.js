import cx from 'classnames';
import { Line } from '@visx/shape';
import { Group } from '@visx/group';
import { getTicks, coerceNumber } from '@visx/scale';
import { Point } from '@visx/point';
import polarToCartesian from '../utils/polarToCartesian';
import { jsx as _jsx } from "react/jsx-runtime";
export default function GridAngle(_ref) {
  let {
    className,
    innerRadius = 0,
    left = 0,
    lineClassName,
    lineStyle,
    numTicks = 10,
    outerRadius = 0,
    scale,
    stroke = '#eaf0f6',
    strokeDasharray,
    strokeWidth = 1,
    tickValues,
    top = 0,
    children,
    // Explicitly extract children so it doesn't get spread to Line
    ...restProps
  } = _ref;
  const ticks = tickValues ?? getTicks(scale, numTicks);
  return /*#__PURE__*/_jsx(Group, {
    className: cx('visx-grid-angle', className),
    top: top,
    left: left,
    children: ticks.map((tick, i) => {
      const angle = (coerceNumber(scale(tick)) ?? Math.PI / 2) - Math.PI / 2;
      return /*#__PURE__*/_jsx(Line, {
        className: lineClassName,
        from: new Point(polarToCartesian({
          angle,
          radius: innerRadius
        })),
        to: new Point(polarToCartesian({
          angle,
          radius: outerRadius
        })),
        stroke: stroke,
        strokeWidth: strokeWidth,
        strokeDasharray: strokeDasharray,
        style: lineStyle,
        ...restProps
      }, `polar-grid-${tick}-${i}`);
    })
  });
}