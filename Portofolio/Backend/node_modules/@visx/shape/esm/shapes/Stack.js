import cx from 'classnames';
import { Group } from '@visx/group';
import { area, stack as stackPath } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function Stack(_ref) {
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
  const stack = stackPath({
    keys,
    value,
    order,
    offset
  });
  const path = area({
    x,
    x0,
    x1,
    y0,
    y1,
    curve,
    defined
  });
  const stacks = stack(data);
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      stacks,
      path,
      stack
    })
  });
  return /*#__PURE__*/_jsx(Group, {
    top: top,
    left: left,
    children: stacks.map((series, i) => /*#__PURE__*/_jsx("path", {
      className: cx('visx-stack', className),
      d: path(series) || '',
      fill: color?.(series.key, i),
      ...restProps
    }, `stack-${i}-${series.key || ''}`))
  });
}