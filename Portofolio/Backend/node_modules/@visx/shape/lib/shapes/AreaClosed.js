"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = AreaClosed;
var _classnames = _interopRequireDefault(require("classnames"));
var _setNumberOrNumberAccessor = _interopRequireDefault(require("../util/setNumberOrNumberAccessor"));
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function AreaClosed(_ref) {
  let {
    x,
    x0,
    x1,
    y,
    y1,
    y0,
    yScale,
    data = [],
    defined = () => true,
    className,
    curve,
    innerRef,
    children,
    ...restProps
  } = _ref;
  const path = (0, _D3ShapeFactories.area)({
    x,
    x0,
    x1,
    defined,
    curve
  });
  if (y0 == null) {
    /**
     * by default set the baseline to the first element of the yRange
     * @TODO take the minimum instead?
     */
    path.y0(yScale.range()[0]);
  } else {
    (0, _setNumberOrNumberAccessor.default)(path.y0, y0);
  }
  if (y && !y1) (0, _setNumberOrNumberAccessor.default)(path.y1, y);
  if (y1 && !y) (0, _setNumberOrNumberAccessor.default)(path.y1, y1);
  if (children) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: children({
      path
    })
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
    ref: innerRef,
    className: (0, _classnames.default)('visx-area-closed', className),
    d: path(data) || '',
    ...restProps
  });
}