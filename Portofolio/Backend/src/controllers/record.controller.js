const recordService = require('../services/record.service');

async function dailyRecord(req, res) {
  res.json(await recordService.dailyRecord(req.auth, req.params.id, req.validQuery.date));
}

module.exports = { dailyRecord };
