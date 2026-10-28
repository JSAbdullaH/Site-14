const { prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const employeeModel = require('../models/employee.model');

async function list(auth, query) {
  const { page, limit } = query;
  const { rows, total } = await employeeModel.listByCompany(
    auth.companyId,
    { search: query.search, siteId: query.site_id, jobCategory: query.job_category, status: query.status },
    { page, limit },
  );
  return { data: rows.map(employeeModel.toPublic), page, limit, total };
}

// SITE-49: the site an employee's hours are attributed to. null = not assigned.
async function assignSite(auth, id, { site_id: siteId }) {
  const employee = await prisma.$transaction(async (tx) => {
    const current = await employeeModel.findInCompany(auth.companyId, id, tx);
    if (!current) throw new AppError(404, 'NOT_FOUND', 'Employee not found');
    if (current.siteId === siteId) return current;

    if (siteId !== null) {
      if (current.status !== 'active') {
        throw new AppError(409, 'EMPLOYEE_INACTIVE', 'This employee is deactivated and cannot be assigned to a site');
      }
      const site = await tx.site.findFirst({ where: { id: siteId, companyId: auth.companyId }, select: { isActive: true } });
      if (!site) {
        throw new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { site_id: 'Site not found' });
      }
      if (!site.isActive) {
        throw new AppError(409, 'SITE_INACTIVE', 'This site is deactivated. Reactivate it before assigning employees.');
      }
    }
    return employeeModel.setSite(tx, id, siteId);
  });
  return employeeModel.toPublic(employee);
}

module.exports = { list, assignSite };
