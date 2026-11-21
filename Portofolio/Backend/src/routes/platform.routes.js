const { Router } = require('express');
const { authenticatePlatform } = require('../middlewares/platform.middleware');
const { limiter } = require('../middlewares/rateLimit.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const platformController = require('../controllers/platform.controller');

const router = Router();

router.post('/auth/login', limiter(20), validateBody(s.platformLoginSchema), platformController.login);

router.use(authenticatePlatform);

router.get('/me', platformController.me);
router.get('/overview', platformController.overview);
router.get('/companies', validateQuery(s.platformListQuery), platformController.companies);
router.get('/devices', validateQuery(s.platformDevicesQuery), platformController.devices);

router.get('/products', platformController.products);
router.post('/products', validateBody(s.createProductSchema), platformController.createProduct);
router.patch('/products/:id', validateParams(s.idParams), validateBody(s.updateProductSchema), platformController.updateProduct);

router.get('/orders', validateQuery(s.listOrdersQuery), platformController.orders);
router.get('/orders/:id', validateParams(s.idParams), platformController.order);
router.post('/orders/:id/ship', validateParams(s.idParams), platformController.shipOrder);
router.post('/orders/:id/deliver', validateParams(s.idParams), platformController.deliverOrder);
router.post('/orders/:id/cancel', validateParams(s.idParams), platformController.cancelOrder);

module.exports = router;
