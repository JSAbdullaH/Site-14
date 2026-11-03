const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const taskController = require('../controllers/task.controller');

const router = Router();

router.use(authenticate, requireRole('site_manager'));

router.post('/', validateBody(s.createTaskSchema), taskController.create);
router.get('/', validateQuery(s.listTasksQuery), taskController.list);
router.patch('/:id', validateParams(s.idParams), validateBody(s.updateTaskSchema), taskController.update);

module.exports = router;
