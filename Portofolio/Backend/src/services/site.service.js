const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const siteModel = require('../models/site.model');

const notFound = () => new AppError(404, 'NOT_FOUND', 'Site not found');

// Site names are unique per company (sites_company_id_name_key).
function nameTaken(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new AppError(409, 'SITE_NAME_TAKEN', 'Your company already has a site with this name', {
      name: 'Your company already has a site with this name',
    });
  }
  return err;
}

// A site with people on it, or with workers still assigned to it, stays active,
// so nobody's hours end up attributed to a closed project.
async function assertCanDeactivate(tx, site) {
  const onSite = await tx.workSession.count({ where: { siteId: site.id, endedAt: null } });
  if (onSite > 0) {
    throw new AppError(409, 'SITE_HAS_ACTIVITY', 'Workers are on this site right now. Deactivate it after the shift ends.');
  }
  const assigned = await tx.employee.count({ where: { siteId: site.id, status: 'active' } });
  if (assigned > 0) {
    throw new AppError(
      409,
      'SITE_HAS_EMPLOYEES',
      `${assigned} employee${assigned === 1 ? ' is' : 's are'} still assigned to this site. Move them to another site first.`,
    );
  }
}

async function create(auth, input) {
  try {
    return siteModel.toPublic({ ...(await siteModel.create(auth.companyId, input)), _count: { employees: 0, workSessions: 0 } });
  } catch (err) {
    throw nameTaken(err);
  }
}

async function list(auth, { is_active: isActive }) {
  const sites = await siteModel.listByCompany(auth.companyId, { isActive });
  return { data: sites.map(siteModel.toPublic) };
}

async function get(auth, id) {
  const site = await siteModel.findInCompany(auth.companyId, id);
  if (!site) throw notFound();
  return siteModel.toPublic(site);
}

async function update(auth, id, input) {
  try {
    const site = await prisma.$transaction(async (tx) => {
      const current = await siteModel.findInCompany(auth.companyId, id, tx);
      if (!current) throw notFound();
      // The schema compares the two times only when both are sent.
      const shown = siteModel.toPublic(current);
      if ((input.shift_start ?? shown.shift_start) === (input.shift_end ?? shown.shift_end)) {
        throw new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', {
          shift_end: 'The shift must end at a different time than it starts',
        });
      }
      if (input.is_active === false && current.isActive) await assertCanDeactivate(tx, current);
      return siteModel.update(tx, id, input);
    });
    return siteModel.toPublic(site);
  } catch (err) {
    throw nameTaken(err);
  }
}

// Sites are deactivated, never deleted: their sessions, tasks and reports still point at them.
async function deactivate(auth, id) {
  await prisma.$transaction(async (tx) => {
    const site = await siteModel.findInCompany(auth.companyId, id, tx);
    if (!site) throw notFound();
    if (!site.isActive) return;
    await assertCanDeactivate(tx, site);
    await siteModel.update(tx, id, { is_active: false });
  });
}

module.exports = { create, list, get, update, deactivate };
