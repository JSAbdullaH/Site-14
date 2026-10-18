"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ScaleSVG;
var _jsxRuntime = require("react/jsx-runtime");
function ScaleSVG(_ref) {
  let {
    children,
    width,
    height,
    xOrigin = 0,
    yOrigin = 0,
    preserveAspectRatio = 'xMinYMin meet',
    innerRef
  } = _ref;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      display: 'inline-block',
      position: 'relative',
      width: '100%',
      verticalAlign: 'top',
      overflow: 'hidden'
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)("svg", {
      preserveAspectRatio: preserveAspectRatio,
      viewBox: `${xOrigin} ${yOrigin} ${width} ${height}`,
      ref: innerRef,
      children: children
    })
  });
}