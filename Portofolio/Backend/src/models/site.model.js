const { prisma } = require('../config/db');

const SITE_FIELDS = {
  id: true,
  companyId: true,
  name: true,
  client: true,
  boundary: true,
  shiftStart: true,
  shiftEnd: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// Assigned = an active employee whose site is this one. On site = an open work session here.
const COUNTS = {
  _count: {
    select: {
      employees: { where: { status: 'active' } },
      workSessions: { where: { endedAt: null } },
    },
  },
};

// TIME columns come back from Prisma as a Date on 1970-01-01 (UTC).
const toTime = (hhmm) => new Date(`1970-01-01T${hhmm}:00Z`);
const fromTime = (date) => date.toISOString().slice(11, 16);

// API (snake_case) fields to Prisma data. Only the fields that were sent.
function toData(input) {
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.client !== undefined) data.client = input.client;
  if (input.boundary !== undefined) data.boundary = input.boundary;
  if (input.shift_start !== undefined) data.shiftStart = toTime(input.shift_start);
  if (input.shift_end !== undefined) data.shiftEnd = toTime(input.shift_end);
  if (input.is_active !== undefined) data.isActive = input.is_active;
  return data;
}

async function create(companyId, input) {
  return prisma.site.create({ data: { companyId, ...toData(input) }, select: SITE_FIELDS });
}

// Company-scoped lookup: a site of another company is simply not found.
async function findInCompany(companyId, id, db = prisma) {
  return db.site.findFirst({ where: { id, companyId }, select: { ...SITE_FIELDS, ...COUNTS } });
}

async function listByCompany(companyId, { isActive } = {}) {
  return prisma.site.findMany({
    where: { companyId, ...(isActive === undefined ? {} : { isActive }) },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: { ...SITE_FIELDS, boundary: false, ...COUNTS },
  });
}

async function update(db, id, input) {
  return db.site.update({ where: { id }, data: toData(input), select: { ...SITE_FIELDS, ...COUNTS } });
}

// The API shape of a site. The boundary is left out of lists, where it is not selected.
function toPublic(site) {
  const out = {
    id: site.id,
    name: site.name,
    client: site.client,
    shift_start: fromTime(site.shiftStart),
    shift_end: fromTime(site.shiftEnd),
    is_active: site.isActive,
  };
  if (site.boundary !== undefined) out.boundary = site.boundary;
  if (site._count) {
    out.employee_count = site._count.employees;
    out.on_site_count = site._count.workSessions;
  }
  out.created_at = site.createdAt.toISOString();
  out.updated_at = site.updatedAt.toISOString();
  return out;
}

module.exports = { create, findInCompany, listByCompany, update, toPublic };
