// refresh_tokens: one row per signed-in session, so logging out really ends it.
const { prisma } = require('../config/db');
const { sha256, randomToken } = require('../utils/tokens');

async function create(db, { userId, ttlMs }) {
  const token = randomToken();
  await db.refreshToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

// The session's user id, or null if the token is unknown, expired or revoked.
async function findValid(token) {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { userId: true, expiresAt: true, revokedAt: true },
  });
  if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;
  return row.userId;
}

// Only the owner can revoke their own session.
async function revoke({ token, userId }) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Signs the user out everywhere: after a password reset or a deactivation.
async function revokeAllForUser(db, userId) {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

module.exports = { create, findValid, revoke, revokeAllForUser };
