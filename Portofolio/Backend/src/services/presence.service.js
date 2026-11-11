const config = require('../config');
const { prisma } = require('../config/db');

const SWEEP_EVERY_MS = 30_000;
const UNREAD_WINDOW_DAYS = 7;
const MAX_UNREAD = 99;

const offlineAfterMs = () => config.DEVICE_OFFLINE_MINUTES * 60_000;

async function openZoneAlert(tx, sessionId, zone, reading) {
  const open = await tx.alert.findFirst({
    where: { sessionId, alertType: 'zone_exit', resolvedAt: null },
    select: { id: true },
  });
  if (open) return open.id;
  const alert = await tx.alert.create({
    data: {
      sessionId,
      alertType: 'zone_exit',
      geofenceId: zone ? zone.id : null,
      latitude: reading.latitude,
      longitude: reading.longitude,
      triggeredAt: reading.recorded_at,
    },
    select: { id: true },
  });
  return alert.id;
}

async function resolveZoneAlert(tx, sessionId, at) {
  await tx.alert.updateMany({
    where: { sessionId, alertType: 'zone_exit', resolvedAt: null, triggeredAt: { lte: at } },
    data: { resolvedAt: at },
  });
}

async function backOnline(tx, deviceId, now) {
  const { count } = await tx.device.updateMany({
    where: { id: deviceId, offlineNotifiedAt: { not: null } },
    data: { offlineNotifiedAt: null },
  });
  if (!count) return;
  const device = await tx.device.findUnique({
    where: { id: deviceId },
    select: {
      companyId: true,
      employee: {
        select: {
          id: true,
          siteId: true,
          currentState: { select: { latitude: true, longitude: true } },
        },
      },
    },
  });
  const employee = device && device.employee;
  if (!employee || !employee.siteId) return;
  await tx.presenceEvent.create({
    data: {
      companyId: device.companyId,
      employeeId: employee.id,
      siteId: employee.siteId,
      deviceId,
      eventType: 'device_online',
      latitude: employee.currentState ? employee.currentState.latitude : null,
      longitude: employee.currentState ? employee.currentState.longitude : null,
      occurredAt: now,
    },
  });
}

async function sweepOffline(now = new Date()) {
  const cutoff = new Date(now.getTime() - offlineAfterMs());
  const silent = await prisma.device.findMany({
    where: {
      isActive: true,
      offlineNotifiedAt: null,
      lastSeenAt: { lt: cutoff },
      employee: { workSessions: { some: { endedAt: null } } },
    },
    select: {
      id: true,
      companyId: true,
      lastSeenAt: true,
      employee: {
        select: {
          id: true,
          workSessions: { where: { endedAt: null }, select: { siteId: true }, take: 1 },
          currentState: { select: { latitude: true, longitude: true } },
        },
      },
    },
    take: 500,
  });

  let flagged = 0;
  for (const d of silent) {
    const session = d.employee.workSessions[0];
    if (!session) continue;
    const created = await prisma.$transaction(async (tx) => {
      const { count } = await tx.device.updateMany({
        where: { id: d.id, offlineNotifiedAt: null, lastSeenAt: { lt: cutoff } },
        data: { offlineNotifiedAt: now },
      });
      if (!count) return false;
      await tx.presenceEvent.create({
        data: {
          companyId: d.companyId,
          employeeId: d.employee.id,
          siteId: session.siteId,
          deviceId: d.id,
          eventType: 'device_offline',
          latitude: d.employee.currentState ? d.employee.currentState.latitude : null,
          longitude: d.employee.currentState ? d.employee.currentState.longitude : null,
          occurredAt: d.lastSeenAt,
        },
      });
      return true;
    });
    if (created) flagged += 1;
  }
  return flagged;
}

function startSweeper() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepOffline();
    } catch (err) {
      console.error('Offline sweep failed:', err.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, SWEEP_EVERY_MS);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}

const EVENT_FIELDS = {
  id: true,
  eventType: true,
  zoneName: true,
  fromZoneName: true,
  latitude: true,
  longitude: true,
  occurredAt: true,
  createdAt: true,
  employee: { select: { id: true, fullName: true } },
  site: { select: { id: true, name: true } },
  device: { select: { id: true, serialNumber: true, name: true, deviceType: true } },
  alert: { select: { id: true, resolvedAt: true, acknowledgedAt: true } },
};

function toPublicEvent(e) {
  return {
    id: e.id,
    type: e.eventType,
    employee: { id: e.employee.id, full_name: e.employee.fullName },
    site: e.site,
    zone_name: e.zoneName,
    from_zone_name: e.fromZoneName,
    device: e.device
      ? { id: e.device.id, serial_number: e.device.serialNumber, name: e.device.name, device_type: e.device.deviceType }
      : null,
    alert: e.alert
      ? { id: e.alert.id, resolved: Boolean(e.alert.resolvedAt), acknowledged: Boolean(e.alert.acknowledgedAt) }
      : null,
    latitude: e.latitude,
    longitude: e.longitude,
    occurred_at: e.occurredAt.toISOString(),
    created_at: e.createdAt.toISOString(),
  };
}

async function listNotifications(auth, q) {
  const user = await auth.db.user.findUnique({ where: { id: auth.userId }, select: { notificationsReadAt: true } });
  const floor = new Date(Date.now() - UNREAD_WINDOW_DAYS * 24 * 3600_000);
  const readAt = user && user.notificationsReadAt && user.notificationsReadAt > floor ? user.notificationsReadAt : floor;

  const where = {
    ...(q.after && { createdAt: { gt: q.after } }),
    ...(q.site_id && { siteId: q.site_id }),
    ...(q.employee_id && { employeeId: q.employee_id }),
    ...(q.type && { eventType: { in: q.type } }),
  };
  const [rows, unread] = await Promise.all([
    auth.db.presenceEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit,
      select: EVENT_FIELDS,
    }),
    auth.db.presenceEvent.count({ where: { createdAt: { gt: readAt } }, take: MAX_UNREAD + 1 }),
  ]);

  return {
    data: rows.map(toPublicEvent),
    unread_count: Math.min(unread, MAX_UNREAD),
    unread_capped: unread > MAX_UNREAD,
    read_at: user && user.notificationsReadAt ? user.notificationsReadAt.toISOString() : null,
    server_time: new Date().toISOString(),
  };
}

async function markRead(auth) {
  const now = new Date();
  await auth.db.user.update({ where: { id: auth.userId }, data: { notificationsReadAt: now } });
  return { read_at: now.toISOString(), unread_count: 0 };
}

module.exports = {
  offlineAfterMs,
  openZoneAlert,
  resolveZoneAlert,
  backOnline,
  sweepOffline,
  startSweeper,
  listNotifications,
  markRead,
};
