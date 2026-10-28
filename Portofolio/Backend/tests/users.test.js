// Site Manager accounts: invitation, acceptance, listing, deactivation, and
// the company boundary around all of it.
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { pool, truncateAll } = require('./setup');

const api = (path) => `/api/v1${path}`;
const post = (path, body) => request(app).post(api(path)).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const lastMail = (to) => [...outbox].reverse().find((m) => m.to === to.toLowerCase());
const inviteToken = (to) => /\/invite\/([\w-]+)/.exec(lastMail(to).text)[1];

// Registers, verifies and signs in a company admin; returns their session.
async function adminOf(company, email) {
  const body = { company_name: company, full_name: `${company} Admin`, email, password: 'correct-horse-12' };
  await post('/auth/register', body).expect(201);
  await post('/auth/verify-email', { email, code: /confirmation code is (\d{6})/.exec(lastMail(email).text)[1] }).expect(200);
  await post('/auth/login', { email, password: body.password }).expect(200);
  const code = /sign-in code is (\d{6})/.exec(lastMail(email).text)[1];
  return (await post('/auth/login/verify', { email, code }).expect(200)).body;
}

const invite = (token, body = { full_name: 'Omar Manager', email: 'omar@albina.test' }) =>
  request(app).post(api('/users')).set(bearer(token)).send(body);

let admin;
beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /users (invite)', () => {
  test('creates an inactive manager with no password and emails an invitation', async () => {
    const res = await invite(admin.access_token).expect(201);
    expect(res.body).toMatchObject({
      full_name: 'Omar Manager',
      email: 'omar@albina.test',
      role: 'site_manager',
      is_active: false,
      invited_at: expect.any(String),
    });
    const { rows } = await pool.query("SELECT password_hash, is_active FROM users WHERE email = 'omar@albina.test'");
    expect(rows).toEqual([{ password_hash: null, is_active: false }]);
    expect(lastMail('omar@albina.test').subject).toMatch(/invited you to Al-Bina/);
  });

  test('a taken email is a 409', async () => {
    await invite(admin.access_token).expect(201);
    const res = await invite(admin.access_token).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('needs an admin token', async () => {
    await request(app).post(api('/users')).send({ full_name: 'X Y', email: 'x@y.test' }).expect(401);
  });
});

describe('accepting an invitation', () => {
  beforeEach(() => invite(admin.access_token).expect(201));

  test('the invitation can be looked up by its token', async () => {
    const res = await request(app).get(api(`/invitations/${inviteToken('omar@albina.test')}`)).expect(200);
    expect(res.body).toEqual({
      full_name: 'Omar Manager', email: 'omar@albina.test', role: 'site_manager', company_name: 'Al-Bina',
    });
  });

  test('the manager sets their own password and is signed in', async () => {
    const token = inviteToken('omar@albina.test');
    const res = await post(`/invitations/${token}/accept`, { password: 'omars-own-pass-1' }).expect(200);
    expect(res.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      user: { email: 'omar@albina.test', role: 'site_manager', is_active: true, is_email_verified: true },
    });
    expect(res.headers['set-cookie'][0]).toMatch(/^site14_refresh=/);
    await post(`/invitations/${token}/accept`, { password: 'second-try-pass' }).expect(400);
    await request(app).get(api('/companies/me')).set(bearer(res.body.access_token)).expect(200);
  });

  test('a manager cannot use admin routes', async () => {
    const res = await post(`/invitations/${inviteToken('omar@albina.test')}/accept`, { password: 'omars-own-pass-1' });
    await request(app).get(api('/users')).set(bearer(res.body.access_token)).expect(403);
    await invite(res.body.access_token, { full_name: 'Sneaky', email: 'sneaky@albina.test' }).expect(403);
  });

  test('a pending invitee cannot sign in or reset a password', async () => {
    await post('/auth/login', { email: 'omar@albina.test', password: 'anything-at-all' }).expect(401);
    const before = outbox.length;
    await post('/auth/forgot-password', { email: 'omar@albina.test' }).expect(204);
    expect(outbox.length).toBe(before);
  });

  test('resending replaces the earlier link', async () => {
    const first = inviteToken('omar@albina.test');
    const { rows } = await pool.query("SELECT id FROM users WHERE email = 'omar@albina.test'");
    await request(app).post(api(`/users/${rows[0].id}/invitation/resend`)).set(bearer(admin.access_token)).expect(204);
    const second = inviteToken('omar@albina.test');
    expect(second).not.toBe(first);
    await post(`/invitations/${first}/accept`, { password: 'omars-own-pass-1' }).expect(400);
    await post(`/invitations/${second}/accept`, { password: 'omars-own-pass-1' }).expect(200);
    await request(app).post(api(`/users/${rows[0].id}/invitation/resend`)).set(bearer(admin.access_token)).expect(409);
  });
});

describe('GET /users', () => {
  test('lists the company users, filtered by is_active', async () => {
    await invite(admin.access_token).expect(201);
    const all = await request(app).get(api('/users')).set(bearer(admin.access_token)).expect(200);
    expect(all.body.data.map((u) => u.email)).toEqual(['sara@albina.test', 'omar@albina.test']);
    expect(all.body.data[1]).toMatchObject({ invitation_pending: true });
    const active = await request(app).get(api('/users?is_active=true')).set(bearer(admin.access_token)).expect(200);
    expect(active.body.data.map((u) => u.email)).toEqual(['sara@albina.test']);
  });
});

describe('DELETE /users/:id', () => {
  async function acceptedManager() {
    await invite(admin.access_token).expect(201);
    const res = await post(`/invitations/${inviteToken('omar@albina.test')}/accept`, { password: 'omars-own-pass-1' });
    return res.body;
  }

  test('deactivates an account, ends its sessions and blocks its access token at once', async () => {
    const manager = await acceptedManager();
    await request(app).delete(api(`/users/${manager.user.id}`)).set(bearer(admin.access_token)).expect(204);
    await request(app).get(api('/companies/me')).set(bearer(manager.access_token)).expect(401);
    await post('/auth/refresh', { refresh_token: manager.refresh_token }).expect(401);
    await post('/auth/login', { email: 'omar@albina.test', password: 'omars-own-pass-1' }).expect(401);
  });

  test('withdraws a pending invitation, so its link stops working', async () => {
    await invite(admin.access_token).expect(201);
    const token = inviteToken('omar@albina.test');
    const { rows } = await pool.query("SELECT id FROM users WHERE email = 'omar@albina.test'");
    await request(app).delete(api(`/users/${rows[0].id}`)).set(bearer(admin.access_token)).expect(204);
    await post(`/invitations/${token}/accept`, { password: 'omars-own-pass-1' }).expect(400);
  });

  test('an admin cannot deactivate themselves', async () => {
    await request(app).delete(api(`/users/${admin.user.id}`)).set(bearer(admin.access_token)).expect(400);
  });

  test('a malformed id is a 404', async () => {
    await request(app).delete(api('/users/not-a-uuid')).set(bearer(admin.access_token)).expect(404);
  });
});

describe('company isolation', () => {
  test("an admin can neither see nor touch another company's users", async () => {
    const other = await adminOf('Nadeef', 'admin@nadeef.test');
    await invite(other.access_token, { full_name: 'Nadeef Manager', email: 'manager@nadeef.test' }).expect(201);
    const { rows } = await pool.query("SELECT id FROM users WHERE email = 'manager@nadeef.test'");

    const list = await request(app).get(api('/users')).set(bearer(admin.access_token)).expect(200);
    expect(list.body.data.map((u) => u.email)).toEqual(['sara@albina.test']);
    await request(app).delete(api(`/users/${rows[0].id}`)).set(bearer(admin.access_token)).expect(404);
    await request(app).delete(api(`/users/${other.user.id}`)).set(bearer(admin.access_token)).expect(404);
    await request(app).post(api(`/users/${rows[0].id}/invitation/resend`)).set(bearer(admin.access_token)).expect(404);
  });
});
