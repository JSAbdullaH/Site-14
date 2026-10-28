const { Router } = require('express');
const { authenticate, requireAdmin, requireRole } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const employeeController = require('../controllers/employee.controller');

const router = Router();

router.use(authenticate);

// The rest of the employee profile (create, edit, deactivate, import) belongs to
// the Employee & Device epic. PATCH takes only site_id until then.
router.get('/', requireRole('site_manager'), validateQuery(s.listEmployeesQuery), employeeController.list);
router.patch('/:id', requireAdmin, validateParams(s.idParams), validateBody(s.assignEmployeeSchema), employeeController.assignSite);

module.exports = router;
