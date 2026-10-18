"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createSqrtScale;
exports.updateSqrtScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateSqrtScale = exports.updateSqrtScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'clamp', 'interpolate', 'nice', 'round', 'zero');
function createSqrtScale(config) {
  return updateSqrtScale((0, _d3Scale.scaleSqrt)(), config);
}