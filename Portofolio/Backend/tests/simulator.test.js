const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { pool, truncateAll, makeCompany } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c, role = 'company_admin') => ({
  Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role }).token}`,
});
const send = (c, body, role) => request(app).post(api('/simulator/readings')).set(bearer(c, role)).send(body);

// makeCompany's site is a square around (46.6, 24.7).
const ON_SITE = { latitude: 24.7, longitude: 46.6008 };
const OUTSIDE = { latitude: 24.7, longitude: 46.603 };

const sessions = async (c) =>
  (await pool.query('SELECT ended_at FROM work_sessions WHERE employee_id = $1 ORDER BY started_at', [c.employeeId])).rows;

let a;
let b;
beforeEach(async () => {
  await truncateAll();
  a = await makeCompany('A');
  b = await makeCompany('B');
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /simulator/readings', () => {
  test('shows what was received, and opens then closes a shift like a real device', async () => {
    const inRes = await send(a, { device_id: a.deviceId, ...ON_SITE }).expect(200);
    expect(inRes.body.received).toEqual({
      device_id: 'GPS-A',
      longitude: ON_SITE.longitude,
      latitude: ON_SITE.latitude,
      recorded_at: expect.any(String),
    });
    expect(inRes.body.result).toMatchObject({ accepted: 1, stored: 1, location_status: 'on_site', session: { id: expect.any(String) } });

    // A crossing is never throttled, even right after the last reading.
    const outRes = await send(a, { device_id: a.deviceId, ...OUTSIDE }).expect(200);
    expect(outRes.body.result).toMatchObject({ accepted: 1, stored: 0, location_status: 'off_site', session: null });
    expect(await sessions(a)).toEqual([{ ended_at: expect.any(Date) }]);
  });

  test("cannot send as another company's device", async () => {
    await send(a, { device_id: b.deviceId, ...ON_SITE }).expect(404);
    expect(await sessions(b)).toEqual([]);
  });

  test('passes on the refusals a device would get', async () => {
    await pool.query('UPDATE employees SET consent_given_at = NULL WHERE id = $1', [a.employeeId]);
    const res = await send(a, { device_id: a.deviceId, ...ON_SITE }).expect(409);
    expect(res.body.error.code).toBe('NO_CONSENT');
  });

  test('is for admins only, and checks the position', async () => {
    await pool.query("UPDATE users SET role = 'site_manager' WHERE id = $1", [a.userId]);
    await send(a, { device_id: a.deviceId, ...ON_SITE }, 'site_manager').expect(403);
    await pool.query("UPDATE users SET role = 'company_admin' WHERE id = $1", [a.userId]);
    await send(a, { device_id: a.deviceId, latitude: 91, longitude: 46.6 }).expect(422);
    await request(app).post(api('/simulator/readings')).send({ device_id: a.deviceId, ...ON_SITE }).expect(401);
  });
});
