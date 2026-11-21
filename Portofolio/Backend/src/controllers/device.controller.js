const deviceService = require('../services/device.service');
const pairingService = require('../services/pairing.service');

async function list(req, res) {
  res.json(await deviceService.list(req.auth, req.validQuery));
}

async function summary(req, res) {
  res.json(await deviceService.summary(req.auth));
}

async function get(req, res) {
  res.json(await deviceService.get(req.auth, req.params.id));
}

async function create(req, res) {
  res.status(201).json(await deviceService.create(req.auth, req.body));
}

async function createBatch(req, res) {
  res.status(201).json(await deviceService.createBatch(req.auth, req.body));
}

async function update(req, res) {
  res.json(await deviceService.update(req.auth, req.params.id, req.body));
}

async function rotateKey(req, res) {
  res.json(await deviceService.rotateKey(req.auth, req.params.id));
}

async function remove(req, res) {
  await deviceService.remove(req.auth, req.params.id);
  res.status(204).end();
}

async function createPairing(req, res) {
  res.status(201).json(await pairingService.create(req.auth, req.body));
}

async function listPairings(req, res) {
  res.json(await pairingService.listPending(req.auth));
}

async function getPairing(req, res) {
  res.json(await pairingService.get(req.auth, req.params.id));
}

async function cancelPairing(req, res) {
  await pairingService.cancel(req.auth, req.params.id);
  res.status(204).end();
}

module.exports = {
  list,
  summary,
  get,
  create,
  createBatch,
  update,
  rotateKey,
  remove,
  createPairing,
  listPairings,
  getPairing,
  cancelPairing,
};
