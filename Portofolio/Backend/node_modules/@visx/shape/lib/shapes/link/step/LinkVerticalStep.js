"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkVerticalStep;
exports.pathVerticalStep = pathVerticalStep;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Path = require("@visx/vendor/d3-path");
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathVerticalStep(_ref) {
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
    const path = (0, _d3Path.path)();
    path.moveTo(sx, sy);
    path.lineTo(sx, sy + (ty - sy) * percent);
    path.lineTo(tx, sy + (ty - sy) * percent);
    path.lineTo(tx, ty);
    return path.toString();
  };
}
function LinkVerticalStep(_ref2) {
  let {
    className,
    innerRef,
    data,
    path,
    percent = 0.5,
    x = _accessors.getX,
    y = _accessors.getY,
    source = _accessors.getSource,
    target = _accessors.getTarget,
    children,
    ...restProps
  } = _ref2;
  const pathGen = path || pathVerticalStep({
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
    className: (0, _classnames.default)('visx-link visx-link-vertical-step', className),
    d: pathGen(data) || '',
    ...restProps
  });
}