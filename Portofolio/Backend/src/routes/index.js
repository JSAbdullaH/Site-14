const { Router } = require('express');
const authRoutes = require('./auth.routes');
const companyRoutes = require('./company.routes');
const userRoutes = require('./user.routes');
const invitationRoutes = require('./invitation.routes');
const geofenceRoutes = require('./geofence.routes');
const locationRoutes = require('./location.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/companies', companyRoutes);
router.use('/users', userRoutes);
router.use('/invitations', invitationRoutes);
router.use('/geofences', geofenceRoutes);
router.use('/locations', locationRoutes);

module.exports = router;
