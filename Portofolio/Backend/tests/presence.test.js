const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { sha256 } = require('../src/utils/tokens');
const { sweepOffline } = require('../src/services/presence.service');
const { pool, truncateAll, makeCompany } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c) => ({
  Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role: 'company_admin' }).token}`,
});
const rows = async (sql, params) => (await pool.query(sql, params)).rows;

const IN_ZONE = { latitude: 24.7, longitude: 46.6 };
const ON_SITE = { latitude: 24.7, longitude: 46.6008 };
const OUTSIDE = { latitude: 24.7, longitude: 46.603 };

const MINUTE = 60_000;
const ago = (minutes) => new Date(Date.now() - minutes * MINUTE);
const reading = (at, where) => ({ recorded_at: at.toISOString(), ...where, battery_percent: 80 });

const keyOf = (c) => `key-${c.deviceId}`;
const send = (c, readings) =>
  request(app).post(api('/ingest/readings')).set('X-Device-Serial', `GPS-${c.tag}`).set('X-Device-Key', keyOf(c)).send({ readings });

async function companyWithKey(tag) {
  const c = { ...(await makeCompany(tag)), tag };
  await pool.query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [c.deviceId, sha256(keyOf(c))]);
  return c;
}

const events = (c) => rows('SELECT event_type, zone_name, from_zone_name, alert_id FROM presence_events WHERE employee_id = $1 ORDER BY occurred_at, created_at', [c.employeeId]);
const zoneAlerts = (c) =>
  rows(
    "SELECT a.resolved_at FROM alerts a JOIN work_sessions s ON s.id = a.session_id WHERE s.employee_id = $1 AND a.alert_type = 'zone_exit' ORDER BY a.triggered_at",
    [c.employeeId],
  );
const live = async (c) => (await request(app).get(api(`/locations/live?site_id=${c.siteId}`)).set(bearer(c)).expect(200)).body.data[0];

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

describe('zone transitions', () => {
  test('arriving in a zone, leaving it and coming back records each step and opens then resolves an alert', async () => {
    const first = await send(a, [reading(ago(30), IN_ZONE)]).expect(200);
    expect(first.body).toMatchObject({ location_status: 'in_zone', out_of_zone: false, events: ['site_enter', 'zone_enter'] });

    const left = await send(a, [reading(ago(20), ON_SITE)]).expect(200);
    expect(left.body).toMatchObject({ location_status: 'on_site', out_of_zone: true, events: ['zone_exit'] });
    expect(await zoneAlerts(a)).toEqual([{ resolved_at: null }]);

    const outside = await live(a);
    expect(outside).toMatchObject({ status: 'out_of_zone', location_status: 'on_site', out_of_zone: { left_zone: 'Roof A', acknowledged: false } });

    const back = await send(a, [reading(ago(10), IN_ZONE)]).expect(200);
    expect(back.body.events).toEqual(['zone_enter']);
    expect((await zoneAlerts(a))[0].resolved_at).not.toBeNull();
    expect((await live(a)).status).toBe('in_zone');

    expect((await events(a)).map((e) => e.event_type)).toEqual(['site_enter', 'zone_enter', 'zone_exit', 'zone_enter']);
  });

  test('leaving the site closes the open out-of-zone alert', async () => {
    await send(a, [reading(ago(30), IN_ZONE), reading(ago(20), ON_SITE)]).expect(200);
    const res = await send(a, [reading(ago(10), OUTSIDE)]).expect(200);
    expect(res.body).toMatchObject({ location_status: 'off_site', out_of_zone: false, events: ['site_exit'] });
    expect((await zoneAlerts(a))[0].resolved_at).not.toBeNull();
    expect((await live(a)).status).toBe('off_site');
  });

  test('a batch sent after being offline replays every crossing in order', async () => {
    await send(a, [reading(ago(40), IN_ZONE), reading(ago(35), ON_SITE), reading(ago(30), IN_ZONE), reading(ago(25), ON_SITE)]).expect(200);
    expect((await events(a)).map((e) => e.event_type)).toEqual(['site_enter', 'zone_enter', 'zone_exit', 'zone_enter', 'zone_exit']);
    expect((await zoneAlerts(a)).map((x) => x.resolved_at === null)).toEqual([false, true]);
  });

  test('a retried batch adds no events', async () => {
    const batch = [reading(ago(30), IN_ZONE), reading(ago(20), ON_SITE)];
    await send(a, batch).expect(200);
    const again = await send(a, batch).expect(200);
    expect(again.body).toMatchObject({ duplicates: 2, events: [] });
    expect(await events(a)).toHaveLength(3);
  });
});

describe('offline devices', () => {
  test('a device silent while on shift is flagged offline once, and back online when heard again', async () => {
    await send(a, [reading(ago(1), IN_ZONE)]).expect(200);
    await pool.query("UPDATE devices SET last_seen_at = now() - interval '10 minutes' WHERE id = $1", [a.deviceId]);

    expect(await sweepOffline()).toBe(1);
    expect(await sweepOffline()).toBe(0);
    expect((await live(a)).status).toBe('offline');

    await send(a, [reading(new Date(), IN_ZONE)]).expect(200);
    const types = (await events(a)).map((e) => e.event_type);
    expect(types.filter((t) => t === 'device_offline')).toHaveLength(1);
    expect(types).toContain('device_online');
    expect((await live(a)).status).toBe('in_zone');
  });

  test('a device that is off site is not flagged', async () => {
    await send(a, [reading(ago(30), IN_ZONE), reading(ago(20), OUTSIDE)]).expect(200);
    await pool.query("UPDATE devices SET last_seen_at = now() - interval '10 minutes' WHERE id = $1", [a.deviceId]);
    expect(await sweepOffline()).toBe(0);
  });
});

describe('notifications and alerts', () => {
  test('lists the company\'s events newest first, counts unread, and marks them read', async () => {
    await send(a, [reading(ago(30), IN_ZONE), reading(ago(20), ON_SITE)]).expect(200);
    await send(b, [reading(ago(30), IN_ZONE)]).expect(200);

    const res = await request(app).get(api('/notifications')).set(bearer(a)).expect(200);
    expect(res.body.unread_count).toBe(3);
    expect(res.body.data[0]).toMatchObject({ type: 'zone_exit', employee: { full_name: 'Worker A' }, zone_name: 'Roof A', alert: { resolved: false } });
    expect(res.body.data.every((e) => e.employee.full_name === 'Worker A')).toBe(true);

    const filtered = await request(app).get(api('/notifications?type=zone_exit')).set(bearer(a)).expect(200);
    expect(filtered.body.data).toHaveLength(1);

    await request(app).post(api('/notifications/read')).set(bearer(a)).expect(200);
    expect((await request(app).get(api('/notifications')).set(bearer(a))).body.unread_count).toBe(0);
  });

  test('open alerts can be listed and acknowledged once', async () => {
    await send(a, [reading(ago(30), IN_ZONE), reading(ago(20), ON_SITE)]).expect(200);

    const open = await request(app).get(api('/alerts?status=open')).set(bearer(a)).expect(200);
    expect(open.body.data).toEqual([expect.objectContaining({ type: 'zone_exit', status: 'open', zone: expect.objectContaining({ name: 'Roof A' }) })]);
    expect((await request(app).get(api('/alerts/summary')).set(bearer(a))).body).toMatchObject({ open: 1, unacknowledged: 1 });

    const ack = await request(app).post(api(`/alerts/${open.body.data[0].id}/acknowledge`)).set(bearer(a)).expect(200);
    expect(ack.body.acknowledged_by).toMatchObject({ full_name: 'Admin A' });
    expect((await live(a)).out_of_zone.acknowledged).toBe(true);

    await request(app).post(api(`/alerts/${open.body.data[0].id}/acknowledge`)).set(bearer(b)).expect(404);
  });
});
