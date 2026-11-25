const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { pool, truncateAll, makeCompany, openSession } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c, role = 'company_admin') => ({ Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role }).token}` });
const q = async (sql, params) => (await pool.query(sql, params)).rows[0];

// A company user marked as SITE14 staff, and the owner-portal token their session gives them.
async function staff(c) {
  await pool.query("UPDATE users SET password_hash = 'x', is_platform_admin = true WHERE id = $1", [c.userId]);
  const res = await request(app).post(api('/platform/auth/session')).set(bearer(c)).expect(200);
  return { Authorization: `Bearer ${res.body.access_token}` };
}

async function secondAdmin(c, email) {
  return (await q(
    "INSERT INTO users (company_id, full_name, email, role, password_hash) VALUES ($1, 'Second', $2, 'company_admin', 'x') RETURNING id",
    [c.companyId, email],
  )).id;
}

let a;
let b;
beforeEach(async () => {
  await truncateAll();
  a = await makeCompany('A');
  b = await makeCompany('B');
  await pool.query("UPDATE users SET password_hash = 'x'");
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('SITE14 staff open the owner portal with their company account', () => {
  test('only a user marked as staff gets a portal session', async () => {
    const res = await request(app).post(api('/platform/auth/session')).set(bearer(a)).expect(403);
    expect(res.body.error.code).toBe('NOT_PLATFORM_ADMIN');
    await request(app).post(api('/platform/auth/session')).expect(401);

    const portal = await staff(a);
    const me = await request(app).get(api('/platform/me')).set(portal).expect(200);
    expect(me.body).toMatchObject({ kind: 'user', company: { id: a.companyId } });
    await request(app).get(api('/platform/companies')).set(portal).expect(200);
  });

  test('taking the flag away locks the portal session out at once', async () => {
    const portal = await staff(a);
    await pool.query('UPDATE users SET is_platform_admin = false WHERE id = $1', [a.userId]);
    await request(app).get(api('/platform/overview')).set(portal).expect(401);
  });
});

describe('GET/PATCH /platform/users', () => {
  test('lists users of every company and grants portal access', async () => {
    const portal = await staff(a);
    const list = await request(app).get(api('/platform/users')).set(portal).expect(200);
    expect(list.body.total).toBe(2);

    const granted = await request(app).patch(api(`/platform/users/${b.userId}`)).set(portal).send({ is_platform_admin: true }).expect(200);
    expect(granted.body).toMatchObject({ is_platform_admin: true, company: { id: b.companyId } });
    const onlyStaff = await request(app).get(api('/platform/users?platform_admin=true')).set(portal).expect(200);
    expect(onlyStaff.body.total).toBe(2);
  });

  test('cannot lock yourself out', async () => {
    const portal = await staff(a);
    await request(app).patch(api(`/platform/users/${a.userId}`)).set(portal).send({ is_active: false }).expect(400);
    await request(app).patch(api(`/platform/users/${a.userId}`)).set(portal).send({ is_platform_admin: false }).expect(400);
  });

  test("keeps a company's last admin", async () => {
    const portal = await staff(a);
    const res = await request(app).patch(api(`/platform/users/${b.userId}`)).set(portal).send({ role: 'site_manager' }).expect(409);
    expect(res.body.error.code).toBe('LAST_COMPANY_ADMIN');

    await secondAdmin(b, 'second@b.test');
    await request(app).patch(api(`/platform/users/${b.userId}`)).set(portal).send({ role: 'site_manager' }).expect(200);
  });

  test('deactivating signs them out and removes portal access', async () => {
    const portal = await staff(a);
    const other = await secondAdmin(a, 'second@a.test');
    await pool.query('UPDATE users SET is_platform_admin = true WHERE id = $1', [other]);
    const res = await request(app).patch(api(`/platform/users/${other}`)).set(portal).send({ is_active: false }).expect(200);
    expect(res.body).toMatchObject({ is_active: false, is_platform_admin: false });
  });
});

describe('GET/PATCH /platform/sites', () => {
  test('lists sites of every company and deactivates one only when nobody is on it', async () => {
    const portal = await staff(a);
    const list = await request(app).get(api('/platform/sites')).set(portal).expect(200);
    expect(list.body.total).toBe(2);

    await openSession(b);
    expect((await request(app).patch(api(`/platform/sites/${b.siteId}`)).set(portal).send({ is_active: false }).expect(409)).body.error.code)
      .toBe('SITE_HAS_ACTIVITY');

    await pool.query('UPDATE work_sessions SET ended_at = now() WHERE employee_id = $1', [b.employeeId]);
    await pool.query("UPDATE employees SET status = 'inactive' WHERE id = $1", [b.employeeId]);
    const done = await request(app).patch(api(`/platform/sites/${b.siteId}`)).set(portal).send({ is_active: false }).expect(200);
    expect(done.body.is_active).toBe(false);
  });
});
