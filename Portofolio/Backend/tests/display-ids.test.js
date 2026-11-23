const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../src/app');
const { outbox } = require('../src/services/mail.service');
const { numberIn } = require('../src/utils/displayId');
const { pool, truncateAll, makeCompany, sqlState, square } = require('./setup');

const MIGRATION = path.join(__dirname, '..', 'prisma', 'migrations', '20261124000000_display_ids');
const api = (p) => `/api/v1${p}`;
const post = (p, body) => request(app).post(api(p)).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const lastMail = (to) => [...outbox].reverse().find((m) => m.to === to.toLowerCase());
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

async function adminOf(company, email) {
  const body = { company_name: company, full_name: `${company} Admin`, email, password: 'correct-horse-12' };
  await post('/auth/register', body).expect(201);
  await post('/auth/verify-email', { email, code: /confirmation code is (\d{6})/.exec(lastMail(email).text)[1] }).expect(200);
  await post('/auth/login', { email, password: body.password }).expect(200);
  const code = /sign-in code is (\d{6})/.exec(lastMail(email).text)[1];
  const session = (await post('/auth/login/verify', { email, code }).expect(200)).body;
  return { token: session.access_token, companyId: session.user.company_id };
}

const addEmployee = (companyId, name) => one(
  "INSERT INTO employees (company_id, full_name, job_category) VALUES ($1, $2, 'construction') RETURNING id, display_number",
  [companyId, name],
);

beforeEach(async () => {
  await truncateAll();
  outbox.length = 0;
});

describe('company key', () => {
  test('is suggested from the initials of the name, and kept unique', async () => {
    const key = async (name) => (await one('INSERT INTO companies (name) VALUES ($1) RETURNING key', [name])).key;
    expect(await key('apple.inc')).toBe('AI');
    expect(await key('Apple Inc')).toBe('AIA');
    expect(await key('Albina')).toBe('AL');
    expect(await key('Al-Bina Advanced Contracting')).toBe('ABAC');
    expect(await key('شركة البناء')).toBe('CO');
  });

  test('a typed key is kept, must be 2 to 5 capitals, and never changes', async () => {
    const { id } = await one("INSERT INTO companies (name, key) VALUES ('Apple Inc', 'APL') RETURNING id");
    expect((await one('SELECT key FROM companies WHERE id = $1', [id])).key).toBe('APL');
    expect(await sqlState("INSERT INTO companies (name, key) VALUES ('X', 'APL')")).toBe('23505');
    expect(await sqlState("INSERT INTO companies (name, key) VALUES ('X', 'abc')")).toBe('23514');
    expect(await sqlState("INSERT INTO companies (name, key) VALUES ('X', 'ABCDEF')")).not.toBeNull();
    expect(await sqlState("UPDATE companies SET key = 'NEW' WHERE id = $1", [id])).toBe('ID001');
    expect(await sqlState("UPDATE companies SET name = 'Apple' WHERE id = $1", [id])).toBeNull();
  });
});

describe('display numbers', () => {
  test('each company counts each type on its own, starting at 100001', async () => {
    const a = await makeCompany('A');
    const b = await makeCompany('B');
    const second = await addEmployee(a.companyId, 'Second A');
    expect((await one('SELECT display_number FROM employees WHERE id = $1', [a.employeeId])).display_number).toBe(100001);
    expect(second.display_number).toBe(100002);
    expect((await one('SELECT display_number FROM employees WHERE id = $1', [b.employeeId])).display_number).toBe(100001);
    expect((await one('SELECT display_number FROM sites WHERE id = $1', [a.siteId])).display_number).toBe(100001);
    const task = await one(
      "INSERT INTO tasks (company_id, site_id, employee_id, created_by, title) VALUES ($1, $2, $3, $4, 'T') RETURNING display_number",
      [a.companyId, a.siteId, a.employeeId, a.userId],
    );
    expect(task.display_number).toBe(100001);
  });

  test('inserts at the same moment never share a number', async () => {
    const a = await makeCompany('A');
    await Promise.all(Array.from({ length: 25 }, (_, i) => addEmployee(a.companyId, `Worker ${i}`)));
    const { rows } = await pool.query('SELECT display_number FROM employees WHERE company_id = $1 ORDER BY 1', [a.companyId]);
    expect(rows.map((r) => r.display_number)).toEqual(Array.from({ length: 26 }, (_, i) => 100001 + i));
  });

  test('a multi-row insert, like the CSV import, numbers every row', async () => {
    const a = await makeCompany('A');
    await pool.query(
      "INSERT INTO employees (company_id, full_name, job_category) VALUES ($1, 'X', 'construction'), ($1, 'Y', 'construction'), ($1, 'Z', 'construction')",
      [a.companyId],
    );
    const { rows } = await pool.query('SELECT display_number FROM employees WHERE company_id = $1 ORDER BY 1', [a.companyId]);
    expect(rows.map((r) => r.display_number)).toEqual([100001, 100002, 100003, 100004]);
  });

  test('a number sent with the insert is ignored, and a number never changes', async () => {
    const a = await makeCompany('A');
    const row = await one(
      "INSERT INTO employees (company_id, full_name, job_category, display_number) VALUES ($1, 'X', 'construction', 999999) RETURNING display_number",
      [a.companyId],
    );
    expect(row.display_number).toBe(100002);
    expect(await sqlState('UPDATE employees SET display_number = 100500 WHERE id = $1', [a.employeeId])).toBe('ID001');
    expect(await sqlState("UPDATE employees SET full_name = 'Renamed' WHERE id = $1", [a.employeeId])).toBeNull();
  });

  test('a rolled-back insert gives its number back', async () => {
    const a = await makeCompany('A');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO employees (company_id, full_name, job_category) VALUES ($1, 'Gone', 'construction')", [a.companyId]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect((await addEmployee(a.companyId, 'Next')).display_number).toBe(100002);
  });

  test('a company out of numbers is refused, not given a seven-digit one', async () => {
    const a = await makeCompany('A');
    await pool.query('UPDATE id_counters SET employee_last = 999999 WHERE company_id = $1', [a.companyId]);
    expect(await sqlState("INSERT INTO employees (company_id, full_name, job_category) VALUES ($1, 'X', 'construction')", [a.companyId])).toBe('ID002');
  });
});

describe('migration on existing data', () => {
  test('numbers old rows in the order they were created, and the next insert follows on', async () => {
    const down = fs.readFileSync(path.join(MIGRATION, 'down.sql'), 'utf8');
    const up = fs.readFileSync(path.join(MIGRATION, 'migration.sql'), 'utf8');
    const a = await makeCompany('A');
    const late = await addEmployee(a.companyId, 'Late');
    const early = await addEmployee(a.companyId, 'Early');
    await pool.query("UPDATE employees SET created_at = now() - interval '1 day' WHERE id = $1", [early.id]);
    try {
      await pool.query(down);
      await pool.query(up);
      const number = async (id) => (await one('SELECT display_number FROM employees WHERE id = $1', [id])).display_number;
      expect(await number(early.id)).toBe(100001);
      expect(await number(a.employeeId)).toBe(100002);
      expect(await number(late.id)).toBe(100003);
      expect((await addEmployee(a.companyId, 'New')).display_number).toBe(100004);
      expect((await one('SELECT key FROM companies WHERE id = $1', [a.companyId])).key).toBe('CA');
    } finally {
      // Leave the schema as the other test files expect it, whatever happened above.
      await pool.query(down);
      await pool.query(up);
    }
  });
});

describe('API', () => {
  test('sign-up gives the company a key from its name, shown on the company', async () => {
    const apple = await adminOf('Apple Inc', 'admin@apple.test');
    const twin = await adminOf('Apple Inc', 'admin@apple2.test');
    const keyOf = async (a) => (await request(app).get(api('/companies/me')).set(bearer(a.token)).expect(200)).body.key;
    expect(await keyOf(apple)).toBe('AI');
    expect(await keyOf(twin)).toBe('AIA');
    await request(app).patch(api('/companies/me')).set(bearer(apple.token)).send({ key: 'NEW' }).expect(422);
  });

  test('employees, tasks and sites carry display_id, and can be found by it', async () => {
    const { token, companyId } = await adminOf('Apple Inc', 'admin@apple.test');
    const site = (await request(app).post(api('/sites')).set(bearer(token)).send({
      name: 'Tower', boundary: square(46.6, 24.7), shift_start: '07:00', shift_end: '17:00',
    }).expect(201)).body;
    expect(site.display_id).toBe('AI-S-100001');

    const employee = (await request(app).post(api('/employees')).set(bearer(token)).send({
      full_name: 'Ahmed Saleh', job_category: 'construction', site_id: site.id, consent: true,
    }).expect(201)).body;
    expect(employee.display_id).toBe('AI-E-100001');
    await addEmployee(companyId, 'Second Worker');

    const task = (await request(app).post(api('/tasks')).set(bearer(token)).send({
      employee_id: employee.id, title: 'Pour the slab',
    }).expect(201)).body;
    expect(task.display_id).toBe('AI-T-100001');

    const find = async (p) => (await request(app).get(api(p)).set(bearer(token)).expect(200)).body;
    expect((await find('/employees?search=ai-e-100001')).data.map((e) => e.full_name)).toEqual(['Ahmed Saleh']);
    expect((await find('/employees?search=100002')).data.map((e) => e.full_name)).toEqual(['Second Worker']);
    expect((await find('/employees?search=AI-T-100001')).data).toEqual([]);
    expect((await find('/tasks?search=AI-T-100001')).data.map((t) => t.title)).toEqual(['Pour the slab']);
    expect((await find('/sites')).data[0].display_id).toBe('AI-S-100001');
    expect((await find(`/employees/${employee.id}`)).display_id).toBe('AI-E-100001');

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
    expect((await find(`/employees/${employee.id}/daily-record?date=${today}`)).employee.display_id).toBe('AI-E-100001');
    const live = await find(`/locations/live?site_id=${site.id}`);
    expect(live.data.map((w) => w.display_id)).toEqual(['AI-E-100001']);
  });
});

describe('numberIn', () => {
  test('reads a full ID of the right type, or six digits', () => {
    expect(numberIn('AI-E-100012', 'employee')).toBe(100012);
    expect(numberIn(' ai-e-100012 ', 'employee')).toBe(100012);
    expect(numberIn('100012', 'task')).toBe(100012);
    expect(numberIn('AI-T-100012', 'employee')).toBeNull();
    expect(numberIn('Ahmed', 'employee')).toBeNull();
    expect(numberIn('12345', 'employee')).toBeNull();
    expect(numberIn(undefined, 'employee')).toBeNull();
  });
});
