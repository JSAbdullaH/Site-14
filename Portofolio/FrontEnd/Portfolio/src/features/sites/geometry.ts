import type { LatLng } from "@/features/map/types";

// Plane geometry for a site perimeter. A site is at most a few kilometres across, so an
// equirectangular projection around its centre is accurate to well under 1 %.

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

type XY = { x: number; y: number };

function project(points: LatLng[]): XY[] {
  if (!points.length) return [];
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng0 = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const kx = Math.cos(lat0 * RAD) * RAD * EARTH_RADIUS_M;
  const ky = RAD * EARTH_RADIUS_M;
  return points.map((p) => ({ x: (p.lng - lng0) * kx, y: (p.lat - lat0) * ky }));
}

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Enclosed area in square metres (0 for fewer than three corners). */
export function areaM2(corners: LatLng[]): number {
  if (corners.length < 3) return 0;
  const p = project(corners);
  let twice = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Length of the closed outline in metres. */
export function perimeterM(corners: LatLng[]): number {
  if (corners.length < 2) return 0;
  const p = project(corners);
  const closed = corners.length >= 3;
  let total = 0;
  for (let i = 0; i < p.length - (closed ? 0 : 1); i += 1) total += dist(p[i], p[(i + 1) % p.length]);
  return total;
}

function orient(a: XY, b: XY, c: XY) {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}

function onSegment(a: XY, b: XY, p: XY) {
  return Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;
}

function segmentsTouch(a: XY, b: XY, c: XY, d: XY) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d)) || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b));
}

function crossesXY(p: XY[]) {
  const n = p.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // Edges that share a corner always touch there.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsTouch(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** True when the closed outline crosses or touches itself, so it has no single inside. */
export function selfIntersects(corners: LatLng[]): boolean {
  return crossesXY(project(corners));
}

/**
 * Adds a corner where it keeps the outline simple. Clicking around the site in order appends,
 * as before; a corner clicked out of order goes into the edge that it lengthens least without
 * making the outline cross itself, so the shape is right whatever the order of the clicks.
 */
export function addCorner(corners: LatLng[], point: LatLng): LatLng[] {
  if (corners.length < 3) return [...corners, point];
  const appended = [...corners, point];
  if (!selfIntersects(appended)) return appended;

  const p = project(appended);
  const q = p[p.length - 1];
  let best: LatLng[] | null = null;
  let bestCost = Infinity;
  for (let i = 0; i < corners.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % corners.length];
    const cost = dist(a, q) + dist(q, b) - dist(a, b);
    if (cost >= bestCost) continue;
    const next = [...corners.slice(0, i + 1), point, ...corners.slice(i + 1)];
    if (selfIntersects(next)) continue;
    best = next;
    bestCost = cost;
  }
  return best ?? appended;
}

/** The same corners, ordered around their centre: a simple outline for any convex or star-shaped site. */
export function orderAroundCentre(corners: LatLng[]): LatLng[] {
  const p = project(corners);
  return corners
    .map((c, i) => ({ c, angle: Math.atan2(p[i].y, p[i].x) }))
    .sort((a, b) => a.angle - b.angle)
    .map((x) => x.c);
}

export function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

export function formatLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m).toLocaleString()} m`;
}
