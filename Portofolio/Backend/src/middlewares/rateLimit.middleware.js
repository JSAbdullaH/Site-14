const rateLimit = require('express-rate-limit');
const config = require('../config');

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test',
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } });
    },
  });

// Per device, not per IP: many devices can share one mobile gateway. Runs after
// authenticateDevice. A device sends a batch every few seconds at most.
const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `device:${req.device.id}`,
  skip: () => config.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many calls from this device. Buffer readings and send them together.' } });
  },
});

module.exports = { limiter, deviceLimiter };
