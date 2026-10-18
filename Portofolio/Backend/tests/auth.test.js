// End-to-end through the real Express app and the test database:
// route -> validation -> controller -> service -> Prisma -> PostgreSQL.
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { pool, truncateAll } = require('./setup');

const account = {
  company_name: 'Al-Bina Advanced',
  full_name: 'Sara Admin',
  email: 'Sara@AlBina.test',
  password: 'correct-horse-12',
};
const register = (body = account) => request(app).post('/api/v1/auth/register').send(body);
const login = (email, password) => request(app).post('/api/v1/auth/login').send({ email, password });

beforeEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

test('GET /health answers', async () => {
  await request(app).get('/health').expect(200, { status: 'ok' });
});

describe('POST /auth/register', () => {
  test('creates the company and its first admin together', async () => {
    await register().expect(201);
    const { rows } = await pool.query(
      'SELECT u.email, u.role, u.full_name, c.name FROM users u JOIN companies c ON c.id = u.company_id',
    );
    expect(rows).toEqual([{ email: 'sara@albina.test', role: 'company_admin', full_name: 'Sara Admin', name: 'Al-Bina Advanced' }]);
  });

  test('a taken email gets the same answer and leaves no extra company behind', async () => {
    await register().expect(201);
    await register({ ...account, company_name: 'Another Co', email: 'SARA@albina.test' }).expect(201);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM companies');
    expect(rows[0].n).toBe(1);
  });

  test('rejects a short password with 422', async () => {
    const res = await register({ ...account, password: 'short' }).expect(422);
    expect(res.body.error.fields).toHaveProperty('password');
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => register().expect(201));

  test('returns a token and the user, whatever the email case', async () => {
    const res = await login('SARA@albina.TEST', account.password).expect(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'sara@albina.test', role: 'company_admin', full_name: 'Sara Admin' });
    expect(res.body.user.company_id).toEqual(expect.any(String));
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

  test('a successful login resets the failure count', async () => {
    await login(account.email, 'wrong-password-1').expect(401);
    await login(account.email, account.password).expect(200);
    const { rows } = await pool.query('SELECT failed_login_count FROM users');
    expect(rows[0].failed_login_count).toBe(0);
  });
});

describe('GET /companies/me', () => {
  test('needs a token', async () => {
    await request(app).get('/api/v1/companies/me').expect(401);
  });

  test('returns the company from the token, with the API field names', async () => {
    await register().expect(201);
    const { body } = await login(account.email, account.password).expect(200);
    const res = await request(app)
      .get('/api/v1/companies/me')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id: body.user.company_id,
      name: 'Al-Bina Advanced',
      midday_ban_start_time: '12:00:00',
      midday_ban_end_time: '15:00:00',
    });
  });
});
