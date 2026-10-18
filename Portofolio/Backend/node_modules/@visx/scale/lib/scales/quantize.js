"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createQuantizeScale;
exports.updateQuantizeScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateQuantizeScale = exports.updateQuantizeScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'nice', 'zero');
function createQuantizeScale(config) {
  return updateQuantizeScale((0, _d3Scale.scaleQuantize)(), config);
}