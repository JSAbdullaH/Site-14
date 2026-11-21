const config = require('../config');

const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Device-Serial, X-Device-Key';
const ALLOWED_METHODS = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
const EXPOSED_HEADERS = 'Content-Disposition, RateLimit, RateLimit-Policy, Retry-After';

function allowedOrigins() {
  const origins = new Set(config.CORS_ORIGINS);
  origins.add(new URL(config.APP_URL).origin);
  return origins;
}

function cors() {
  const origins = allowedOrigins();
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.vary('Origin');
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    }
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      if (origin && origins.has(origin)) {
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        res.setHeader('Access-Control-Max-Age', '600');
      }
      return res.status(204).end();
    }
    return next();
  };
}

module.exports = { cors, allowedOrigins };
