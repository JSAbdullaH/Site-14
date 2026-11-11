const alertService = require('../services/alert.service');
const presence = require('../services/presence.service');

async function list(req, res) {
  res.json(await alertService.list(req.auth, req.validQuery));
}

async function summary(req, res) {
  res.json(await alertService.summary(req.auth));
}

async function acknowledge(req, res) {
  res.json(await alertService.acknowledge(req.auth, req.params.id));
}

async function notifications(req, res) {
  res.json(await presence.listNotifications(req.auth, req.validQuery));
}

async function readNotifications(req, res) {
  res.json(await presence.markRead(req.auth));
}

module.exports = { list, summary, acknowledge, notifications, readNotifications };
