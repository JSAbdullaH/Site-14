import cx from 'classnames';
import { jsx as _jsx } from "react/jsx-runtime";
export default function Bar(_ref) {
  let {
    className,
    innerRef,
    ...restProps
  } = _ref;
  return /*#__PURE__*/_jsx("rect", {
    ref: innerRef,
    className: cx('visx-bar', className),
    ...restProps
  });
}