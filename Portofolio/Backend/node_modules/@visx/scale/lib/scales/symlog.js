"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createSymlogScale;
exports.updateSymlogScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateSymlogScale = exports.updateSymlogScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'clamp', 'constant', 'nice', 'zero', 'round');
function createSymlogScale(config) {
  return updateSymlogScale((0, _d3Scale.scaleSymlog)(), config);
}