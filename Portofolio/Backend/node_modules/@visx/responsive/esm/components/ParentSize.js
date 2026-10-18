import useParentSize from '../hooks/useParentSize';
import { jsx as _jsx } from "react/jsx-runtime";
const defaultParentSizeStyles = {
  width: '100%',
  height: '100%'
};
export default function ParentSize(_ref) {
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
  } = useParentSize({
    initialSize,
    debounceTime,
    ignoreDimensions,
    enableDebounceLeadingCall,
    resizeObserverPolyfill
  });
  return /*#__PURE__*/_jsx("div", {
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