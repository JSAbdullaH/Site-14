const { pointInPolygon, polygonWithin, findZone } = require('../src/utils/geo');
const { square } = require('./setup');

const zone = square(46.6, 24.7, 0.001);

describe('pointInPolygon', () => {
  test('a point well inside is inside', () => {
    expect(pointInPolygon(46.6, 24.7, zone)).toBe(true);
  });

  test('a point well outside is outside', () => {
    expect(pointInPolygon(46.7, 24.7, zone)).toBe(false);
    expect(pointInPolygon(46.6, 24.8, zone)).toBe(false);
  });

  test('a point exactly on an edge counts as inside', () => {
    expect(pointInPolygon(46.601, 24.7, zone)).toBe(true);
    expect(pointInPolygon(46.6, 24.699, zone)).toBe(true);
  });

  test('a point exactly on a corner counts as inside', () => {
    expect(pointInPolygon(46.599, 24.699, zone)).toBe(true);
    expect(pointInPolygon(46.601, 24.701, zone)).toBe(true);
  });

  test('a point oscillating across the edge flips cleanly each time', () => {
    const readings = [46.60099, 46.60101, 46.60099, 46.60101].map((lng) => pointInPolygon(lng, 24.7, zone));
    expect(readings).toEqual([true, false, true, false]);
  });

  test('float noise right on the edge does not flip the result', () => {
    expect(pointInPolygon(46.601 + 1e-9, 24.7, zone)).toBe(true);
  });

  test('works on a concave (L-shaped) polygon', () => {
    const l = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]] };
    expect(pointInPolygon(0.5, 1.5, l)).toBe(true);
    expect(pointInPolygon(1.5, 1.5, l)).toBe(false);
  });

  test('a point inside a hole is outside; on the hole edge is inside', () => {
    const ring = { type: 'Polygon', coordinates: [square(0, 0, 2).coordinates[0], square(0, 0, 1).coordinates[0]] };
    expect(pointInPolygon(0, 0, ring)).toBe(false);
    expect(pointInPolygon(1.5, 0, ring)).toBe(true);
    expect(pointInPolygon(1, 0, ring)).toBe(true);
  });

  test('a missing or malformed boundary is never a match', () => {
    expect(pointInPolygon(0, 0, null)).toBe(false);
    expect(pointInPolygon(0, 0, { type: 'Point', coordinates: [0, 0] })).toBe(false);
  });
});

describe('polygonWithin', () => {
  test('a zone inside the site is within it', () => {
    expect(polygonWithin(square(46.6, 24.7, 0.0005), zone)).toBe(true);
  });

  test('a zone crossing the site edge is not', () => {
    expect(polygonWithin(square(46.601, 24.7, 0.0005), zone)).toBe(false);
  });

  const lSite = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4], [0, 0]]] };

  test('a zone with every corner inside a concave site but cutting across its notch is not', () => {
    const across = { type: 'Polygon', coordinates: [[[1, 3], [3, 1], [3.5, 1.5], [1.5, 3.5], [1, 3]]] };
    expect(across.coordinates[0].every(([x, y]) => pointInPolygon(x, y, lSite))).toBe(true);
    expect(polygonWithin(across, lSite)).toBe(false);
  });

  test('a zone that fills one arm of a concave site is within it', () => {
    expect(polygonWithin({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]] }, lSite)).toBe(true);
  });

  test('a zone that swallows a hole in the site is not', () => {
    const holed = { type: 'Polygon', coordinates: [square(0, 0, 3).coordinates[0], square(0, 0, 0.5).coordinates[0]] };
    expect(polygonWithin(square(0, 0, 2), holed)).toBe(false);
    expect(polygonWithin(square(2, 2, 0.5), holed)).toBe(true);
  });
});

describe('findZone', () => {
  test('returns the first zone containing the point, or null', () => {
    const a = { id: 'a', boundary: square(46.6, 24.7, 0.0002) };
    const b = { id: 'b', boundary: square(46.6005, 24.7, 0.0002) };
    expect(findZone(46.6005, 24.7, [a, b])).toBe(b);
    expect(findZone(46.6009, 24.7009, [a, b])).toBeNull();
  });
});
