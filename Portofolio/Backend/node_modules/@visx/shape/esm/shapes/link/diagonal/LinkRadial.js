import cx from 'classnames';
import { linkRadial } from '@visx/vendor/d3-shape';
import { getX, getY, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathRadialDiagonal(_ref) {
  let {
    source,
    target,
    angle,
    radius
  } = _ref;
  return data => {
    const link = linkRadial();
    link.angle(angle);
    link.radius(radius);
    link.source(source);
    link.target(target);
    return link(data);
  };
}
export default function LinkRadialDiagonal(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    angle = getX,
    radius = getY,
    source = getSource,
    target = getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathRadialDiagonal({
    source,
    target,
    angle,
    radius
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-link visx-link-radial-diagonal', className),
    d: pathGen(data) || '',
    ...restProps
  });
}