const {
  pointInPolygon,
  polygonWithin,
  findZone,
  settleZone,
  settledInside,
  boundaryDistance,
  distanceMetres,
  implausibleJump,
  EXIT_MARGIN_CAP_M,
} = require('../src/utils/geo');
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

// Metres east of the zone's east edge (lng 46.601) at latitude 24.7. Negative is inside.
const M_PER_DEG_LNG = 111320 * Math.cos((24.7 * Math.PI) / 180);
const east = (metres) => 46.601 + metres / M_PER_DEG_LNG;

describe('boundaryDistance and distanceMetres', () => {
  test('is signed metres from the edge: negative inside, positive outside', () => {
    expect(boundaryDistance(east(20), 24.7, zone)).toBeCloseTo(20, 0);
    expect(boundaryDistance(east(-20), 24.7, zone)).toBeCloseTo(-20, 0);
  });

  test('a point in a hole is outside', () => {
    const holed = { type: 'Polygon', coordinates: [zone.coordinates[0], square(46.6, 24.7, 0.0002).coordinates[0]] };
    expect(boundaryDistance(46.6, 24.7, holed)).toBeGreaterThan(0);
  });

  test('a missing boundary is infinitely far', () => {
    expect(boundaryDistance(46.6, 24.7, null)).toBe(Infinity);
  });

  test('measures great-circle metres', () => {
    expect(distanceMetres({ latitude: 24.7, longitude: 46.6 }, { latitude: 24.701, longitude: 46.6 })).toBeCloseTo(111.2, 0);
  });
});

describe('settledInside', () => {
  test('without an accuracy it is the plain geometric test', () => {
    expect(settledInside(east(1), 24.7, zone, { wasInside: true })).toBe(false);
    expect(settledInside(east(-1), 24.7, zone, { wasInside: false })).toBe(true);
  });

  test('a worker inside stays inside while a reading is out by less than its accuracy', () => {
    expect(settledInside(east(8), 24.7, zone, { accuracy: 10, wasInside: true })).toBe(true);
    expect(settledInside(east(12), 24.7, zone, { accuracy: 10, wasInside: true })).toBe(false);
  });

  test('a worker outside enters only once a reading is in by its accuracy', () => {
    expect(settledInside(east(-3), 24.7, zone, { accuracy: 5, wasInside: false })).toBe(false);
    expect(settledInside(east(-7), 24.7, zone, { accuracy: 5, wasInside: false })).toBe(true);
  });

  test('a rough fix holds the state by at most the cap', () => {
    expect(settledInside(east(EXIT_MARGIN_CAP_M + 2), 24.7, zone, { accuracy: 140, wasInside: true })).toBe(false);
  });
});

describe('settleZone', () => {
  const a = { id: 'a', boundary: square(46.6, 24.7, 0.0002) };
  const b = { id: 'b', boundary: square(46.6004, 24.7, 0.0002) };
  const lng = (m) => 46.6002 + m / M_PER_DEG_LNG; // metres east of the shared edge

  test('jitter across a shared edge keeps the current zone', () => {
    expect(settleZone(lng(4), 24.7, [a, b], a, 8)).toBe(a);
    expect(settleZone(lng(-4), 24.7, [a, b], b, 8)).toBe(b);
  });

  test('moves to the next zone once clearly in it', () => {
    expect(settleZone(lng(10), 24.7, [a, b], a, 8)).toBe(b);
  });

  test('without an accuracy it matches findZone', () => {
    expect(settleZone(lng(1), 24.7, [a, b], a)).toBe(findZone(lng(1), 24.7, [a, b]));
  });
});

describe('implausibleJump', () => {
  const at = (s) => new Date(Date.UTC(2026, 10, 4, 9, 0, s));
  const prev = { latitude: 24.7, longitude: 46.6, recorded_at: at(0), accuracy_m: 5 };

  test('a walk or a drive across the site is plausible', () => {
    expect(implausibleJump(prev, { latitude: 24.7001, longitude: 46.6, recorded_at: at(5), accuracy_m: 5 })).toBe(false);
    expect(implausibleJump(prev, { latitude: 24.702, longitude: 46.6, recorded_at: at(10), accuracy_m: 5 })).toBe(false);
  });

  test('a kilometre in five seconds is a glitch', () => {
    expect(implausibleJump(prev, { latitude: 24.709, longitude: 46.6, recorded_at: at(5), accuracy_m: 5 })).toBe(true);
  });

  test('after a long gap any move is believed', () => {
    expect(implausibleJump(prev, { latitude: 24.8, longitude: 46.6, recorded_at: at(300) })).toBe(false);
  });

  test('without a previous reading nothing is a jump', () => {
    expect(implausibleJump(null, prev)).toBe(false);
  });
});
