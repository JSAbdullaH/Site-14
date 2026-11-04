const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { sha256 } = require('../src/utils/tokens');
const { pool, truncateAll, makeCompany } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c) => ({
  Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role: 'company_admin' }).token}`,
});
const q = async (sql, params) => (await pool.query(sql, params)).rows[0];
const rows = async (sql, params) => (await pool.query(sql, params)).rows;

// makeCompany's site is a square around (46.6, 24.7); its outdoor zone "Roof" covers the middle.
const IN_ZONE = { latitude: 24.7, longitude: 46.6 };
const ON_SITE = { latitude: 24.7, longitude: 46.6008 };
const OUTSIDE = { latitude: 24.7, longitude: 46.603 };

const MINUTE = 60_000;
const ago = (minutes) => new Date(Date.now() - minutes * MINUTE);
const reading = (at, where, extra = {}) => ({ recorded_at: at.toISOString(), ...where, battery_percent: 80, heart_rate_bpm: 88, ...extra });

const keyOf = (c) => `key-${c.deviceId}`;
const send = (c, body, key = keyOf(c), serial = `GPS-${c.tag}`) =>
  request(app).post(api('/ingest/readings')).set('X-Device-Serial', serial).set('X-Device-Key', key).send(body);

async function companyWithKey(tag, options) {
  const c = { ...(await makeCompany(tag, options)), tag };
  await pool.query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [c.deviceId, sha256(keyOf(c))]);
  return c;
}

const sessions = (c) => rows('SELECT started_at, ended_at FROM work_sessions WHERE employee_id = $1 ORDER BY started_at', [c.employeeId]);
const logCount = async (c) => (await q(
  'SELECT count(*)::int AS n FROM telemetry_logs t JOIN work_sessions s ON s.id = t.session_id WHERE s.employee_id = $1',
  [c.employeeId],
)).n;

let a;
let b;
beforeEach(async () => {
  await truncateAll();
  a = await companyWithKey('A');
  b = await companyWithKey('B');
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('device authentication', () => {
  test('needs the serial and the matching key', async () => {
    const body = { readings: [reading(ago(1), IN_ZONE)] };
    await request(app).post(api('/ingest/readings')).send(body).expect(401);
    expect((await send(a, body, 'wrong-key').expect(401)).body.error.code).toBe('DEVICE_UNAUTHENTICATED');
    await send(a, body, keyOf(b)).expect(401);
    await send(a, body, keyOf(a), 'NO-SUCH-DEVICE').expect(401);
    await send(a, body, keyOf(a), 'gps-a').expect(200);
  });

  test('a user token is not a device key', async () => {
    await request(app).post(api('/ingest/readings')).set(bearer(a)).send({ readings: [reading(ago(1), IN_ZONE)] }).expect(401);
  });

  test('a deactivated device is refused', async () => {
    await pool.query('UPDATE devices SET is_active = false WHERE id = $1', [a.deviceId]);
    expect((await send(a, { readings: [reading(ago(1), IN_ZONE)] }).expect(403)).body.error.code).toBe('DEVICE_INACTIVE');
  });
});

describe('receiving readings', () => {
  test('arriving on site opens a shift at the device time, and the live map shows the worker', async () => {
    const at = ago(2);
    const res = await send(a, { readings: [reading(at, IN_ZONE)] }).expect(200);
    expect(res.body).toMatchObject({ accepted: 1, stored: 1, duplicates: 0, throttled: 0, rejected: [], location_status: 'in_zone' });
    expect(res.body.session).toMatchObject({ id: expect.any(String), started_at: at.toISOString() });

    expect(await sessions(a)).toEqual([{ started_at: at, ended_at: null }]);

    const live = await request(app).get(api(`/locations/live?site_id=${a.siteId}`)).set(bearer(a)).expect(200);
    expect(live.body.data).toEqual([expect.objectContaining({
      employee_id: a.employeeId,
      location_status: 'in_zone',
      zone: expect.objectContaining({ id: a.geofenceId }),
      ...IN_ZONE,
      battery_percent: 80,
      heart_rate_bpm: 88,
      recorded_at: at.toISOString(),
    })]);
  });

  test('every stored reading carries both the device clock and the server clock', async () => {
    // A device that buffered for ten minutes, then sent everything.
    const before = new Date();
    await send(a, { readings: [reading(ago(12), IN_ZONE), reading(ago(11), ON_SITE)] }).expect(200);
    const logs = await rows('SELECT recorded_at, received_at FROM telemetry_logs ORDER BY recorded_at');
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log.received_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(log.received_at - log.recorded_at).toBeGreaterThan(10 * MINUTE);
    }
    expect(logs[0].received_at).toEqual(logs[1].received_at);
  });

  test('moving between zones updates the map; leaving ends the shift at the exit time', async () => {
    const arrival = ago(30);
    const res = await send(a, { readings: [reading(arrival, IN_ZONE), reading(ago(20), ON_SITE)] }).expect(200);
    expect(res.body.location_status).toBe('on_site');

    const exit = ago(10);
    const left = await send(a, { readings: [reading(exit, OUTSIDE)] }).expect(200);
    expect(left.body).toMatchObject({ accepted: 1, stored: 0, location_status: 'off_site', session: null });

    expect(await sessions(a)).toEqual([{ started_at: arrival, ended_at: exit }]);
    const [day] = await rows('SELECT worked_minutes, is_open FROM daily_work_records WHERE employee_id = $1', [a.employeeId]);
    expect(day).toEqual({ worked_minutes: 20, is_open: false });

    // Off site, no position is kept: the map holds the last on-site position, without heart rate.
    expect(await logCount(a)).toBe(2);
    const state = await q('SELECT session_id, latitude, longitude, heart_rate_bpm FROM employee_current_state WHERE employee_id = $1', [a.employeeId]);
    expect(state).toEqual({ session_id: null, ...ON_SITE, heart_rate_bpm: null });
  });

  test('coming back opens a new shift', async () => {
    await send(a, { readings: [reading(ago(50), IN_ZONE), reading(ago(40), OUTSIDE), reading(ago(30), IN_ZONE)] }).expect(200);
    const list = await sessions(a);
    expect(list).toHaveLength(2);
    expect(list[1].ended_at).toBeNull();
  });

  test('a reading from outside before arrival stores nothing and opens nothing', async () => {
    const res = await send(a, { readings: [reading(ago(1), OUTSIDE)] }).expect(200);
    expect(res.body).toMatchObject({ accepted: 1, stored: 0, location_status: 'off_site', session: null });
    expect(await sessions(a)).toEqual([]);
  });

  test('a batch out of order is put in order first', async () => {
    const [exit, arrival] = [ago(5), ago(15)];
    const res = await send(a, { readings: [reading(exit, OUTSIDE), reading(arrival, IN_ZONE), reading(ago(10), ON_SITE)] }).expect(200);
    expect(res.body.accepted).toBe(3);
    expect(await sessions(a)).toEqual([{ started_at: arrival, ended_at: exit }]);
    expect(await logCount(a)).toBe(2);
  });

  test('a device silent on site and next heard outside: the silence is not counted as work', async () => {
    const lastHeard = ago(90);
    await send(a, { readings: [reading(ago(100), IN_ZONE), reading(lastHeard, ON_SITE)] }).expect(200);
    await send(a, { readings: [reading(ago(5), OUTSIDE)] }).expect(200);
    const [s] = await sessions(a);
    expect(s.ended_at).toEqual(lastHeard);
  });

  test('companies never see each other', async () => {
    await send(a, { readings: [reading(ago(1), IN_ZONE)] }).expect(200);
    const live = await request(app).get(api(`/locations/live?site_id=${b.siteId}`)).set(bearer(b)).expect(200);
    expect(live.body.data).toEqual([]);
  });
});

describe('who the data belongs to', () => {
  test('an unassigned device: refused, nothing stored, but the device is seen', async () => {
    await pool.query('UPDATE devices SET employee_id = NULL WHERE id = $1', [a.deviceId]);
    const res = await send(a, { readings: [reading(ago(1), IN_ZONE)] }).expect(409);
    expect(res.body.error.code).toBe('DEVICE_UNASSIGNED');
    expect(await q('SELECT count(*)::int AS n FROM work_sessions')).toEqual({ n: 0 });
    expect((await q('SELECT last_seen_at FROM devices WHERE id = $1', [a.deviceId])).last_seen_at).not.toBeNull();
  });

  test('a worker without consent: no position is ever stored', async () => {
    const c = await companyWithKey('C', { consent: false });
    const res = await send(c, { readings: [reading(ago(1), IN_ZONE)] }).expect(409);
    expect(res.body.error.code).toBe('NO_CONSENT');
    expect(await q('SELECT count(*)::int AS n FROM employee_current_state WHERE employee_id = $1', [c.employeeId])).toEqual({ n: 0 });
  });

  test('a worker with no site, or on a deactivated site', async () => {
    await pool.query('UPDATE sites SET is_active = false WHERE id = $1', [a.siteId]);
    expect((await send(a, { readings: [reading(ago(1), IN_ZONE)] }).expect(409)).body.error.code).toBe('NO_SITE');
    await pool.query('UPDATE employees SET site_id = NULL WHERE id = $1', [a.employeeId]);
    expect((await send(a, { readings: [reading(ago(1), IN_ZONE)] }).expect(409)).body.error.code).toBe('NO_SITE');
  });

  test('a device given to another worker reports for the new wearer', async () => {
    await send(a, { readings: [reading(ago(20), IN_ZONE), reading(ago(15), OUTSIDE)] }).expect(200);
    const other = (await q(
      "INSERT INTO employees (company_id, site_id, full_name, job_category, consent_given_at) VALUES ($1, $2, 'New Wearer', 'construction', now()) RETURNING id",
      [a.companyId, a.siteId],
    )).id;
    await request(app).patch(api(`/devices/${a.deviceId}`)).set(bearer(a)).send({ employee_id: other }).expect(200);
    await send(a, { readings: [reading(ago(5), IN_ZONE)] }).expect(200);
    expect(await q('SELECT count(*)::int AS n FROM work_sessions WHERE employee_id = $1', [other])).toEqual({ n: 1 });
  });
});

describe('repeated and excessive readings', () => {
  test('a retried batch is stored once and the hours do not change', async () => {
    const batch = { readings: [reading(ago(40), IN_ZONE), reading(ago(30), ON_SITE), reading(ago(20), OUTSIDE)] };
    await send(a, batch).expect(200);
    const before = await sessions(a);

    for (let i = 0; i < 3; i += 1) {
      const retry = await send(a, batch).expect(200);
      expect(retry.body).toMatchObject({ accepted: 0, duplicates: 3, stored: 0 });
    }
    expect(await sessions(a)).toEqual(before);
    expect(await logCount(a)).toBe(2);
  });

  test('a batch that overlaps the last one keeps only the new readings', async () => {
    const overlap = ago(9);
    await send(a, { readings: [reading(ago(10), IN_ZONE), reading(overlap, IN_ZONE)] }).expect(200);
    const res = await send(a, { readings: [reading(overlap, IN_ZONE), reading(ago(8), ON_SITE)] }).expect(200);
    expect(res.body).toMatchObject({ accepted: 1, duplicates: 1 });
    expect(await logCount(a)).toBe(3);
  });

  test('the same batch sent twice at the same moment is stored once', async () => {
    const batch = { readings: [reading(ago(10), IN_ZONE), reading(ago(9), ON_SITE)] };
    const [x, y] = await Promise.all([send(a, batch), send(a, batch)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(x.body.accepted + y.body.accepted).toBe(2);
    expect(await logCount(a)).toBe(2);
    expect(await sessions(a)).toHaveLength(1);
  });

  test('readings closer than a few seconds apart are dropped, but arriving or leaving never is', async () => {
    const start = ago(10).getTime();
    const burst = Array.from({ length: 20 }, (_, i) => reading(new Date(start + i * 500), IN_ZONE));
    const res = await send(a, { readings: burst }).expect(200);
    expect(res.body).toMatchObject({ accepted: 4, throttled: 16 });

    const exit = await send(a, { readings: [reading(new Date(start + 10_100), OUTSIDE)] }).expect(200);
    expect(exit.body).toMatchObject({ accepted: 1, throttled: 0, location_status: 'off_site' });
  });

  test('a batch has at most 120 readings', async () => {
    const start = ago(30).getTime();
    const many = Array.from({ length: 121 }, (_, i) => reading(new Date(start + i * 5000), IN_ZONE));
    const res = await send(a, { readings: many }).expect(422);
    expect(res.body.error.fields).toHaveProperty('readings');
    await send(a, { readings: many.slice(0, 120) }).expect(200);
  });

  test('malformed readings are refused as a whole', async () => {
    const bad = [
      { readings: [] },
      { readings: [{ ...reading(ago(1), IN_ZONE), latitude: 91 }] },
      { readings: [{ ...reading(ago(1), IN_ZONE), recorded_at: 'yesterday' }] },
      { readings: [{ ...reading(ago(1), IN_ZONE), recorded_at: '2026-11-04T09:30:00' }] },
      { readings: [{ ...reading(ago(1), IN_ZONE), battery_percent: 101 }] },
      { readings: [{ ...reading(ago(1), IN_ZONE), heart_rate_bpm: 300 }] },
    ];
    for (const body of bad) await send(a, body).expect(422);
    expect(await logCount(a)).toBe(0);
  });

  test('unknown extra fields from newer firmware are ignored', async () => {
    await send(a, { readings: [reading(ago(1), IN_ZONE, { accuracy_m: 4, speed: 1.2 })], firmware: '2.1' }).expect(200);
  });
});

describe('device clock drift', () => {
  test('reports the server time and how far the device clock is off', async () => {
    const deviceNow = new Date(Date.now() - 45_000); // the device clock runs 45 s behind
    const res = await send(a, { sent_at: deviceNow.toISOString(), readings: [reading(new Date(deviceNow - 5000), IN_ZONE)] }).expect(200);
    expect(Date.parse(res.body.server_time)).toBeGreaterThan(Date.now() - 5000);
    expect(res.body.clock_offset_seconds).toBeGreaterThanOrEqual(45);
    expect(res.body.clock_offset_seconds).toBeLessThan(50);

    const device = await q('SELECT last_seen_at, last_recorded_at, clock_offset_seconds FROM devices WHERE id = $1', [a.deviceId]);
    expect(device.clock_offset_seconds).toBe(res.body.clock_offset_seconds);
    expect(device.last_seen_at - device.last_recorded_at).toBeGreaterThanOrEqual(50_000);

    const listed = await request(app).get(api('/devices')).set(bearer(a)).expect(200);
    expect(listed.body.data[0]).toMatchObject({ serial_number: 'GPS-A', clock_offset_seconds: res.body.clock_offset_seconds });
  });

  test('a reading from a clock far in the future is refused, and does not block the real ones', async () => {
    const res = await send(a, { readings: [reading(new Date(Date.now() + 3 * 3600_000), IN_ZONE)] }).expect(200);
    expect(res.body).toMatchObject({ accepted: 0, rejected: [{ index: 0, reason: 'clock_ahead', recorded_at: expect.any(String) }] });

    const next = await send(a, { readings: [reading(ago(1), IN_ZONE)] }).expect(200);
    expect(next.body.accepted).toBe(1);
  });

  test('a small lead is accepted', async () => {
    const res = await send(a, { readings: [reading(new Date(Date.now() + 60_000), IN_ZONE)] }).expect(200);
    expect(res.body.accepted).toBe(1);
  });

  test('a reading older than a day is refused, so finished days stay as reported', async () => {
    const res = await send(a, { readings: [reading(ago(25 * 60), IN_ZONE), reading(ago(1), IN_ZONE)] }).expect(200);
    expect(res.body).toMatchObject({ accepted: 1, rejected: [{ index: 0, reason: 'too_old' }] });
  });
});
