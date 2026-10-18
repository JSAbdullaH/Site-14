import cx from 'classnames';
import { path as d3Path } from '@visx/vendor/d3-path';
import { getY, getX, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathHorizontalLine(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return data => {
    const sourceData = source(data);
    const targetData = target(data);
    const sx = x(sourceData);
    const sy = y(sourceData);
    const tx = x(targetData);
    const ty = y(targetData);
    const path = d3Path();
    path.moveTo(sx, sy);
    path.lineTo(tx, ty);
    return path.toString();
  };
}
export default function LinkHorizontalLine(_ref2) {
  let {
    className,
    children,
    innerRef,
    data,
    path,
    x = getY,
    // note this returns a y value
    y = getX,
    // note this returns a x value
    source = getSource,
    target = getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathHorizontalLine({
    source,
    target,
    x,
    y
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-link visx-link-horizontal-line', className),
    d: pathGen(data) || '',
    ...restProps
  });
}