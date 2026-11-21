const { Router } = require('express');
const { authenticate, requireRole, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const deviceController = require('../controllers/device.controller');

const router = Router();

router.use(authenticate);

const readers = requireRole('site_manager');

router.get('/', readers, validateQuery(s.listDevicesQuery), deviceController.list);
router.get('/summary', readers, deviceController.summary);
router.post('/', requireAdmin, validateBody(s.createDeviceSchema), deviceController.create);
router.post('/batch', requireAdmin, validateBody(s.createDeviceBatchSchema), deviceController.createBatch);

router.get('/pairings', requireAdmin, deviceController.listPairings);
router.post('/pairings', requireAdmin, validateBody(s.createPairingSchema), deviceController.createPairing);
router.get('/pairings/:id', requireAdmin, validateParams(s.idParams), deviceController.getPairing);
router.delete('/pairings/:id', requireAdmin, validateParams(s.idParams), deviceController.cancelPairing);

router.get('/:id', readers, validateParams(s.idParams), deviceController.get);
router.patch('/:id', requireAdmin, validateParams(s.idParams), validateBody(s.updateDeviceSchema), deviceController.update);
router.delete('/:id', requireAdmin, validateParams(s.idParams), deviceController.remove);
router.post('/:id/key', requireAdmin, validateParams(s.idParams), deviceController.rotateKey);

module.exports = router;
