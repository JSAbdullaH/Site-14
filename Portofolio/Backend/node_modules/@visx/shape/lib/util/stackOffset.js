"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.STACK_OFFSET_NAMES = exports.STACK_OFFSETS = void 0;
exports.default = stackOffset;
var _d3Shape = require("@visx/vendor/d3-shape");
const STACK_OFFSETS = exports.STACK_OFFSETS = {
  expand: _d3Shape.stackOffsetExpand,
  diverging: _d3Shape.stackOffsetDiverging,
  none: _d3Shape.stackOffsetNone,
  silhouette: _d3Shape.stackOffsetSilhouette,
  wiggle: _d3Shape.stackOffsetWiggle
};
const STACK_OFFSET_NAMES = exports.STACK_OFFSET_NAMES = Object.keys(STACK_OFFSETS);
function stackOffset(offset) {
  return offset && STACK_OFFSETS[offset] || STACK_OFFSETS.none;
}