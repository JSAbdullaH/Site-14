const EPSILON = 1e-7;

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

function pointInPolygon(longitude, latitude, polygon) {
  if (!polygon || polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) return false;
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || ringPosition(longitude, latitude, outer) === 'outside') return false;
  return holes.every((hole) => ringPosition(longitude, latitude, hole) !== 'inside');
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

function findZone(longitude, latitude, geofences) {
  return geofences.find((g) => pointInPolygon(longitude, latitude, g.boundary)) || null;
}

module.exports = { pointInPolygon, polygonWithin, findZone, EPSILON };
