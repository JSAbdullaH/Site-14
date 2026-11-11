const AppError = require('../utils/AppError');
const { prisma } = require('../config/db');
const { verifyPlatformToken } = require('../utils/platformJwt');

async function authenticatePlatform(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const { adminId } = verifyPlatformToken(header.slice(7).trim());
  const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId }, select: { id: true, isActive: true } });
  if (!admin || !admin.isActive) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  req.platform = { adminId: admin.id };
  next();
}

module.exports = { authenticatePlatform };
