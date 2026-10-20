// SITE-69: the migration runs forward and rolls back cleanly.
const globalSetup = require('./setup');
const { pool, SCHEMA_TABLES, listTables } = require('./setup');
const { rollback } = require('../prisma/rollback');
const { assertSafeTarget } = require('../prisma/safety');

const url = process.env.DATABASE_URL;

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

afterAll(async () => {
  await globalSetup(); // leave the test database built for the other test files
  await pool.end();
});

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
