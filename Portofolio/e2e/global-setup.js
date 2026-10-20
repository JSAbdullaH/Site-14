// Before the run: rebuild the E2E database from the migrations and load the
// demo seed (SITE-75), so every run starts from the same data.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..', 'Backend');
// Use the backend's own copy of pg, so this folder needs only Playwright.
const { Client } = require(require.resolve('pg', { paths: [backend] }));

module.exports = async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL_TEST (or DATABASE_URL_E2E) in Portofolio/Backend/.env');
  const name = new URL(url).pathname.slice(1);
  if (!/test|e2e/i.test(name)) {
    throw new Error(`Refusing to use database "${name}" for E2E: its name must contain "test" or "e2e", because the run wipes it.`);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dir = path.join(backend, 'prisma', 'migrations');
    for (const folder of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, folder, 'migration.sql');
      if (fs.existsSync(file)) await client.query(fs.readFileSync(file, 'utf8'));
    }
  } finally {
    await client.end();
  }

  // Run the seed as its own Node process: it loads the Prisma client, which
  // Playwright's test runner cannot load inside its own process.
  execFileSync(process.execPath, ['prisma/seed.js'], {
    cwd: backend,
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' },
    stdio: 'inherit',
  });
};
