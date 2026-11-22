const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/jwt');
const { signPlatformToken } = require('../src/utils/platformJwt');
const { hashPassword } = require('../src/utils/password');
const { pool, truncateAll, makeCompany } = require('./setup');

const api = (path) => `/api/v1${path}`;
const bearer = (c, role = 'company_admin') => ({ Authorization: `Bearer ${signAccessToken({ userId: c.userId, companyId: c.companyId, role }).token}` });
const q = async (sql, params) => (await pool.query(sql, params)).rows[0];

const ORDER = { shipping_address: 'King Fahd Road, Al Olaya, Riyadh 12211', contact_phone: '+966 50 123 4567' };

let a;
let b;
let watch;
let owner;
beforeEach(async () => {
  await truncateAll();
  a = await makeCompany('A');
  b = await makeCompany('B');
  watch = await prisma.product.create({
    data: {
      sku: 'SW-TEST',
      name: 'Test Watch',
      description: 'A watch used by the tests.',
      deviceType: 'watch',
      serialPrefix: 'SW',
      priceHalalas: 50000,
      stock: 5,
      features: ['GPS'],
    },
  });
  const admin = await prisma.platformAdmin.create({
    data: { fullName: 'Owner', email: 'owner@site14.test', passwordHash: await hashPassword('owner-password-123') },
  });
  owner = { Authorization: `Bearer ${signPlatformToken(admin.id).token}` };
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('marketplace', () => {
  test('a purchase puts the devices straight into the buyer\'s inventory', async () => {
    const res = await request(app)
      .post(api('/marketplace/orders'))
      .set(bearer(a))
      .send({ ...ORDER, items: [{ product_id: watch.id, quantity: 2 }, { product_id: watch.id, quantity: 1 }] })
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'placed',
      reference_number: expect.stringMatching(/^SITE14-O-\d{8}-[0-9A-F]{8}$/),
      subtotal_halalas: 150000,
      vat_halalas: 22500,
      total_halalas: 172500,
      device_count: 3,
    });

    const devices = await request(app).get(api('/devices?source=marketplace')).set(bearer(a)).expect(200);
    expect(devices.body.total).toBe(3);
    expect(devices.body.data[0]).toMatchObject({
      device_type: 'watch',
      source: 'marketplace',
      name: 'Test Watch',
      serial_number: expect.stringMatching(/^SW-/),
      order: { status: 'placed' },
    });

    expect((await q('SELECT stock FROM products WHERE id = $1', [watch.id])).stock).toBe(2);
    expect((await request(app).get(api('/devices')).set(bearer(b))).body.total).toBe(1);
  });

  test('stock is never oversold', async () => {
    const res = await request(app)
      .post(api('/marketplace/orders'))
      .set(bearer(a))
      .send({ ...ORDER, items: [{ product_id: watch.id, quantity: 6 }] })
      .expect(409);
    expect(res.body.error.fields['items.0.quantity']).toBe('Only 5 left in stock');
  });

  test('only a company admin can buy', async () => {
    await request(app).post(api('/marketplace/orders')).set(bearer(a, 'site_manager')).send({ ...ORDER, items: [{ product_id: watch.id, quantity: 1 }] }).expect(403);
  });

  test('shipping loads keys onto the devices; the company sees the order delivered', async () => {
    const { body: order } = await request(app).post(api('/marketplace/orders')).set(bearer(a)).send({ ...ORDER, items: [{ product_id: watch.id, quantity: 2 }] }).expect(201);

    const [device] = (await request(app).get(api('/devices')).set(bearer(a))).body.data.filter((d) => d.source === 'marketplace');
    await request(app).post(api(`/devices/${device.id}/key`)).set(bearer(a)).expect(409);

    const shipped = await request(app).post(api(`/platform/orders/${order.id}/ship`)).set(owner).expect(200);
    expect(shipped.body.keys).toHaveLength(2);
    expect(shipped.body.order.status).toBe('shipped');

    const key = shipped.body.keys[0];
    await request(app).post(api('/ingest/heartbeat')).set({ 'X-Device-Serial': key.serial_number, 'X-Device-Key': key.api_key }).send({}).expect(200);

    await request(app).post(api(`/platform/orders/${order.id}/ship`)).set(owner).expect(409);
    await request(app).post(api(`/platform/orders/${order.id}/deliver`)).set(owner).expect(200);
    const mine = await request(app).get(api(`/marketplace/orders/${order.id}`)).set(bearer(a)).expect(200);
    expect(mine.body.status).toBe('delivered');
    await request(app).get(api(`/marketplace/orders/${order.id}`)).set(bearer(b)).expect(404);
  });

  test('cancelling returns the stock and removes the devices', async () => {
    const { body: order } = await request(app).post(api('/marketplace/orders')).set(bearer(a)).send({ ...ORDER, items: [{ product_id: watch.id, quantity: 3 }] }).expect(201);
    await request(app).post(api(`/platform/orders/${order.id}/cancel`)).set(owner).expect(200);
    expect((await q('SELECT stock FROM products WHERE id = $1', [watch.id])).stock).toBe(5);
    expect((await request(app).get(api('/devices?source=marketplace')).set(bearer(a))).body.total).toBe(0);
  });
});

describe('website owner dashboard', () => {
  test('signs in with its own account, separate from company accounts', async () => {
    const res = await request(app).post(api('/platform/auth/login')).send({ email: 'owner@site14.test', password: 'owner-password-123' }).expect(200);
    await request(app).get(api('/platform/overview')).set({ Authorization: `Bearer ${res.body.access_token}` }).expect(200);
    await request(app).get(api('/devices')).set({ Authorization: `Bearer ${res.body.access_token}` }).expect(401);
    await request(app).get(api('/platform/overview')).set(bearer(a)).expect(401);
    await request(app).post(api('/platform/auth/login')).send({ email: 'owner@site14.test', password: 'wrong-password' }).expect(401);
  });

  test('sees every company and every device', async () => {
    const companies = await request(app).get(api('/platform/companies')).set(owner).expect(200);
    expect(companies.body.total).toBe(2);
    const devices = await request(app).get(api('/platform/devices')).set(owner).expect(200);
    expect(devices.body.total).toBe(2);
    expect(devices.body.data[0].company).toEqual(expect.objectContaining({ name: expect.stringMatching(/^Company [AB]$/) }));
  });

  test('manages the catalog', async () => {
    const created = await request(app)
      .post(api('/platform/products'))
      .set(owner)
      .send({ sku: 'tb-new', name: 'New Tablet', description: 'A tablet for the site office.', device_type: 'tablet', serial_prefix: 'nt', price_halalas: 99900, stock: 10 })
      .expect(201);
    expect(created.body).toMatchObject({ sku: 'TB-NEW', serial_prefix: 'NT', is_active: true });
    await request(app).patch(api(`/platform/products/${created.body.id}`)).set(owner).send({ is_active: false }).expect(200);
    const listed = await request(app).get(api('/marketplace/products')).set(bearer(a)).expect(200);
    expect(listed.body.data.map((p) => p.sku)).toEqual(['SW-TEST']);
  });
});
