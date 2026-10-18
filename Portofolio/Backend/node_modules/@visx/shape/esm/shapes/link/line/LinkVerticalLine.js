import cx from 'classnames';
import { path as d3Path } from '@visx/vendor/d3-path';
import { getX, getY, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathVerticalLine(_ref) {
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
export default function LinkVerticalLine(_ref2) {
  let {
    className,
    innerRef,
    data,
    path,
    x = getX,
    y = getY,
    source = getSource,
    target = getTarget,
    children,
    ...restProps
  } = _ref2;
  const pathGen = path || pathVerticalLine({
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
    className: cx('visx-link visx-link-vertical-line', className),
    d: pathGen(data) || '',
    ...restProps
  });
}