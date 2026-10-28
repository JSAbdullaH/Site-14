const { Router } = require('express');
const { authenticate, requireAdmin, requireRole } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const siteController = require('../controllers/site.controller');

const router = Router();

router.use(authenticate);

// Managers read sites (the site selector); only an admin creates or changes them.
router.get('/', requireRole('site_manager'), validateQuery(s.listSitesQuery), siteController.list);
router.get('/:id', requireRole('site_manager'), validateParams(s.idParams), siteController.get);
router.post('/', requireAdmin, validateBody(s.createSiteSchema), siteController.create);
router.patch('/:id', requireAdmin, validateParams(s.idParams), validateBody(s.updateSiteSchema), siteController.update);
router.delete('/:id', requireAdmin, validateParams(s.idParams), siteController.deactivate);

module.exports = router;
