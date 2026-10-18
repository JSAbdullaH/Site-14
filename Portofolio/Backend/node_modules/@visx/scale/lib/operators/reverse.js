"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyReverse;
function applyReverse(scale, config) {
  if (config.reverse) {
    const reversedRange = scale.range().slice().reverse();
    if ('padding' in scale) {
      // point and band scales
      scale.range(reversedRange);
    } else {
      // the rest
      scale.range(reversedRange);
    }
  }
}