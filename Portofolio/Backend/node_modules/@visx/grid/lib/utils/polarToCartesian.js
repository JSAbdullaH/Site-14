"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = polarToCartesian;
function polarToCartesian(_ref) {
  let {
    radius,
    angle
  } = _ref;
  return {
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle)
  };
}