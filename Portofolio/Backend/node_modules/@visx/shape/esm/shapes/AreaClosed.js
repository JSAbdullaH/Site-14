import cx from 'classnames';
import setNumOrAccessor from '../util/setNumberOrNumberAccessor';
import { area } from '../util/D3ShapeFactories';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
export default function AreaClosed(_ref) {
  let {
    x,
    x0,
    x1,
    y,
    y1,
    y0,
    yScale,
    data = [],
    defined = () => true,
    className,
    curve,
    innerRef,
    children,
    ...restProps
  } = _ref;
  const path = area({
    x,
    x0,
    x1,
    defined,
    curve
  });
  if (y0 == null) {
    /**
     * by default set the baseline to the first element of the yRange
     * @TODO take the minimum instead?
     */
    path.y0(yScale.range()[0]);
  } else {
    setNumOrAccessor(path.y0, y0);
  }
  if (y && !y1) setNumOrAccessor(path.y1, y);
  if (y1 && !y) setNumOrAccessor(path.y1, y1);
  if (children) return /*#__PURE__*/_jsx(_Fragment, {
    children: children({
      path
    })
  });
  return /*#__PURE__*/_jsx("path", {
    ref: innerRef,
    className: cx('visx-area-closed', className),
    d: path(data) || '',
    ...restProps
  });
}