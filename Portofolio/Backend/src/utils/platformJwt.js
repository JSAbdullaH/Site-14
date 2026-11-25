const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('./AppError');

const ISSUER = 'site14-platform';
const AUDIENCE = 'platform-admin';

const secret = () => config.PLATFORM_JWT_SECRET || `${config.JWT_ACCESS_SECRET}:platform`;

// kind "admin": a platform_admins account (its own password).
// kind "user": a company user marked is_platform_admin, signed in with their company account.
function signPlatformToken(subject, kind = 'admin') {
  const expiresIn = config.PLATFORM_JWT_TTL_SECONDS;
  const token = jwt.sign({ scope: 'platform', kind }, secret(), {
    algorithm: 'HS256',
    subject,
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
    return payload.kind === 'user' ? { kind: 'user', userId: payload.sub } : { kind: 'admin', adminId: payload.sub };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
}

module.exports = { signPlatformToken, verifyPlatformToken };
