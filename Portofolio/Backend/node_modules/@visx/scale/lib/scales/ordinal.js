"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createOrdinalScale;
exports.updateOrdinalScale = void 0;
var _d3Scale = require("@visx/vendor/d3-scale");
var _scaleOperator = _interopRequireDefault(require("../operators/scaleOperator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const updateOrdinalScale = exports.updateOrdinalScale = (0, _scaleOperator.default)('domain', 'range', 'reverse', 'unknown');
function createOrdinalScale(config) {
  return updateOrdinalScale((0, _d3Scale.scaleOrdinal)(), config);
}