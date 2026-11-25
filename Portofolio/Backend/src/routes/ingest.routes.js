const { Router } = require('express');
const { authenticateDevice } = require('../middlewares/auth.middleware');
const { deviceLimiter } = require('../middlewares/rateLimit.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const ingestController = require('../controllers/ingest.controller');

const router = Router();

router.post('/readings', authenticateDevice, deviceLimiter, validateBody(s.ingestSchema), ingestController.readings);
router.get('/site', authenticateDevice, deviceLimiter, ingestController.site);
// The device disconnects itself: it is deleted and stops being able to send.
router.delete('/device', authenticateDevice, deviceLimiter, ingestController.disconnect);
router.post('/heartbeat', authenticateDevice, deviceLimiter, validateBody(s.heartbeatSchema), ingestController.heartbeat);

module.exports = router;
