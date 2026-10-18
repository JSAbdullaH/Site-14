"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BarRounded;
exports.useBarRoundedPath = useBarRoundedPath;
var _classnames = _interopRequireDefault(require("classnames"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/** Hook that returns a BarRounded path. */
function useBarRoundedPath(_ref) {
  let {
    all,
    bottom,
    bottomLeft,
    bottomRight,
    height,
    left,
    radius,
    right,
    top,
    topLeft,
    topRight,
    width,
    x,
    y
  } = _ref;
  topRight = all || top || right || topRight;
  bottomRight = all || bottom || right || bottomRight;
  bottomLeft = all || bottom || left || bottomLeft;
  topLeft = all || top || left || topLeft;

  // clamp radius to center of shortest side of the rect
  radius = Math.max(1, Math.min(radius, Math.min(width, height) / 2));
  const diameter = 2 * radius;
  const path = `M${x + radius},${y} h${width - diameter}
 ${topRight ? `a${radius},${radius} 0 0 1 ${radius},${radius}` : `h${radius}v${radius}`}
 v${height - diameter}
 ${bottomRight ? `a${radius},${radius} 0 0 1 ${-radius},${radius}` : `v${radius}h${-radius}`}
 h${diameter - width}
 ${bottomLeft ? `a${radius},${radius} 0 0 1 ${-radius},${-radius}` : `h${-radius}v${-radius}`}
 v${diameter - height}
 ${topLeft ? `a${radius},${radius} 0 0 1 ${radius},${-radius}` : `v${-radius}h${radius}`}
z`.split('\n').join('');
  return path;
}
function BarRounded(_ref2) {
  let {
    children,
    className,
    innerRef,
    x,
    y,
    width,
    height,
    radius,
    all = false,
    top = false,
    bottom = false,
    left = false,
    right = false,
    topLeft = false,
    topRight = false,
    bottomLeft = false,
    bottomRight = false,
    ...restProps
  } = _ref2;
  const path = useBarRoundedPath({
    x,
    y,
    width,
    height,
    radius,
    all,
    top,
    bottom,
    left,
    right,
    topLeft,
    topRight,
    bottomLeft,
    bottomRight
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-bar-rounded', className),
    d: path,
    ...restProps
  });
}