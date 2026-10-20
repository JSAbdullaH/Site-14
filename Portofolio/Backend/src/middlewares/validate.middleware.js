const AppError = require('../utils/AppError');

const validateBody =(schema) => (req, _res, next) => {
  req.body = schema.parse(req.body || {});
  next();
};

const validateQuery = (schema) => (req, _res, next) => {
  req.validQuery = schema.parse(req.query || {});
  next();
};

const validateParams = (schema) => (req, _res, next) => {
  if (!schema.safeParse(req.params).success) throw new AppError(404, 'NOT_FOUND', 'Not found');
  next();
};

module.exports = { validateBody, validateQuery, validateParams };
