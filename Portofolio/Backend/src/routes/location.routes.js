const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { validateQuery } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const locationController = require('../controllers/location.controller');

const router = Router();

router.use(authenticate, requireRole('site_manager'));

router.get('/live', validateQuery(s.liveLocationsQuery), locationController.live);

module.exports = router;
