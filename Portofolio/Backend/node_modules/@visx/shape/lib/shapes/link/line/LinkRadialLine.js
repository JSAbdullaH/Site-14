"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkRadialLine;
exports.pathRadialLine = pathRadialLine;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Path = require("@visx/vendor/d3-path");
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathRadialLine(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return data => {
    const sourceData = source(data);
    const targetData = target(data);
    const sa = x(sourceData) - Math.PI / 2;
    const sr = y(sourceData);
    const ta = x(targetData) - Math.PI / 2;
    const tr = y(targetData);
    const sc = Math.cos(sa);
    const ss = Math.sin(sa);
    const tc = Math.cos(ta);
    const ts = Math.sin(ta);
    const path = (0, _d3Path.path)();
    path.moveTo(sr * sc, sr * ss);
    path.lineTo(tr * tc, tr * ts);
    return path.toString();
  };
}
function LinkRadialLine(_ref2) {
  let {
    className,
    innerRef,
    data,
    path,
    x = _accessors.getX,
    y = _accessors.getY,
    source = _accessors.getSource,
    target = _accessors.getTarget,
    children,
    ...restProps
  } = _ref2;
  const pathGen = path || pathRadialLine({
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
    className: (0, _classnames.default)('visx-link visx-link-radial-line', className),
    d: pathGen(data) || '',
    ...restProps
  });
}