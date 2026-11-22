const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const { Prisma } = require('../config/db');

function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.fields) body.fields = err.fields;
    return res.status(err.status).json({ error: body });
  }

  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!(key in fields)) fields[key] = issue.message;
    }
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'One or more fields are invalid', fields },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

module.exports = { notFound, errorHandler };
