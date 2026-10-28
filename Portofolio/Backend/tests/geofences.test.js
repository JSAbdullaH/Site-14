const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { pool, truncateAll, makeCompany, openSession, square } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c, role = 'company_admin') => ({
  Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role }).token}`,
});

const zoneBody = (c, over = {}) => ({
  site_id: c.siteId,
  name: 'Scaffolding',
  is_outdoor: true,
  boundary: square(46.6, 24.7, 0.0003),
  ...over,
});

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

describe('POST /geofences', () => {
  test('creates a zone inside the site', async () => {
    const res = await request(app).post(api('/geofences')).set(bearer(a)).send(zoneBody(a)).expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      site_id: a.siteId,
      name: 'Scaffolding',
      is_outdoor: true,
      is_active: true,
      boundary: square(46.6, 24.7, 0.0003),
    });
  });

  test('a site manager can create zones too', async () => {
    await pool.query("UPDATE users SET role = 'site_manager' WHERE id = $1", [a.userId]);
    await request(app).post(api('/geofences')).set(bearer(a, 'site_manager')).send(zoneBody(a)).expect(201);
  });

  test('requires a token', async () => {
    await request(app).post(api('/geofences')).send(zoneBody(a)).expect(401);
  });

  test('rejects a zone that leaves the site', async () => {
    const res = await request(app)
      .post(api('/geofences'))
      .set(bearer(a))
      .send(zoneBody(a, { boundary: square(46.601, 24.7, 0.0005) }))
      .expect(422);
    expect(res.body.error.fields).toHaveProperty('boundary');
  });

  test('rejects an open ring, too few corners and out-of-range coordinates', async () => {
    const send = (boundary) => request(app).post(api('/geofences')).set(bearer(a)).send(zoneBody(a, { boundary }));
    await send({ type: 'Polygon', coordinates: [[[46.6, 24.7], [46.6001, 24.7], [46.6001, 24.7001], [46.6, 24.7001]]] }).expect(422);
    await send({ type: 'Polygon', coordinates: [[[46.6, 24.7], [46.6001, 24.7], [46.6, 24.7]]] }).expect(422);
    await send({ type: 'Polygon', coordinates: [[[200, 24.7], [46.6001, 24.7], [46.6001, 24.7001], [200, 24.7]]] }).expect(422);
    await send({ type: 'Point', coordinates: [46.6, 24.7] }).expect(422);
  });

  test("cannot add a zone to another company's site", async () => {
    await request(app).post(api('/geofences')).set(bearer(a)).send(zoneBody(a, { site_id: b.siteId })).expect(404);
  });
});

describe('GET /geofences', () => {
  test("lists the site's zones, filtered by is_active", async () => {
    const created = await request(app).post(api('/geofences')).set(bearer(a)).send(zoneBody(a)).expect(201);
    await request(app).delete(api(`/geofences/${created.body.id}`)).set(bearer(a)).expect(204);

    const all = await request(app).get(api('/geofences')).query({ site_id: a.siteId }).set(bearer(a)).expect(200);
    expect(all.body.data.map((g) => g.name)).toEqual(['Roof A', 'Scaffolding']);

    const active = await request(app)
      .get(api('/geofences'))
      .query({ site_id: a.siteId, is_active: 'true' })
      .set(bearer(a))
      .expect(200);
    expect(active.body.data.map((g) => g.name)).toEqual(['Roof A']);
  });

  test('requires site_id', async () => {
    await request(app).get(api('/geofences')).set(bearer(a)).expect(422);
  });

  test("cannot list another company's zones", async () => {
    await request(app).get(api('/geofences')).query({ site_id: b.siteId }).set(bearer(a)).expect(404);
  });
});

describe('PATCH /geofences/:id', () => {
  test('renames, re-flags and redraws a zone', async () => {
    const res = await request(app)
      .patch(api(`/geofences/${a.geofenceId}`))
      .set(bearer(a))
      .send({ name: 'Roof (north)', is_outdoor: false, boundary: square(46.6, 24.7, 0.0002) })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Roof (north)', is_outdoor: false, boundary: square(46.6, 24.7, 0.0002) });
  });

  test('rejects a redraw that leaves the site, and an empty body', async () => {
    await request(app)
      .patch(api(`/geofences/${a.geofenceId}`))
      .set(bearer(a))
      .send({ boundary: square(46.7, 24.7, 0.0002) })
      .expect(422);
    await request(app).patch(api(`/geofences/${a.geofenceId}`)).set(bearer(a)).send({}).expect(422);
  });

  test("cannot touch another company's zone", async () => {
    await request(app).patch(api(`/geofences/${b.geofenceId}`)).set(bearer(a)).send({ name: 'x' }).expect(404);
    await request(app).patch(api('/geofences/not-a-uuid')).set(bearer(a)).send({ name: 'x' }).expect(404);
  });
});

describe('DELETE /geofences/:id', () => {
  test('deactivates the zone and keeps the row', async () => {
    await request(app).delete(api(`/geofences/${a.geofenceId}`)).set(bearer(a)).expect(204);
    const { rows } = await pool.query('SELECT is_active FROM geofences WHERE id = $1', [a.geofenceId]);
    expect(rows).toEqual([{ is_active: false }]);
  });

  test("cannot deactivate another company's zone", async () => {
    await request(app).delete(api(`/geofences/${b.geofenceId}`)).set(bearer(a)).expect(404);
  });
});

describe('GET /locations/live', () => {
  async function addWorker(c, name) {
    const { rows } = await pool.query(
      "INSERT INTO employees (company_id, site_id, full_name, job_category, consent_given_at) VALUES ($1, $2, $3, 'construction', now()) RETURNING id",
      [c.companyId, c.siteId, name],
    );
    return rows[0].id;
  }
  const setState = (employeeId, { sessionId = null, geofenceId = null, lat = 24.7, lng = 46.6, battery = 80 }) =>
    pool.query(
      `INSERT INTO employee_current_state (employee_id, session_id, geofence_id, latitude, longitude, battery_percent, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [employeeId, sessionId, geofenceId, lat, lng, battery],
    );

  test('returns one row per worker with off_site, on_site and in_zone status', async () => {
    const sessionId = await openSession(a);
    await setState(a.employeeId, { sessionId, geofenceId: a.geofenceId });
    const onSite = await addWorker(a, 'Ali On Site');
    const device = (await pool.query(
      "INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, 'GPS-ALI', 'x') RETURNING id",
      [a.companyId, onSite],
    )).rows[0];
    const aliSession = await openSession({ ...a, employeeId: onSite, deviceId: device.id });
    await setState(onSite, { sessionId: aliSession, lat: 24.7009, lng: 46.6009 });
    const offSite = await addWorker(a, 'Badr Off Site');
    await setState(offSite, { lat: 24.8, lng: 46.7 });
    await addWorker(a, 'No Reading Yet');

    const res = await request(app).get(api('/locations/live')).query({ site_id: a.siteId }).set(bearer(a)).expect(200);
    expect(res.body.site_id).toBe(a.siteId);
    expect(res.body.site).toEqual({ id: a.siteId, name: 'Site A', boundary: square(46.6, 24.7) });
    const byName = Object.fromEntries(res.body.data.map((r) => [r.full_name, r]));
    expect(Object.keys(byName).sort()).toEqual(['Ali On Site', 'Badr Off Site', 'Worker A']);
    expect(byName['Worker A']).toMatchObject({
      location_status: 'in_zone',
      zone: { id: a.geofenceId, name: 'Roof A', is_outdoor: true },
      latitude: 24.7,
      longitude: 46.6,
      battery_percent: 80,
      recorded_at: expect.any(String),
    });
    expect(byName['Ali On Site']).toMatchObject({ location_status: 'on_site', zone: null });
    expect(byName['Badr Off Site']).toMatchObject({ location_status: 'off_site', zone: null });
  });

  test('hides inactive workers', async () => {
    await setState(a.employeeId, {});
    await pool.query("UPDATE employees SET status = 'inactive' WHERE id = $1", [a.employeeId]);
    const res = await request(app).get(api('/locations/live')).query({ site_id: a.siteId }).set(bearer(a)).expect(200);
    expect(res.body.data).toEqual([]);
  });

  test("cannot read another company's site", async () => {
    await request(app).get(api('/locations/live')).query({ site_id: b.siteId }).set(bearer(a)).expect(404);
    await request(app).get(api('/locations/live')).set(bearer(a)).expect(422);
  });
});
