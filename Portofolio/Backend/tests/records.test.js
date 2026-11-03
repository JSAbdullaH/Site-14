const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { todayInRiyadh, dayRange } = require('../src/utils/day');
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
  return { token: session.access_token, companyId: session.user.company_id, userId: session.user.id };
}

async function managerOf(adminToken, email) {
  await request(app).post(api('/users')).set(bearer(adminToken)).send({ full_name: 'Omar Manager', email }).expect(201);
  const token = /\/invite\/([\w-]+)/.exec(lastMail(email).text)[1];
  return (await post(`/invitations/${token}/accept`, { password: 'omars-own-pass-1' }).expect(200)).body.access_token;
}

const ROOF = { lng: 46.598, lat: 24.7 };
const WAREHOUSE = { lng: 46.602, lat: 24.7 };
const YARD = { lng: 46.6, lat: 24.7 };
const DAY = '2026-10-14';
const at = (hhmm, date = DAY) => new Date(`${date}T${hhmm}:00+03:00`);

let admin;
let world;

async function buildWorld(companyId) {
  const q = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const site = await q(
    "INSERT INTO sites (company_id, name, boundary, shift_start, shift_end) VALUES ($1, 'Al Malqa Tower', $2, '07:00', '17:00') RETURNING id",
    [companyId, square(46.6, 24.7, 0.003)],
  );
  const roof = await q("INSERT INTO geofences (site_id, name, boundary, is_outdoor) VALUES ($1, 'Roof', $2, true) RETURNING id", [site.id, square(ROOF.lng, ROOF.lat, 0.0005)]);
  const warehouse = await q("INSERT INTO geofences (site_id, name, boundary) VALUES ($1, 'Warehouse', $2) RETURNING id", [site.id, square(WAREHOUSE.lng, WAREHOUSE.lat, 0.0005)]);
  const res = await request(app).post(api('/employees')).set(bearer(admin.token))
    .send({ full_name: 'Ahmed Saleh', employee_number: 'E-001', job_category: 'construction', site_id: site.id, consent: true }).expect(201);
  const device = await q("INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-1', 'x') RETURNING id", [companyId, res.body.id]);
  return { siteId: site.id, roofId: roof.id, warehouseId: warehouse.id, employeeId: res.body.id, deviceId: device.id };
}

async function shift(from, to, places, { skip = [] } = {}) {
  const { rows } = await pool.query(
    'INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at, ended_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [admin.companyId, world.employeeId, world.siteId, world.deviceId, from, to],
  );
  const sessionId = rows[0].id;
  const until = to || new Date();
  for (let t = from.getTime(); t < until.getTime(); t += 10 * 60_000) {
    const when = new Date(t);
    if (skip.some(([a, b]) => when >= a && when < b)) continue;
    const place = places(when);
    await pool.query(
      'INSERT INTO telemetry_logs (session_id, latitude, longitude, battery_percent, recorded_at) VALUES ($1, $2, $3, 80, $4)',
      [sessionId, place.lat, place.lng, when],
    );
  }
  return sessionId;
}

const normalDay = (when) => (when < at('10:00') ? ROOF : when < at('11:00') ? YARD : WAREHOUSE);

const record = (date = DAY, token = admin.token) =>
  request(app).get(api(`/employees/${world.employeeId}/daily-record?date=${date}`)).set(bearer(token));

beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
  world = await buildWorld(admin.companyId);
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('daily record', () => {
  test('a completed shift: first and last seen, minutes per zone, alerts and tasks', async () => {
    const sessionId = await shift(at('07:00'), at('15:00'), normalDay);
    await pool.query(
      "INSERT INTO alerts (session_id, alert_type, geofence_id, latitude, longitude, triggered_at) VALUES ($1, 'zone_exit', $2, 24.7, 46.6, $3)",
      [sessionId, world.roofId, at('10:05')],
    );
    await pool.query(
      `INSERT INTO tasks (company_id, site_id, employee_id, created_by, title, status, scheduled_for, completed_at)
       VALUES ($1, $2, $3, $4, 'Inspect scaffolding', 'done', $5, $6), ($1, $2, $3, $4, 'Clear the gate', 'todo', $5, NULL)`,
      [admin.companyId, world.siteId, world.employeeId, admin.userId, DAY, at('13:00')],
    );

    const { body } = await record().expect(200);
    expect(body).toMatchObject({
      employee: { id: world.employeeId, full_name: 'Ahmed Saleh', employee_number: 'E-001' },
      date: DAY,
      status: 'present',
      is_provisional: false,
      has_corrections: false,
      session_count: 1,
      sites: [{ id: world.siteId, name: 'Al Malqa Tower' }],
      attendance: {
        first_seen: { original: '07:00', value: '07:00', corrected: false },
        last_seen: { original: '15:00', value: '15:00', corrected: false },
        worked_minutes: { original: 480, value: 480, corrected: false },
      },
      offline_minutes: 0,
    });
    expect(body.minutes_by_zone).toEqual([
      { zone: { id: world.warehouseId, name: 'Warehouse', is_outdoor: false }, minutes: 240 },
      { zone: { id: world.roofId, name: 'Roof', is_outdoor: true }, minutes: 180 },
      { zone: null, minutes: 60 },
    ]);
    expect(body.alerts).toEqual([expect.objectContaining({ type: 'zone_exit', zone: { id: world.roofId, name: 'Roof' } })]);
    expect(body.tasks.map((t) => [t.title, t.status])).toEqual([['Clear the gate', 'todo'], ['Inspect scaffolding', 'done']]);
    expect(body.corrections).toEqual([]);
  });

  test('time without readings is counted as offline, not as time in a zone', async () => {
    await shift(at('07:00'), at('15:00'), normalDay, { skip: [[at('12:00'), at('12:50')]] });
    const { body } = await record().expect(200);
    expect(body.offline_minutes).toBe(60);
    expect(body.minutes_by_zone.map((z) => [z.zone && z.zone.name, z.minutes])).toEqual([['Roof', 180], ['Warehouse', 180], [null, 60]]);
    expect(body.attendance.worked_minutes.value).toBe(480);
  });

  test('a worker who did not report at all has a record marked absent', async () => {
    const { body } = await record('2026-10-15').expect(200);
    expect(body).toMatchObject({
      status: 'absent',
      is_provisional: false,
      session_count: 0,
      attendance: {
        first_seen: { original: null, value: null },
        last_seen: { original: null, value: null },
        worked_minutes: { original: 0, value: 0 },
      },
      minutes_by_zone: [],
      alerts: [],
      tasks: [],
    });
  });

  test('a day still in progress is marked provisional', async () => {
    const startOfToday = dayRange(todayInRiyadh()).start.getTime();
    await shift(new Date(Math.max(Date.now() - 90 * 60_000, startOfToday)), null, () => ROOF);
    const { body } = await record(todayInRiyadh()).expect(200);
    expect(body).toMatchObject({ status: 'present', is_provisional: true });
    expect(body.attendance.last_seen.value).not.toBeNull();
  });

  test('a corrected day shows the original value and every correction', async () => {
    await shift(at('07:00'), at('15:00'), normalDay);
    const insert = (field, from, to, reason) => pool.query(
      `INSERT INTO record_corrections (company_id, employee_id, site_id, work_date, field, original_value, corrected_value, reason, corrected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [admin.companyId, world.employeeId, world.siteId, DAY, field, from, to, reason, admin.userId],
    );
    await insert('worked_minutes', '480', '450', 'Left 30 minutes early, confirmed by the supervisor');
    await insert('worked_minutes', '450', '460', 'Supervisor rechecked the gate log');

    const { body } = await record().expect(200);
    expect(body.has_corrections).toBe(true);
    expect(body.attendance.worked_minutes).toEqual({ original: 480, value: 460, corrected: true });
    expect(body.attendance.first_seen.corrected).toBe(false);
    expect(body.corrections.map((c) => [c.original_value, c.corrected_value, c.corrected_by.full_name])).toEqual([
      ['480', '450', 'Al-Bina Admin'],
      ['450', '460', 'Al-Bina Admin'],
    ]);
  });

  test('a site manager can read it; another company, a future day or a bad date cannot', async () => {
    await shift(at('07:00'), at('15:00'), normalDay);
    const manager = await managerOf(admin.token, 'omar@albina.test');
    await record(DAY, manager).expect(200);

    const other = await adminOf('Nadeef', 'admin@nadeef.test');
    await record(DAY, other.token).expect(404);

    const future = new Date(Date.now() + 3 * 24 * 3600e3).toISOString().slice(0, 10);
    expect((await record(future).expect(422)).body.error.fields).toEqual({ date: 'Pick today or an earlier day' });
    expect((await record('2026-02-30').expect(422)).body.error.fields).toEqual({ date: 'Not a real date' });
    await request(app).get(api(`/employees/${world.employeeId}/daily-record`)).expect(401);
  });
});
