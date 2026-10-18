import { useMemo, Fragment } from 'react';
import getSplitLineSegments from '../util/getSplitLineSegments';
import { line } from '../util/D3ShapeFactories';
import LinePath from './LinePath';
import { jsx as _jsx } from "react/jsx-runtime";
const getX = d => d.x || 0;
const getY = d => d.y || 0;
export default function SplitLinePath(_ref) {
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
  const pointsInSegments = useMemo(() => {
    const xFn = typeof x === 'number' || typeof x === 'undefined' ? () => x : x;
    const yFn = typeof y === 'number' || typeof y === 'undefined' ? () => y : y;
    return segments.map(s => s.map((value, i) => ({
      x: xFn(value, i, s),
      y: yFn(value, i, s)
    })));
  }, [x, y, segments]);
  const pathString = useMemo(() => {
    const path = line({
      x,
      y,
      defined,
      curve
    });
    return path(segments.flat()) || '';
  }, [x, y, defined, curve, segments]);
  const splitLineSegments = useMemo(() => getSplitLineSegments({
    path: pathString,
    segmentation,
    pointsInSegments,
    sampleRate
  }), [pathString, segmentation, pointsInSegments, sampleRate]);
  return /*#__PURE__*/_jsx("g", {
    children: splitLineSegments.map((segment, index) => children ? /*#__PURE__*/_jsx(Fragment, {
      children: children({
        index,
        segment,
        styles: styles[index] || styles[index % styles.length]
      })
    }, index) : /*#__PURE__*/_jsx(LinePath, {
      className: className,
      data: segment,
      x: getX,
      y: getY,
      ...(styles[index] || styles[index % styles.length])
    }, index))
  });
}