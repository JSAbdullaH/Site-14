import cx from 'classnames';
import { path as d3Path } from '@visx/vendor/d3-path';
import { getX, getY, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathRadialLine(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return data => {
    const sourceData = source(data);
    const targetData = target(data);
    const sa = x(sourceData) - Math.PI / 2;
    const sr = y(sourceData);
    const ta = x(targetData) - Math.PI / 2;
    const tr = y(targetData);
    const sc = Math.cos(sa);
    const ss = Math.sin(sa);
    const tc = Math.cos(ta);
    const ts = Math.sin(ta);
    const path = d3Path();
    path.moveTo(sr * sc, sr * ss);
    path.lineTo(tr * tc, tr * ts);
    return path.toString();
  };
}
export default function LinkRadialLine(_ref2) {
  let {
    className,
    innerRef,
    data,
    path,
    x = getX,
    y = getY,
    source = getSource,
    target = getTarget,
    children,
    ...restProps
  } = _ref2;
  const pathGen = path || pathRadialLine({
    source,
    target,
    x,
    y
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path: pathGen
    })
  });
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-link visx-link-radial-line', className),
    d: pathGen(data) || '',
    ...restProps
  });
}