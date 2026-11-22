const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const geofenceController = require('../controllers/geofence.controller');

const router = Router();

router.use(authenticate, requireRole('site_manager'));

router.post('/', validateBody(s.createGeofenceSchema), geofenceController.create);
router.get('/', validateQuery(s.listGeofencesQuery), geofenceController.list);
router.patch('/:id', validateParams(s.idParams), validateBody(s.updateGeofenceSchema), geofenceController.update);
router.delete('/:id', validateParams(s.idParams), geofenceController.deactivate);

module.exports = router;
