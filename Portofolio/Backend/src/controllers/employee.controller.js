const employeeService = require('../services/employee.service');

async function list(req, res) {
  res.json(await employeeService.list(req.auth, req.validQuery));
}

async function assignSite(req, res) {
  res.json(await employeeService.assignSite(req.auth, req.params.id, req.body));
}

module.exports = { list, assignSite };
