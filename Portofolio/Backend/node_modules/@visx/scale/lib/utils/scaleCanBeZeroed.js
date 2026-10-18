"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = scaleCanBeZeroed;
const zeroableScaleTypes = new Set(['linear', 'pow', 'quantize', 'sqrt', 'symlog']);
function scaleCanBeZeroed(scaleConfig) {
  return zeroableScaleTypes.has(scaleConfig.type);
}