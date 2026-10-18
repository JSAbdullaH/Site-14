"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyDomain;
function applyDomain(scale, config) {
  if (config.domain) {
    if ('nice' in scale || 'quantiles' in scale) {
      // continuous input scales
      scale.domain(config.domain);
    } else if ('padding' in scale) {
      // point and band scales
      scale.domain(config.domain);
    } else {
      // ordinal and threshold scale
      scale.domain(config.domain);
    }
  }
}