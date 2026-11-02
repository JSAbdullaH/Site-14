const AppError = require('../utils/AppError');
const geofenceModel = require('../models/geofence.model');
const { polygonWithin } = require('../utils/geo');

const notFound = () => new AppError(404, 'NOT_FOUND', 'Zone not found');
const siteNotFound = () => new AppError(404, 'NOT_FOUND', 'Site not found');

const outsideSite = () =>
  new AppError(422, 'VALIDATION_ERROR', 'The zone must be drawn inside the site boundary', {
    boundary: 'The zone must be drawn inside the site boundary',
  });

async function siteOf(auth, siteId) {
  const site = await geofenceModel.findSite(auth.companyId, siteId);
  if (!site) throw siteNotFound();
  return site;
}

async function create(auth, input) {
  const site = await siteOf(auth, input.site_id);
  if (!polygonWithin(input.boundary, site.boundary)) throw outsideSite();
  const geofence = await geofenceModel.create({
    siteId: site.id,
    name: input.name,
    isOutdoor: input.is_outdoor,
    boundary: input.boundary,
  });
  return geofenceModel.toPublic(geofence);
}

async function list(auth, { site_id: siteId, is_active: isActive }) {
  await siteOf(auth, siteId);
  const geofences = await geofenceModel.listBySite(auth.companyId, siteId, { isActive });
  return { data: geofences.map(geofenceModel.toPublic) };
}

async function update(auth, id, input) {
  const geofence = await geofenceModel.findById(auth.companyId, id);
  if (!geofence) throw notFound();
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.is_outdoor !== undefined) data.isOutdoor = input.is_outdoor;
  if (input.boundary !== undefined) {
    const site = await siteOf(auth, geofence.siteId);
    if (!polygonWithin(input.boundary, site.boundary)) throw outsideSite();
    data.boundary = input.boundary;
  }
  if (input.is_active !== undefined) data.isActive = input.is_active;
  return geofenceModel.toPublic(await geofenceModel.update(id, data));
}

async function deactivate(auth, id) {
  const geofence = await geofenceModel.findById(auth.companyId, id);
  if (!geofence) throw notFound();
  if (geofence.isActive) await geofenceModel.update(id, { isActive: false });
}

module.exports = { create, list, update, deactivate };
