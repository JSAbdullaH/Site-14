const { Router } = require('express');
const { authenticate, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const userController = require('../controllers/user.controller');

const router = Router();

// Every route here is for a Company Admin of the caller's own company.
router.use(authenticate, requireAdmin);

router.post('/', validateBody(s.inviteUserSchema), userController.invite);
router.get('/', validateQuery(s.listUsersQuery), userController.list);
router.post('/:id/invitation/resend', validateParams(s.idParams), userController.resendInvitation);
router.delete('/:id', validateParams(s.idParams), userController.deactivate);

module.exports = router;
