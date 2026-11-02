const geofenceService = require('../services/geofence.service');

async function create(req, res) {
  res.status(201).json(await geofenceService.create(req.auth, req.body));
}

async function list(req, res) {
  res.json(await geofenceService.list(req.auth, req.validQuery));
}

async function update(req, res) {
  res.json(await geofenceService.update(req.auth, req.params.id, req.body));
}

async function deactivate(req, res) {
  await geofenceService.deactivate(req.auth, req.params.id);
  res.status(204).end();
}

module.exports = { create, list, update, deactivate };
