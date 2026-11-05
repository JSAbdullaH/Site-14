const deviceService = require('../services/device.service');

async function list(req, res) {
  res.json(await deviceService.list(req.auth, req.validQuery));
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

module.exports = { list, create, createBatch, update, rotateKey };
