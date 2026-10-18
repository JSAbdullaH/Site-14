"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createBandScale;
exports.updateBandScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateBandScale = exports.updateBandScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'align', 'padding', 'round');
function createBandScale(config) {
  return updateBandScale((0, _d3Scale.scaleBand)(), config);
}