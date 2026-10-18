"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Arc;
var _classnames = _interopRequireDefault(require("classnames"));
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function Arc(_ref) {
  let {
    className,
    data,
    innerRadius,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius,
    children,
    innerRef,
    ...restProps
  } = _ref;
  const path = (0, _D3ShapeFactories.arc)({
    innerRadius,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius
  });
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path
    })
  });
  if (!data && (startAngle == null || endAngle == null || innerRadius == null || outerRadius == null)) {
    console.warn('[@visx/shape/Arc]: expected data because one of startAngle, endAngle, innerRadius, outerRadius is undefined. Bailing.');
    return null;
  }
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-arc', className),
    d: path(data) || '',
    ...restProps
  });
}