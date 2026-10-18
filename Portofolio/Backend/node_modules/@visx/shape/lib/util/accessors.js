"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getFirstItem = getFirstItem;
exports.getSecondItem = getSecondItem;
exports.getSource = getSource;
exports.getTarget = getTarget;
exports.getX = getX;
exports.getY = getY;
function getX(l) {
  return typeof l?.x === 'number' ? l?.x : 0;
}
function getY(l) {
  return typeof l?.y === 'number' ? l?.y : 0;
}
function getSource(l) {
  return l?.source;
}
function getTarget(l) {
  return l?.target;
}
function getFirstItem(d) {
  return d?.[0];
}
function getSecondItem(d) {
  return d?.[1];
}