"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Polygon;
exports.getPoints = exports.getPoint = void 0;
var _classnames = _interopRequireDefault(require("classnames"));
var _trigonometry = require("../util/trigonometry");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const DEFAULT_CENTER = {
  x: 0,
  y: 0
};
const getPoint = _ref => {
  let {
    sides = 4,
    size = 25,
    center = DEFAULT_CENTER,
    rotate = 0,
    side
  } = _ref;
  const degrees = 360 / sides * side - rotate;
  const radians = (0, _trigonometry.degreesToRadians)(degrees);
  return {
    x: center.x + size * Math.cos(radians),
    y: center.y + size * Math.sin(radians)
  };
};
exports.getPoint = getPoint;
const getPoints = _ref2 => {
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
exports.getPoints = getPoints;
function Polygon(_ref3) {
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
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      points: pointsToRender
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("polygon", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-polygon', className),
    points: pointsToRender.join(' '),
    ...restProps
  });
}