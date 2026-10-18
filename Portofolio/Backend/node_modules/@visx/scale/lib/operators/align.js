"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyAlign;
function applyAlign(scale, config) {
  if ('align' in scale && 'align' in config && typeof config.align !== 'undefined') {
    scale.align(config.align);
  }
}