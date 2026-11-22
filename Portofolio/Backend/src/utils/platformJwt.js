const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('./AppError');

const ISSUER = 'site14-platform';
const AUDIENCE = 'platform-admin';

const secret = () => config.PLATFORM_JWT_SECRET || `${config.JWT_ACCESS_SECRET}:platform`;

function signPlatformToken(adminId) {
  const expiresIn = config.PLATFORM_JWT_TTL_SECONDS;
  const token = jwt.sign({ scope: 'platform' }, secret(), {
    algorithm: 'HS256',
    subject: adminId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn,
  });
  return { token, expiresIn };
}

function verifyPlatformToken(token) {
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.scope !== 'platform') throw new Error('malformed');
    return { adminId: payload.sub };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
}

module.exports = { signPlatformToken, verifyPlatformToken };
