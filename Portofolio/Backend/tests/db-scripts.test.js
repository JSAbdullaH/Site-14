// The scripts that change a whole database:
//   SITE-75  npm run db:seed      demo data, and running it again resets cleanly
//   SITE-69  npm run db:rollback  undoes the migration and leaves nothing behind
const globalSetup = require('./setup');
const { pool, SCHEMA_TABLES, listTables } = require('./setup');
const { prisma } = require('../src/config/db');
const { seed } = require('../prisma/seed');
const { rollback, assertSafeTarget } = require('../prisma/rollback');

const url = process.env.DATABASE_URL;

afterAll(async () => {
  await globalSetup(); // leave the test database built for the other test files
  await prisma.$disconnect();
  await pool.end();
});

// ---------------------------------------------------------------- seed (SITE-75)

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

// Row count of every table, to compare two runs.
async function snapshot() {
  const counts = {};
  for (const t of await listTables()) counts[t] = (await one(`SELECT count(*)::int AS n FROM "${t}"`)).n;
  return counts;
}

let first;
beforeAll(async () => {
  await seed();
  first = await snapshot();
}, 120_000);

test('a company with two sites, three zones (one outdoor) and twenty tracked employees', async () => {
  const c = await one("SELECT id FROM companies WHERE name = 'Al-Bina Advanced Contracting'");
  expect((await one('SELECT count(*)::int AS n FROM sites WHERE company_id = $1', [c.id])).n).toBe(2);

  const zones = await one(
    'SELECT count(*)::int AS n, count(*) FILTER (WHERE g.is_outdoor)::int AS outdoor FROM geofences g JOIN sites s ON s.id = g.site_id WHERE s.company_id = $1',
    [c.id],
  );
  expect(zones).toEqual({ n: 3, outdoor: 1 });

  // Tracked = has consented and wears a device.
  const tracked = await one(
    'SELECT count(*)::int AS n FROM employees e JOIN devices d ON d.employee_id = e.id WHERE e.company_id = $1 AND e.consent_given_at IS NOT NULL',
    [c.id],
  );
  expect(tracked.n).toBe(20);
});

test('the live map, the table, the alert list and the daily record all have data', async () => {
  const c = await one("SELECT id FROM companies WHERE name = 'Al-Bina Advanced Contracting'");
  const q = async (sql) => (await one(sql, [c.id])).n;

  // Live map: workers on site right now, each with a fresh position.
  expect(await q(`SELECT count(*)::int AS n FROM employee_current_state cs
    JOIN work_sessions ws ON ws.id = cs.session_id WHERE ws.company_id = $1 AND ws.ended_at IS NULL`)).toBeGreaterThanOrEqual(10);
  // Table: the employee list.
  expect(await q('SELECT count(*)::int AS n FROM employees WHERE company_id = $1')).toBeGreaterThanOrEqual(20);
  // Alert list: open ones for today, handled ones from the past week.
  expect(await q(`SELECT count(*)::int AS n FROM alerts a JOIN work_sessions ws ON ws.id = a.session_id
    WHERE ws.company_id = $1 AND a.resolved_at IS NULL`)).toBeGreaterThanOrEqual(2);
  expect(await q(`SELECT count(*)::int AS n FROM alerts a JOIN work_sessions ws ON ws.id = a.session_id
    WHERE ws.company_id = $1 AND a.resolved_at IS NOT NULL`)).toBeGreaterThan(0);
  // Daily record: a week of past days.
  expect(await q('SELECT count(DISTINCT work_date)::int AS n FROM daily_work_records WHERE company_id = $1')).toBeGreaterThanOrEqual(6);
  // Readings behind the sessions, and tasks in every status.
  expect(await q(`SELECT count(*)::int AS n FROM telemetry_logs t JOIN work_sessions ws ON ws.id = t.session_id
    WHERE ws.company_id = $1`)).toBeGreaterThan(5000);
  expect(await q('SELECT count(DISTINCT status)::int AS n FROM tasks WHERE company_id = $1')).toBe(3);
});

test('employees without consent have no device and no session', async () => {
  const pending = await one(`SELECT count(*)::int AS n FROM employees e
    WHERE e.consent_given_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.employee_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM work_sessions ws WHERE ws.employee_id = e.id)`);
  expect(pending.n).toBeGreaterThanOrEqual(2);
});

test('the demo users can be looked up for sign-in', async () => {
  const users = await pool.query("SELECT email, role FROM users WHERE email LIKE '%@albina.test' ORDER BY email");
  expect(users.rows).toEqual([
    { email: 'admin@albina.test', role: 'company_admin' },
    { email: 'manager@albina.test', role: 'site_manager' },
  ]);
});

test('running the seed twice resets cleanly instead of duplicating rows', async () => {
  await seed();
  expect(await snapshot()).toEqual(first);
}, 120_000);

// ---------------------------------------------------------------- rollback (SITE-69)

// Everything in the public schema that a migration could leave behind.
async function leftovers() {
  const { rows } = await pool.query(`
    SELECT 'table' AS kind, tablename AS name FROM pg_tables WHERE schemaname = 'public'
    UNION ALL SELECT 'view', viewname FROM pg_views WHERE schemaname = 'public'
    UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    UNION ALL SELECT 'type', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
    UNION ALL SELECT 'sequence', sequencename FROM pg_sequences WHERE schemaname = 'public'`);
  return rows;
}

test('rolling back leaves an empty database, and the migration runs again after it', async () => {
  expect(await listTables()).toEqual([...SCHEMA_TABLES].sort());

  expect(await rollback(url)).toBe('20261015000000_init');
  expect(await leftovers()).toEqual([]); // no tables, view, functions, enum types or sequences

  await globalSetup();
  expect(await listTables()).toEqual([...SCHEMA_TABLES].sort());
});

test('the reset scripts refuse production and remote databases', () => {
  expect(() => assertSafeTarget('postgresql://u@localhost:5432/x', 'seed')).not.toThrow();
  expect(() => assertSafeTarget('postgresql://admin@130.94.118.244:40007/site14', 'seed')).toThrow(/Refusing to seed/);

  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    expect(() => assertSafeTarget('postgresql://u@localhost:5432/x', 'roll back')).toThrow(/production/);
  } finally {
    process.env.NODE_ENV = env;
  }
});
