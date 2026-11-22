const pairingService = require('../services/pairing.service');

async function lookup(req, res) {
  res.json(await pairingService.lookup(req.params.code));
}

async function claim(req, res) {
  res.status(201).json(await pairingService.claim(req.params.code, req.body, req.headers));
}

module.exports = { lookup, claim };
