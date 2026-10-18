"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = localPoint;
var _localPointGeneric = _interopRequireDefault(require("./localPointGeneric"));
var _typeGuards = require("./typeGuards");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/** Handles two signatures for backwards compatibility. */
function localPoint(nodeOrEvent, maybeEvent) {
  // localPoint(node, event)
  if ((0, _typeGuards.isElement)(nodeOrEvent) && maybeEvent) {
    return (0, _localPointGeneric.default)(nodeOrEvent, maybeEvent);
  }
  // localPoint(event)
  if ((0, _typeGuards.isEvent)(nodeOrEvent)) {
    const event = nodeOrEvent;
    const node = event.target;
    if (node) return (0, _localPointGeneric.default)(node, event);
  }
  return null;
}