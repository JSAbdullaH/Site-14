"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyExponent;
function applyExponent(scale, config) {
  if ('exponent' in scale && 'exponent' in config && typeof config.exponent !== 'undefined') {
    scale.exponent(config.exponent);
  }
}