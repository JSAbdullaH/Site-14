"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkHorizontalCurve;
exports.pathHorizontalCurve = pathHorizontalCurve;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Path = require("@visx/vendor/d3-path");
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathHorizontalCurve(_ref) {
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
    const path = (0, _d3Path.path)();
    path.moveTo(sx, sy);
    path.bezierCurveTo(sx + ix, sy + iy, tx + iy, ty - ix, tx, ty);
    return path.toString();
  };
}
function LinkHorizontalCurve(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    percent = 0.2,
    x = _accessors.getY,
    // note this returns a y value
    y = _accessors.getX,
    // note this returns an x value
    source = _accessors.getSource,
    target = _accessors.getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathHorizontalCurve({
    source,
    target,
    x,
    y,
    percent
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-link visx-link-horizontal-curve', className),
    d: pathGen(data) || '',
    ...restProps
  });
}