const AppError = require('../utils/AppError');
const { todayInRiyadh, dayRange, clockInRiyadh, minutesBetween, walk, minutesByZone } = require('../utils/day');

const CORRECTABLE = ['first_seen', 'last_seen', 'worked_minutes'];

const notFound = () => new AppError(404, 'NOT_FOUND', 'Employee not found');
const invalid = (field, message) => new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { [field]: message });

function checkDate(date) {
  if (date > todayInRiyadh()) throw invalid('date', 'Pick today or an earlier day');
}

async function findEmployee(db, id) {
  const employee = await db.employee.findUnique({
    where: { id },
    select: { id: true, fullName: true, employeeNumber: true, jobCategory: true, siteId: true },
  });
  if (!employee) throw notFound();
  return employee;
}

async function loadDay(db, employeeId, date) {
  const { start, end } = dayRange(date);
  const sessions = await db.workSession.findMany({
    where: { employeeId, startedAt: { gte: start, lt: end } },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      site: { select: { id: true, name: true } },
      telemetryLogs: {
        orderBy: { recordedAt: 'asc' },
        select: { latitude: true, longitude: true, recordedAt: true, batteryPercent: true },
      },
      alerts: {
        orderBy: { triggeredAt: 'asc' },
        select: {
          id: true,
          alertType: true,
          triggeredAt: true,
          acknowledgedAt: true,
          resolvedAt: true,
          limitMinutes: true,
          observedMinutes: true,
          limitBpm: true,
          observedBpm: true,
          geofence: { select: { id: true, name: true } },
        },
      },
    },
  });
  const siteIds = [...new Set(sessions.map((s) => s.site.id))];
  const geofences = siteIds.length
    ? await db.geofence.findMany({
      where: { siteId: { in: siteIds } },
      select: { id: true, siteId: true, name: true, isOutdoor: true, boundary: true },
    })
    : [];
  const now = new Date();
  return sessions.map((s) => ({
    ...s,
    walk: walk(s.telemetryLogs, geofences.filter((g) => g.siteId === s.site.id), s.endedAt || now),
  }));
}

function attendanceOf(sessions) {
  if (!sessions.length) return { first_seen: null, last_seen: null, worked_minutes: 0 };
  const now = new Date();
  const open = sessions.some((s) => !s.endedAt);
  const lastReading = sessions.flatMap((s) => s.telemetryLogs).map((r) => r.recordedAt).sort((a, b) => b - a)[0];
  const lastSeen = open ? lastReading || sessions[sessions.length - 1].startedAt : new Date(Math.max(...sessions.map((s) => s.endedAt)));
  return {
    first_seen: clockInRiyadh(sessions[0].startedAt),
    last_seen: clockInRiyadh(lastSeen),
    worked_minutes: sessions.reduce((sum, s) => sum + minutesBetween(s.startedAt, s.endedAt || now), 0),
  };
}

async function correctionsOf(db, employeeId, date) {
  return db.recordCorrection.findMany({
    where: { employeeId, workDate: new Date(`${date}T00:00:00Z`) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      field: true,
      originalValue: true,
      correctedValue: true,
      reason: true,
      createdAt: true,
      site: { select: { id: true, name: true } },
      author: { select: { id: true, fullName: true } },
    },
  });
}

function withCorrections(original, corrections) {
  const result = {};
  for (const field of CORRECTABLE) {
    const latest = corrections.filter((c) => c.field === field).pop();
    const value = latest ? latest.correctedValue : original[field];
    result[field] = {
      original: original[field],
      value: field === 'worked_minutes' && latest ? Number(value) : value,
      corrected: Boolean(latest),
    };
  }
  return result;
}

const correctionToPublic = (c) => ({
  id: c.id,
  field: c.field,
  original_value: c.originalValue,
  corrected_value: c.correctedValue,
  reason: c.reason,
  site: c.site,
  corrected_by: { id: c.author.id, full_name: c.author.fullName },
  created_at: c.createdAt.toISOString(),
});

const alertToPublic = (a) => ({
  id: a.id,
  type: a.alertType,
  triggered_at: a.triggeredAt.toISOString(),
  zone: a.geofence,
  limit_minutes: a.limitMinutes,
  observed_minutes: a.observedMinutes,
  limit_bpm: a.limitBpm,
  observed_bpm: a.observedBpm,
  acknowledged_at: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
  resolved_at: a.resolvedAt ? a.resolvedAt.toISOString() : null,
});

async function dailyRecord(auth, employeeId, date) {
  checkDate(date);
  const employee = await findEmployee(auth.db, employeeId);
  const [sessions, corrections, tasks] = await Promise.all([
    loadDay(auth.db, employeeId, date),
    correctionsOf(auth.db, employeeId, date),
    auth.db.task.findMany({
      where: { employeeId, scheduledFor: new Date(`${date}T00:00:00Z`) },
      orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, status: true, completedAt: true },
    }),
  ]);

  const segments = sessions.flatMap((s) => s.walk.segments);
  const gaps = sessions.flatMap((s) => s.walk.gaps);
  const sites = [...new Map(sessions.map((s) => [s.site.id, s.site])).values()];

  return {
    employee: {
      id: employee.id,
      full_name: employee.fullName,
      employee_number: employee.employeeNumber,
      job_category: employee.jobCategory,
    },
    date,
    status: sessions.length ? 'present' : 'absent',
    is_provisional: date === todayInRiyadh() || sessions.some((s) => !s.endedAt),
    has_corrections: corrections.length > 0,
    sites,
    session_count: sessions.length,
    attendance: withCorrections(attendanceOf(sessions), corrections),
    minutes_by_zone: minutesByZone(segments),
    offline_minutes: gaps.reduce((sum, g) => sum + g.minutes, 0),
    alerts: sessions.flatMap((s) => s.alerts).map(alertToPublic),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      completed_at: t.completedAt ? t.completedAt.toISOString() : null,
    })),
    corrections: corrections.map(correctionToPublic),
  };
}

module.exports = { dailyRecord, CORRECTABLE, checkDate, findEmployee, loadDay, attendanceOf, correctionsOf, withCorrections, correctionToPublic };
