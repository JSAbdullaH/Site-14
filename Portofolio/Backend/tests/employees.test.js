const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { pool, truncateAll, square } = require('./setup');

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
  const session = (await post('/auth/login/verify', { email, code }).expect(200)).body;
  return { token: session.access_token, companyId: session.user.company_id };
}

async function managerOf(adminToken, email) {
  await request(app).post(api('/users')).set(bearer(adminToken)).send({ full_name: 'Omar Manager', email }).expect(201);
  const token = /\/invite\/([\w-]+)/.exec(lastMail(email).text)[1];
  return (await post(`/invitations/${token}/accept`, { password: 'omars-own-pass-1' }).expect(200)).body.access_token;
}

async function siteOf(companyId, name = 'Al Malqa Tower') {
  const { rows } = await pool.query(
    "INSERT INTO sites (company_id, name, boundary, shift_start, shift_end) VALUES ($1, $2, $3, '07:00', '17:00') RETURNING id",
    [companyId, name, square(46.6, 24.7)],
  );
  return rows[0].id;
}

const as = (token) => ({
  list: (query = '') => request(app).get(api(`/employees${query}`)).set(bearer(token)),
  get: (id) => request(app).get(api(`/employees/${id}`)).set(bearer(token)),
  create: (body) => request(app).post(api('/employees')).set(bearer(token)).send(body),
  update: (id, body) => request(app).patch(api(`/employees/${id}`)).set(bearer(token)).send(body),
  remove: (id) => request(app).delete(api(`/employees/${id}`)).set(bearer(token)),
});

const ahmed = { full_name: 'Ahmed Saleh', employee_number: 'E-001', job_category: 'Construction' };

let admin;
let A;
beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
  A = as(admin.token);
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /employees', () => {
  test('creates a worker, and their job category with the default 8-hour limit', async () => {
    const res = await A.create(ahmed).expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      full_name: 'Ahmed Saleh',
      employee_number: 'E-001',
      job_category: 'construction',
      status: 'active',
      consent_given_at: null,
      site: null,
      device: null,
    });
    const { rows } = await pool.query('SELECT job_category, daily_limit_minutes FROM job_category_rules');
    expect(rows).toEqual([{ job_category: 'construction', daily_limit_minutes: 480 }]);
  });

  test('security and cleaning start with the 12-hour statutory limit', async () => {
    await A.create({ full_name: 'Khalid Omar', job_category: 'Security' }).expect(201);
    await A.create({ full_name: 'Imran Ali', job_category: 'cleaning' }).expect(201);
    const { rows } = await pool.query('SELECT job_category, daily_limit_minutes FROM job_category_rules ORDER BY 1');
    expect(rows).toEqual([
      { job_category: 'cleaning', daily_limit_minutes: 720 },
      { job_category: 'security', daily_limit_minutes: 720 },
    ]);
  });

  test('records consent and the site', async () => {
    const siteId = await siteOf(admin.companyId);
    const res = await A.create({ ...ahmed, site_id: siteId, consent: true }).expect(201);
    expect(res.body.site).toEqual({ id: siteId, name: 'Al Malqa Tower' });
    expect(Date.parse(res.body.consent_given_at)).toBeGreaterThan(Date.now() - 60_000);
  });

  test('a taken employee number is a 409', async () => {
    await A.create(ahmed).expect(201);
    const res = await A.create({ ...ahmed, full_name: 'Someone Else' }).expect(409);
    expect(res.body.error.code).toBe('EMPLOYEE_NUMBER_TAKEN');
  });

  test('invalid input is a 422 that names the field', async () => {
    const res = await A.create({ full_name: 'A', job_category: '' }).expect(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['full_name', 'job_category']);
  });

  test('company_id cannot be sent', async () => {
    await A.create({ ...ahmed, company_id: admin.companyId }).expect(422);
  });
});

describe('GET /employees', () => {
  beforeEach(async () => {
    const siteId = await siteOf(admin.companyId);
    await A.create({ ...ahmed, site_id: siteId }).expect(201);
    await A.create({ full_name: 'Khalid Omar', employee_number: 'E-002', job_category: 'security' }).expect(201);
    await A.create({ full_name: 'Yousef Nasser', employee_number: 'E-003', job_category: 'construction' }).expect(201);
  });

  test('lists every active worker by name, with paging info', async () => {
    const res = await A.list().expect(200);
    expect(res.body.data.map((e) => e.full_name)).toEqual(['Ahmed Saleh', 'Khalid Omar', 'Yousef Nasser']);
    expect(res.body).toMatchObject({ page: 1, limit: 25, total: 3 });
  });

  test('searches by name or number, and filters by site and category', async () => {
    expect((await A.list('?search=khal').expect(200)).body.data.map((e) => e.full_name)).toEqual(['Khalid Omar']);
    expect((await A.list('?search=E-003').expect(200)).body.data.map((e) => e.full_name)).toEqual(['Yousef Nasser']);
    expect((await A.list('?job_category=Construction').expect(200)).body.total).toBe(2);
    const { rows } = await pool.query('SELECT id FROM sites');
    expect((await A.list(`?site_id=${rows[0].id}`).expect(200)).body.data.map((e) => e.full_name)).toEqual(['Ahmed Saleh']);
  });

  test('pages', async () => {
    const res = await A.list('?limit=2&page=2').expect(200);
    expect(res.body.data.map((e) => e.full_name)).toEqual(['Yousef Nasser']);
    expect(res.body.total).toBe(3);
  });

  test('a site manager can read the list', async () => {
    const manager = await managerOf(admin.token, 'omar@albina.test');
    expect((await as(manager).list().expect(200)).body.total).toBe(3);
  });

  test('needs a token', async () => {
    await request(app).get(api('/employees')).expect(401);
  });
});

describe('GET /employees/:id', () => {
  test('returns the profile with device, live state and minutes worked today', async () => {
    const siteId = await siteOf(admin.companyId);
    const { body: e } = await A.create({ ...ahmed, site_id: siteId, consent: true }).expect(201);
    const { rows: [device] } = await pool.query(
      "INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-1', 'x') RETURNING id",
      [admin.companyId, e.id],
    );
    const { rows: [session] } = await pool.query(
      "INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at) VALUES ($1, $2, $3, $4, now() - interval '90 minutes') RETURNING id",
      [admin.companyId, e.id, siteId, device.id],
    );
    await pool.query(
      'INSERT INTO employee_current_state (employee_id, session_id, latitude, longitude, battery_percent, heart_rate_bpm, recorded_at) VALUES ($1, $2, 24.7, 46.6, 80, 92, now())',
      [e.id, session.id],
    );

    const res = await A.get(e.id).expect(200);
    expect(res.body).toMatchObject({
      full_name: 'Ahmed Saleh',
      device: { id: device.id, serial_number: 'GPS-1' },
      current_state: { on_site: true, zone: null, latitude: 24.7, longitude: 46.6, battery_percent: 80, heart_rate_bpm: 92 },
    });
    expect(res.body.minutes_today).toBeGreaterThanOrEqual(0);
    expect(res.body.minutes_today).toBeLessThanOrEqual(91);
  });

  test('an unknown id is a 404', async () => {
    await A.get('00000000-0000-0000-0000-000000000000').expect(404);
    await A.get('not-a-uuid').expect(404);
  });
});

describe('PATCH /employees/:id', () => {
  test('edits fields and reassigns the site', async () => {
    const { body: e } = await A.create(ahmed).expect(201);
    const siteId = await siteOf(admin.companyId);
    const res = await A.update(e.id, { full_name: 'Ahmed S. Saleh', site_id: siteId, job_category: 'security' }).expect(200);
    expect(res.body).toMatchObject({ full_name: 'Ahmed S. Saleh', job_category: 'security', site: { id: siteId } });
    expect((await A.update(e.id, { site_id: null }).expect(200)).body.site).toBeNull();
  });

  test('consent keeps the first moment it was given, and can be withdrawn off shift', async () => {
    const { body: e } = await A.create({ ...ahmed, consent: true }).expect(201);
    const again = await A.update(e.id, { consent: true }).expect(200);
    expect(again.body.consent_given_at).toBe(e.consent_given_at);
    expect((await A.update(e.id, { consent: false }).expect(200)).body.consent_given_at).toBeNull();
  });

  test('an empty body is a 422', async () => {
    const { body: e } = await A.create(ahmed).expect(201);
    await A.update(e.id, {}).expect(422);
  });
});

describe('DELETE /employees/:id', () => {
  test('deactivates, keeps the row, frees the device, and hides it from the default list', async () => {
    const { body: e } = await A.create(ahmed).expect(201);
    await pool.query("INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-1', 'x')", [admin.companyId, e.id]);

    await A.remove(e.id).expect(204);
    const { rows } = await pool.query('SELECT e.status, d.employee_id FROM employees e, devices d');
    expect(rows).toEqual([{ status: 'inactive', employee_id: null }]);
    expect((await A.list().expect(200)).body.total).toBe(0);
    expect((await A.list('?status=inactive').expect(200)).body.total).toBe(1);
  });

test('a worker with recorded activity is deactivated, and the activity stays', async () => {
    const siteId = await siteOf(admin.companyId);
    const { body: e } = await A.create({ ...ahmed, site_id: siteId, consent: true }).expect(201);
    const { rows: [device] } = await pool.query(
      "INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-1', 'x') RETURNING id",
      [admin.companyId, e.id],
    );
    const { rows: [session] } = await pool.query(
      "INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at, ended_at) VALUES ($1, $2, $3, $4, now() - interval '9 hours', now() - interval '1 hour') RETURNING id",
      [admin.companyId, e.id, siteId, device.id],
    );
    await pool.query('INSERT INTO telemetry_logs (session_id, latitude, longitude, recorded_at) VALUES ($1, 24.7, 46.6, now() - interval \'2 hours\')', [session.id]);

    await A.remove(e.id).expect(204);
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM employees WHERE id = $1) AS employees,
      (SELECT count(*)::int FROM work_sessions WHERE employee_id = $1) AS sessions,
      (SELECT count(*)::int FROM telemetry_logs WHERE session_id = $2) AS readings`, [e.id, session.id]);
    expect(counts.rows[0]).toEqual({ employees: 1, sessions: 1, readings: 1 });
    expect((await A.get(e.id).expect(200)).body.status).toBe('inactive');
  });
});

describe('roles', () => {
  test('a site manager cannot create, edit or deactivate', async () => {
    const { body: e } = await A.create(ahmed).expect(201);
    const M = as(await managerOf(admin.token, 'omar@albina.test'));
    await M.get(e.id).expect(200);
    await M.create({ ...ahmed, employee_number: 'E-009' }).expect(403);
    await M.update(e.id, { full_name: 'Changed' }).expect(403);
    await M.remove(e.id).expect(403);
  });
});

describe('company isolation', () => {
  test("another company's employees cannot be listed, read, changed or deactivated", async () => {
    const { body: e } = await A.create(ahmed).expect(201);
    const other = await adminOf('Nadeef', 'admin@nadeef.test');
    const B = as(other.token);
    await B.create({ full_name: 'Imran Ali', job_category: 'cleaning' }).expect(201);

    expect((await B.list().expect(200)).body.data.map((x) => x.full_name)).toEqual(['Imran Ali']);
    await B.get(e.id).expect(404);
    await B.update(e.id, { full_name: 'Hacked' }).expect(404);
    await B.remove(e.id).expect(404);
    await B.create({ ...ahmed, full_name: 'Other Ahmed' }).expect(201);

    const { rows } = await pool.query('SELECT full_name, status FROM employees WHERE id = $1', [e.id]);
    expect(rows).toEqual([{ full_name: 'Ahmed Saleh', status: 'active' }]);
  });

  test("a site of another company cannot be assigned", async () => {
    const other = await adminOf('Nadeef', 'admin@nadeef.test');
    const foreignSite = await siteOf(other.companyId, 'King Fahd Mall');
    const res = await A.create({ ...ahmed, site_id: foreignSite }).expect(422);
    expect(res.body.error.fields).toEqual({ site_id: 'Site not found' });
  });
});
