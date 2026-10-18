"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = sumPoints;
var _Point = _interopRequireDefault(require("./Point"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function sumPoints(point1, point2) {
  return new _Point.default({
    x: point1.x + point2.x,
    y: point1.y + point2.y
  });
}