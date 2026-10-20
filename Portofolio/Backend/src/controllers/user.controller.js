const userService = require('../services/user.service');
const { sendSession } = require('./auth.controller');

async function invite(req, res) {
  res.status(201).json(await userService.invite(req.auth, req.body));
}

async function list(req, res) {
  res.json(await userService.list(req.auth, req.validQuery));
}

async function resendInvitation(req, res) {
  await userService.resendInvitation(req.auth, req.params.id);
  res.status(204).end();
}

async function deactivate(req, res) {
  await userService.deactivate(req.auth, req.params.id);
  res.status(204).end();
}

async function describeInvitation(req, res) {
  res.json(await userService.describeInvitation(req.params.token));
}

async function acceptInvitation(req, res) {
  sendSession(res, await userService.acceptInvitation(req.params.token, req.body));
}

module.exports = { invite, list, resendInvitation, deactivate, describeInvitation, acceptInvitation };
