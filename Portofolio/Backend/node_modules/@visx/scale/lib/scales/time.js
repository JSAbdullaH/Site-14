"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createTimeScale;
exports.updateTimeScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateTimeScale = exports.updateTimeScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'clamp', 'interpolate', 'nice', 'round');
function createTimeScale(config) {
  return updateTimeScale((0, _d3Scale.scaleTime)(), config);
}