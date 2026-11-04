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

const q = async (sql, params) => (await pool.query(sql, params)).rows[0];

async function siteOf(companyId, name = 'Al Malqa Tower', active = true) {
  return (await q(
    "INSERT INTO sites (company_id, name, boundary, shift_start, shift_end, is_active) VALUES ($1, $2, $3, '07:00', '17:00', $4) RETURNING id",
    [companyId, name, square(46.6, 24.7), active],
  )).id;
}

async function workerOf(companyId, siteId, name = 'Ahmed Saleh', status = 'active') {
  await q(
    "INSERT INTO job_category_rules (company_id, job_category) VALUES ($1, 'construction') ON CONFLICT DO NOTHING RETURNING id",
    [companyId],
  );
  return (await q(
    "INSERT INTO employees (company_id, site_id, full_name, job_category, status) VALUES ($1, $2, $3, 'construction', $4) RETURNING id",
    [companyId, siteId, name, status],
  )).id;
}

const as = (token) => ({
  create: (body) => request(app).post(api('/tasks')).set(bearer(token)).send(body),
  list: (query = '') => request(app).get(api(`/tasks${query}`)).set(bearer(token)),
  update: (id, body) => request(app).patch(api(`/tasks/${id}`)).set(bearer(token)).send(body),
});

let admin;
let A;
let site;
let ahmed;
beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
  admin = await adminOf('Al-Bina', 'sara@albina.test');
  A = as(admin.token);
  site = await siteOf(admin.companyId);
  ahmed = await workerOf(admin.companyId, site);
});
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('POST /tasks (SITE-42)', () => {
  test('creates a task for today on the worker\'s site', async () => {
    const res = await A.create({ title: 'Pour the second floor slab', employee_id: ahmed }).expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      title: 'Pour the second floor slab',
      status: 'todo',
      completed_at: null,
      site: { id: site, name: 'Al Malqa Tower' },
      employee: { id: ahmed, full_name: 'Ahmed Saleh' },
      created_by: { full_name: 'Al-Bina Admin' },
    });
    const { today } = await q("SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date::text AS today");
    expect(res.body.scheduled_for).toBe(today);
  });

  test('keeps the date it is given', async () => {
    const res = await A.create({ title: 'Inspect scaffolding', employee_id: ahmed, scheduled_for: '2026-11-04' }).expect(201);
    expect(res.body.scheduled_for).toBe('2026-11-04');
  });

  test('a site manager can create tasks', async () => {
    const manager = await managerOf(admin.token, 'omar@albina.test');
    await as(manager).create({ title: 'Clear the gate', employee_id: ahmed }).expect(201);
  });

  test('rejects a bad title, a missing employee and a fake date', async () => {
    const res = await A.create({ title: 'x', employee_id: 'nope', scheduled_for: '2026-02-30' }).expect(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['employee_id', 'scheduled_for', 'title']);
  });

  test('rejects an inactive worker, a worker with no site, and a worker on another site', async () => {
    const gone = await workerOf(admin.companyId, site, 'Gone Worker', 'inactive');
    await A.create({ title: 'Paint', employee_id: gone }).expect(422);

    const floating = await workerOf(admin.companyId, null, 'No Site');
    const res = await A.create({ title: 'Paint', employee_id: floating }).expect(422);
    expect(res.body.error.fields).toHaveProperty('site_id');

    const other = await siteOf(admin.companyId, 'Other Tower');
    await A.create({ title: 'Paint', employee_id: ahmed, site_id: other }).expect(422);
  });

  test('rejects a task on a deactivated site', async () => {
    const closed = await siteOf(admin.companyId, 'Closed Tower', false);
    const worker = await workerOf(admin.companyId, closed, 'Late Worker');
    await A.create({ title: 'Paint', employee_id: worker }).expect(409);
  });

  test("cannot give a task to another company's worker", async () => {
    const other = await adminOf('Rival', 'boss@rival.test');
    const rivalWorker = await workerOf(other.companyId, await siteOf(other.companyId, 'Rival Site'), 'Rival Worker');
    await A.create({ title: 'Steal', employee_id: rivalWorker }).expect(422);
  });

  test('requires a token', async () => {
    await request(app).post(api('/tasks')).send({ title: 'Paint', employee_id: ahmed }).expect(401);
  });
});

describe('PATCH /tasks/:id (SITE-43)', () => {
  test('moves a task through its statuses and stamps completion', async () => {
    const { id } = (await A.create({ title: 'Pour slab', employee_id: ahmed })).body;

    const started = await A.update(id, { status: 'in_progress' }).expect(200);
    expect(started.body).toMatchObject({ status: 'in_progress', completed_at: null });

    const done = await A.update(id, { status: 'done' }).expect(200);
    expect(done.body.status).toBe('done');
    expect(done.body.completed_at).toEqual(expect.any(String));

    const reopened = await A.update(id, { status: 'todo' }).expect(200);
    expect(reopened.body).toMatchObject({ status: 'todo', completed_at: null });
  });

  test('renames a task and ignores a status it already has', async () => {
    const { id } = (await A.create({ title: 'Pour slab', employee_id: ahmed })).body;
    const res = await A.update(id, { title: 'Pour the roof slab', status: 'todo' }).expect(200);
    expect(res.body).toMatchObject({ title: 'Pour the roof slab', status: 'todo' });
  });

  test('rejects an empty body and an unknown status', async () => {
    const { id } = (await A.create({ title: 'Pour slab', employee_id: ahmed })).body;
    await A.update(id, {}).expect(422);
    await A.update(id, { status: 'pending' }).expect(422);
  });

  test("returns 404 for another company's task and a bad id", async () => {
    const other = await adminOf('Rival', 'boss@rival.test');
    const rivalWorker = await workerOf(other.companyId, await siteOf(other.companyId, 'Rival Site'), 'Rival Worker');
    const { id } = (await as(other.token).create({ title: 'Theirs', employee_id: rivalWorker }).expect(201)).body;
    await A.update(id, { status: 'done' }).expect(404);
    await A.update('not-a-uuid', { status: 'done' }).expect(404);
  });
});

describe('GET /tasks (SITE-44)', () => {
  test("lists one worker's tasks, newest day first, and filters by status and day", async () => {
    const khalid = await workerOf(admin.companyId, site, 'Khalid Omar');
    await A.create({ title: 'Older', employee_id: ahmed, scheduled_for: '2026-11-01' }).expect(201);
    const newer = (await A.create({ title: 'Newer', employee_id: ahmed, scheduled_for: '2026-11-04' })).body;
    await A.create({ title: 'Not Ahmed', employee_id: khalid, scheduled_for: '2026-11-04' }).expect(201);
    await A.update(newer.id, { status: 'done' }).expect(200);

    const mine = await A.list(`?employee_id=${ahmed}`).expect(200);
    expect(mine.body.total).toBe(2);
    expect(mine.body.data.map((t) => t.title)).toEqual(['Newer', 'Older']);

    const done = await A.list(`?employee_id=${ahmed}&status=done`).expect(200);
    expect(done.body.data.map((t) => t.title)).toEqual(['Newer']);

    const day = await A.list('?scheduled_for=2026-11-04').expect(200);
    expect(day.body.data.map((t) => t.title).sort()).toEqual(['Newer', 'Not Ahmed']);
  });

  test("never shows another company's tasks", async () => {
    const other = await adminOf('Rival', 'boss@rival.test');
    const rivalWorker = await workerOf(other.companyId, await siteOf(other.companyId, 'Rival Site'), 'Rival Worker');
    await as(other.token).create({ title: 'Theirs', employee_id: rivalWorker }).expect(201);
    const res = await A.list().expect(200);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  test('rejects a bad filter', async () => {
    await A.list('?status=pending').expect(422);
    await A.list('?employee_id=nope').expect(422);
  });
});
