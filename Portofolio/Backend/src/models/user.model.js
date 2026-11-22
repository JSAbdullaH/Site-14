const { prisma } = require('../config/db');
const config = require('../config');

const AUTH_FIELDS = {
  id: true,
  companyId: true,
  fullName: true,
  email: true,
  passwordHash: true,
  role: true,
  isEmailVerified: true,
  isActive: true,
  lockedUntil: true,
  createdAt: true,
};

async function create(tx, { companyId, fullName, email, passwordHash, role, isActive = true }) {
  return tx.user.create({
    data: { companyId, fullName, email, passwordHash, role, isActive, isEmailVerified: false },
    select: AUTH_FIELDS,
  });
}

// Emails are stored lower-case (zod lowercases them, and a CHECK in the
// database enforces it), so an exact match is a case-insensitive match.
async function findByEmail(email) {
  return prisma.user.findUnique({ where: { email }, select: AUTH_FIELDS });
}

async function findById(id, db = prisma) {
  return db.user.findUnique({ where: { id }, select: AUTH_FIELDS });
}

async function list(db, { isActive } = {}) {
  return db.user.findMany({
    where: isActive === undefined ? {} : { isActive },
    orderBy: { createdAt: 'asc' },
    select: AUTH_FIELDS,
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

async function update(db, id, data) {
  return db.user.update({ where: { id }, data, select: AUTH_FIELDS });
}

// An invitation that was never accepted has no history, so it is removed
// instead of being kept as an inactive account.
async function deletePendingInvitation(tx, id) {
  await tx.authToken.deleteMany({ where: { userId: id } });
  await tx.user.delete({ where: { id } });
}

// A user who has not accepted their invitation yet has no password.
const isPendingInvitation = (user) => user.passwordHash === null;

// The API shape (snake_case) of a user. Never includes the password hash.
function toPublic(user) {
  return {
    id: user.id,
    full_name: user.fullName,
    email: user.email,
    role: user.role,
    company_id: user.companyId,
    is_active: user.isActive,
    is_email_verified: user.isEmailVerified,
    invitation_pending: isPendingInvitation(user),
    created_at: user.createdAt.toISOString(),
  };
}

module.exports = {
  create,
  findByEmail,
  findById,
  list,
  registerFailure,
  resetFailures,
  update,
  deletePendingInvitation,
  isPendingInvitation,
  toPublic,
};
