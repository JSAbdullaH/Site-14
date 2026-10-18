import cx from 'classnames';
import { jsx as _jsx } from "react/jsx-runtime";
export default function Group(_ref) {
  let {
    top = 0,
    left = 0,
    transform,
    className,
    children,
    innerRef,
    ...restProps
  } = _ref;
  return /*#__PURE__*/_jsx("g", {
    ref: innerRef,
    className: cx('visx-group', className),
    transform: transform || `translate(${left}, ${top})`,
    ...restProps,
    children: children
  });
}