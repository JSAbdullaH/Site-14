const { Router } = require('express');
const { authenticate, requireRole, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const companyController = require('../controllers/company.controller');

const router = Router();

router.get('/me', authenticate, requireRole('site_manager'), companyController.getMe);
router.patch('/me', authenticate, requireAdmin, validateBody(s.updateCompanySchema), companyController.updateMe);

module.exports = router;
