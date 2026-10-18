import cx from 'classnames';
import { area } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function Area(_ref) {
  let {
    children,
    x,
    x0,
    x1,
    y,
    y0,
    y1,
    data = [],
    defined = () => true,
    className,
    curve,
    innerRef,
    ...restProps
  } = _ref;
  const path = area({
    x,
    x0,
    x1,
    y,
    y0,
    y1,
    defined,
    curve
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path
    })
  });
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-area', className),
    d: path(data) || '',
    ...restProps
  });
}