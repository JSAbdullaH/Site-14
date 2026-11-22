const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { validateQuery } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const alertController = require('../controllers/alert.controller');

const router = Router();

router.use(authenticate, requireRole('site_manager'));

router.get('/', validateQuery(s.listNotificationsQuery), alertController.notifications);
router.post('/read', alertController.readNotifications);

module.exports = router;
