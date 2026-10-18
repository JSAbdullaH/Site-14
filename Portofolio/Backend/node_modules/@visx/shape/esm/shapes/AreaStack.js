import cx from 'classnames';
import Stack from './Stack';
import { jsx as _jsx } from "react/jsx-runtime";
export default function AreaStack(_ref) {
  let {
    className,
    top,
    left,
    keys,
    data,
    curve,
    defined,
    x,
    x0,
    x1,
    y0,
    y1,
    value,
    order,
    offset,
    color,
    children,
    ...restProps
  } = _ref;
  return /*#__PURE__*/_jsx(Stack, {
    className: className,
    top: top,
    left: left,
    keys: keys,
    data: data,
    curve: curve,
    defined: defined,
    x: x,
    x0: x0,
    x1: x1,
    y0: y0,
    y1: y1,
    value: value,
    order: order,
    offset: offset,
    color: color,
    ...restProps,
    children: children || (_ref2 => {
      let {
        stacks,
        path
      } = _ref2;
      return stacks.map((series, i) => /*#__PURE__*/_jsx("path", {
        className: cx('visx-area-stack', className),
        d: path(series) || '',
        fill: color?.(series.key, i),
        ...restProps
      }, `area-stack-${i}-${series.key || ''}`));
    })
  });
}