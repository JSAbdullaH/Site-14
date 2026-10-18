import cx from 'classnames';
import { Group } from '@visx/group';
import { arc as arcPath, pie as piePath } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function Pie(_ref) {
  let {
    className,
    top,
    left,
    data = [],
    centroid,
    innerRadius = 0,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius,
    pieSort,
    pieSortValues,
    pieValue,
    children,
    fill = '',
    ...restProps
  } = _ref;
  const path = arcPath({
    innerRadius,
    outerRadius,
    cornerRadius,
    padRadius
  });
  const pie = piePath({
    startAngle,
    endAngle,
    padAngle,
    value: pieValue,
    sort: pieSort,
    sortValues: pieSortValues
  });
  const arcs = pie(data);
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      arcs,
      path,
      pie
    })
  });
  return /*#__PURE__*/_jsx(Group, {
    className: "visx-pie-arcs-group",
    top: top,
    left: left,
    children: arcs.map((arc, i) => /*#__PURE__*/_jsxs("g", {
      children: [/*#__PURE__*/_jsx("path", {
        className: cx('visx-pie-arc', className),
        d: path(arc) || '',
        fill: fill == null || typeof fill === 'string' ? fill : fill(arc),
        ...restProps
      }), centroid?.(path.centroid(arc), arc)]
    }, `pie-arc-${i}`))
  });
}