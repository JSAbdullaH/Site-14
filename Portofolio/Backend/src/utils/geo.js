const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const turfDistance = require('@turf/distance').default;
const { pointToPolygonDistance } = require('@turf/point-to-polygon-distance');

const EPSILON = 1e-7;
// Float noise in stored coordinates (46.6 - 0.001 is 46.599000000000004) must not move a point
// off an edge. 2 cm is far below GPS precision.
const EDGE_TOLERANCE_M = 0.02;

const isPolygon = (polygon) =>
  Boolean(polygon && polygon.type === 'Polygon' && Array.isArray(polygon.coordinates) && polygon.coordinates[0]);

// A point on the boundary of a site or zone counts as inside it, also on the edge of a hole.
function pointInPolygon(longitude, latitude, polygon) {
  if (!isPolygon(polygon)) return false;
  if (booleanPointInPolygon([longitude, latitude], polygon)) return true;
  return pointToPolygonDistance([longitude, latitude], polygon, { units: 'meters' }) <= EDGE_TOLERANCE_M;
}

// Great-circle distance in metres between two { latitude, longitude } points.
function distanceMetres(a, b) {
  return turfDistance([a.longitude, a.latitude], [b.longitude, b.latitude], { units: 'meters' });
}

// Metres from the point to the nearest edge of the polygon: negative inside, positive outside
// (a point in a hole is outside). Infinity for a missing or malformed polygon.
function boundaryDistance(longitude, latitude, polygon) {
  if (!isPolygon(polygon)) return Infinity;
  return pointToPolygonDistance([longitude, latitude], polygon, { units: 'meters' });
}

// GPS jitter near an edge must not flip a worker between inside and outside. A reading changes what
// we believe only when it is past the edge by its accuracy radius, capped so that a rough fix does
// not hold someone in place for long. Leaving needs more certainty than entering: a false exit ends
// a session or raises an out-of-zone alert, a late entry only starts the session a few seconds late.
const ENTER_MARGIN_CAP_M = 10;
const EXIT_MARGIN_CAP_M = 25;

function margin(accuracy, wasInside) {
  if (accuracy === null || accuracy === undefined) return 0;
  return Math.min(Math.max(accuracy, 0), wasInside ? EXIT_MARGIN_CAP_M : ENTER_MARGIN_CAP_M);
}

// Whether a reading puts the wearer inside the polygon, given where they were before.
// Without an accuracy it is the plain geometric test.
function settledInside(longitude, latitude, polygon, { accuracy, wasInside = false } = {}) {
  const m = margin(accuracy, wasInside);
  if (m === 0) return pointInPolygon(longitude, latitude, polygon);
  const d = boundaryDistance(longitude, latitude, polygon);
  return wasInside ? d <= m : d <= -m;
}

function findZone(longitude, latitude, geofences) {
  return geofences.find((g) => pointInPolygon(longitude, latitude, g.boundary)) || null;
}

// The zone a reading puts the wearer in. The current zone is kept until the reading is clearly out of it.
function settleZone(longitude, latitude, geofences, current, accuracy) {
  if (current && settledInside(longitude, latitude, current.boundary, { accuracy, wasInside: true })) return current;
  return (
    geofences.find((g) => g !== current && settledInside(longitude, latitude, g.boundary, { accuracy, wasInside: false })) ||
    null
  );
}

// Faster than any worker moves, vehicles on site included: 50 m/s is 180 km/h.
const MAX_SPEED_MPS = 50;
// After this long a large move is believable: the device may have been off, or driven elsewhere.
const JUMP_WINDOW_SECONDS = 120;
// Assumed accuracy for a reading that does not report one.
const DEFAULT_ACCURACY_M = 20;

// A reading too far from the previous accepted one for the time between them is a GPS glitch
// (a multipath bounce or a cell-tower fix). Both accuracy radii are allowed for before deciding.
function implausibleJump(previous, reading) {
  if (!previous) return false;
  const seconds = (reading.recorded_at - previous.recorded_at) / 1000;
  if (seconds <= 0 || seconds > JUMP_WINDOW_SECONDS) return false;
  const slack = (previous.accuracy_m ?? DEFAULT_ACCURACY_M) + (reading.accuracy_m ?? DEFAULT_ACCURACY_M);
  return distanceMetres(previous, reading) - slack > MAX_SPEED_MPS * seconds;
}

// ---------------------------------------------------------------- polygon inside polygon
// Kept on planar geometry: zones are a few hundred metres across, where planar and geodesic
// answers agree, and Turf's booleanWithin does not handle holes in the outer polygon.

function onSegment(px, py, [ax, ay], [bx, by]) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  const length = Math.hypot(bx - ax, by - ay);
  if (length === 0) return Math.hypot(px - ax, py - ay) <= EPSILON;
  if (Math.abs(cross) / length > EPSILON) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  return dot >= -EPSILON && dot <= length * length + EPSILON;
}

function ringPosition(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (onSegment(px, py, ring[j], ring[i])) return 'edge';
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

function orientation([ax, ay], [bx, by], [cx, cy]) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(v) <= EPSILON * EPSILON) return 0;
  return v > 0 ? 1 : -1;
}

function segmentsCross(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

const edges = (ring) => ring.slice(0, -1).map((p, i) => [p, ring[i + 1]]);

function polygonWithin(inner, outer) {
  const ring = inner.coordinates[0];
  const innerEdges = edges(ring);
  const outerEdges = outer.coordinates.flatMap(edges);
  const holes = outer.coordinates.slice(1);

  const pointsInside = ring.every(([lng, lat]) => pointInPolygon(lng, lat, outer));
  const midpointsInside = innerEdges.every(([[ax, ay], [bx, by]]) => pointInPolygon((ax + bx) / 2, (ay + by) / 2, outer));
  const noCrossing = innerEdges.every(([a, b]) => outerEdges.every(([c, d]) => !segmentsCross(a, b, c, d)));
  const noHoleInside = holes.every((hole) =>
    hole.every(([lng, lat]) => ringPosition(lng, lat, ring) !== 'inside'),
  );
  return pointsInside && midpointsInside && noCrossing && noHoleInside;
}

module.exports = {
  pointInPolygon,
  polygonWithin,
  findZone,
  settleZone,
  settledInside,
  boundaryDistance,
  distanceMetres,
  implausibleJump,
  EPSILON,
  ENTER_MARGIN_CAP_M,
  EXIT_MARGIN_CAP_M,
  MAX_SPEED_MPS,
  JUMP_WINDOW_SECONDS,
};
