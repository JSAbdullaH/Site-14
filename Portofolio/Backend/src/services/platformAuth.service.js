const config = require('../config');
const { prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { burnPasswordCheck, hashPassword, verifyPassword } = require('../utils/password');
const { signPlatformToken } = require('../utils/platformJwt');

const FIELDS = { id: true, fullName: true, email: true, passwordHash: true, isActive: true, lockedUntil: true, lastLoginAt: true, createdAt: true };

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

function toPublic(a) {
  return {
    id: a.id,
    full_name: a.fullName,
    email: a.email,
    last_login_at: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    created_at: a.createdAt.toISOString(),
  };
}

async function registerFailure(id) {
  await prisma.$executeRaw`
    UPDATE platform_admins SET
        failed_login_count = CASE
          WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
          ELSE failed_login_count + 1 END,
        locked_until = CASE
          WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
                     ELSE failed_login_count + 1 END) >= ${config.LOGIN_MAX_FAILURES}::int
          THEN now() + make_interval(mins => ${config.LOGIN_LOCK_MINUTES}::int)
          ELSE NULL END
      WHERE id = ${id}::uuid`;
}

async function login({ email, password }) {
  const admin = await prisma.platformAdmin.findUnique({ where: { email }, select: FIELDS });
  if (!admin || !admin.isActive) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }
  if (!(await verifyPassword(admin.passwordHash, password))) {
    await registerFailure(admin.id);
    throw invalidCredentials();
  }
  const updated = await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    select: FIELDS,
  });
  const { token, expiresIn } = signPlatformToken(admin.id);
  return { access_token: token, expires_in: expiresIn, admin: { ...toPublic(updated), kind: 'admin', company: null } };
}

const USER_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  isActive: true,
  isPlatformAdmin: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
};

const userToPublic = (u) => ({
  id: u.id,
  full_name: u.fullName,
  email: u.email,
  kind: 'user',
  company: u.company,
  last_login_at: null,
  created_at: u.createdAt.toISOString(),
});

// A company user marked as SITE14 staff opens the owner portal with the session they
// already have: no second password.
async function fromSession(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
  if (!user || !user.isActive || !user.isPlatformAdmin) {
    throw new AppError(403, 'NOT_PLATFORM_ADMIN', 'This account does not have access to the SITE14 owner portal');
  }
  const { token, expiresIn } = signPlatformToken(user.id, 'user');
  return { access_token: token, expires_in: expiresIn, admin: userToPublic(user) };
}

async function me(platform) {
  if (platform.kind === 'user') {
    const user = await prisma.user.findUnique({ where: { id: platform.userId }, select: USER_FIELDS });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Admin not found');
    return userToPublic(user);
  }
  const admin = await prisma.platformAdmin.findUnique({ where: { id: platform.adminId }, select: FIELDS });
  if (!admin) throw new AppError(404, 'NOT_FOUND', 'Admin not found');
  return { ...toPublic(admin), kind: 'admin', company: null };
}

async function upsertAdmin({ email, fullName, password }) {
  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    create: { email, fullName, passwordHash },
    update: { fullName, passwordHash, isActive: true, failedLoginCount: 0, lockedUntil: null },
    select: FIELDS,
  });
  return toPublic(admin);
}

module.exports = { login, fromSession, me, upsertAdmin };
