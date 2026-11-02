const locationService = require('../services/location.service');

async function live(req, res) {
  res.json(await locationService.live(req.auth, req.validQuery));
}

module.exports = { live };
