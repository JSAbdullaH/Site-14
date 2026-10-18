"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createPowScale;
exports.updatePowScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updatePowScale = exports.updatePowScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'clamp', 'exponent', 'interpolate', 'nice', 'round', 'zero');
function createPowScale(config) {
  return updatePowScale((0, _d3Scale.scalePow)(), config);
}