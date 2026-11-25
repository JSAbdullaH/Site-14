const AppError = require('../utils/AppError');
const { prisma } = require('../config/db');
const { verifyPlatformToken } = require('../utils/platformJwt');

async function authenticatePlatform(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const claims = verifyPlatformToken(header.slice(7).trim());
  const invalid = () => new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  if (claims.kind === 'user') {
    // Checked on every call, so taking the flag away (or deactivating them) locks them out at once.
    const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: { id: true, isActive: true, isPlatformAdmin: true } });
    if (!user || !user.isActive || !user.isPlatformAdmin) throw invalid();
    req.platform = { kind: 'user', userId: user.id };
    return next();
  }
  const admin = await prisma.platformAdmin.findUnique({ where: { id: claims.adminId }, select: { id: true, isActive: true } });
  if (!admin || !admin.isActive) throw invalid();
  req.platform = { kind: 'admin', adminId: admin.id };
  next();
}

module.exports = { authenticatePlatform };
