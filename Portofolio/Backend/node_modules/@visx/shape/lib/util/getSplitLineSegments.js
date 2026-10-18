"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getSplitLineSegments;
var _getOrCreateMeasurementElement = _interopRequireDefault(require("./getOrCreateMeasurementElement"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const MEASUREMENT_ELEMENT_ID = '__visx_splitpath_svg_path_measurement_id';

/** Different algorithms to segment the line */

const TRUE = () => true;
function getSplitLineSegments(_ref) {
  let {
    path,
    pointsInSegments,
    segmentation = 'x',
    sampleRate = 1
  } = _ref;
  try {
    const pathElement = (0, _getOrCreateMeasurementElement.default)(MEASUREMENT_ELEMENT_ID);
    pathElement.setAttribute('d', path);
    const totalLength = pathElement.getTotalLength();
    const numSegments = pointsInSegments.length;
    const lineSegments = pointsInSegments.map(() => []);
    if (segmentation === 'x' || segmentation === 'y') {
      const segmentStarts = pointsInSegments.map(points => points.find(p => typeof p[segmentation] === 'number')?.[segmentation]);
      const first = pathElement.getPointAtLength(0);
      const last = pathElement.getPointAtLength(totalLength);
      const isIncreasing = last[segmentation] > first[segmentation];
      const isBeyondSegmentStart = isIncreasing ? segmentStarts.map(start => typeof start === 'undefined' ? TRUE : xOrY => xOrY >= start) : segmentStarts.map(start => typeof start === 'undefined' ? TRUE : xOrY => xOrY <= start);
      let currentSegment = 0;
      for (let distance = 0; distance <= totalLength; distance += sampleRate) {
        const sample = pathElement.getPointAtLength(distance);
        const position = sample[segmentation];
        // find the current segment to which this sample belongs
        while (currentSegment < numSegments - 1 && isBeyondSegmentStart[currentSegment + 1](position)) {
          currentSegment += 1;
        }
        // add sample to segment
        lineSegments[currentSegment].push(sample);
      }
    } else {
      // segmentation === "length"
      const numPointsInSegment = pointsInSegments.map(points => points.length);
      const numPoints = numPointsInSegment.reduce((sum, curr) => sum + curr, 0);
      const lengthBetweenPoints = totalLength / Math.max(1, numPoints - 1);
      const segmentStarts = numPointsInSegment.slice(0, numSegments - 1);
      segmentStarts.unshift(0);
      for (let i = 2; i < numSegments; i += 1) {
        segmentStarts[i] += segmentStarts[i - 1];
      }
      for (let i = 0; i < numSegments; i += 1) {
        segmentStarts[i] *= lengthBetweenPoints;
      }
      let currentSegment = 0;
      for (let distance = 0; distance <= totalLength; distance += sampleRate) {
        const sample = pathElement.getPointAtLength(distance);
        // find the current segment to which this sample belongs
        while (currentSegment < numSegments - 1 && distance >= segmentStarts[currentSegment + 1]) {
          currentSegment += 1;
        }
        // add sample to segment
        lineSegments[currentSegment].push(sample);
      }
    }
    return lineSegments;
  } catch (e) {
    console.warn(e);
    return [];
  }
}