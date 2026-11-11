const marketplaceService = require('../services/marketplace.service');

async function products(_req, res) {
  res.json(await marketplaceService.listProducts());
}

async function placeOrder(req, res) {
  res.status(201).json(await marketplaceService.placeOrder(req.auth, req.body));
}

async function orders(req, res) {
  res.json(await marketplaceService.listOrders(req.auth, req.validQuery));
}

async function order(req, res) {
  res.json(await marketplaceService.getOrder(req.auth, req.params.id));
}

module.exports = { products, placeOrder, orders, order };
