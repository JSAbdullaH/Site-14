import cx from 'classnames';
import { linkHorizontal } from '@visx/vendor/d3-shape';
import { getY, getX, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathHorizontalDiagonal(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return data => {
    const link = linkHorizontal();
    link.x(x);
    link.y(y);
    link.source(source);
    link.target(target);
    return link(data);
  };
}
export default function LinkHorizontalDiagonal(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    x = getY,
    // note this returns a y value
    y = getX,
    // note this returns an x value
    source = getSource,
    target = getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathHorizontalDiagonal({
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
    className: cx('visx-link visx-link-horizontal-diagonal', className),
    d: pathGen(data) || '',
    ...restProps
  });
}