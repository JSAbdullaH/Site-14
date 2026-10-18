"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyInterpolate;
var _createColorInterpolator = _interopRequireDefault(require("../utils/createColorInterpolator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function applyInterpolate(scale, config) {
  if ('interpolate' in config && 'interpolate' in scale && typeof config.interpolate !== 'undefined') {
    const interpolator = (0, _createColorInterpolator.default)(config.interpolate);
    scale.interpolate(interpolator);
  }
}