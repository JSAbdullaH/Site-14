const { Router } = require('express');
const { limiter } = require('../middlewares/rateLimit.middleware');
const { validateBody, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const userController = require('../controllers/user.controller');

const invitationLimiter = limiter(30);

const router = Router();

// Public: the token in the path is the credential.
router.get('/:token', invitationLimiter, validateParams(s.tokenParams), userController.describeInvitation);
router.post(
  '/:token/accept',
  invitationLimiter,
  validateParams(s.tokenParams),
  validateBody(s.acceptInvitationSchema),
  userController.acceptInvitation,
);

module.exports = router;
