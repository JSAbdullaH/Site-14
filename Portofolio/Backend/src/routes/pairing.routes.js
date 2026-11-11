const { Router } = require('express');
const { limiter } = require('../middlewares/rateLimit.middleware');
const { validateBody, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const pairingController = require('../controllers/pairing.controller');

const router = Router();

const lookupLimiter = limiter(60);
const claimLimiter = limiter(20);

router.get('/:code', lookupLimiter, validateParams(s.pairingCodeParams), pairingController.lookup);
router.post('/:code/claim', claimLimiter, validateParams(s.pairingCodeParams), validateBody(s.claimPairingSchema), pairingController.claim);

module.exports = router;
