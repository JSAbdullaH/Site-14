"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = setNumberOrNumberAccessor;
/**
 * This is a workaround for TypeScript not inferring the correct
 * method overload/signature for some d3 shape methods.
 */
function setNumberOrNumberAccessor(func, value) {
  if (typeof value === 'number') func(value);else func(value);
}