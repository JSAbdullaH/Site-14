const config = require('../config');
const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { burnPasswordCheck, hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const companyModel = require('../models/company.model');
const userModel = require('../models/user.model');

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

// Prisma error P2002 = unique constraint violation (PostgreSQL 23505).
const isUniqueViolation = (err) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

async function register(input) {
  const passwordHash = await hashPassword(input.password);
  try {
    // Company and first admin are saved together, or neither is.
    await prisma.$transaction(async (tx) => {
      const company = await companyModel.create(tx, {
        name: input.company_name,
        commercialRegistration: input.commercial_registration,
      });
      await userModel.create(tx, {
        companyId: company.id,
        fullName: input.full_name,
        email: input.email,
        passwordHash,
        role: 'company_admin',
      });
    });
  } catch (err) {
    // Same answer for a taken email, so the endpoint does not reveal who has an account.
    if (isUniqueViolation(err)) return;
    throw err;
  }
}

async function login(input) {
  const user = await userModel.findByEmail(input.email);

  if (!user || !user.passwordHash) {
    await burnPasswordCheck(input.password);
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await burnPasswordCheck(input.password);
    throw invalidCredentials();
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    await userModel.registerFailure(user.id);
    throw invalidCredentials();
  }

  if (!user.isActive) throw invalidCredentials();
  if (config.REQUIRE_EMAIL_VERIFICATION && !user.isEmailVerified) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email address before signing in');
  }

  await userModel.resetFailures(user.id);

  const { token, expiresIn } = signAccessToken({
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
  });

  return {
    access_token: token,
    expires_in: expiresIn,
    user: {
      id: user.id,
      full_name: user.fullName,
      email: user.email,
      role: user.role,
      company_id: user.companyId,
    },
  };
}

module.exports = { register, login };
