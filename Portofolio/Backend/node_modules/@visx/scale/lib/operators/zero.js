"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyZero;
function applyZero(scale, config) {
  if ('zero' in config && config.zero === true) {
    const domain = scale.domain();
    const [a, b] = domain;
    const isDescending = b < a;
    const [min, max] = isDescending ? [b, a] : [a, b];
    const domainWithZero = [Math.min(0, min), Math.max(0, max)];
    scale.domain(isDescending ? domainWithZero.reverse() : domainWithZero);
  }
}