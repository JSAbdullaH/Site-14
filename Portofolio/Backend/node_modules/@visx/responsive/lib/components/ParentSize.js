"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ParentSize;
var _useParentSize = _interopRequireDefault(require("../hooks/useParentSize"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const defaultParentSizeStyles = {
  width: '100%',
  height: '100%'
};
function ParentSize(_ref) {
  let {
    className,
    children,
    debounceTime,
    ignoreDimensions,
    initialSize,
    parentSizeStyles = defaultParentSizeStyles,
    enableDebounceLeadingCall = true,
    resizeObserverPolyfill,
    ...restProps
  } = _ref;
  const {
    parentRef,
    resize,
    ...dimensions
  } = (0, _useParentSize.default)({
    initialSize,
    debounceTime,
    ignoreDimensions,
    enableDebounceLeadingCall,
    resizeObserverPolyfill
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: parentSizeStyles,
    ref: parentRef,
    className: className,
    ...restProps,
    children: children({
      ...dimensions,
      ref: parentRef.current,
      resize
    })
  });
}