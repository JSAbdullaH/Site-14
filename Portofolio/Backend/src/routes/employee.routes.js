const { Router } = require('express');
const multer = require('multer');
const AppError = require('../utils/AppError');
const { authenticate, requireRole, requireAdmin } = require('../middlewares/auth.middleware');
const { validateBody, validateQuery, validateParams } = require('../middlewares/validate.middleware');
const s = require('../utils/schemas');
const employeeController = require('../controllers/employee.controller');

const router = Router();

router.use(authenticate);

const readers = requireRole('site_manager');

const csvUpload = (req, res, next) => {
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } }).single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'INVALID_FILE', 'The file is larger than 1 MB'));
    return next(new AppError(422, 'INVALID_FILE', 'Send the CSV in a form field named "file"'));
  });
};

router.get('/import/template', requireAdmin, employeeController.importTemplate);
router.post('/import/preview', requireAdmin, csvUpload, validateBody(s.importColumnMap), employeeController.importPreview);
router.post('/import', requireAdmin, csvUpload, validateBody(s.importColumnMap), employeeController.importCommit);

router.get('/', readers, validateQuery(s.listEmployeesQuery), employeeController.list);
router.get('/:id', readers, validateParams(s.idParams), employeeController.get);
router.post('/', requireAdmin, validateBody(s.createEmployeeSchema), employeeController.create);
router.patch('/:id', requireAdmin, validateParams(s.idParams), validateBody(s.updateEmployeeSchema), employeeController.update);
router.delete('/:id', requireAdmin, validateParams(s.idParams), employeeController.deactivate);

module.exports = router;
