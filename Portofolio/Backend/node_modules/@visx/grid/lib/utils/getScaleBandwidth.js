"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getScaleBandwidth;
function getScaleBandwidth(scale) {
  return 'bandwidth' in scale ? scale.bandwidth() : 0;
}