const { Router } = require('express');
const { authenticate, requireRole, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const marketplaceController = require('../controllers/marketplace.controller');

const router = Router();

router.use(authenticate);

router.get('/products', requireRole('site_manager'), marketplaceController.products);
router.get('/orders', requireAdmin, validateQuery(s.listOrdersQuery), marketplaceController.orders);
router.post('/orders', requireAdmin, validateBody(s.placeOrderSchema), marketplaceController.placeOrder);
router.get('/orders/:id', requireAdmin, validateParams(s.idParams), marketplaceController.order);

module.exports = router;
