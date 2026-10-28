const siteService = require('../services/site.service');

async function create(req, res) {
  res.status(201).json(await siteService.create(req.auth, req.body));
}

async function list(req, res) {
  res.json(await siteService.list(req.auth, req.validQuery));
}

async function get(req, res) {
  res.json(await siteService.get(req.auth, req.params.id));
}

async function update(req, res) {
  res.json(await siteService.update(req.auth, req.params.id, req.body));
}

async function deactivate(req, res) {
  await siteService.deactivate(req.auth, req.params.id);
  res.status(204).end();
}

module.exports = { create, list, get, update, deactivate };
