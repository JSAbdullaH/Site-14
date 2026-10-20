const { prisma } = require('../config/db');
const config = require('../config');

async function create(tx, { companyId, fullName, email, passwordHash, role }) {
  return tx.user.create({
    data: { companyId, fullName, email, passwordHash, role, isEmailVerified: false },
    select: { id: true },
  });
}

// Emails are stored lower-case (zod lowercases them, and a CHECK in the
// database enforces it), so an exact match is a case-insensitive match.
async function findByEmail(email) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      companyId: true,
      fullName: true,
      email: true,
      passwordHash: true,
      role: true,
      isEmailVerified: true,
      isActive: true,
      lockedUntil: true,
    },
  });
}

// Raw SQL on purpose: the read, the count and the lock happen in ONE statement,
// so two wrong passwords sent at the same moment cannot both read the old count.
// Prisma's update API cannot express this CASE logic atomically.
async function registerFailure(userId) {
  await prisma.$executeRaw`
    UPDATE users SET
        failed_login_count = CASE
          WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
          ELSE failed_login_count + 1 END,
        locked_until = CASE
          WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
                     ELSE failed_login_count + 1 END) >= ${config.LOGIN_MAX_FAILURES}::int
          THEN now() + make_interval(mins => ${config.LOGIN_LOCK_MINUTES}::int)
          ELSE NULL END
      WHERE id = ${userId}::uuid`;
}

async function resetFailures(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

module.exports = { create, findByEmail, registerFailure, resetFailures };
