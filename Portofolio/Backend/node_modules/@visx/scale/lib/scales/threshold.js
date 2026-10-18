"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createThresholdScale;
exports.updateThresholdScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateThresholdScale = exports.updateThresholdScale = (0, _scaleOperator.default)('domain', 'range', 'reverse');
function createThresholdScale(config) {
  return updateThresholdScale((0, _d3Scale.scaleThreshold)(), config);
}