const ingestService = require('../services/ingest.service');

async function readings(req, res) {
  res.json(await ingestService.ingest(req.device, req.body));
}

module.exports = { readings };
