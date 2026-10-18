import cx from 'classnames';
import { Group } from '@visx/group';
import GridRows from './GridRows';
import GridColumns from './GridColumns';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function Grid(_ref) {
  let {
    top,
    left,
    xScale,
    yScale,
    width,
    height,
    className,
    stroke,
    strokeWidth,
    strokeDasharray,
    numTicksRows,
    numTicksColumns,
    rowLineStyle,
    columnLineStyle,
    xOffset,
    yOffset,
    rowTickValues,
    columnTickValues,
    ...restProps
  } = _ref;
  return /*#__PURE__*/_jsxs(Group, {
    className: cx('visx-grid', className),
    top: top,
    left: left,
    children: [/*#__PURE__*/_jsx(GridRows, {
      className: className,
      scale: yScale,
      width: width,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray,
      numTicks: numTicksRows,
      lineStyle: rowLineStyle,
      offset: yOffset,
      tickValues: rowTickValues,
      ...restProps
    }), /*#__PURE__*/_jsx(GridColumns, {
      className: className,
      scale: xScale,
      height: height,
      stroke: stroke,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray,
      numTicks: numTicksColumns,
      lineStyle: columnLineStyle,
      offset: xOffset,
      tickValues: columnTickValues,
      ...restProps
    })]
  });
}