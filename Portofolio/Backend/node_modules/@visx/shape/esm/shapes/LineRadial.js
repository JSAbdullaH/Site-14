import cx from 'classnames';
import { radialLine } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function LineRadial(_ref) {
  let {
    className,
    angle,
    radius,
    defined,
    curve,
    data = [],
    innerRef,
    children,
    fill = 'transparent',
    ...restProps
  } = _ref;
  const path = radialLine({
    angle,
    radius,
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
    className: cx('visx-line-radial', className),
    d: path(data) || '',
    fill: fill,
    ...restProps
  });
}