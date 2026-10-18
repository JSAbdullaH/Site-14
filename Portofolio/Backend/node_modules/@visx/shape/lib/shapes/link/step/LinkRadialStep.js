"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkRadialStep;
exports.pathRadialStep = pathRadialStep;
var _classnames = _interopRequireDefault(require("classnames"));
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathRadialStep(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return link => {
    const sourceData = source(link);
    const targetData = target(link);
    const sx = x(sourceData);
    const sy = y(sourceData);
    const tx = x(targetData);
    const ty = y(targetData);
    const sa = sx - Math.PI / 2;
    const sr = sy;
    const ta = tx - Math.PI / 2;
    const tr = ty;
    const sc = Math.cos(sa);
    const ss = Math.sin(sa);
    const tc = Math.cos(ta);
    const ts = Math.sin(ta);
    const sf = Math.abs(ta - sa) > Math.PI ? ta <= sa : ta > sa;
    return `
      M${sr * sc},${sr * ss}
      A${sr},${sr},0,0,${sf ? 1 : 0},${sr * tc},${sr * ts}
      L${tr * tc},${tr * ts}
    `;
  };
}
function LinkRadialStep(_ref2) {
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
  const pathGen = path || pathRadialStep({
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
    className: (0, _classnames.default)('visx-link visx-link-radial-step', className),
    d: pathGen(data) || '',
    ...restProps
  });
}