const AppError = require('../utils/AppError');

const FIELDS = {
  id: true,
  alertType: true,
  latitude: true,
  longitude: true,
  limitMinutes: true,
  observedMinutes: true,
  limitBpm: true,
  observedBpm: true,
  triggeredAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
  geofence: { select: { id: true, name: true } },
  acknowledger: { select: { id: true, fullName: true } },
  session: {
    select: {
      employee: { select: { id: true, fullName: true, jobCategory: true } },
      site: { select: { id: true, name: true } },
    },
  },
};

const iso = (d) => (d ? d.toISOString() : null);

function toPublic(a, now = Date.now()) {
  const end = a.resolvedAt ? a.resolvedAt.getTime() : now;
  return {
    id: a.id,
    type: a.alertType,
    status: a.resolvedAt ? 'resolved' : 'open',
    employee: { id: a.session.employee.id, full_name: a.session.employee.fullName, job_category: a.session.employee.jobCategory },
    site: a.session.site,
    zone: a.geofence,
    latitude: a.latitude,
    longitude: a.longitude,
    limit_minutes: a.limitMinutes,
    observed_minutes: a.observedMinutes,
    limit_bpm: a.limitBpm,
    observed_bpm: a.observedBpm,
    duration_seconds: Math.max(0, Math.round((end - a.triggeredAt.getTime()) / 1000)),
    triggered_at: a.triggeredAt.toISOString(),
    resolved_at: iso(a.resolvedAt),
    acknowledged_at: iso(a.acknowledgedAt),
    acknowledged_by: a.acknowledger ? { id: a.acknowledger.id, full_name: a.acknowledger.fullName } : null,
  };
}

function filters(q) {
  return {
    ...(q.status === 'open' && { resolvedAt: null }),
    ...(q.status === 'resolved' && { resolvedAt: { not: null } }),
    ...(q.type && { alertType: q.type }),
    ...(q.site_id && { session: { siteId: q.site_id } }),
    ...(q.employee_id && { session: { employeeId: q.employee_id } }),
  };
}

async function list(auth, q) {
  const where = filters(q);
  const [rows, total] = await Promise.all([
    auth.db.alert.findMany({
      where,
      orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: FIELDS,
    }),
    auth.db.alert.count({ where }),
  ]);
  return { data: rows.map((a) => toPublic(a)), page: q.page, limit: q.limit, total };
}

async function summary(auth) {
  const rows = await auth.db.alert.groupBy({
    by: ['alertType'],
    where: { resolvedAt: null },
    _count: { _all: true },
  });
  const unacknowledged = await auth.db.alert.count({ where: { resolvedAt: null, acknowledgedAt: null } });
  const byType = Object.fromEntries(rows.map((r) => [r.alertType, r._count._all]));
  return {
    open: rows.reduce((n, r) => n + r._count._all, 0),
    unacknowledged,
    by_type: byType,
  };
}

async function acknowledge(auth, id) {
  const { count } = await auth.db.alert.updateMany({
    where: { id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedBy: auth.userId },
  });
  const alert = await auth.db.alert.findUnique({ where: { id }, select: FIELDS });
  if (!alert) throw new AppError(404, 'NOT_FOUND', 'Alert not found');
  if (!count && alert.acknowledger && alert.acknowledger.id !== auth.userId) {
    throw new AppError(409, 'ALREADY_ACKNOWLEDGED', `${alert.acknowledger.fullName} already acknowledged this alert`);
  }
  return toPublic(alert);
}

module.exports = { list, summary, acknowledge };
