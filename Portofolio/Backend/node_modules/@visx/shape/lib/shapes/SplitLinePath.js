"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SplitLinePath;
var _react = require("react");
var _getSplitLineSegments = _interopRequireDefault(require("../util/getSplitLineSegments"));
var _D3ShapeFactories = require("../util/D3ShapeFactories");
var _LinePath = _interopRequireDefault(require("./LinePath"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const getX = d => d.x || 0;
const getY = d => d.y || 0;
function SplitLinePath(_ref) {
  let {
    children,
    className,
    curve,
    defined,
    segmentation,
    sampleRate,
    segments,
    x,
    y,
    styles
  } = _ref;
  // Convert data in all segments to points.
  const pointsInSegments = (0, _react.useMemo)(() => {
    const xFn = typeof x === 'number' || typeof x === 'undefined' ? () => x : x;
    const yFn = typeof y === 'number' || typeof y === 'undefined' ? () => y : y;
    return segments.map(s => s.map((value, i) => ({
      x: xFn(value, i, s),
      y: yFn(value, i, s)
    })));
  }, [x, y, segments]);
  const pathString = (0, _react.useMemo)(() => {
    const path = (0, _D3ShapeFactories.line)({
      x,
      y,
      defined,
      curve
    });
    return path(segments.flat()) || '';
  }, [x, y, defined, curve, segments]);
  const splitLineSegments = (0, _react.useMemo)(() => (0, _getSplitLineSegments.default)({
    path: pathString,
    segmentation,
    pointsInSegments,
    sampleRate
  }), [pathString, segmentation, pointsInSegments, sampleRate]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("g", {
    children: splitLineSegments.map((segment, index) => children ? /*#__PURE__*/(0, _jsxRuntime.jsx)(_react.Fragment, {
      children: children({
        index,
        segment,
        styles: styles[index] || styles[index % styles.length]
      })
    }, index) : /*#__PURE__*/(0, _jsxRuntime.jsx)(_LinePath.default, {
      className: className,
      data: segment,
      x: getX,
      y: getY,
      ...(styles[index] || styles[index % styles.length])
    }, index))
  });
}