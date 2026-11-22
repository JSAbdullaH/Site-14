const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const alertController = require('../controllers/alert.controller');

const router = Router();

router.use(authenticate, requireRole('site_manager'));

router.get('/', validateQuery(s.listAlertsQuery), alertController.list);
router.get('/summary', alertController.summary);
router.post('/:id/acknowledge', validateParams(s.idParams), alertController.acknowledge);

module.exports = router;
