const { Router } = require('express');
const { authenticate, requireRole, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const employeeController = require('../controllers/employee.controller');

const router = Router();

router.use(authenticate);

const readers = requireRole('site_manager');

router.get('/', readers, validateQuery(s.listEmployeesQuery), employeeController.list);
router.get('/:id', readers, validateParams(s.idParams), employeeController.get);
router.post('/', requireAdmin, validateBody(s.createEmployeeSchema), employeeController.create);
router.patch('/:id', requireAdmin, validateParams(s.idParams), validateBody(s.updateEmployeeSchema), employeeController.update);
router.delete('/:id', requireAdmin, validateParams(s.idParams), employeeController.deactivate);

module.exports = router;
