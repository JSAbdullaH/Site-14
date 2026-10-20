// Shared test setup. Jest uses this one file in three ways:
//   1. setupFiles: runs it before every test file, so the app talks to the test database.
//   2. globalSetup: calls the exported function once, to rebuild the test database.
//   3. Test files require it for the small SQL helpers below.
const fs = require('node:fs');
const path = require('node:path');
const { Client, Pool } = require('pg');
require('dotenv').config({ quiet: true });

// ---------- 1. Point the app at the test database, and refuse anything else ----------
const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error('DATABASE_URL_TEST is not set. Copy .env.example to .env and run: createdb site14_test');
}
const name = new URL(url).pathname.replace(/^\//, '');
if (!/test/i.test(name)) {
  throw new Error(`Refusing to run tests on database "${name}": its name must contain "test", because tests wipe it.`);
}
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test-only-secret-at-least-32-characters-long';

// ---------- 2. Rebuild the test database from the migration files (once per run) ----------
async function globalSetup() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dir = path.join(__dirname, '..', 'prisma', 'migrations');
    const folders = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isDirectory()).sort();
    for (const folder of folders) {
      await client.query(fs.readFileSync(path.join(dir, folder, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

// ---------- 3. SQL helpers for the tests ----------
// A Pool opens no connection until the first query, so creating it here is free.
const pool = new Pool({ connectionString: url });

// The tables and columns schema.prisma declares, read from the file, so the
// tests follow the schema when tables or columns are added or removed.
//   { companies: ['created_at', 'id', 'name', ...], ... }
const SCHEMA_COLUMNS = (() => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const blocks = [...text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  const models = new Set(blocks.map((b) => b[1]));
  const tables = {};
  for (const [, , body] of blocks) {
    const table = body.match(/@@map\("(\w+)"\)/)[1];
    tables[table] = body.split('\n')
      .map((line) => line.trim().match(/^(\w+)\s+(\w+)[?[\]]*(.*)$/))
      .filter((m) => m && !models.has(m[2])) // skip relation fields
      .map((m) => (m[3].match(/@map\("(\w+)"\)/) || [, m[1]])[1])
      .sort();
  }
  return tables;
})();
const SCHEMA_TABLES = Object.keys(SCHEMA_COLUMNS);

// Every table that exists right now, apart from Prisma's migration history.
async function listTables() {
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1",
  );
  return rows.map((r) => r.tablename);
}

// TRUNCATE is allowed even on append-only tables (the triggers block UPDATE/DELETE only).
async function truncateAll() {
  const tables = await listTables();
  if (tables.length) await pool.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

const square = (lng, lat, half = 0.001) => ({
  type: 'Polygon',
  coordinates: [[[lng - half, lat - half], [lng + half, lat - half], [lng + half, lat + half], [lng - half, lat + half], [lng - half, lat - half]]],
});

// One company with everything a work session needs. Returns the ids.
async function makeCompany(tag, { consent = true } = {}) {
  const q = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const company = await q('INSERT INTO companies (name) VALUES ($1) RETURNING id', [`Company ${tag}`]);
  await q('INSERT INTO job_category_rules (company_id, job_category) VALUES ($1, $2) RETURNING id', [company.id, 'construction']);
  const user = await q(
    "INSERT INTO users (company_id, full_name, email, role) VALUES ($1, $2, $3, 'company_admin') RETURNING id",
    [company.id, `Admin ${tag}`, `admin-${tag.toLowerCase()}@example.test`],
  );
  const site = await q(
    "INSERT INTO sites (company_id, name, boundary, shift_start, shift_end) VALUES ($1, $2, $3, '07:00', '17:00') RETURNING id",
    [company.id, `Site ${tag}`, square(46.6, 24.7)],
  );
  const geofence = await q(
    'INSERT INTO geofences (site_id, name, boundary, is_outdoor) VALUES ($1, $2, $3, true) RETURNING id',
    [site.id, `Roof ${tag}`, square(46.6, 24.7, 0.0005)],
  );
  const employee = await q(
    "INSERT INTO employees (company_id, site_id, full_name, job_category, consent_given_at) VALUES ($1, $2, $3, 'construction', $4) RETURNING id",
    [company.id, site.id, `Worker ${tag}`, consent ? new Date() : null],
  );
  const device = await q(
    "INSERT INTO devices (company_id, employee_id, serial_number, api_key_hash) VALUES ($1, $2, $3, 'x') RETURNING id",
    [company.id, employee.id, `GPS-${tag}`],
  );
  return { companyId: company.id, userId: user.id, siteId: site.id, geofenceId: geofence.id, employeeId: employee.id, deviceId: device.id };
}

async function openSession(c, startedAt = new Date(Date.now() - 60 * 60_000)) {
  const { rows } = await pool.query(
    'INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [c.companyId, c.employeeId, c.siteId, c.deviceId, startedAt],
  );
  return rows[0].id;
}

// Resolves with the SQLSTATE of the error the query raised, or null if it succeeded.
async function sqlState(sql, params) {
  try {
    await pool.query(sql, params);
    return null;
  } catch (err) {
    return err.code;
  }
}

module.exports = globalSetup;
Object.assign(module.exports, { pool, SCHEMA_TABLES, SCHEMA_COLUMNS, listTables, truncateAll, makeCompany, openSession, sqlState, square });
