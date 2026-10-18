"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyUnknown;
function applyUnknown(scale, config) {
  if ('unknown' in scale && 'unknown' in config && typeof config.unknown !== 'undefined') {
    scale.unknown(config.unknown);
  }
}