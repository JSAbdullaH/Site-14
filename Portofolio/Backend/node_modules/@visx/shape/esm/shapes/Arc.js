import cx from 'classnames';
import { arc } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function Arc(_ref) {
  let {
    className,
    data,
    innerRadius,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius,
    children,
    innerRef,
    ...restProps
  } = _ref;
  const path = arc({
    innerRadius,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius
  });
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path
    })
  });
  if (!data && (startAngle == null || endAngle == null || innerRadius == null || outerRadius == null)) {
    console.warn('[@visx/shape/Arc]: expected data because one of startAngle, endAngle, innerRadius, outerRadius is undefined. Bailing.');
    return null;
  }
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-arc', className),
    d: path(data) || '',
    ...restProps
  });
}