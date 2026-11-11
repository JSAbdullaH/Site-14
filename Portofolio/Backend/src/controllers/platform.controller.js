const platformAuth = require('../services/platformAuth.service');
const platformService = require('../services/platform.service');

async function login(req, res) {
  res.json(await platformAuth.login(req.body));
}

async function me(req, res) {
  res.json(await platformAuth.me(req.platform.adminId));
}

async function overview(_req, res) {
  res.json(await platformService.overview());
}

async function companies(req, res) {
  res.json(await platformService.companies(req.validQuery));
}

async function devices(req, res) {
  res.json(await platformService.devices(req.validQuery));
}

async function products(_req, res) {
  res.json(await platformService.listProducts());
}

async function createProduct(req, res) {
  res.status(201).json(await platformService.createProduct(req.body));
}

async function updateProduct(req, res) {
  res.json(await platformService.updateProduct(req.params.id, req.body));
}

async function orders(req, res) {
  res.json(await platformService.listOrders(req.validQuery));
}

async function order(req, res) {
  res.json(await platformService.getOrder(req.params.id));
}

async function shipOrder(req, res) {
  res.json(await platformService.shipOrder(req.params.id));
}

async function deliverOrder(req, res) {
  res.json(await platformService.deliverOrder(req.params.id));
}

async function cancelOrder(req, res) {
  res.json(await platformService.cancelOrder(req.params.id));
}

module.exports = {
  login,
  me,
  overview,
  companies,
  devices,
  products,
  createProduct,
  updateProduct,
  orders,
  order,
  shipOrder,
  deliverOrder,
  cancelOrder,
};
