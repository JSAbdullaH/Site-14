const request = require('supertest');
const app = require('../src/app');
const { prisma, forCompany } = require('../src/config/db');
const { outbox } = require('../src/services/mail.service');
const { buildDailyRecords } = require('../src/services/report.service');
const template = require('../src/templates/attendance.html');
const { pool, truncateAll, square } = require('./setup');

const api = (path) => `/api/v1${path}`;
const post = (path, body) => request(app).post(api(path)).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const lastMail = (to) => [...outbox].reverse().find((m) => m.to === to.toLowerCase());

const at = (hhmm, date) => new Date(`${date}T${hhmm}:00+03:00`);

let admin;
let world;

async function adminOf(company, email) {
  const body = { company_name: company, full_name: `${company} Admin`, email, password: 'correct-horse-12' };
  await post('/auth/register', body).expect(201);
  await post('/auth/verify-email', { email, code: /confirmation code is (\d{6})/.exec(lastMail(email).text)[1] }).expect(200);
  await post('/auth/login', { email, password: body.password }).expect(200);
  const code = /sign-in code is (\d{6})/.exec(lastMail(email).text)[1];
  const session = (await post('/auth/login/verify', { email, code }).expect(200)).body;
  return { token: session.access_token, companyId: session.user.company_id, userId: session.user.id };
}

async function buildWorld() {
  const q = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const site = await q(
    "INSERT INTO sites (company_id, name, boundary, shift_start, shift_end) VALUES ($1, 'Al Malqa Tower', $2, '07:00', '17:00') RETURNING id",
    [admin.companyId, square(46.6, 24.7, 0.003)],
  );
  const res = await request(app).post(api('/employees')).set(bearer(admin.token))
    .send({ full_name: 'Ahmed Saleh', employee_number: 'E-001', job_category: 'construction', site_id: site.id, consent: true }).expect(201);
  const device = await q("INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-1', 'x') RETURNING id", [admin.companyId, res.body.id]);
  return { siteId: site.id, employeeId: res.body.id, deviceId: device.id };
}

async function shift(from, to, { lastReading } = {}) {
  const { rows } = await pool.query(
    'INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at, ended_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [admin.companyId, world.employeeId, world.siteId, world.deviceId, from, to],
  );
  const until = lastReading || to;
  for (let t = from.getTime(); t <= until.getTime(); t += 10 * 60_000) {
    await pool.query(
      'INSERT INTO telemetry_logs (session_id, latitude, longitude, battery_percent, recorded_at) VALUES ($1, 24.7, 46.6, 80, $2)',
      [rows[0].id, new Date(t)],
    );
  }
}

const report = (from, to) => buildDailyRecords({ db: forCompany(admin.companyId), userId: admin.userId }, world.siteId, from, to);
const history = (date) =>
  request(app).get(api(`/employees/${world.employeeId}/daily-record?date=${date}`)).set(bearer(admin.token)).expect(200);
const correct = (date, value) =>
  request(app).post(api(`/employees/${world.employeeId}/daily-record/corrections`)).set(bearer(admin.token))
    .send({ date, field: 'worked_minutes', corrected_value: value, reason: 'Left early, confirmed by the supervisor' }).expect(201);

beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
  world = await buildWorld();
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('report hours match the daily record (SITE-193)', () => {
  test('without corrections, the report and History give the same hours', async () => {
    await shift(at('07:14', '2026-11-01'), at('14:55', '2026-11-01'));
    const [{ body }, data] = await Promise.all([history('2026-11-01'), report('2026-11-01', '2026-11-01')]);
    expect(data.records[0].total_minutes).toBe(body.attendance.worked_minutes.value);
    expect(data.records[0].total_minutes).toBe(461);
    expect(data.records[0].corrected).toBe(false);
  });

  test('after a correction, the report prints the corrected hours and says so', async () => {
    await shift(at('07:14', '2026-11-01'), at('14:55', '2026-11-01'));
    await correct('2026-11-01', 450);
    const [{ body }, data] = await Promise.all([history('2026-11-01'), report('2026-11-01', '2026-11-01')]);
    expect(body.attendance.worked_minutes).toEqual({ original: 461, value: 450, corrected: true });
    expect(data.records[0]).toMatchObject({ total_minutes: 450, corrected: true });
    expect(data.totals).toMatchObject({ minutes: 450, corrected: 1 });

    const html = template.render({
      layout: 'day', reference: 'SITE14-R-20261101-AAAAAAAA', site: { name: 'Al Malqa Tower', shift: '07:00 to 17:00' },
      period: { label: '01 November 2026' }, issuer: { name: 'Sara', at: 'now' }, ...data,
    });
    expect(html).toContain('CORRECTED');
    expect(html).toContain('7.50');
    expect(html).not.toContain('7.68');
  });

  test('a correction on another day does not change this day', async () => {
    await shift(at('07:00', '2026-11-01'), at('15:00', '2026-11-01'));
    await shift(at('07:00', '2026-11-02'), at('15:00', '2026-11-02'));
    await correct('2026-11-02', 300);
    const data = await report('2026-11-01', '2026-11-01');
    expect(data.records[0]).toMatchObject({ total_minutes: 480, corrected: false });
  });
});

describe('open sessions and the period register (SITE-194)', () => {
  test('a past shift whose device stopped reporting counts up to its last reading', async () => {
    await shift(at('07:00', '2026-11-01'), null, { lastReading: at('14:30', '2026-11-01') });
    const [{ body }, data] = await Promise.all([history('2026-11-01'), report('2026-11-01', '2026-11-01')]);
    expect(data.records[0].total_minutes).toBe(450);
    expect(body.attendance.worked_minutes.value).toBe(450);
    expect(data.records[0].last_seen).toBe('14:30');
    expect(data.provisional).toBe(false);
  });

  test('a multi-day report sums each day and counts days present and absent', async () => {
    await shift(at('07:00', '2026-11-01'), at('15:00', '2026-11-01'));
    await shift(at('07:00', '2026-11-02'), null, { lastReading: at('12:00', '2026-11-02') });
    await shift(at('07:00', '2026-11-03'), at('15:00', '2026-11-03'));
    const data = await report('2026-11-01', '2026-11-07');
    expect(data.workdays).toBe(6);
    expect(data.records[0]).toMatchObject({
      days_present: 3,
      days_absent: 3,
      total_minutes: 480 + 300 + 480,
      avg_minutes: 420,
    });
  });

  test('the period layout has Days, Absent and Avg/day, and no In or Out', async () => {
    await shift(at('07:00', '2026-11-01'), at('15:00', '2026-11-01'));
    const data = await report('2026-11-01', '2026-11-07');
    const html = template.render({
      layout: 'period', reference: 'SITE14-R-20261101-AAAAAAAA', site: { name: 'Al Malqa Tower', shift: '07:00 to 17:00' },
      period: { label: '01 to 07 November 2026' }, issuer: { name: 'Sara', at: 'now' }, ...data,
    });
    expect(html).toContain('<th class="num">Days</th>');
    expect(html).toContain('<th class="num">Absent</th>');
    expect(html).toContain('<th class="num">Avg/day</th>');
    expect(html).not.toContain('<th>In</th>');
  });

  test('time two sessions share (a device swap) counts once in both places', async () => {
    await shift(at('07:00', '2026-11-01'), at('12:00', '2026-11-01'));
    await shift(at('11:00', '2026-11-01'), at('15:00', '2026-11-01'));
    const [{ body }, data] = await Promise.all([history('2026-11-01'), report('2026-11-01', '2026-11-01')]);
    expect(data.records[0].total_minutes).toBe(480);
    expect(body.attendance.worked_minutes.value).toBe(480);
  });
});
