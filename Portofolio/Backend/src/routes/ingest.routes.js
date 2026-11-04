const { Router } = require('express');
const { authenticateDevice } = require('../middlewares/auth.middleware');
const { deviceLimiter } = require('../middlewares/rateLimit.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const ingestController = require('../controllers/ingest.controller');

const router = Router();

// Called by the devices themselves, not by people. See DEVICES.md.
router.post('/readings', authenticateDevice, deviceLimiter, validateBody(s.ingestSchema), ingestController.readings);

module.exports = router;
