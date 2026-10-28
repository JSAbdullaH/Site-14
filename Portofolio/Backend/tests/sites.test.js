// Multiple Sites (SITE-47, SITE-48, SITE-49): creating and editing sites,
// running several at once, assigning employees, and the company boundary.
const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { pool, truncateAll, square } = require('./setup');

const api = (path) => `/api/v1${path}`;
const post = (path, body) => request(app).post(api(path)).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const lastMail = (to) => [...outbox].reverse().find((m) => m.to === to.toLowerCase());

// Registers, verifies and signs in a company admin; returns their session.
async function adminOf(company, email) {
  const body = { company_name: company, full_name: `${company} Admin`, email, password: 'correct-horse-12' };
  await post('/auth/register', body).expect(201);
  await post('/auth/verify-email', { email, code: /confirmation code is (\d{6})/.exec(lastMail(email).text)[1] }).expect(200);
  await post('/auth/login', { email, password: body.password }).expect(200);
  const code = /sign-in code is (\d{6})/.exec(lastMail(email).text)[1];
  return (await post('/auth/login/verify', { email, code }).expect(200)).body;
}

// Invites a Site Manager into the admin's company and signs them in.
async function managerOf(admin, email) {
  await request(app).post(api('/users')).set(bearer(admin.access_token)).send({ full_name: 'Omar Manager', email }).expect(201);
  const token = /\/invite\/([\w-]+)/.exec(lastMail(email).text)[1];
  return (await post(`/invitations/${token}/accept`, { password: 'omars-own-pass-1' }).expect(200)).body;
}

const SITE = {
  name: 'Al Malqa Tower',
  client: 'Riyadh Development Co.',
  boundary: square(46.629, 24.812, 0.003),
  shift_start: '07:00',
  shift_end: '17:00',
};

const as = (session) => ({
  get: (path) => request(app).get(api(path)).set(bearer(session.access_token)),
  post: (path, body) => request(app).post(api(path)).set(bearer(session.access_token)).send(body),
  patch: (path, body) => request(app).patch(api(path)).set(bearer(session.access_token)).send(body),
  delete: (path) => request(app).delete(api(path)).set(bearer(session.access_token)),
});

// An employee row in the admin's company, written directly: the employee
// endpoints for creating profiles belong to another epic.
async function addEmployee(companyId, fullName, { siteId = null, status = 'active' } = {}) {
  await pool.query(
    'INSERT INTO job_category_rules (company_id, job_category) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [companyId, 'construction'],
  );
  const { rows } = await pool.query(
    "INSERT INTO employees (company_id, site_id, full_name, job_category, status, consent_given_at) VALUES ($1, $2, $3, 'construction', $4, now()) RETURNING id",
    [companyId, siteId, fullName, status],
  );
  return rows[0].id;
}

let admin;
let companyId;
beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
  companyId = admin.user.company_id;
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /sites (SITE-47)', () => {
  test('creates a site with its boundary, client and shift', async () => {
    const res = await as(admin).post('/sites', SITE).expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Al Malqa Tower',
      client: 'Riyadh Development Co.',
      boundary: SITE.boundary,
      shift_start: '07:00',
      shift_end: '17:00',
      is_active: true,
      employee_count: 0,
      on_site_count: 0,
    });
  });

  test('client is optional, and a blank client is stored as none', async () => {
    const res = await as(admin).post('/sites', { ...SITE, client: '   ' }).expect(201);
    expect(res.body.client).toBeNull();
    const { client, ...withoutClient } = SITE;
    const other = await as(admin).post('/sites', { ...withoutClient, name: 'Al Narjis Villas' }).expect(201);
    expect(other.body.client).toBeNull();
  });

  test('a night shift that runs past midnight is allowed', async () => {
    const res = await as(admin).post('/sites', { ...SITE, shift_start: '22:00', shift_end: '06:00' }).expect(201);
    expect(res.body).toMatchObject({ shift_start: '22:00', shift_end: '06:00' });
  });

  test.each([
    ['an open ring', { type: 'Polygon', coordinates: [[[46.6, 24.7], [46.7, 24.7], [46.7, 24.8], [46.6, 24.8]]] }],
    ['too few corners', { type: 'Polygon', coordinates: [[[46.6, 24.7], [46.7, 24.7], [46.6, 24.7]]] }],
    ['an empty ring', { type: 'Polygon', coordinates: [[]] }],
    ['repeated corners', { type: 'Polygon', coordinates: [[[46.6, 24.7], [46.7, 24.7], [46.7, 24.7], [46.6, 24.7]]] }],
    ['a latitude out of range', { type: 'Polygon', coordinates: [[[46.6, 95], [46.7, 24.7], [46.7, 24.8], [46.6, 95]]] }],
    ['a point instead of a polygon', { type: 'Point', coordinates: [46.6, 24.7] }],
  ])('rejects a boundary with %s', async (_label, boundary) => {
    const res = await as(admin).post('/sites', { ...SITE, boundary }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).some((k) => k.startsWith('boundary'))).toBe(true);
  });

  test('rejects a bad shift', async () => {
    const res = await as(admin).post('/sites', { ...SITE, shift_start: '7am', shift_end: '07:00' }).expect(422);
    expect(res.body.error.fields).toHaveProperty('shift_start');
    const same = await as(admin).post('/sites', { ...SITE, shift_end: '07:00' }).expect(422);
    expect(same.body.error.fields).toHaveProperty('shift_end');
  });

  test('a name already used in the company is a 409', async () => {
    await as(admin).post('/sites', SITE).expect(201);
    const res = await as(admin).post('/sites', { ...SITE, name: '  Al Malqa Tower ' }).expect(409);
    expect(res.body.error).toMatchObject({ code: 'SITE_NAME_TAKEN', fields: { name: expect.any(String) } });
  });

  test('another company may use the same name', async () => {
    await as(admin).post('/sites', SITE).expect(201);
    const other = await adminOf('Rawabi', 'lina@rawabi.test');
    await as(other).post('/sites', SITE).expect(201);
  });

  test('a Site Manager cannot create a site', async () => {
    const manager = await managerOf(admin, 'omar@albina.test');
    await as(manager).post('/sites', SITE).expect(403);
  });

  test('needs a token', async () => {
    await post('/sites', SITE).expect(401);
  });
});

describe('GET /sites (SITE-48)', () => {
  test('lists every concurrent site with worker counts, active first then by name', async () => {
    const b = await as(admin).post('/sites', { ...SITE, name: 'B Site' }).expect(201);
    const a = await as(admin).post('/sites', { ...SITE, name: 'A Site' }).expect(201);
    const c = await as(admin).post('/sites', { ...SITE, name: 'C Site' }).expect(201);
    await as(admin).delete(`/sites/${a.body.id}`).expect(204);
    await addEmployee(companyId, 'Ahmed Saleh', { siteId: b.body.id });
    await addEmployee(companyId, 'Khalid Omar', { siteId: b.body.id });
    await addEmployee(companyId, 'Gone Worker', { siteId: b.body.id, status: 'inactive' });

    const res = await as(admin).get('/sites').expect(200);
    expect(res.body.data.map((s) => s.name)).toEqual(['B Site', 'C Site', 'A Site']);
    expect(res.body.data[0]).toMatchObject({ id: b.body.id, employee_count: 2, on_site_count: 0, is_active: true });
    expect(res.body.data[0]).not.toHaveProperty('boundary');
    expect(res.body.data[1]).toMatchObject({ id: c.body.id, employee_count: 0 });
  });

  test('filters by is_active', async () => {
    const a = await as(admin).post('/sites', { ...SITE, name: 'A Site' }).expect(201);
    await as(admin).post('/sites', { ...SITE, name: 'B Site' }).expect(201);
    await as(admin).delete(`/sites/${a.body.id}`).expect(204);
    const active = await as(admin).get('/sites?is_active=true').expect(200);
    expect(active.body.data.map((s) => s.name)).toEqual(['B Site']);
    const inactive = await as(admin).get('/sites?is_active=false').expect(200);
    expect(inactive.body.data.map((s) => s.name)).toEqual(['A Site']);
  });

  test('a Site Manager can list and read sites', async () => {
    const site = await as(admin).post('/sites', SITE).expect(201);
    const manager = await managerOf(admin, 'omar@albina.test');
    expect((await as(manager).get('/sites').expect(200)).body.data).toHaveLength(1);
    expect((await as(manager).get(`/sites/${site.body.id}`).expect(200)).body.boundary).toEqual(SITE.boundary);
  });

  test('never shows another company\'s sites', async () => {
    const site = await as(admin).post('/sites', SITE).expect(201);
    const other = await adminOf('Rawabi', 'lina@rawabi.test');
    expect((await as(other).get('/sites').expect(200)).body.data).toEqual([]);
    await as(other).get(`/sites/${site.body.id}`).expect(404);
  });

  test('a malformed id is a 404', async () => {
    await as(admin).get('/sites/not-a-uuid').expect(404);
  });
});

describe('PATCH /sites/:id', () => {
  let site;
  beforeEach(async () => {
    site = (await as(admin).post('/sites', SITE).expect(201)).body;
  });

  test('changes only the fields sent', async () => {
    const res = await as(admin).patch(`/sites/${site.id}`, { name: 'Al Malqa Tower 2', client: null }).expect(200);
    expect(res.body).toMatchObject({ name: 'Al Malqa Tower 2', client: null, shift_start: '07:00', boundary: SITE.boundary });
  });

  test('checks a new shift end against the stored start', async () => {
    const res = await as(admin).patch(`/sites/${site.id}`, { shift_end: '07:00' }).expect(422);
    expect(res.body.error.fields).toHaveProperty('shift_end');
  });

  test('an empty body is a 422', async () => {
    await as(admin).patch(`/sites/${site.id}`, {}).expect(422);
  });

  test('renaming to a name in use is a 409', async () => {
    await as(admin).post('/sites', { ...SITE, name: 'Other' }).expect(201);
    const res = await as(admin).patch(`/sites/${site.id}`, { name: 'Other' }).expect(409);
    expect(res.body.error.code).toBe('SITE_NAME_TAKEN');
  });

  test('reactivates a deactivated site', async () => {
    await as(admin).delete(`/sites/${site.id}`).expect(204);
    const res = await as(admin).patch(`/sites/${site.id}`, { is_active: true }).expect(200);
    expect(res.body.is_active).toBe(true);
  });

  test('cannot change another company\'s site', async () => {
    const other = await adminOf('Rawabi', 'lina@rawabi.test');
    await as(other).patch(`/sites/${site.id}`, { name: 'Taken over' }).expect(404);
  });

  test('a Site Manager cannot edit a site', async () => {
    const manager = await managerOf(admin, 'omar@albina.test');
    await as(manager).patch(`/sites/${site.id}`, { name: 'X Site' }).expect(403);
  });
});

describe('DELETE /sites/:id', () => {
  let site;
  beforeEach(async () => {
    site = (await as(admin).post('/sites', SITE).expect(201)).body;
  });

  test('deactivates the site and keeps the row', async () => {
    await as(admin).delete(`/sites/${site.id}`).expect(204);
    const { rows } = await pool.query('SELECT is_active FROM sites WHERE id = $1', [site.id]);
    expect(rows).toEqual([{ is_active: false }]);
    await as(admin).delete(`/sites/${site.id}`).expect(204);
  });

  test('is blocked while employees are assigned', async () => {
    await addEmployee(companyId, 'Ahmed Saleh', { siteId: site.id });
    const res = await as(admin).delete(`/sites/${site.id}`).expect(409);
    expect(res.body.error.code).toBe('SITE_HAS_EMPLOYEES');
    await as(admin).patch(`/sites/${site.id}`, { is_active: false }).expect(409);
  });

  test('is blocked while a worker is on site', async () => {
    const employeeId = await addEmployee(companyId, 'Ahmed Saleh', { siteId: site.id });
    const { rows } = await pool.query(
      "INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-1', 'x') RETURNING id",
      [companyId, employeeId],
    );
    await pool.query(
      'INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at) VALUES ($1, $2, $3, $4, now())',
      [companyId, employeeId, site.id, rows[0].id],
    );
    await pool.query("UPDATE employees SET status = 'inactive' WHERE id = $1", [employeeId]);
    expect((await as(admin).get(`/sites/${site.id}`).expect(200)).body.on_site_count).toBe(1);
    const res = await as(admin).delete(`/sites/${site.id}`).expect(409);
    expect(res.body.error.code).toBe('SITE_HAS_ACTIVITY');
  });

  test('another company\'s site is a 404', async () => {
    const other = await adminOf('Rawabi', 'lina@rawabi.test');
    await as(other).delete(`/sites/${site.id}`).expect(404);
  });
});

describe('assigning employees to a site (SITE-49)', () => {
  let site;
  let employeeId;
  beforeEach(async () => {
    site = (await as(admin).post('/sites', SITE).expect(201)).body;
    employeeId = await addEmployee(companyId, 'Ahmed Saleh');
  });

  test('assigns, moves and unassigns an employee', async () => {
    const other = (await as(admin).post('/sites', { ...SITE, name: 'Al Narjis Villas' }).expect(201)).body;
    const res = await as(admin).patch(`/employees/${employeeId}`, { site_id: site.id }).expect(200);
    expect(res.body).toMatchObject({ id: employeeId, site_id: site.id, site_name: 'Al Malqa Tower' });
    expect((await as(admin).get(`/sites/${site.id}`).expect(200)).body.employee_count).toBe(1);

    await as(admin).patch(`/employees/${employeeId}`, { site_id: other.id }).expect(200);
    expect((await as(admin).get(`/sites/${site.id}`).expect(200)).body.employee_count).toBe(0);

    const off = await as(admin).patch(`/employees/${employeeId}`, { site_id: null }).expect(200);
    expect(off.body).toMatchObject({ site_id: null, site_name: null });
  });

  test('lists employees by site, unassigned, and by search', async () => {
    await as(admin).patch(`/employees/${employeeId}`, { site_id: site.id }).expect(200);
    await addEmployee(companyId, 'Khalid Omar');
    const onSite = await as(admin).get(`/employees?site_id=${site.id}`).expect(200);
    expect(onSite.body).toMatchObject({ page: 1, limit: 25, total: 1 });
    expect(onSite.body.data.map((e) => e.full_name)).toEqual(['Ahmed Saleh']);
    const none = await as(admin).get('/employees?site_id=none').expect(200);
    expect(none.body.data.map((e) => e.full_name)).toEqual(['Khalid Omar']);
    const search = await as(admin).get('/employees?search=khal').expect(200);
    expect(search.body.data.map((e) => e.full_name)).toEqual(['Khalid Omar']);
  });

  test('cannot assign to a deactivated site', async () => {
    const closed = (await as(admin).post('/sites', { ...SITE, name: 'Closed' }).expect(201)).body;
    await as(admin).delete(`/sites/${closed.id}`).expect(204);
    const res = await as(admin).patch(`/employees/${employeeId}`, { site_id: closed.id }).expect(409);
    expect(res.body.error.code).toBe('SITE_INACTIVE');
  });

  test('cannot assign a deactivated employee', async () => {
    await pool.query("UPDATE employees SET status = 'inactive' WHERE id = $1", [employeeId]);
    const res = await as(admin).patch(`/employees/${employeeId}`, { site_id: site.id }).expect(409);
    expect(res.body.error.code).toBe('EMPLOYEE_INACTIVE');
  });

  test('cannot use another company\'s site or employee', async () => {
    const other = await adminOf('Rawabi', 'lina@rawabi.test');
    const theirSite = (await as(other).post('/sites', SITE).expect(201)).body;
    const res = await as(admin).patch(`/employees/${employeeId}`, { site_id: theirSite.id }).expect(422);
    expect(res.body.error.fields).toHaveProperty('site_id');
    await as(other).patch(`/employees/${employeeId}`, { site_id: theirSite.id }).expect(404);
    expect((await as(other).get('/employees').expect(200)).body.total).toBe(0);
  });

  test('a Site Manager can read the list but not reassign', async () => {
    const manager = await managerOf(admin, 'omar@albina.test');
    await as(manager).get('/employees').expect(200);
    await as(manager).patch(`/employees/${employeeId}`, { site_id: site.id }).expect(403);
  });
});
