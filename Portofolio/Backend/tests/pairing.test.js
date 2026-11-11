const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { pool, truncateAll, makeCompany } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c) => ({ Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role: 'company_admin' }).token}` });
const q = async (sql, params) => (await pool.query(sql, params)).rows[0];

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

async function freeWorker(c, name) {
  return (await q(
    "INSERT INTO employees (company_id, site_id, full_name, job_category, consent_given_at) VALUES ($1, $2, $3, 'construction', now()) RETURNING id",
    [c.companyId, c.siteId, name],
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

describe('device pairing', () => {
  test('a phone opening the link becomes a real device of the company, detected from its browser', async () => {
    const worker = await freeWorker(a, 'Sara');
    const created = await request(app).post(api('/devices/pairings')).set(bearer(a)).send({ employee_id: worker }).expect(201);
    expect(created.body).toMatchObject({ status: 'pending', code: expect.stringMatching(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/), employee: { full_name: 'Sara' } });

    const code = created.body.code;
    const info = await request(app).get(api(`/pairing/${code.toLowerCase()}`)).expect(200);
    expect(info.body).toMatchObject({ company_name: 'Company A', employee: { full_name: 'Sara' } });

    const claimed = await request(app)
      .post(api(`/pairing/${code}/claim`))
      .set('User-Agent', IPHONE)
      .send({ battery_percent: 64 })
      .expect(201);
    expect(claimed.body).toMatchObject({
      serial_number: expect.stringMatching(/^PH-[A-Z2-9]{8}$/),
      api_key: expect.stringMatching(/^dk_/),
      device: {
        device_type: 'phone',
        source: 'paired',
        name: 'iPhone',
        manufacturer: 'Apple',
        os: { name: 'iOS', version: '18.1' },
        browser: 'Safari 18',
        health: 'online',
        battery_percent: 64,
        employee: { id: worker, full_name: 'Sara' },
      },
    });

    const row = await q('SELECT company_id, employee_id FROM devices WHERE serial_number = $1', [claimed.body.serial_number]);
    expect(row).toEqual({ company_id: a.companyId, employee_id: worker });

    const status = await request(app).get(api(`/devices/pairings/${created.body.id}`)).set(bearer(a)).expect(200);
    expect(status.body).toMatchObject({ status: 'claimed', device: { serial_number: claimed.body.serial_number } });

    await request(app).post(api(`/pairing/${code}/claim`)).set('User-Agent', IPHONE).send({}).expect(409);

    const beat = await request(app)
      .post(api('/ingest/heartbeat'))
      .set({ 'X-Device-Serial': claimed.body.serial_number, 'X-Device-Key': claimed.body.api_key })
      .send({ battery_percent: 60 })
      .expect(200);
    expect(beat.body).toMatchObject({ ready: true, wearer: { full_name: 'Sara' }, company_name: 'Company A' });
  });

  test('the browser cannot claim to be a different kind of device', async () => {
    const { body } = await request(app).post(api('/devices/pairings')).set(bearer(a)).send({}).expect(201);
    const claimed = await request(app)
      .post(api(`/pairing/${body.code}/claim`))
      .set('User-Agent', IPHONE)
      .send({ device_type: 'laptop' })
      .expect(201);
    expect(claimed.body.device.device_type).toBe('phone');
  });

  test('a laptop is recognised from its battery', async () => {
    const { body } = await request(app).post(api('/devices/pairings')).set(bearer(a)).send({}).expect(201);
    const claimed = await request(app)
      .post(api(`/pairing/${body.code}/claim`))
      .set('User-Agent', MAC)
      .send({ has_battery: true })
      .expect(201);
    expect(claimed.body.device).toMatchObject({ device_type: 'laptop', name: 'MacBook', os: { name: 'macOS' } });
  });

  test('expired, cancelled and unknown codes are refused', async () => {
    const { body } = await request(app).post(api('/devices/pairings')).set(bearer(a)).send({}).expect(201);
    await q("UPDATE device_pairings SET expires_at = now() - interval '1 minute' WHERE id = $1", [body.id]);
    await request(app).get(api(`/pairing/${body.code}`)).expect(410);

    const other = await request(app).post(api('/devices/pairings')).set(bearer(a)).send({}).expect(201);
    await request(app).delete(api(`/devices/pairings/${other.body.id}`)).set(bearer(a)).expect(204);
    await request(app).post(api(`/pairing/${other.body.code}/claim`)).send({}).expect(404);

    await request(app).get(api('/pairing/AAAA-AAAA')).expect(404);
  });

  test('another company cannot read or cancel a pairing', async () => {
    const { body } = await request(app).post(api('/devices/pairings')).set(bearer(a)).send({}).expect(201);
    await request(app).get(api(`/devices/pairings/${body.id}`)).set(bearer(b)).expect(404);
    await request(app).delete(api(`/devices/pairings/${body.id}`)).set(bearer(b)).expect(409);
  });
});
