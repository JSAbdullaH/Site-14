const ingestService = require('../services/ingest.service');

async function readings(req, res) {
  res.json(await ingestService.ingest(req.device, req.body));
}

async function heartbeat(req, res) {
  res.json(await ingestService.heartbeat(req.device, req.body));
}

module.exports = { readings, heartbeat };
