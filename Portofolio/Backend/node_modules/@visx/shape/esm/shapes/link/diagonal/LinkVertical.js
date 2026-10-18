import cx from 'classnames';
import { linkVertical } from '@visx/vendor/d3-shape';
import { getX, getY, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathVerticalDiagonal(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return data => {
    const link = linkVertical();
    link.x(x);
    link.y(y);
    link.source(source);
    link.target(target);
    return link(data);
  };
}
export default function LinkVerticalDiagonal(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    x = getX,
    y = getY,
    source = getSource,
    target = getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathVerticalDiagonal({
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
    className: cx('visx-link visx-link-vertical-diagonal', className),
    d: pathGen(data) || '',
    ...restProps
  });
}