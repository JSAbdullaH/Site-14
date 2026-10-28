const employeeService = require('../services/employee.service');
const importService = require('../services/employee-import.service');

async function list(req, res) {
  res.json(await employeeService.list(req.auth, req.validQuery));
}

async function get(req, res) {
  res.json(await employeeService.get(req.auth, req.params.id));
}

async function create(req, res) {
  res.status(201).json(await employeeService.create(req.auth, req.body));
}

async function update(req, res) {
  res.json(await employeeService.update(req.auth, req.params.id, req.body));
}

async function deactivate(req, res) {
  await employeeService.deactivate(req.auth, req.params.id);
  res.status(204).end();
}

function importTemplate(_req, res) {
  res.type('text/csv').attachment('employees-template.csv').send(importService.TEMPLATE);
}

async function importPreview(req, res) {
  res.json(await importService.preview(req.auth, req.file, req.body.column_map));
}

async function importCommit(req, res) {
  res.status(201).json(await importService.commit(req.auth, req.file, req.body.column_map));
}

module.exports = { list, get, create, update, deactivate, importTemplate, importPreview, importCommit };
