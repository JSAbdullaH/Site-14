// SITE-77: Playwright rebuilds and seeds a test database, starts the real
// backend and frontend on it, then walks the critical journey.
//   npx playwright install chromium     (once)
//   npm run test:e2e                    (from Portofolio/Backend)
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const backend = path.join(__dirname, '..', '..');
const frontend = path.join(backend, '..', 'FrontEnd', 'Portfolio');

// The database settings live in the backend's .env.
require('dotenv').config({ path: path.join(backend, '.env'), quiet: true });

// A separate database can be set with DATABASE_URL_E2E; otherwise the test one.
// The run wipes it, so its name must say it is a test database.
const databaseUrl = process.env.DATABASE_URL_E2E || process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST (or DATABASE_URL_E2E) in .env');
const name = new URL(databaseUrl).pathname.slice(1);
if (!/test|e2e/i.test(name)) {
  throw new Error(`Refusing to use database "${name}" for E2E: its name must contain "test" or "e2e".`);
}

module.exports = defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Fresh database (migrations + demo seed), then the API on it.
      command: 'npx prisma migrate reset --force && npm run db:seed && npm start',
      cwd: backend,
      url: 'http://localhost:4000/health',
      env: { DATABASE_URL: databaseUrl, PORT: '4000', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The frontend dev server; it forwards /api to port 4000.
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: frontend,
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
