"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
class Point {
  x = 0;
  y = 0;
  constructor(_ref) {
    let {
      x = 0,
      y = 0
    } = _ref;
    this.x = x;
    this.y = y;
  }
  value() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toArray() {
    return [this.x, this.y];
  }
}
exports.default = Point;