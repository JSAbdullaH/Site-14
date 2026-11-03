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

module.exports = { create, list, update };
