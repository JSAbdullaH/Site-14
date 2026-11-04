const { prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { sha256, safeEqual } = require('../utils/tokens');
const { pointInPolygon, findZone } = require('../utils/geo');
const { OFFLINE_GAP_MINUTES } = require('../utils/day');

const SECOND = 1000;

// A device clock may run this far ahead of the server. Further ahead, the reading
// would block every real reading after it (readings must get newer), so it is refused.
const MAX_CLOCK_AHEAD_SECONDS = 120;
// Older readings would reopen days that are already reported.
const MAX_READING_AGE_HOURS = 24;
// Closer readings add nothing to the hours or the path, so they are dropped.
const MIN_READING_INTERVAL_SECONDS = 3;

const unauthenticated = () => new AppError(401, 'DEVICE_UNAUTHENTICATED', 'Unknown device or wrong key');

const DUMMY_HASH = sha256('no-such-device');

async function authenticate(serial, key) {
  if (!serial || !key) throw unauthenticated();
  const device = await prisma.device.findUnique({
    where: { serialNumber: String(serial).trim().toUpperCase() },
    select: { id: true, companyId: true, serialNumber: true, apiKeyHash: true, isActive: true },
  });
  // Hash even for an unknown serial, so the answer takes the same time either way.
  const matches = safeEqual(sha256(String(key)), device ? device.apiKeyHash : DUMMY_HASH);
  if (!device || !matches) throw unauthenticated();
  if (!device.isActive) throw new AppError(403, 'DEVICE_INACTIVE', 'This device is deactivated');
  return { id: device.id, companyId: device.companyId, serialNumber: device.serialNumber };
}

// Refusals that concern the whole batch. Nothing is stored, and the device must not retry.
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

async function apply(tx, d, readings, now) {
  const employee = d.employee;
  const site = employee.site;
  const result = { accepted: 0, duplicates: 0, throttled: 0, rejected: [], stored: 0 };

  let session = await tx.workSession.findFirst({
    where: { employeeId: employee.id, endedAt: null },
    select: { id: true, siteId: true, startedAt: true },
  });
  let lastOnSite = session ? await lastReadingOf(tx, session) : null;
  // The wearer was moved to another site during a shift: that shift ended at its last reading.
  if (session && session.siteId !== site.id) {
    await tx.workSession.update({ where: { id: session.id }, data: { endedAt: lastOnSite } });
    session = null;
  }

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
    } else if (!onSite && session) {
      // A device that went silent on site and is next heard outside: the time it was
      // not heard is not counted as work. The shift ends at its last reading on site.
      const silent = r.recorded_at - lastOnSite > OFFLINE_GAP_MINUTES * 60 * SECOND;
      await tx.workSession.update({ where: { id: session.id }, data: { endedAt: silent ? lastOnSite : r.recorded_at } });
      session = null;
    }

    // Only positions on the site are kept. Outside it, the wearer is off duty.
    if (onSite) {
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
    // The unique (session_id, recorded_at) index is the last guard against a reading stored twice.
    result.stored = (await tx.telemetryLog.createMany({ data: rows, skipDuplicates: true })).count;
  }

  if (latest) {
    const battery = latest.battery_percent ?? null;
    if (latest.onSite) {
      const zone = findZone(latest.longitude, latest.latitude, site.geofences);
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
      // Off site: the map keeps the last position on site, and no heart rate is kept.
      await tx.employeeCurrentState.updateMany({
        where: { employeeId: employee.id },
        data: { sessionId: null, geofenceId: null, batteryPercent: battery, heartRateBpm: null, recordedAt: latest.recorded_at },
      });
    }
  }

  const state = await tx.employeeCurrentState.findUnique({
    where: { employeeId: employee.id },
    select: { geofenceId: true },
  });
  let status = 'off_site';
  if (session) status = state && state.geofenceId ? 'in_zone' : 'on_site';

  return { result, newest, session, status };
}

async function ingest(device, { sent_at: sentAt, readings }) {
  const outcome = await prisma.$transaction(async (tx) => {
    // One call at a time per device, so a retry that races the original is seen as a duplicate.
    await tx.$queryRaw`SELECT id FROM devices WHERE id = ${device.id}::uuid FOR UPDATE`;
    // Server clock, read once, so every reading in the batch has the same received_at.
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
                geofences: { where: { isActive: true }, select: { id: true, boundary: true } },
              },
            },
          },
        },
      },
    });

    // A refused device still counts as seen: the admin can tell it is switched on.
    const seen = { lastSeenAt: now, ...(clockOffsetSeconds !== undefined && { clockOffsetSeconds }) };
    const refused = refusal(d);
    if (refused) {
      await tx.device.update({ where: { id: d.id }, data: seen });
      return { refused };
    }

    const { result, newest, session, status } = await apply(tx, d, readings, now);
    await tx.device.update({ where: { id: d.id }, data: { ...seen, lastRecordedAt: newest } });

    return {
      body: {
        server_time: now.toISOString(),
        clock_offset_seconds: clockOffsetSeconds ?? null,
        ...result,
        location_status: status,
        session: session ? { id: String(session.id), started_at: session.startedAt.toISOString() } : null,
      },
    };
  });

  if (outcome.refused) throw outcome.refused;
  return outcome.body;
}

module.exports = {
  authenticate,
  ingest,
  MAX_CLOCK_AHEAD_SECONDS,
  MAX_READING_AGE_HOURS,
  MIN_READING_INTERVAL_SECONDS,
};
