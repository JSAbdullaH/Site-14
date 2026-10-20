// auth_tokens: single-use, time-limited tokens for email verification,
// invitation, password reset and the login one-time code.
const crypto = require('node:crypto');
const { prisma } = require('../config/db');
const { sha256, randomToken, randomCode, codeHash } = require('../utils/tokens');

// Issuing a new token retires the user's earlier unused tokens of the same
// type, so only the most recent email ever works.
async function retire(db, userId, tokenType) {
  await db.authToken.updateMany({
    where: { userId, tokenType, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

// Returns the raw token. Only its hash is stored.
async function issueLinkToken(db, { userId, tokenType, ttlMs }) {
  await retire(db, userId, tokenType);
  const token = randomToken();
  await db.authToken.create({
    data: { userId, tokenType, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

// Six-digit code (login_otp, email_verify). Returns the raw code.
async function issueCode(db, { userId, tokenType, ttlMs }) {
  await retire(db, userId, tokenType);
  const id = crypto.randomUUID();
  const code = randomCode();
  await db.authToken.create({
    data: {
      id, userId, tokenType, tokenHash: codeHash(id, code),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return code;
}

// When the user's last token of this type was issued, for the resend cooldown.
async function lastIssuedAt(userId, tokenType) {
  const row = await prisma.authToken.findFirst({
    where: { userId, tokenType },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return row ? row.createdAt : null;
}

// Marks a link token as used and returns its user id, or null when the token
// is unknown, expired, already used, or of another type. The UPDATE is
// conditional, so two requests racing with the same token cannot both win.
async function consumeLinkToken(db, { token, tokenType }) {
  const row = await db.authToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, tokenType: true },
  });
  if (!row || row.tokenType !== tokenType) return null;
  const { count } = await db.authToken.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return count === 1 ? row.userId : null;
}

// Peek without consuming: used to show who an invitation is for.
async function findUsableLinkToken({ token, tokenType }) {
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { userId: true, tokenType: true, consumedAt: true, expiresAt: true },
  });
  if (!row || row.tokenType !== tokenType || row.consumedAt || row.expiresAt <= new Date()) return null;
  return row.userId;
}

// The user's live code of this type, if any.
async function findActiveCode(userId, tokenType) {
  return prisma.authToken.findFirst({
    where: { userId, tokenType, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tokenHash: true, createdAt: true, expiresAt: true },
  });
}

// Spends one attempt before the code is compared, in one statement, so
// parallel guesses cannot exceed the limit. Returns false when none are left.
async function spendAttempt(tokenId, maxAttempts) {
  const { count } = await prisma.authToken.updateMany({
    where: { id: tokenId, consumedAt: null, attemptCount: { lt: maxAttempts } },
    data: { attemptCount: { increment: 1 } },
  });
  return count === 1;
}

async function consumeById(tokenId) {
  const { count } = await prisma.authToken.updateMany({
    where: { id: tokenId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return count === 1;
}

async function retireAll(db, userId) {
  await db.authToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
}

module.exports = {
  issueLinkToken,
  issueCode,
  lastIssuedAt,
  consumeLinkToken,
  findUsableLinkToken,
  findActiveCode,
  spendAttempt,
  consumeById,
  retireAll,
};
