"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyClamp;
function applyClamp(scale, config) {
  if ('clamp' in scale && 'clamp' in config && typeof config.clamp !== 'undefined') {
    scale.clamp(config.clamp);
  }
}