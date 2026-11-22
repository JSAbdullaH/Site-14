const { findZone } = require('./geo');

const MINUTE = 60_000;
const RIYADH_OFFSET = 3 * 60 * MINUTE;
const OFFLINE_GAP_MINUTES = 15;

function todayInRiyadh(now = new Date()) {
  return new Date(now.getTime() + RIYADH_OFFSET).toISOString().slice(0, 10);
}

function dayRange(date) {
  const start = new Date(`${date}T00:00:00+03:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * MINUTE) };
}

function clockInRiyadh(at) {
  return at ? new Date(at.getTime() + RIYADH_OFFSET).toISOString().slice(11, 16) : null;
}

const minutesBetween = (from, to) => Math.max(0, Math.round((to - from) / MINUTE));

function zoneOf(reading, geofences) {
  const zone = findZone(reading.longitude, reading.latitude, geofences);
  return zone ? { id: zone.id, name: zone.name, is_outdoor: zone.isOutdoor } : null;
}

function walk(readings, geofences, endAt) {
  const segments = [];
  const gaps = [];
  const points = readings.map((r) => ({ ...r, zone: zoneOf(r, geofences) }));

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const next = points[i + 1];
    const until = next ? next.recordedAt : endAt;
    if (until && minutesBetween(point.recordedAt, until) > OFFLINE_GAP_MINUTES) {
      gaps.push({ from: point.recordedAt, to: until, minutes: minutesBetween(point.recordedAt, until), untilEnd: !next });
    }
    const covered = until && minutesBetween(point.recordedAt, until) <= OFFLINE_GAP_MINUTES ? until : point.recordedAt;
    const last = segments[segments.length - 1];
    const sameZone = last && (last.zone ? last.zone.id : null) === (point.zone ? point.zone.id : null);
    if (sameZone && last.to.getTime() === point.recordedAt.getTime()) {
      last.to = covered;
    } else {
      segments.push({ zone: point.zone, from: point.recordedAt, to: covered });
    }
  }
  return { points, segments, gaps };
}

function minutesByZone(segments) {
  const totals = new Map();
  for (const s of segments) {
    const key = s.zone ? s.zone.id : 'none';
    const row = totals.get(key) || { zone: s.zone, minutes: 0 };
    row.minutes += minutesBetween(s.from, s.to);
    totals.set(key, row);
  }
  const name = (r) => (r.zone ? r.zone.name : '\uffff');
  return [...totals.values()]
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || name(a).localeCompare(name(b)));
}

module.exports = {
  OFFLINE_GAP_MINUTES,
  todayInRiyadh,
  dayRange,
  clockInRiyadh,
  minutesBetween,
  walk,
  minutesByZone,
};
