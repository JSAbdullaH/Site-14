"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getBandwidth;
function getBandwidth(scale) {
  if ('bandwidth' in scale) {
    return scale.bandwidth();
  }
  const range = scale.range();
  const domain = scale.domain();
  return Math.abs(range[range.length - 1] - range[0]) / domain.length;
}