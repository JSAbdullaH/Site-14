"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkRadialDiagonal;
exports.pathRadialDiagonal = pathRadialDiagonal;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Shape = require("@visx/vendor/d3-shape");
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathRadialDiagonal(_ref) {
  let {
    source,
    target,
    angle,
    radius
  } = _ref;
  return data => {
    const link = (0, _d3Shape.linkRadial)();
    link.angle(angle);
    link.radius(radius);
    link.source(source);
    link.target(target);
    return link(data);
  };
}
function LinkRadialDiagonal(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    angle = _accessors.getX,
    radius = _accessors.getY,
    source = _accessors.getSource,
    target = _accessors.getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathRadialDiagonal({
    source,
    target,
    angle,
    radius
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-link visx-link-radial-diagonal', className),
    d: pathGen(data) || '',
    ...restProps
  });
}