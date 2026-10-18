"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
exports.stereographicRaw = stereographicRaw;
var _math = require("../math.js");
var _azimuthal = require("./azimuthal.js");
var _index = _interopRequireDefault(require("./index.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function stereographicRaw(x, y) {
  var cy = (0, _math.cos)(y),
    k = 1 + (0, _math.cos)(x) * cy;
  return [cy * (0, _math.sin)(x) / k, (0, _math.sin)(y) / k];
}
stereographicRaw.invert = (0, _azimuthal.azimuthalInvert)(function (z) {
  return 2 * (0, _math.atan)(z);
});
function _default() {
  return (0, _index.default)(stereographicRaw).scale(250).clipAngle(142);
}