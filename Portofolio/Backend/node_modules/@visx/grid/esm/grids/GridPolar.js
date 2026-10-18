import cx from 'classnames';
import { Group } from '@visx/group';
import GridAngle from './GridAngle';
import GridRadial from './GridRadial';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function GridPolar(_ref) {
  let {
    arcThickness,
    className,
    classNameAngle,
    classNameRadial,
    endAngle,
    fillRadial,
    innerRadius,
    left,
    lineClassNameAngle,
    lineClassNameRadial,
    lineStyleAngle,
    lineStyleRadial,
    numTicksAngle,
    numTicksRadial,
    outerRadius,
    scaleAngle,
    scaleRadial,
    startAngle,
    strokeAngle,
    strokeRadial,
    strokeWidthAngle,
    strokeWidthRadial,
    strokeDasharrayAngle,
    strokeDasharrayRadial,
    tickValuesAngle,
    tickValuesRadial,
    top
  } = _ref;
  return /*#__PURE__*/_jsxs(Group, {
    className: cx('visx-grid-polar', className),
    top: top,
    left: left,
    children: [/*#__PURE__*/_jsx(GridAngle, {
      className: classNameAngle,
      innerRadius: innerRadius,
      lineClassName: lineClassNameAngle,
      lineStyle: lineStyleAngle,
      numTicks: numTicksAngle,
      outerRadius: outerRadius,
      scale: scaleAngle,
      stroke: strokeAngle,
      strokeWidth: strokeWidthAngle,
      strokeDasharray: strokeDasharrayAngle,
      tickValues: tickValuesAngle
    }), /*#__PURE__*/_jsx(GridRadial, {
      arcThickness: arcThickness,
      className: classNameRadial,
      endAngle: endAngle,
      fill: fillRadial,
      lineClassName: lineClassNameRadial,
      lineStyle: lineStyleRadial,
      numTicks: numTicksRadial,
      scale: scaleRadial,
      startAngle: startAngle,
      stroke: strokeRadial,
      strokeWidth: strokeWidthRadial,
      strokeDasharray: strokeDasharrayRadial,
      tickValues: tickValuesRadial
    })]
  });
}