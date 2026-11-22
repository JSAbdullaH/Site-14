const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const reportController = require('../controllers/report.controller');

const router = Router();

router.get('/verify/:reference', validateParams(s.referenceParams), reportController.verify);

router.use(authenticate);
router.get('/', requireRole('site_manager'), validateQuery(s.generateReportQuery), reportController.generate);

module.exports = router;
