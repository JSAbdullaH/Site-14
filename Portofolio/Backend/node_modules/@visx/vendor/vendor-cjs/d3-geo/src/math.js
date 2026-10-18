"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.abs = void 0;
exports.acos = acos;
exports.asin = asin;
exports.halfPi = exports.floor = exports.exp = exports.epsilon2 = exports.epsilon = exports.degrees = exports.cos = exports.ceil = exports.atan2 = exports.atan = void 0;
exports.haversin = haversin;
exports.tau = exports.tan = exports.sqrt = exports.sin = exports.sign = exports.radians = exports.quarterPi = exports.pow = exports.pi = exports.log = exports.hypot = void 0;
var epsilon = exports.epsilon = 1e-6;
var epsilon2 = exports.epsilon2 = 1e-12;
var pi = exports.pi = Math.PI;
var halfPi = exports.halfPi = pi / 2;
var quarterPi = exports.quarterPi = pi / 4;
var tau = exports.tau = pi * 2;
var degrees = exports.degrees = 180 / pi;
var radians = exports.radians = pi / 180;
var abs = exports.abs = Math.abs;
var atan = exports.atan = Math.atan;
var atan2 = exports.atan2 = Math.atan2;
var cos = exports.cos = Math.cos;
var ceil = exports.ceil = Math.ceil;
var exp = exports.exp = Math.exp;
var floor = exports.floor = Math.floor;
var hypot = exports.hypot = Math.hypot;
var log = exports.log = Math.log;
var pow = exports.pow = Math.pow;
var sin = exports.sin = Math.sin;
var sign = exports.sign = Math.sign || function (x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
};
var sqrt = exports.sqrt = Math.sqrt;
var tan = exports.tan = Math.tan;
function acos(x) {
  return x > 1 ? 0 : x < -1 ? pi : Math.acos(x);
}
function asin(x) {
  return x > 1 ? halfPi : x < -1 ? -halfPi : Math.asin(x);
}
function haversin(x) {
  return (x = sin(x / 2)) * x;
}