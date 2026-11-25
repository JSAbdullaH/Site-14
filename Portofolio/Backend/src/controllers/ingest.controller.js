const ingestService = require('../services/ingest.service');
const deviceService = require('../services/device.service');

async function readings(req, res) {
  res.json(await ingestService.ingest(req.device, req.body));
}

async function heartbeat(req, res) {
  res.json(await ingestService.heartbeat(req.device, req.body));
}

async function site(req, res) {
  res.json(await ingestService.siteOf(req.device));
}

async function disconnect(req, res) {
  await deviceService.disconnect(req.device);
  res.status(204).end();
}

module.exports = { readings, heartbeat, site, disconnect };
