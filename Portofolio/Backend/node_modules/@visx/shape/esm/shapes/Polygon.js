import cx from 'classnames';
import { degreesToRadians } from '../util/trigonometry';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
const DEFAULT_CENTER = {
  x: 0,
  y: 0
};
export const getPoint = _ref => {
  let {
    sides = 4,
    size = 25,
    center = DEFAULT_CENTER,
    rotate = 0,
    side
  } = _ref;
  const degrees = 360 / sides * side - rotate;
  const radians = degreesToRadians(degrees);
  return {
    x: center.x + size * Math.cos(radians),
    y: center.y + size * Math.sin(radians)
  };
};
export const getPoints = _ref2 => {
  let {
    sides,
    size,
    center,
    rotate
  } = _ref2;
  return new Array(sides).fill(0).map((_, side) => getPoint({
    sides,
    size,
    center,
    rotate,
    side
  }));
};
export default function Polygon(_ref3) {
  let {
    sides = 4,
    size = 25,
    center = DEFAULT_CENTER,
    rotate = 0,
    className,
    children,
    innerRef,
    points,
    ...restProps
  } = _ref3;
  const pointsToRender = points || getPoints({
    sides,
    size,
    center,
    rotate
  }).map(_ref4 => {
    let {
      x,
      y
    } = _ref4;
    return [x, y];
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      points: pointsToRender
    })
  });
  return /*#__PURE__*/_jsx("polygon", {
    ref: innerRef,
    className: cx('visx-polygon', className),
    points: pointsToRender.join(' '),
    ...restProps
  });
}