import cx from 'classnames';
import { Arc } from '@visx/shape';
import { Group } from '@visx/group';
import { getTicks } from '@visx/scale';
import { jsx as _jsx } from "react/jsx-runtime";
export default function GridRadial(_ref) {
  let {
    arcThickness,
    className,
    endAngle = 2 * Math.PI,
    fill = 'transparent',
    fillOpacity = 1,
    left = 0,
    lineClassName,
    lineStyle,
    numTicks = 10,
    scale,
    startAngle = 0,
    stroke = '#eaf0f6',
    strokeWidth = 1,
    strokeDasharray,
    tickValues,
    top = 0,
    ...restProps
  } = _ref;
  const radii = tickValues ?? getTicks(scale, numTicks);
  const innerRadius = Math.min(...scale.domain());
  return /*#__PURE__*/_jsx(Group, {
    className: cx('visx-grid-radial', className),
    top: top,
    left: left,
    children: radii.map((radius, i) => /*#__PURE__*/_jsx(Arc, {
      className: lineClassName,
      startAngle: startAngle,
      endAngle: endAngle,
      innerRadius: scale(arcThickness ? radius - arcThickness : innerRadius),
      outerRadius: scale(radius),
      fill: fill,
      fillOpacity: fillOpacity,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray,
      style: lineStyle,
      ...restProps
    }, `radial-grid-${radius}-${i}`))
  });
}