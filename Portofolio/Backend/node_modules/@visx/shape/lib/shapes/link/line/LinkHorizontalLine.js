"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkHorizontalLine;
exports.pathHorizontalLine = pathHorizontalLine;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Path = require("@visx/vendor/d3-path");
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathHorizontalLine(_ref) {
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
    const path = (0, _d3Path.path)();
    path.moveTo(sx, sy);
    path.lineTo(tx, ty);
    return path.toString();
  };
}
function LinkHorizontalLine(_ref2) {
  let {
    className,
    children,
    innerRef,
    data,
    path,
    x = _accessors.getY,
    // note this returns a y value
    y = _accessors.getX,
    // note this returns a x value
    source = _accessors.getSource,
    target = _accessors.getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathHorizontalLine({
    source,
    target,
    x,
    y
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-link visx-link-horizontal-line', className),
    d: pathGen(data) || '',
    ...restProps
  });
}