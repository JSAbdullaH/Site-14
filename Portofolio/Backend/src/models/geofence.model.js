const { prisma } = require('../config/db');

const ofCompany = (companyId, where = {}) => ({ ...where, site: { companyId } });

const toPublic = (g) => ({
  id: g.id,
  site_id: g.siteId,
  name: g.name,
  is_outdoor: g.isOutdoor,
  boundary: g.boundary,
  is_active: g.isActive,
  created_at: g.createdAt.toISOString(),
});

function findSite(companyId, id) {
  return prisma.site.findFirst({ where: { id, companyId }, select: { id: true, name: true, boundary: true } });
}

function create({ siteId, name, isOutdoor, boundary }) {
  return prisma.geofence.create({ data: { siteId, name, isOutdoor, boundary } });
}

function listBySite(companyId, siteId, { isActive } = {}) {
  const where = ofCompany(companyId, { siteId });
  if (isActive !== undefined) where.isActive = isActive;
  return prisma.geofence.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

function findById(companyId, id) {
  return prisma.geofence.findFirst({ where: ofCompany(companyId, { id }) });
}

function update(id, data) {
  return prisma.geofence.update({ where: { id }, data });
}

module.exports = { toPublic, findSite, create, listBySite, findById, update };
