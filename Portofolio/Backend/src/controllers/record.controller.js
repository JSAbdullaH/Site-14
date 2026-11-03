const recordService = require('../services/record.service');

async function dailyRecord(req, res) {
  res.json(await recordService.dailyRecord(req.auth, req.params.id, req.validQuery.date));
}

async function correct(req, res) {
  res.status(201).json(await recordService.correct(req.auth, req.params.id, req.body));
}

module.exports = { dailyRecord, correct };
