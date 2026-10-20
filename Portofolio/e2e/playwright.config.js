// SITE-77: Playwright starts the real backend and frontend, on a database
// rebuilt and seeded for the run, then walks the critical journey.
//   cd Portofolio/e2e && npm install && npx playwright install chromium
//   npm test
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

// The database settings live in the backend's .env.
require('dotenv').config({ path: path.join(__dirname, '..', 'Backend', '.env'), quiet: true });

// A separate database can be set with DATABASE_URL_E2E; otherwise the test one.
const databaseUrl = process.env.DATABASE_URL_E2E || process.env.DATABASE_URL_TEST;
process.env.E2E_DATABASE_URL = databaseUrl;

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup'),
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
      // The API, on the database global-setup prepared.
      command: 'npm start',
      cwd: path.join(__dirname, '..', 'Backend'),
      url: 'http://localhost:4000/health',
      env: { DATABASE_URL: databaseUrl, PORT: '4000', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The frontend dev server; it forwards /api to port 4000.
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: path.join(__dirname, '..', 'FrontEnd', 'Portfolio'),
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
