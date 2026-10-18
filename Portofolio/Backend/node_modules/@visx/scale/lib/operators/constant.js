"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyConstant;
function applyConstant(scale, config) {
  if ('constant' in scale && 'constant' in config && typeof config.constant !== 'undefined') {
    scale.constant(config.constant);
  }
}