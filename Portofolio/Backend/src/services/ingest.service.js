const { prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { sha256, safeEqual } = require('../utils/tokens');
const { pointInPolygon, findZone } = require('../utils/geo');
const { OFFLINE_GAP_MINUTES } = require('../utils/day');
const presence = require('./presence.service');

const SECOND = 1000;

const MAX_CLOCK_AHEAD_SECONDS = 120;
const MAX_READING_AGE_HOURS = 24;
const MIN_READING_INTERVAL_SECONDS = 3;

const unauthenticated = () => new AppError(401, 'DEVICE_UNAUTHENTICATED', 'Unknown device or wrong key');

const DUMMY_HASH = sha256('no-such-device');

async function authenticate(serial, key) {
  if (!serial || !key) throw unauthenticated();
  const device = await prisma.device.findUnique({
    where: { serialNumber: String(serial).trim().toUpperCase() },
    select: { id: true, companyId: true, serialNumber: true, apiKeyHash: true, isActive: true },
  });
  const matches = safeEqual(sha256(String(key)), device ? device.apiKeyHash : DUMMY_HASH);
  if (!device || !matches) throw unauthenticated();
  if (!device.isActive) throw new AppError(403, 'DEVICE_INACTIVE', 'This device is deactivated');
  return { id: device.id, companyId: device.companyId, serialNumber: device.serialNumber };
}

function refusal(d) {
  const e = d.employee;
  if (!e) return new AppError(409, 'DEVICE_UNASSIGNED', 'This device is not assigned to an employee. Readings are not stored.');
  if (!e.consentGivenAt) return new AppError(409, 'NO_CONSENT', 'The wearer has not consented to tracking. Readings are not stored.');
  if (!e.site || !e.site.isActive) return new AppError(409, 'NO_SITE', 'The wearer is not assigned to an active site. Readings are not stored.');
  return null;
}

async function lastReadingOf(tx, session) {
  const last = await tx.telemetryLog.findFirst({
    where: { sessionId: session.id },
    orderBy: { recordedAt: 'desc' },
    select: { recordedAt: true },
  });
  return last ? last.recordedAt : session.startedAt;
}

function check(reading, now, newest) {
  const at = reading.recorded_at;
  if (at - now > MAX_CLOCK_AHEAD_SECONDS * SECOND) return 'clock_ahead';
  if (now - at > MAX_READING_AGE_HOURS * 3600 * SECOND) return 'too_old';
  if (newest && at <= newest) return 'duplicate';
  return null;
}

async function currentZone(tx, employeeId, session, zones) {
  if (!session) return null;
  const state = await tx.employeeCurrentState.findUnique({
    where: { employeeId },
    select: { sessionId: true, geofenceId: true },
  });
  if (!state || state.sessionId !== session.id || !state.geofenceId) return null;
  return zones.find((z) => z.id === state.geofenceId) || null;
}

async function apply(tx, d, readings, now) {
  const employee = d.employee;
  const site = employee.site;
  const zones = site.geofences;
  const zoned = zones.length > 0;
  const result = { accepted: 0, duplicates: 0, throttled: 0, rejected: [], stored: 0 };
  const events = [];

  const event = (eventType, at, point, extra = {}) =>
    events.push({
      companyId: d.companyId,
      employeeId: employee.id,
      siteId: site.id,
      deviceId: d.id,
      eventType,
      latitude: point ? point.latitude : null,
      longitude: point ? point.longitude : null,
      occurredAt: at,
      ...extra,
    });

  let session = await tx.workSession.findFirst({
    where: { employeeId: employee.id, endedAt: null },
    select: { id: true, siteId: true, startedAt: true },
  });
  let lastOnSite = session ? await lastReadingOf(tx, session) : null;
  if (session && session.siteId !== site.id) {
    await tx.workSession.update({ where: { id: session.id }, data: { endedAt: lastOnSite } });
    await presence.resolveZoneAlert(tx, session.id, lastOnSite);
    session = null;
  }

  let zone = await currentZone(tx, employee.id, session, zones);
  let newest = d.lastRecordedAt;
  let latest = null;
  const rows = [];

  const sorted = readings.map((r, index) => ({ ...r, index })).sort((a, b) => a.recorded_at - b.recorded_at);
  for (const r of sorted) {
    const problem = check(r, now, newest);
    if (problem === 'duplicate') {
      result.duplicates += 1;
      continue;
    }
    if (problem) {
      result.rejected.push({ index: r.index, recorded_at: r.recorded_at.toISOString(), reason: problem });
      continue;
    }

    const onSite = pointInPolygon(r.longitude, r.latitude, site.boundary);
    const crossing = onSite !== Boolean(session);
    if (!crossing && newest && r.recorded_at - newest < MIN_READING_INTERVAL_SECONDS * SECOND) {
      result.throttled += 1;
      continue;
    }

    if (onSite && !session) {
      session = await tx.workSession.create({
        data: { companyId: d.companyId, employeeId: employee.id, siteId: site.id, deviceId: d.id, startedAt: r.recorded_at },
        select: { id: true, siteId: true, startedAt: true },
      });
      zone = null;
      event('site_enter', r.recorded_at, r);
    } else if (!onSite && session) {
      const silent = r.recorded_at - lastOnSite > OFFLINE_GAP_MINUTES * 60 * SECOND;
      const endedAt = silent ? lastOnSite : r.recorded_at;
      await tx.workSession.update({ where: { id: session.id }, data: { endedAt } });
      await presence.resolveZoneAlert(tx, session.id, endedAt);
      event('site_exit', endedAt, r, zone ? { geofenceId: zone.id, zoneName: zone.name } : {});
      session = null;
      zone = null;
    }

    if (onSite) {
      const next = zoned ? findZone(r.longitude, r.latitude, zones) : null;
      if (zoned && (next ? next.id : null) !== (zone ? zone.id : null)) {
        if (next) {
          await presence.resolveZoneAlert(tx, session.id, r.recorded_at);
          event('zone_enter', r.recorded_at, r, { geofenceId: next.id, zoneName: next.name, fromZoneName: zone ? zone.name : null });
        } else {
          const alertId = await presence.openZoneAlert(tx, session.id, zone, r);
          event('zone_exit', r.recorded_at, r, { geofenceId: zone.id, zoneName: zone.name, alertId });
        }
        zone = next;
      }

      rows.push({
        sessionId: session.id,
        latitude: r.latitude,
        longitude: r.longitude,
        batteryPercent: r.battery_percent ?? null,
        heartRateBpm: r.heart_rate_bpm ?? null,
        recordedAt: r.recorded_at,
        receivedAt: now,
      });
      lastOnSite = r.recorded_at;
    }
    newest = r.recorded_at;
    latest = { ...r, onSite };
    result.accepted += 1;
  }

  if (rows.length) {
    result.stored = (await tx.telemetryLog.createMany({ data: rows, skipDuplicates: true })).count;
  }

  if (latest) {
    const battery = latest.battery_percent ?? null;
    if (latest.onSite) {
      const state = {
        sessionId: session.id,
        geofenceId: zone ? zone.id : null,
        latitude: latest.latitude,
        longitude: latest.longitude,
        batteryPercent: battery,
        heartRateBpm: latest.heart_rate_bpm ?? null,
        recordedAt: latest.recorded_at,
      };
      await tx.employeeCurrentState.upsert({
        where: { employeeId: employee.id },
        create: { employeeId: employee.id, ...state },
        update: state,
      });
    } else {
      await tx.employeeCurrentState.updateMany({
        where: { employeeId: employee.id },
        data: { sessionId: null, geofenceId: null, batteryPercent: battery, heartRateBpm: null, recordedAt: latest.recorded_at },
      });
    }
  }

  if (events.length) await tx.presenceEvent.createMany({ data: events });

  let status = 'off_site';
  if (session) status = zone ? 'in_zone' : 'on_site';
  const outOfZone = Boolean(session && zoned && !zone);

  return {
    result,
    newest,
    session,
    status,
    outOfZone,
    zone,
    events: events.map((e) => e.eventType),
    battery: latest ? latest.battery_percent ?? undefined : undefined,
  };
}

async function ingest(device, { sent_at: sentAt, readings }) {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM devices WHERE id = ${device.id}::uuid FOR UPDATE`;
    const now = new Date();
    const clockOffsetSeconds = sentAt ? Math.round((now - sentAt) / SECOND) : undefined;

    const d = await tx.device.findUnique({
      where: { id: device.id },
      select: {
        id: true,
        companyId: true,
        lastRecordedAt: true,
        employee: {
          select: {
            id: true,
            consentGivenAt: true,
            site: {
              select: {
                id: true,
                isActive: true,
                boundary: true,
                geofences: { where: { isActive: true }, select: { id: true, name: true, boundary: true } },
              },
            },
          },
        },
      },
    });

    const seen = { lastSeenAt: now, ...(clockOffsetSeconds !== undefined && { clockOffsetSeconds }) };
    await presence.backOnline(tx, d.id, now);
    const refused = refusal(d);
    if (refused) {
      await tx.device.update({ where: { id: d.id }, data: seen });
      return { refused };
    }

    const { result, newest, session, status, outOfZone, zone, events, battery } = await apply(tx, d, readings, now);
    await tx.device.update({
      where: { id: d.id },
      data: { ...seen, lastRecordedAt: newest, ...(battery !== undefined && { lastBatteryPercent: battery }) },
    });

    return {
      body: {
        server_time: now.toISOString(),
        clock_offset_seconds: clockOffsetSeconds ?? null,
        ...result,
        location_status: status,
        out_of_zone: outOfZone,
        zone: zone ? { id: zone.id, name: zone.name } : null,
        events,
        session: session ? { id: String(session.id), started_at: session.startedAt.toISOString() } : null,
      },
    };
  });

  if (outcome.refused) throw outcome.refused;
  return outcome.body;
}

async function heartbeat(device, { battery_percent: battery }) {
  const now = new Date();
  const d = await prisma.$transaction(async (tx) => {
    await presence.backOnline(tx, device.id, now);
    return tx.device.update({
      where: { id: device.id },
      data: { lastSeenAt: now, ...(battery !== undefined && { lastBatteryPercent: battery }) },
      select: {
        serialNumber: true,
        name: true,
        deviceType: true,
        company: { select: { name: true } },
        employee: {
          select: {
            fullName: true,
            consentGivenAt: true,
            site: { select: { name: true, isActive: true } },
          },
        },
      },
    });
  });
  const refused = refusal(d);
  const site = d.employee && d.employee.site;
  return {
    server_time: now.toISOString(),
    device: { serial_number: d.serialNumber, name: d.name, device_type: d.deviceType },
    company_name: d.company.name,
    wearer: d.employee ? { full_name: d.employee.fullName } : null,
    site: site && site.isActive ? { name: site.name } : null,
    ready: !refused,
    reason: refused ? refused.code : null,
  };
}

module.exports = {
  authenticate,
  ingest,
  heartbeat,
  MAX_CLOCK_AHEAD_SECONDS,
  MAX_READING_AGE_HOURS,
  MIN_READING_INTERVAL_SECONDS,
};
