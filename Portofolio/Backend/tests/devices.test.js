const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { sha256 } = require('../src/utils/tokens');
const { pool, truncateAll, makeCompany, openSession } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c, role = 'company_admin') => ({
  Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role }).token}`,
});
const q = async (sql, params) => (await pool.query(sql, params)).rows[0];

const as = (c, role) => ({
  list: (query = '') => request(app).get(api(`/devices${query}`)).set(bearer(c, role)),
  create: (body) => request(app).post(api('/devices')).set(bearer(c, role)).send(body),
  batch: (body) => request(app).post(api('/devices/batch')).set(bearer(c, role)).send(body),
  update: (id, body) => request(app).patch(api(`/devices/${id}`)).set(bearer(c, role)).send(body),
  rotate: (id) => request(app).post(api(`/devices/${id}/key`)).set(bearer(c, role)),
});

async function workerOf(c, name, { status = 'active' } = {}) {
  return (await q(
    "INSERT INTO employees (company_id, site_id, full_name, job_category, status, consent_given_at) VALUES ($1, $2, $3, 'construction', $4, now()) RETURNING id",
    [c.companyId, c.siteId, name, status],
  )).id;
}

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

describe('POST /devices (register one device)', () => {
  test('registers the device and shows its key once', async () => {
    const res = await as(a).create({ serial_number: '  watch-0042 ' }).expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      serial_number: 'WATCH-0042',
      is_active: true,
      employee: null,
      last_seen_at: null,
      api_key: expect.stringMatching(/^dk_[\w-]{40,}$/),
    });

    // Only the hash is stored.
    const row = await q('SELECT company_id, api_key_hash FROM devices WHERE id = $1', [res.body.id]);
    expect(row).toEqual({ company_id: a.companyId, api_key_hash: sha256(res.body.api_key) });

    const listed = await as(a).list('?search=0042').expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).not.toHaveProperty('api_key');
  });

  test('a serial is registered once, across all companies, without saying where', async () => {
    await as(a).create({ serial_number: 'WATCH-1' }).expect(201);
    const same = await as(a).create({ serial_number: 'watch-1' }).expect(409);
    expect(same.body.error).toMatchObject({ code: 'SERIAL_TAKEN', fields: { serial_number: expect.any(String) } });

    const other = await as(b).create({ serial_number: 'WATCH-1' }).expect(409);
    expect(JSON.stringify(other.body)).not.toContain('Company A');
  });

  test('rejects an empty or malformed serial', async () => {
    await as(a).create({ serial_number: '' }).expect(422);
    await as(a).create({ serial_number: 'has space' }).expect(422);
    await as(a).create({ serial_number: 'x'.repeat(65) }).expect(422);
    await as(a).create({ serial_number: 'OK-1', employee_id: a.employeeId }).expect(422);
  });

  test('a site manager can list devices but not register them', async () => {
    await pool.query("UPDATE users SET role = 'site_manager' WHERE id = $1", [a.userId]);
    await as(a, 'site_manager').list().expect(200);
    await as(a, 'site_manager').create({ serial_number: 'WATCH-2' }).expect(403);
    await as(a, 'site_manager').batch({ serial_numbers: ['WATCH-2'] }).expect(403);
  });

  test('needs a token', async () => {
    await request(app).get(api('/devices')).expect(401);
  });
});

describe('POST /devices/batch (register many at once)', () => {
  const serials = (n, prefix = 'W') => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`);

  test('ninety watches in one call, each with its own key', async () => {
    const res = await as(a).batch({ serial_numbers: serials(90) }).expect(201);
    expect(res.body.created).toBe(90);
    expect(res.body.data.map((d) => d.serial_number)).toEqual(serials(90));
    expect(new Set(res.body.data.map((d) => d.api_key)).size).toBe(90);
    expect((await q('SELECT count(*)::int AS n FROM devices WHERE company_id = $1', [a.companyId])).n).toBe(91);
  });

  test('all or nothing: one serial already registered stops the whole batch', async () => {
    await as(b).create({ serial_number: 'W-005' }).expect(201);
    const res = await as(a).batch({ serial_numbers: serials(10) }).expect(409);
    expect(res.body.error.code).toBe('SERIAL_TAKEN');
    expect(res.body.error.fields.serial_numbers).toContain('W-005');
    expect((await q('SELECT count(*)::int AS n FROM devices WHERE company_id = $1', [a.companyId])).n).toBe(1);
  });

  test('a serial listed twice (any case) is named', async () => {
    const res = await as(a).batch({ serial_numbers: ['W-1', 'W-2', 'w-1'] }).expect(422);
    expect(res.body.error.fields.serial_numbers).toBe('Listed more than once: W-1');
  });

  test('names the bad line, and caps the batch size', async () => {
    const res = await as(a).batch({ serial_numbers: ['W-1', 'bad serial', 'W-3'] }).expect(422);
    expect(res.body.error.fields).toHaveProperty(['serial_numbers.1']);
    await as(a).batch({ serial_numbers: [] }).expect(422);
    await as(a).batch({ serial_numbers: serials(501) }).expect(422);
  });
});

describe('GET /devices', () => {
  test('filters by assignment and status, and never shows another company', async () => {
    await as(a).batch({ serial_numbers: ['FREE-1', 'FREE-2'] }).expect(201);
    const all = await as(a).list().expect(200);
    expect(all.body.data.map((d) => d.serial_number)).toEqual(['FREE-1', 'FREE-2', 'GPS-A']);
    expect(all.body.data[2].employee).toMatchObject({ id: a.employeeId, full_name: 'Worker A', site: { id: a.siteId } });

    const free = await as(a).list('?assigned=false').expect(200);
    expect(free.body.data.map((d) => d.serial_number)).toEqual(['FREE-1', 'FREE-2']);

    const byWearer = await as(a).list('?search=worker').expect(200);
    expect(byWearer.body.data.map((d) => d.serial_number)).toEqual(['GPS-A']);
  });
});

describe('PATCH /devices/:id (assign to an employee)', () => {
  let deviceId;
  beforeEach(async () => {
    deviceId = (await as(a).create({ serial_number: 'WATCH-9' }).expect(201)).body.id;
  });

  test('assigns the device, and the employee list shows it', async () => {
    const worker = await workerOf(a, 'Ahmed Saleh');
    const res = await as(a).update(deviceId, { employee_id: worker }).expect(200);
    expect(res.body.employee).toMatchObject({ id: worker, full_name: 'Ahmed Saleh' });

    const employees = await request(app).get(api('/employees?search=Ahmed')).set(bearer(a)).expect(200);
    expect(employees.body.data[0].device).toEqual({ id: deviceId, serial_number: 'WATCH-9' });
  });

  test('one device per employee', async () => {
    const res = await as(a).update(deviceId, { employee_id: a.employeeId }).expect(409);
    expect(res.body.error).toMatchObject({ code: 'EMPLOYEE_HAS_DEVICE', message: expect.stringContaining('GPS-A') });
  });

  test('moves to another employee and back to the shelf', async () => {
    const first = await workerOf(a, 'First');
    const second = await workerOf(a, 'Second');
    await as(a).update(deviceId, { employee_id: first }).expect(200);
    await as(a).update(deviceId, { employee_id: second }).expect(200);
    const res = await as(a).update(deviceId, { employee_id: null }).expect(200);
    expect(res.body.employee).toBeNull();
  });

  test('refuses an inactive employee, and an employee of another company', async () => {
    const gone = await workerOf(a, 'Gone', { status: 'inactive' });
    expect((await as(a).update(deviceId, { employee_id: gone }).expect(409)).body.error.code).toBe('EMPLOYEE_INACTIVE');

    const res = await as(a).update(deviceId, { employee_id: b.employeeId }).expect(422);
    expect(res.body.error.fields.employee_id).toBe('Employee not found');
  });

  test("cannot touch another company's device", async () => {
    await as(b).update(deviceId, { is_active: false }).expect(404);
    await as(b).rotate(deviceId).expect(404);
  });

  test('the wearer cannot change mid-shift', async () => {
    await openSession(a);
    const res = await as(a).update(a.deviceId, { employee_id: null }).expect(409);
    expect(res.body.error.code).toBe('ON_SHIFT');
    await as(a).update(a.deviceId, { is_active: false }).expect(409);
  });

  test('deactivating takes the device off its wearer; it must be reactivated before reuse', async () => {
    const res = await as(a).update(a.deviceId, { is_active: false }).expect(200);
    expect(res.body).toMatchObject({ is_active: false, employee: null });

    const blocked = await as(a).update(a.deviceId, { employee_id: a.employeeId }).expect(409);
    expect(blocked.body.error.code).toBe('DEVICE_INACTIVE');

    const back = await as(a).update(a.deviceId, { is_active: true, employee_id: a.employeeId }).expect(200);
    expect(back.body).toMatchObject({ is_active: true, employee: { id: a.employeeId } });
  });

  test('an employee who is deactivated gives the device back', async () => {
    await request(app).delete(api(`/employees/${a.employeeId}`)).set(bearer(a)).expect(204);
    expect((await q('SELECT employee_id FROM devices WHERE id = $1', [a.deviceId])).employee_id).toBeNull();
  });
});

describe('POST /devices/:id/key', () => {
  test('a new key replaces the old one', async () => {
    const created = (await as(a).create({ serial_number: 'WATCH-K' }).expect(201)).body;
    const rotated = (await as(a).rotate(created.id).expect(200)).body;
    expect(rotated.api_key).not.toBe(created.api_key);
    expect((await q('SELECT api_key_hash FROM devices WHERE id = $1', [created.id])).api_key_hash).toBe(sha256(rotated.api_key));
  });
});
