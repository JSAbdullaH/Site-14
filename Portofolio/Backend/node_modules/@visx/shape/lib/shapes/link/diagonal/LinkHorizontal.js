"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkHorizontalDiagonal;
exports.pathHorizontalDiagonal = pathHorizontalDiagonal;
var _classnames = _interopRequireDefault(require("classnames"));
var _d3Shape = require("@visx/vendor/d3-shape");
var _accessors = require("../../../util/accessors");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function pathHorizontalDiagonal(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return data => {
    const link = (0, _d3Shape.linkHorizontal)();
    link.x(x);
    link.y(y);
    link.source(source);
    link.target(target);
    return link(data);
  };
}
function LinkHorizontalDiagonal(_ref2) {
  let {
    className,
    children,
    data,
    innerRef,
    path,
    x = _accessors.getY,
    // note this returns a y value
    y = _accessors.getX,
    // note this returns an x value
    source = _accessors.getSource,
    target = _accessors.getTarget,
    ...restProps
  } = _ref2;
  const pathGen = path || pathHorizontalDiagonal({
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
    className: (0, _classnames.default)('visx-link visx-link-horizontal-diagonal', className),
    d: pathGen(data) || '',
    ...restProps
  });
}