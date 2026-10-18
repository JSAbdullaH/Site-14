import cx from 'classnames';
import { jsx as _jsx } from "react/jsx-runtime";
export default function Circle(_ref) {
  let {
    className,
    innerRef,
    ...restProps
  } = _ref;
  return /*#__PURE__*/_jsx("circle", {
    ref: innerRef,
    className: cx('visx-circle', className),
    ...restProps
  });
}