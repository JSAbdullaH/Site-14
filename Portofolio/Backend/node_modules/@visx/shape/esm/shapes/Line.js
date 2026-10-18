import cx from 'classnames';
import { jsx as _jsx } from "react/jsx-runtime";
export default function Line(_ref) {
  let {
    from = {
      x: 0,
      y: 0
    },
    to = {
      x: 1,
      y: 1
    },
    fill = 'transparent',
    className,
    innerRef,
    ...restProps
  } = _ref;
  const isRectilinear = from.x === to.x || from.y === to.y;
  return /*#__PURE__*/_jsx("line", {
    ref: innerRef,
    className: cx('visx-line', className),
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    fill: fill,
    shapeRendering: isRectilinear ? 'crispEdges' : 'auto',
    ...restProps
  });
}