const AppError = require('../utils/AppError');

const notFound = () => new AppError(404, 'NOT_FOUND', 'Task not found');
const invalid = (field, message) => new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { [field]: message });

const FIELDS = {
  id: true,
  title: true,
  status: true,
  scheduledFor: true,
  completedAt: true,
  createdAt: true,
  site: { select: { id: true, name: true } },
  employee: { select: { id: true, fullName: true } },
  creator: { select: { id: true, fullName: true } },
};

const day = (d) => d.toISOString().slice(0, 10);

function toPublic(t) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    scheduled_for: day(t.scheduledFor),
    completed_at: t.completedAt ? t.completedAt.toISOString() : null,
    created_at: t.createdAt.toISOString(),
    site: t.site,
    employee: { id: t.employee.id, full_name: t.employee.fullName },
    created_by: { id: t.creator.id, full_name: t.creator.fullName },
  };
}

async function create(auth, input) {
  const employee = await auth.db.employee.findUnique({
    where: { id: input.employee_id },
    select: { status: true, siteId: true },
  });
  if (!employee) throw invalid('employee_id', 'Employee not found');
  if (employee.status !== 'active') throw invalid('employee_id', 'This employee is inactive');

  const siteId = input.site_id ?? employee.siteId;
  if (!siteId) throw invalid('site_id', 'This employee has no site. Choose a site for the task.');
  if (employee.siteId !== siteId) throw invalid('employee_id', 'This employee works on another site');

  const site = await auth.db.site.findUnique({ where: { id: siteId }, select: { isActive: true } });
  if (!site) throw invalid('site_id', 'Site not found');
  if (!site.isActive) throw new AppError(409, 'SITE_INACTIVE', 'This site is deactivated');

  const task = await auth.db.task.create({
    data: {
      siteId,
      employeeId: input.employee_id,
      createdBy: auth.userId,
      title: input.title,
      ...(input.scheduled_for && { scheduledFor: new Date(`${input.scheduled_for}T00:00:00Z`) }),
    },
    select: FIELDS,
  });
  return toPublic(task);
}

async function list(auth, q) {
  const where = {
    ...(q.employee_id && { employeeId: q.employee_id }),
    ...(q.site_id && { siteId: q.site_id }),
    ...(q.status && { status: q.status }),
    ...(q.scheduled_for && { scheduledFor: new Date(`${q.scheduled_for}T00:00:00Z`) }),
  };
  const [rows, total] = await Promise.all([
    auth.db.task.findMany({
      where,
      select: FIELDS,
      orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    auth.db.task.count({ where }),
  ]);
  return { data: rows.map(toPublic), page: q.page, limit: q.limit, total };
}

async function update(auth, id, input) {
  const current = await auth.db.task.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw notFound();

  const data = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.status !== undefined && input.status !== current.status) {
    data.status = input.status;
    data.completedAt = input.status === 'done' ? new Date() : null;
  }
  if (!Object.keys(data).length) {
    return toPublic(await auth.db.task.findUnique({ where: { id }, select: FIELDS }));
  }
  return toPublic(await auth.db.task.update({ where: { id }, data, select: FIELDS }));
}

module.exports = { create, list, update, toPublic };
