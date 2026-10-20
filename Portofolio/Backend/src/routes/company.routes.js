const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const companyController = require('../controllers/company.controller');

const router = Router();

router.get('/me', authenticate, requireRole('site_manager'), companyController.getMe);

module.exports = router;
