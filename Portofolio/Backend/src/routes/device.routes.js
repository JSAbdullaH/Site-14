const { Router } = require('express');
const { authenticate, requireRole, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const deviceController = require('../controllers/device.controller');

const router = Router();

router.use(authenticate);

// Managers see which worker wears which device; only an admin registers or changes devices.
router.get('/', requireRole('site_manager'), validateQuery(s.listDevicesQuery), deviceController.list);
router.post('/', requireAdmin, validateBody(s.createDeviceSchema), deviceController.create);
router.post('/batch', requireAdmin, validateBody(s.createDeviceBatchSchema), deviceController.createBatch);
router.patch('/:id', requireAdmin, validateParams(s.idParams), validateBody(s.updateDeviceSchema), deviceController.update);
router.post('/:id/key', requireAdmin, validateParams(s.idParams), deviceController.rotateKey);

module.exports = router;
