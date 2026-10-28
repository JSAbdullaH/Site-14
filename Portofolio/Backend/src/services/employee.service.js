
const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');

const notFound = () => new AppError(404, 'NOT_FOUND', 'Employee not found');
const invalid = (field, message) => new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { [field]: message });

const LIST_FIELDS = {
  id: true,
  fullName: true,
  employeeNumber: true,
  jobCategory: true,
  status: true,
  consentGivenAt: true,
  createdAt: true,
  site: { select: { id: true, name: true } },
  device: { select: { id: true, serialNumber: true } },
};

const PROFILE_FIELDS = {
  ...LIST_FIELDS,
  currentState: {
    select: {
      latitude: true,
      longitude: true,
      batteryPercent: true,
      heartRateBpm: true,
      recordedAt: true,
      sessionId: true,
      geofence: { select: { id: true, name: true } },
    },
  },
};

function toPublic(e) {
  return {
    id: e.id,
    full_name: e.fullName,
    employee_number: e.employeeNumber,
    job_category: e.jobCategory,
    status: e.status,
    consent_given_at: e.consentGivenAt ? e.consentGivenAt.toISOString() : null,
    site: e.site,
    device: e.device ? { id: e.device.id, serial_number: e.device.serialNumber } : null,
    created_at: e.createdAt.toISOString(),
  };
}

async function list(auth, q) {
  const where = {
    ...(q.status === 'all' ? {} : { status: q.status }),
    ...(q.site_id && { siteId: q.site_id }),
    ...(q.job_category && { jobCategory: q.job_category }),
    ...(q.geofence_id && { currentState: { geofenceId: q.geofence_id } }),
    ...(q.search && {
      OR: [
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { employeeNumber: { contains: q.search, mode: 'insensitive' } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    auth.db.employee.findMany({
      where,
      select: LIST_FIELDS,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    auth.db.employee.count({ where }),
  ]);
  return { data: rows.map(toPublic), page: q.page, limit: q.limit, total };
}

async function get(auth, id) {
  const e = await auth.db.employee.findUnique({ where: { id }, select: PROFILE_FIELDS });
  if (!e) throw notFound();

  const [today] = await prisma.$queryRaw`
    SELECT COALESCE(sum(worked_minutes), 0)::int AS minutes
    FROM daily_work_records
    WHERE company_id = ${auth.companyId}::uuid AND employee_id = ${id}::uuid
      AND work_date = (now() AT TIME ZONE 'Asia/Riyadh')::date`;

  const s = e.currentState;
  return {
    ...toPublic(e),
    current_state: s && {
      on_site: s.sessionId !== null,
      zone: s.geofence,
      latitude: s.latitude,
      longitude: s.longitude,
      battery_percent: s.batteryPercent,
      heart_rate_bpm: s.heartRateBpm,
      recorded_at: s.recordedAt.toISOString(),
    },
    minutes_today: today.minutes,
  };
}

async function checkSite(db, siteId) {
  if (!siteId) return;
  const site = await db.site.findUnique({ where: { id: siteId }, select: { isActive: true } });
  if (!site || !site.isActive) throw invalid('site_id', 'Site not found');
}

const DAILY_LIMIT_MINUTES = { security: 720, cleaning: 720 };
const DEFAULT_LIMIT_MINUTES = 480;

async function ensureCategory(db, jobCategory) {
  const found = await db.jobCategoryRule.findFirst({ where: { jobCategory }, select: { id: true } });
  if (!found) {
    const dailyLimitMinutes = DAILY_LIMIT_MINUTES[jobCategory] ?? DEFAULT_LIMIT_MINUTES;
    await db.jobCategoryRule.create({ data: { jobCategory, dailyLimitMinutes } });
  }
}

function toData(input, current) {
  const data = {};
  if (input.full_name !== undefined) data.fullName = input.full_name;
  if (input.employee_number !== undefined) data.employeeNumber = input.employee_number;
  if (input.job_category !== undefined) data.jobCategory = input.job_category;
  if (input.site_id !== undefined) data.siteId = input.site_id;
  if (input.consent === true && !(current && current.consentGivenAt)) data.consentGivenAt = new Date();
  if (input.consent === false) data.consentGivenAt = null;
  return data;
}

function rethrow(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppError(409, 'EMPLOYEE_NUMBER_TAKEN', 'Another employee already has this number', {
      employee_number: 'Another employee already has this number',
    });
  }
  throw err;
}

async function create(auth, input) {
  await checkSite(auth.db, input.site_id);
  try {
    const e = await auth.db.$transaction(async (tx) => {
      await ensureCategory(tx, input.job_category);
      return tx.employee.create({ data: toData(input), select: LIST_FIELDS });
    });
    return toPublic(e);
  } catch (err) {
    return rethrow(err);
  }
}

async function update(auth, id, input) {
  const current = await auth.db.employee.findUnique({
    where: { id },
    select: { consentGivenAt: true, workSessions: { where: { endedAt: null }, select: { id: true } } },
  });
  if (!current) throw notFound();
  await checkSite(auth.db, input.site_id);
  if (input.consent === false && current.workSessions.length) {
    throw new AppError(409, 'ON_SHIFT', 'End the worker\'s shift before withdrawing consent');
  }
  try {
    const e = await auth.db.$transaction(async (tx) => {
      if (input.job_category) await ensureCategory(tx, input.job_category);
      return tx.employee.update({ where: { id }, data: toData(input, current), select: LIST_FIELDS });
    });
    return toPublic(e);
  } catch (err) {
    return rethrow(err);
  }
}

async function deactivate(auth, id) {
  const e = await auth.db.employee.findUnique({ where: { id }, select: { id: true } });
  if (!e) throw notFound();
  await auth.db.$transaction(async (tx) => {
    await tx.device.updateMany({ where: { employeeId: id }, data: { employeeId: null } });
    await tx.employee.update({ where: { id }, data: { status: 'inactive' } });
  });
}

module.exports = { list, get, create, update, deactivate };
