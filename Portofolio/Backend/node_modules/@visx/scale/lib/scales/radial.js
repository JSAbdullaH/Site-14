"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createRadialScale;
exports.updateRadialScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateRadialScale = exports.updateRadialScale = (0, _scaleOperator.default)('domain', 'range', 'clamp', 'nice', 'round', 'unknown');
function createRadialScale(config) {
  return updateRadialScale((0, _d3Scale.scaleRadial)(), config);
}