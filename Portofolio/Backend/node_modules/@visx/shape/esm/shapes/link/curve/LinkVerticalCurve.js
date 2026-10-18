import cx from 'classnames';
import { path as d3Path } from '@visx/vendor/d3-path';
import { getX, getY, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathVerticalCurve(_ref) {
  let {
    source,
    target,
    x,
    y,
    percent
  } = _ref;
  return link => {
    const sourceData = source(link);
    const targetData = target(link);
    const sx = x(sourceData);
    const sy = y(sourceData);
    const tx = x(targetData);
    const ty = y(targetData);
    const dx = tx - sx;
    const dy = ty - sy;
    const ix = percent * (dx + dy);
    const iy = percent * (dy - dx);
    const path = d3Path();
    path.moveTo(sx, sy);
    path.bezierCurveTo(sx + ix, sy + iy, tx + iy, ty - ix, tx, ty);
    return path.toString();
  };
}
export default function LinkVerticalCurve(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    percent = 0.2,
    x = getX,
    y = getY,
    source = getSource,
    target = getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathVerticalCurve({
    source,
    target,
    x,
    y,
    percent
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-link visx-link-vertical-curve', className),
    d: pathGen(data) || '',
    ...restProps
  });
}