const taskService = require('../services/task.service');

async function create(req, res) {
  res.status(201).json(await taskService.create(req.auth, req.body));
}

async function list(req, res) {
  res.json(await taskService.list(req.auth, req.validQuery));
}

async function update(req, res) {
  res.json(await taskService.update(req.auth, req.params.id, req.body));
}

async function remove(req, res) {
  await taskService.remove(req.auth, req.params.id);
  res.status(204).end();
}

module.exports = { create, list, update, remove };
