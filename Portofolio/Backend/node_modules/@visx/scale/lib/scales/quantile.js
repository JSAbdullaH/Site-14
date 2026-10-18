"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createQuantileScale;
exports.updateQuantileScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateQuantileScale = exports.updateQuantileScale = (0, _scaleOperator.default)('domain', 'range', 'reverse');
function createQuantileScale(config) {
  return updateQuantileScale((0, _d3Scale.scaleQuantile)(), config);
}