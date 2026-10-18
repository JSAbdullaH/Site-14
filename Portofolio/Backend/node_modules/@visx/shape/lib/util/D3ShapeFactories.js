"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.arc = arc;
exports.area = area;
exports.line = line;
exports.pie = pie;
exports.radialLine = radialLine;
exports.stack = stack;
var _d3Shape = require("@visx/vendor/d3-shape");
var _setNumberOrNumberAccessor = _interopRequireDefault(require("./setNumberOrNumberAccessor"));
var _stackOrder = _interopRequireDefault(require("./stackOrder"));
var _stackOffset = _interopRequireDefault(require("./stackOffset"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function arc() {
  let {
    innerRadius,
    outerRadius,
    cornerRadius,
    startAngle,
    endAngle,
    padAngle,
    padRadius
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const path = (0, _d3Shape.arc)();
  if (innerRadius != null) (0, _setNumberOrNumberAccessor.default)(path.innerRadius, innerRadius);
  if (outerRadius != null) (0, _setNumberOrNumberAccessor.default)(path.outerRadius, outerRadius);
  if (cornerRadius != null) (0, _setNumberOrNumberAccessor.default)(path.cornerRadius, cornerRadius);
  if (startAngle != null) (0, _setNumberOrNumberAccessor.default)(path.startAngle, startAngle);
  if (endAngle != null) (0, _setNumberOrNumberAccessor.default)(path.endAngle, endAngle);
  if (padAngle != null) (0, _setNumberOrNumberAccessor.default)(path.padAngle, padAngle);
  if (padRadius != null) (0, _setNumberOrNumberAccessor.default)(path.padRadius, padRadius);
  return path;
}
function area() {
  let {
    x,
    x0,
    x1,
    y,
    y0,
    y1,
    defined,
    curve
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const path = (0, _d3Shape.area)();
  if (x) (0, _setNumberOrNumberAccessor.default)(path.x, x);
  if (x0) (0, _setNumberOrNumberAccessor.default)(path.x0, x0);
  if (x1) (0, _setNumberOrNumberAccessor.default)(path.x1, x1);
  if (y) (0, _setNumberOrNumberAccessor.default)(path.y, y);
  if (y0) (0, _setNumberOrNumberAccessor.default)(path.y0, y0);
  if (y1) (0, _setNumberOrNumberAccessor.default)(path.y1, y1);
  if (defined) path.defined(defined);
  if (curve) path.curve(curve);
  return path;
}
function line() {
  let {
    x,
    y,
    defined,
    curve
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const path = (0, _d3Shape.line)();
  if (x) (0, _setNumberOrNumberAccessor.default)(path.x, x);
  if (y) (0, _setNumberOrNumberAccessor.default)(path.y, y);
  if (defined) path.defined(defined);
  if (curve) path.curve(curve);
  return path;
}
function pie() {
  let {
    startAngle,
    endAngle,
    padAngle,
    value,
    sort,
    sortValues
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const path = (0, _d3Shape.pie)();

  // In d3-shape v3+, sortValues defaults to descending sort.
  // To maintain visx's behavior of preserving input order by default,
  // we explicitly set sortValues to null when neither sort nor sortValues is provided.
  // Note: d3's pie generator clears sortValues when sort is set, and vice versa.
  if (sortValues !== undefined) {
    path.sortValues(sortValues);
  } else if (sort === undefined) {
    // Neither provided - disable sorting to preserve input order
    path.sortValues(null);
  } else if (sort === null) {
    // explicit null: clear comparator
    path.sort(null);
  } else {
    // here sort is narrowed to a comparator function
    path.sort(sort);
  }
  if (value != null) path.value(value);
  if (padAngle != null) (0, _setNumberOrNumberAccessor.default)(path.padAngle, padAngle);
  if (startAngle != null) (0, _setNumberOrNumberAccessor.default)(path.startAngle, startAngle);
  if (endAngle != null) (0, _setNumberOrNumberAccessor.default)(path.endAngle, endAngle);
  return path;
}
function radialLine() {
  let {
    angle,
    radius,
    defined,
    curve
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const path = (0, _d3Shape.radialLine)();
  if (angle) (0, _setNumberOrNumberAccessor.default)(path.angle, angle);
  if (radius) (0, _setNumberOrNumberAccessor.default)(path.radius, radius);
  if (defined) path.defined(defined);
  if (curve) path.curve(curve);
  return path;
}
function stack(_ref) {
  let {
    keys,
    value,
    order,
    offset
  } = _ref;
  const path = (0, _d3Shape.stack)();
  if (keys) path.keys(keys);
  if (value) (0, _setNumberOrNumberAccessor.default)(path.value, value);
  if (order) path.order((0, _stackOrder.default)(order));
  if (offset) path.offset((0, _stackOffset.default)(offset));
  return path;
}