const config = require('../config');
const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { hashPassword } = require('../utils/password');
const userModel = require('../models/user.model');
const authTokens = require('../models/authToken.model');
const refreshTokens = require('../models/refreshToken.model');
const authService = require('./auth.service');
const mail = require('./mail.service');

const INVITATION_TTL_MS = () => config.INVITATION_TTL_HOURS * 60 * 60_000;

const notFound = () => new AppError(404, 'NOT_FOUND', 'User not found');

async function sendInvitation(user, inviterId) {
  const [inviter, company] = await Promise.all([
    userModel.findById(inviterId),
    prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } }),
  ]);
  const token = await authTokens.issueLinkToken(prisma, {
    userId: user.id,
    tokenType: 'invitation',
    ttlMs: INVITATION_TTL_MS(),
  });
  await mail.sendInvitation(user.email, {
    fullName: user.fullName,
    companyName: company.name,
    inviterName: inviter ? inviter.fullName : 'Your administrator',
    token,
  });
}

const toInvited = (user) => ({ ...userModel.toPublic(user), invited_at: user.createdAt.toISOString() });

async function invite(auth, input) {
  let user;
  try {
    user = await userModel.create(prisma, {
      companyId: auth.companyId,
      fullName: input.full_name,
      email: input.email,
      passwordHash: null,
      role: input.role,
      isActive: false,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'This email address already has an account', {
        email: 'This email address already has an account',
      });
    }
    throw err;
  }
  await sendInvitation(user, auth.userId);
  return toInvited(user);
}

async function list(auth, { is_active: isActive }) {
  const users = await userModel.listByCompany(auth.companyId, { isActive });
  return { data: users.map(userModel.toPublic) };
}

async function resendInvitation(auth, id) {
  const user = await userModel.findInCompany(auth.companyId, id);
  if (!user) throw notFound();
  if (!userModel.isPendingInvitation(user)) {
    throw new AppError(409, 'INVITATION_ACCEPTED', 'This user has already accepted their invitation');
  }
  await sendInvitation(user, auth.userId);
}

async function describeInvitation(token) {
  const userId = await authTokens.findUsableLinkToken({ token, tokenType: 'invitation' });
  const user = userId && (await userModel.findById(userId));
  if (!user || !userModel.isPendingInvitation(user)) {
    throw new AppError(400, 'INVALID_TOKEN', 'This invitation is invalid, has expired, or was already used');
  }
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } });
  return { full_name: user.fullName, email: user.email, role: user.role, company_name: company.name };
}

async function acceptInvitation(token, { password }) {
  const passwordHash = await hashPassword(password);
  const session = await prisma.$transaction(async (tx) => {
    const userId = await authTokens.consumeLinkToken(tx, { token, tokenType: 'invitation' });
    if (!userId) return null;
    const pending = await userModel.findById(userId, tx);
    if (!pending || !userModel.isPendingInvitation(pending)) return null;
    const user = await userModel.update(tx, userId, { passwordHash, isActive: true, isEmailVerified: true });
    return authService.issueSession(user, tx);
  });
  if (!session) {
    throw new AppError(400, 'INVALID_TOKEN', 'This invitation is invalid, has expired, or was already used');
  }
  return session;
}

async function deactivate(auth, id) {
  if (id === auth.userId) {
    throw new AppError(400, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
  }
  const user = await userModel.findInCompany(auth.companyId, id);
  if (!user) throw notFound();

  await prisma.$transaction(async (tx) => {
    if (userModel.isPendingInvitation(user)) {
      await userModel.deletePendingInvitation(tx, user.id);
      return;
    }
    await userModel.update(tx, user.id, { isActive: false });
    await refreshTokens.revokeAllForUser(tx, user.id);
    await authTokens.retireAll(tx, user.id);
  });
}

module.exports = { invite, list, resendInvitation, describeInvitation, acceptInvitation, deactivate };
