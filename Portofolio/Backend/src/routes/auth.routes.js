const { Router } = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { limiter } = require('../middlewares/rateLimit.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const authController = require('../controllers/auth.controller');

// Endpoints that take a password, a code, or send an email.
const authLimiter = limiter(30);
// Refresh runs on every page load and every 15 minutes, so it gets more room.
const sessionLimiter = limiter(300);

const router = Router();

router.post('/register', authLimiter, validateBody(s.registerSchema), authController.register);
router.post('/verify-email', authLimiter, validateBody(s.verifyEmailSchema), authController.verifyEmail);
router.post('/verify-email/resend', authLimiter, validateBody(s.emailSchema), authController.resendVerification);
router.post('/login', authLimiter, validateBody(s.loginSchema), authController.login);
router.post('/login/verify', authLimiter, validateBody(s.loginVerifySchema), authController.verifyLogin);
router.post('/refresh', sessionLimiter, validateBody(s.refreshSchema), authController.refresh);
router.post('/logout', sessionLimiter, authenticate, validateBody(s.refreshSchema), authController.logout);
router.post('/forgot-password', authLimiter, validateBody(s.emailSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validateBody(s.resetPasswordSchema), authController.resetPassword);

module.exports = router;
