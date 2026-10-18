import { jsx as _jsx } from "react/jsx-runtime";
export default function ScaleSVG(_ref) {
  let {
    children,
    width,
    height,
    xOrigin = 0,
    yOrigin = 0,
    preserveAspectRatio = 'xMinYMin meet',
    innerRef
  } = _ref;
  return /*#__PURE__*/_jsx("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      width: '100%',
      verticalAlign: 'top',
      overflow: 'hidden'
    },
    children: /*#__PURE__*/_jsx("svg", {
      preserveAspectRatio: preserveAspectRatio,
      viewBox: `${xOrigin} ${yOrigin} ${width} ${height}`,
      ref: innerRef,
      children: children
    })
  });
}