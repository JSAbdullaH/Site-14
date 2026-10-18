export default class Point {
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