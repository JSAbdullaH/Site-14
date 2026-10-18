import cx from 'classnames';
import { line } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function LinePath(_ref) {
  let {
    children,
    data = [],
    x,
    y,
    fill = 'transparent',
    className,
    curve,
    innerRef,
    defined = () => true,
    ...restProps
  } = _ref;
  const path = line({
    x,
    y,
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
    className: cx('visx-linepath', className),
    d: path(data) || '',
    fill: fill
    // without this a datum surrounded by nulls will not be visible
    // https://github.com/d3/d3-shape#line_defined
    ,
    strokeLinecap: "round",
    ...restProps
  });
}