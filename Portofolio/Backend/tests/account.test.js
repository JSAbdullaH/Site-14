// The account page: a user's own profile and their company's details.
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { pool, truncateAll } = require('./setup');

const api = (path) => `/api/v1${path}`;
const post = (path, body) => request(app).post(api(path)).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const lastMail = (to) => [...outbox].reverse().find((m) => m.to === to.toLowerCase());

async function adminOf(company, email) {
  const body = { company_name: company, full_name: `${company} Admin`, email, password: 'correct-horse-12' };
  await post('/auth/register', body).expect(201);
  await post('/auth/verify-email', { email, code: /confirmation code is (\d{6})/.exec(lastMail(email).text)[1] }).expect(200);
  await post('/auth/login', { email, password: body.password }).expect(200);
  const code = /sign-in code is (\d{6})/.exec(lastMail(email).text)[1];
  return (await post('/auth/login/verify', { email, code }).expect(200)).body.access_token;
}

async function managerOf(adminToken, email) {
  await request(app).post(api('/users')).set(bearer(adminToken)).send({ full_name: 'Omar Manager', email }).expect(201);
  const token = /\/invite\/([\w-]+)/.exec(lastMail(email).text)[1];
  return (await post(`/invitations/${token}/accept`, { password: 'omars-own-pass-1' }).expect(200)).body.access_token;
}

const getMe = (token) => request(app).get(api('/users/me')).set(bearer(token));
const patchMe = (token, body) => request(app).patch(api('/users/me')).set(bearer(token)).send(body);
const getCompany = (token) => request(app).get(api('/companies/me')).set(bearer(token));
const patchCompany = (token, body) => request(app).patch(api('/companies/me')).set(bearer(token)).send(body);

let admin;
let manager;
beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
  manager = await managerOf(admin, 'omar@albina.test');
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('GET and PATCH /users/me', () => {
  test('any signed-in user reads their own account', async () => {
    expect((await getMe(manager).expect(200)).body).toMatchObject({ email: 'omar@albina.test', role: 'site_manager', full_name: 'Omar Manager' });
    expect((await getMe(admin).expect(200)).body).toMatchObject({ email: 'sara@albina.test', role: 'company_admin' });
  });

  test('a user changes their own name, trimmed', async () => {
    const res = await patchMe(manager, { full_name: '  Omar Al-Harbi ' }).expect(200);
    expect(res.body).toMatchObject({ full_name: 'Omar Al-Harbi', role: 'site_manager' });
    expect((await getMe(manager)).body.full_name).toBe('Omar Al-Harbi');
  });

  test('the role and the email cannot be changed, and nothing else changes with them', async () => {
    await patchMe(manager, { full_name: 'Omar', role: 'company_admin' }).expect(422);
    await patchMe(manager, { email: 'boss@albina.test' }).expect(422);
    expect((await getMe(manager)).body).toMatchObject({ full_name: 'Omar Manager', role: 'site_manager', email: 'omar@albina.test' });
  });

  test('a name must be 2 to 120 characters', async () => {
    await patchMe(manager, { full_name: 'O' }).expect(422);
    await patchMe(manager, { full_name: 'x'.repeat(121) }).expect(422);
  });

  test('needs a signed-in user', async () => {
    await request(app).patch(api('/users/me')).send({ full_name: 'Nobody' }).expect(401);
  });
});

describe('PATCH /companies/me', () => {
  test('a company admin changes the name and commercial register', async () => {
    const res = await patchCompany(admin, { name: 'Al-Bina Construction', commercial_registration: '1010123456' }).expect(200);
    expect(res.body).toMatchObject({ name: 'Al-Bina Construction', commercial_registration: '1010123456' });
    expect((await getCompany(manager).expect(200)).body).toMatchObject({ name: 'Al-Bina Construction', commercial_registration: '1010123456' });
  });

  test('an empty commercial register removes it', async () => {
    await patchCompany(admin, { commercial_registration: '1010123456' }).expect(200);
    expect((await patchCompany(admin, { commercial_registration: '' }).expect(200)).body.commercial_registration).toBeNull();
  });

  test('a site manager cannot change company details', async () => {
    await patchCompany(manager, { name: 'Taken Over' }).expect(403);
    expect((await getCompany(admin)).body.name).toBe('Al-Bina');
  });

  test('only one company changes', async () => {
    const other = await adminOf('Other Co', 'lina@other.test');
    await patchCompany(admin, { name: 'Renamed' }).expect(200);
    expect((await getCompany(other)).body.name).toBe('Other Co');
  });

  test('unknown fields and empty changes are refused', async () => {
    await patchCompany(admin, {}).expect(422);
    await patchCompany(admin, { name: 'Ok Name', heart_rate_max_bpm: 200 }).expect(422);
  });
});
