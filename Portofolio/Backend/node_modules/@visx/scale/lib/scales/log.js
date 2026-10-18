"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createLogScale;
exports.updateLogScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateLogScale = exports.updateLogScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'base', 'clamp', 'interpolate', 'nice', 'round');
function createLogScale(config) {
  return updateLogScale((0, _d3Scale.scaleLog)(), config);
}