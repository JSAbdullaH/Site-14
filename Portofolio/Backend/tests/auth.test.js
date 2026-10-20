// End-to-end through the real Express app and the test database:
// route -> validation -> controller -> service -> Prisma -> PostgreSQL.
// Emails land in mail.outbox (no SMTP in tests), so links and codes are read from there.
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { pool, truncateAll } = require('./setup');

const account = {
  company_name: 'Al-Bina Advanced',
  full_name: 'Sara Admin',
  email: 'Sara@AlBina.test',
  password: 'correct-horse-12',
};
const api = (path) => `/api/v1${path}`;
const post = (path, body) => request(app).post(api(path)).send(body);
const register = (body = account) => post('/auth/register', body);
const login = (email, password) => post('/auth/login', { email, password });

// The last email sent to an address.
const lastMail = (to) => [...outbox].reverse().find((m) => m.to === to.toLowerCase());
const linkToken = (to) => /token=([\w-]+)/.exec(lastMail(to).text)[1];
const loginCode = (to) => /sign-in code is (\d{6})/.exec(lastMail(to).text)[1];
const verifyCode = (to) => /confirmation code is (\d{6})/.exec(lastMail(to).text)[1];
const verify = (email, code) => post('/auth/verify-email', { email, code });
const otherCode = (code) => (code === '000000' ? '111111' : '000000');

// Pretend the last verification code was sent this many seconds ago.
const ageVerifyCode = (seconds) =>
  pool.query(
    `UPDATE auth_tokens SET created_at = now() - make_interval(secs => $1), expires_at = expires_at - make_interval(secs => $1)
      WHERE token_type = 'email_verify'`,
    [seconds],
  );

const ageLoginCode = (seconds) =>
  pool.query(
    `UPDATE auth_tokens SET created_at = now() - make_interval(secs => $1), expires_at = expires_at - make_interval(secs => $1)
      WHERE token_type = 'login_otp'`,
    [seconds],
  );

async function registerAndVerify(body = account) {
  await register(body).expect(201);
  await verify(body.email, verifyCode(body.email)).expect(200);
}

// Full sign-in: password, then the emailed code. Returns the session body and cookie.
async function signIn(email = account.email, password = account.password) {
  await login(email, password).expect(200);
  const res = await post('/auth/login/verify', { email, code: loginCode(email) }).expect(200);
  return { ...res.body, cookie: res.headers['set-cookie'] };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

test('GET /health answers', async () => {
  await request(app).get('/health').expect(200, { status: 'ok' });
});

describe('POST /auth/register', () => {
  test('creates the company and its first admin together, unverified', async () => {
    const res = await register().expect(201);
    expect(res.body).toMatchObject({
      verification_required: true,
      code_expires_in: 300,
      resend_after: 60,
      company: { name: 'Al-Bina Advanced' },
      user: { email: 'sara@albina.test', role: 'company_admin', is_email_verified: false },
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const { rows } = await pool.query(
      'SELECT u.email, u.role, u.full_name, u.is_email_verified, c.name FROM users u JOIN companies c ON c.id = u.company_id',
    );
    expect(rows).toEqual([
      { email: 'sara@albina.test', role: 'company_admin', full_name: 'Sara Admin', is_email_verified: false, name: 'Al-Bina Advanced' },
    ]);
  });

  test('emails a six-digit code valid for 5 minutes, and stores only its hash', async () => {
    await register().expect(201);
    expect(verifyCode(account.email)).toMatch(/^\d{6}$/);
    const { rows } = await pool.query(
      "SELECT token_hash, round(extract(epoch FROM expires_at - created_at))::int AS ttl FROM auth_tokens WHERE token_type = 'email_verify'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].ttl).toBe(300);
  });

  test('a taken email gets the same answer, leaves no extra company, and warns the owner', async () => {
    await register().expect(201);
    const res = await register({ ...account, company_name: 'Another Co', email: 'SARA@albina.test' }).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['code_expires_in', 'company', 'resend_after', 'user', 'verification_required']);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM companies');
    expect(rows[0].n).toBe(1);
    expect(lastMail(account.email).subject).toMatch(/tried to register/);
  });

  test('rejects a short password with 422', async () => {
    const res = await register({ ...account, password: 'short' }).expect(422);
    expect(res.body.error.fields).toHaveProperty('password');
  });
});

describe('email verification', () => {
  beforeEach(() => register().expect(201));

  test('an unverified admin cannot sign in', async () => {
    const res = await login(account.email, account.password).expect(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('the code verifies the email once', async () => {
    const code = verifyCode(account.email);
    await verify('SARA@albina.test', code).expect(200, { verified: true });
    await verify(account.email, code).expect(401);
    const { rows } = await pool.query('SELECT is_email_verified FROM users');
    expect(rows[0].is_email_verified).toBe(true);
  });

  test('five wrong codes lock the code, even for the right one', async () => {
    const code = verifyCode(account.email);
    for (let i = 0; i < 5; i += 1) await verify(account.email, otherCode(code)).expect(401);
    await verify(account.email, code).expect(401);
  });

  test('a code older than 5 minutes is refused', async () => {
    const code = verifyCode(account.email);
    await ageVerifyCode(301);
    await verify(account.email, code).expect(401);
  });

  test('a new code can be requested only after 1 minute', async () => {
    const first = verifyCode(account.email);
    const before = outbox.length;
    await post('/auth/verify-email/resend', { email: account.email }).expect(204);
    expect(outbox.length).toBe(before);

    await ageVerifyCode(61);
    await post('/auth/verify-email/resend', { email: account.email }).expect(204);
    expect(outbox.length).toBe(before + 1);
    const second = verifyCode(account.email);
    if (first !== second) await verify(account.email, first).expect(401);
    await verify(account.email, second).expect(200);
  });

  test('resend answers 204 for an unknown email and sends nothing', async () => {
    const before = outbox.length;
    await post('/auth/verify-email/resend', { email: 'nobody@albina.test' }).expect(204);
    expect(outbox.length).toBe(before);
  });

  test('a code for another account does not verify this one', async () => {
    await register({ ...account, company_name: 'Other Co', email: 'omar@other.test' }).expect(201);
    const code = verifyCode('omar@other.test');
    if (code !== verifyCode(account.email)) await verify(account.email, code).expect(401);
  });
});

describe('login with a one-time code', () => {
  beforeEach(() => registerAndVerify());

  test('the password step sends a code and issues no token', async () => {
    const res = await login('SARA@albina.TEST', account.password).expect(200);
    expect(res.body).toEqual({ code_required: true, expires_in: 300, resend_after: 60 });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(loginCode(account.email)).toMatch(/^\d{6}$/);
  });

  test('the right code returns tokens, the user, and an httpOnly refresh cookie', async () => {
    const session = await signIn();
    expect(session).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 900,
      user: { email: 'sara@albina.test', role: 'company_admin', full_name: 'Sara Admin' },
    });
    expect(session.cookie[0]).toMatch(/^site14_refresh=/);
    expect(session.cookie[0]).toMatch(/HttpOnly/);
    expect(session.cookie[0]).toMatch(/SameSite=Strict/);
    expect(session.cookie[0]).toMatch(/Path=\/api\/v1\/auth/);
  });

  test('a code works only once', async () => {
    await login(account.email, account.password).expect(200);
    const code = loginCode(account.email);
    await post('/auth/login/verify', { email: account.email, code }).expect(200);
    await post('/auth/login/verify', { email: account.email, code }).expect(401);
  });

  test('five wrong codes lock the code, even for the right one', async () => {
    await login(account.email, account.password).expect(200);
    const code = loginCode(account.email);
    for (let i = 0; i < 5; i += 1) await post('/auth/login/verify', { email: account.email, code: otherCode(code) }).expect(401);
    const { rows } = await pool.query("SELECT attempt_count FROM auth_tokens WHERE token_type = 'login_otp'");
    expect(rows[0].attempt_count).toBe(5);
    await post('/auth/login/verify', { email: account.email, code }).expect(401);
  });

  test('an expired code is refused', async () => {
    await login(account.email, account.password).expect(200);
    await pool.query("UPDATE auth_tokens SET expires_at = now() - interval '1 second' WHERE token_type = 'login_otp'");
    await post('/auth/login/verify', { email: account.email, code: loginCode(account.email) }).expect(401);
  });

  test('within 1 minute a second login sends no new code and keeps the first one', async () => {
    await login(account.email, account.password).expect(200);
    const code = loginCode(account.email);
    const before = outbox.length;
    const res = await login(account.email, account.password).expect(200);
    expect(outbox.length).toBe(before);
    expect(res.body.resend_after).toBeGreaterThan(0);
    expect(res.body.resend_after).toBeLessThanOrEqual(60);
    await post('/auth/login/verify', { email: account.email, code }).expect(200);
  });

  test('a code older than 5 minutes is refused', async () => {
    await login(account.email, account.password).expect(200);
    await ageLoginCode(301);
    await post('/auth/login/verify', { email: account.email, code: loginCode(account.email) }).expect(401);
  });

  test('after 1 minute a new login retires the previous code', async () => {
    await login(account.email, account.password).expect(200);
    const first = loginCode(account.email);
    await ageLoginCode(61);
    await login(account.email, account.password).expect(200);
    const second = loginCode(account.email);
    if (first !== second) await post('/auth/login/verify', { email: account.email, code: first }).expect(401);
    await post('/auth/login/verify', { email: account.email, code: second }).expect(200);
  });

  test('a wrong password and an unknown email look the same', async () => {
    const a = await login(account.email, 'wrong-password-1').expect(401);
    const b = await login('nobody@albina.test', 'wrong-password-1').expect(401);
    expect(a.body).toEqual(b.body);
  });

  test('locks the account after 5 failures, even for the right password', async () => {
    for (let i = 0; i < 5; i += 1) await login(account.email, 'wrong-password-1').expect(401);
    const { rows } = await pool.query('SELECT failed_login_count, locked_until > now() AS locked FROM users');
    expect(rows[0]).toEqual({ failed_login_count: 5, locked: true });
    await login(account.email, account.password).expect(401);
  });

  test('a correct password resets the failure count', async () => {
    await login(account.email, 'wrong-password-1').expect(401);
    await login(account.email, account.password).expect(200);
    const { rows } = await pool.query('SELECT failed_login_count FROM users');
    expect(rows[0].failed_login_count).toBe(0);
  });
});

describe('refresh and logout', () => {
  beforeEach(() => registerAndVerify());

  test('the cookie alone gets a new access token', async () => {
    const { cookie } = await signIn();
    const res = await request(app).post(api('/auth/refresh')).set('Cookie', cookie).expect(200);
    expect(res.body).toMatchObject({ access_token: expect.any(String), expires_in: 900, user: { email: 'sara@albina.test' } });
  });

  test('the refresh token in the body works too', async () => {
    const { refresh_token } = await signIn();
    await post('/auth/refresh', { refresh_token }).expect(200);
  });

  test('without a token refresh is 401', async () => {
    await post('/auth/refresh', {}).expect(401);
    await post('/auth/refresh', { refresh_token: 'made-up' }).expect(401);
  });

  test('logout revokes the session, so refresh stops working', async () => {
    const { access_token, cookie } = await signIn();
    await request(app).post(api('/auth/logout')).set(bearer(access_token)).set('Cookie', cookie).expect(204);
    const { rows } = await pool.query('SELECT revoked_at IS NOT NULL AS revoked FROM refresh_tokens');
    expect(rows).toEqual([{ revoked: true }]);
    await request(app).post(api('/auth/refresh')).set('Cookie', cookie).expect(401);
  });

  test('logout needs an access token', async () => {
    const { cookie } = await signIn();
    await request(app).post(api('/auth/logout')).set('Cookie', cookie).expect(401);
  });

  test('an expired refresh token is refused', async () => {
    const { refresh_token } = await signIn();
    await pool.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 second'");
    await post('/auth/refresh', { refresh_token }).expect(401);
  });
});

describe('password reset', () => {
  beforeEach(() => registerAndVerify());

  test('forgot-password answers 204 for anyone, and only mails real users', async () => {
    const before = outbox.length;
    await post('/auth/forgot-password', { email: 'nobody@albina.test' }).expect(204);
    expect(outbox.length).toBe(before);
    await post('/auth/forgot-password', { email: account.email }).expect(204);
    expect(lastMail(account.email).subject).toMatch(/Reset/);
  });

  test('the link sets a new password once, unlocks the account, and ends every session', async () => {
    const { refresh_token } = await signIn();
    for (let i = 0; i < 5; i += 1) await login(account.email, 'wrong-password-1').expect(401);

    await post('/auth/forgot-password', { email: account.email }).expect(204);
    const token = linkToken(account.email);
    await post('/auth/reset-password', { token, password: 'brand-new-pass-34' }).expect(200, { reset: true });
    await post('/auth/reset-password', { token, password: 'another-pass-56' }).expect(400);

    await post('/auth/refresh', { refresh_token }).expect(401);
    await login(account.email, account.password).expect(401);
    await signIn(account.email, 'brand-new-pass-34');
  });

  test('rejects a weak new password', async () => {
    await post('/auth/forgot-password', { email: account.email }).expect(204);
    await post('/auth/reset-password', { token: linkToken(account.email), password: 'short' }).expect(422);
  });
});

describe('protected routes and company scope', () => {
  test('GET /companies/me needs a token', async () => {
    await request(app).get(api('/companies/me')).expect(401);
    await request(app).get(api('/companies/me')).set(bearer('not-a-jwt')).expect(401);
  });

  test('returns the company from the token, with the API field names', async () => {
    await registerAndVerify();
    const { access_token, user } = await signIn();
    const res = await request(app).get(api('/companies/me')).set(bearer(access_token)).expect(200);
    expect(res.body).toMatchObject({
      id: user.company_id,
      name: 'Al-Bina Advanced',
      midday_ban_start_time: '12:00:00',
      midday_ban_end_time: '15:00:00',
    });
  });
});
