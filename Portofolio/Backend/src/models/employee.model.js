const { prisma } = require('../config/db');

const EMPLOYEE_FIELDS = {
  id: true,
  companyId: true,
  siteId: true,
  employeeNumber: true,
  fullName: true,
  jobCategory: true,
  status: true,
  createdAt: true,
  site: { select: { name: true } },
};

function whereOf(companyId, { search, siteId, jobCategory, status }) {
  const where = { companyId };
  if (siteId === 'none') where.siteId = null;
  else if (siteId) where.siteId = siteId;
  if (jobCategory) where.jobCategory = jobCategory;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { employeeNumber: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}

async function listByCompany(companyId, filters, { page, limit }) {
  const where = whereOf(companyId, filters);
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: EMPLOYEE_FIELDS,
    }),
    prisma.employee.count({ where }),
  ]);
  return { rows, total };
}

// Company-scoped lookup: an employee of another company is simply not found.
async function findInCompany(companyId, id, db = prisma) {
  return db.employee.findFirst({ where: { id, companyId }, select: EMPLOYEE_FIELDS });
}

async function setSite(db, id, siteId) {
  return db.employee.update({ where: { id }, data: { siteId }, select: EMPLOYEE_FIELDS });
}

function toPublic(employee) {
  return {
    id: employee.id,
    full_name: employee.fullName,
    employee_number: employee.employeeNumber,
    job_category: employee.jobCategory,
    site_id: employee.siteId,
    site_name: employee.site ? employee.site.name : null,
    status: employee.status,
    created_at: employee.createdAt.toISOString(),
  };
}

module.exports = { listByCompany, findInCompany, setSite, toPublic };
