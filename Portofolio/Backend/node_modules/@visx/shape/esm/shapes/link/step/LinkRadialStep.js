import cx from 'classnames';
import { getX, getY, getSource, getTarget } from '../../../util/accessors';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export function pathRadialStep(_ref) {
  let {
    source,
    target,
    x,
    y
  } = _ref;
  return link => {
    const sourceData = source(link);
    const targetData = target(link);
    const sx = x(sourceData);
    const sy = y(sourceData);
    const tx = x(targetData);
    const ty = y(targetData);
    const sa = sx - Math.PI / 2;
    const sr = sy;
    const ta = tx - Math.PI / 2;
    const tr = ty;
    const sc = Math.cos(sa);
    const ss = Math.sin(sa);
    const tc = Math.cos(ta);
    const ts = Math.sin(ta);
    const sf = Math.abs(ta - sa) > Math.PI ? ta <= sa : ta > sa;
    return `
      M${sr * sc},${sr * ss}
      A${sr},${sr},0,0,${sf ? 1 : 0},${sr * tc},${sr * ts}
      L${tr * tc},${tr * ts}
    `;
  };
}
export default function LinkRadialStep(_ref2) {
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
  const pathGen = path || pathRadialStep({
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
    className: cx('visx-link visx-link-radial-step', className),
    d: pathGen(data) || '',
    ...restProps
  });
}