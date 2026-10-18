"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.STACK_ORDER_NAMES = exports.STACK_ORDERS = void 0;
exports.default = stackOrder;
var _d3Shape = require("@visx/vendor/d3-shape");
const STACK_ORDERS = exports.STACK_ORDERS = {
  ascending: _d3Shape.stackOrderAscending,
  descending: _d3Shape.stackOrderDescending,
  insideout: _d3Shape.stackOrderInsideOut,
  none: _d3Shape.stackOrderNone,
  reverse: _d3Shape.stackOrderReverse
};
const STACK_ORDER_NAMES = exports.STACK_ORDER_NAMES = Object.keys(STACK_ORDERS);
function stackOrder(order) {
  return order && STACK_ORDERS[order] || STACK_ORDERS.none;
}