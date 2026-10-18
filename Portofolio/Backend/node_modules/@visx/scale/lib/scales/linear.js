"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createLinearScale;
exports.updateLinearScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateLinearScale = exports.updateLinearScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'clamp', 'interpolate', 'nice', 'round', 'zero');
function createLinearScale(config) {
  return updateLinearScale((0, _d3Scale.scaleLinear)(), config);
}