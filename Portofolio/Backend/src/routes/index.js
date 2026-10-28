const { Router } = require('express');
const authRoutes = require('./auth.routes');
const companyRoutes = require('./company.routes');
const userRoutes = require('./user.routes');
const invitationRoutes = require('./invitation.routes');
const siteRoutes = require('./site.routes');
const employeeRoutes = require('./employee.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/companies', companyRoutes);
router.use('/users', userRoutes);
router.use('/invitations', invitationRoutes);
router.use('/sites', siteRoutes);
router.use('/employees', employeeRoutes);

module.exports = router;
