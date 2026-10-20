const crypto = require('node:crypto');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const randomToken = () => crypto.randomBytes(32).toString('base64url');

const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const codeHash = (tokenId, code) => sha256(`${tokenId}:${code}`);

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { sha256, randomToken, randomCode, codeHash, safeEqual };
