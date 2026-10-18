"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyBase;
function applyBase(scale, config) {
  if ('base' in scale && 'base' in config && typeof config.base !== 'undefined') {
    scale.base(config.base);
  }
}