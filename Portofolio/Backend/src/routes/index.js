const { Router } = require('express');
const authRoutes = require('./auth.routes');
const companyRoutes = require('./company.routes');
const userRoutes = require('./user.routes');
const invitationRoutes = require('./invitation.routes');
const siteRoutes = require('./site.routes');
const employeeRoutes = require('./employee.routes');
const geofenceRoutes = require('./geofence.routes');
const locationRoutes = require('./location.routes');
const taskRoutes = require('./task.routes');
const reportRoutes = require('./report.routes');
const deviceRoutes = require('./device.routes');
const ingestRoutes = require('./ingest.routes');
const pairingRoutes = require('./pairing.routes');
const marketplaceRoutes = require('./marketplace.routes');
const platformRoutes = require('./platform.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/companies', companyRoutes);
router.use('/users', userRoutes);
router.use('/invitations', invitationRoutes);
router.use('/sites', siteRoutes);
router.use('/employees', employeeRoutes);
router.use('/geofences', geofenceRoutes);
router.use('/locations', locationRoutes);
router.use('/tasks', taskRoutes);
router.use('/reports', reportRoutes);
router.use('/devices', deviceRoutes);
router.use('/ingest', ingestRoutes);
router.use('/pairing', pairingRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/platform', platformRoutes);

module.exports = router;
