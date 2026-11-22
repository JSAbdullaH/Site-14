const { checkDate, findEmployee, loadDay } = require('./record.service');

const ORDER = { arrived: 0, back_online: 1, left_zone: 2, entered_zone: 3, offline: 4, left_site: 5 };

function eventsOf(session) {
  const { segments, gaps } = session.walk;
  const zoneId = (s) => (s && s.zone ? s.zone.id : null);
  const events = [{ type: 'arrived', at: session.startedAt, zone: null }];

  segments.forEach((seg, i) => {
    if (!seg.zone) return;
    const prev = segments[i - 1];
    const next = segments[i + 1];
    if (zoneId(prev) !== seg.zone.id) events.push({ type: 'entered_zone', at: seg.from, zone: seg.zone });
    const leaves = next ? zoneId(next) !== seg.zone.id : Boolean(session.endedAt);
    if (leaves) events.push({ type: 'left_zone', at: seg.to, zone: seg.zone });
  });

  for (const gap of gaps) {
    events.push({ type: 'offline', at: gap.from, zone: null, minutes: gap.minutes });
    if (!gap.untilEnd) events.push({ type: 'back_online', at: gap.to, zone: null });
  }
  if (session.endedAt) events.push({ type: 'left_site', at: session.endedAt, zone: null });

  return events
    .sort((a, b) => a.at - b.at || ORDER[a.type] - ORDER[b.type])
    .map((e) => ({
      type: e.type,
      at: e.at.toISOString(),
      zone: e.zone ? { id: e.zone.id, name: e.zone.name } : null,
      site: session.site.name,
      ...(e.minutes !== undefined && { minutes: e.minutes }),
    }));
}

async function history(auth, employeeId, date) {
  checkDate(date);
  await findEmployee(auth.db, employeeId);
  const sessions = await loadDay(auth.db, employeeId, date);
  const siteIds = [...new Set(sessions.map((s) => s.site.id))];
  const [sites, zones] = siteIds.length
    ? await Promise.all([
      auth.db.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true, boundary: true } }),
      auth.db.geofence.findMany({
        where: { siteId: { in: siteIds } },
        select: { id: true, siteId: true, name: true, isOutdoor: true, boundary: true },
      }),
    ])
    : [[], []];

  return {
    employee_id: employeeId,
    date,
    sites,
    zones: zones.map((z) => ({ id: z.id, site_id: z.siteId, name: z.name, is_outdoor: z.isOutdoor, boundary: z.boundary })),
    sessions: sessions.map((s) => ({
      session_id: String(s.id),
      site: s.site,
      started_at: s.startedAt.toISOString(),
      ended_at: s.endedAt ? s.endedAt.toISOString() : null,
      points: s.walk.points.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        recorded_at: p.recordedAt.toISOString(),
        battery_percent: p.batteryPercent,
        zone_id: p.zone ? p.zone.id : null,
      })),
      gaps: s.walk.gaps.map((g) => ({ from: g.from.toISOString(), to: g.to.toISOString(), minutes: g.minutes, until_end: g.untilEnd })),
      events: eventsOf(s),
    })),
  };
}

module.exports = { history };
