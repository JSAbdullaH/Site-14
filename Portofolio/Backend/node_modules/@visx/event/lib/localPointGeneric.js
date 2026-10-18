"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = localPoint;
var _point = require("@visx/point");
var _typeGuards = require("./typeGuards");
var _getXAndYFromEvent = _interopRequireDefault(require("./getXAndYFromEvent"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function localPoint(node, event) {
  if (!node || !event) return null;
  const coords = (0, _getXAndYFromEvent.default)(event);

  // find top-most SVG
  const svg = (0, _typeGuards.isSVGElement)(node) ? node.ownerSVGElement : node;
  const screenCTM = (0, _typeGuards.isSVGGraphicsElement)(svg) ? svg.getScreenCTM() : null;
  if ((0, _typeGuards.isSVGSVGElement)(svg) && screenCTM) {
    let point = svg.createSVGPoint();
    point.x = coords.x;
    point.y = coords.y;
    point = point.matrixTransform(screenCTM.inverse());
    return new _point.Point({
      x: point.x,
      y: point.y
    });
  }

  // fall back to bounding box
  const rect = node.getBoundingClientRect();
  return new _point.Point({
    x: coords.x - rect.left - node.clientLeft,
    y: coords.y - rect.top - node.clientTop
  });
}