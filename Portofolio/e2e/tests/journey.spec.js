// SITE-77: the critical journey, end to end in a real browser.
//
// The journey from the story, in order. Each step is a test.step, so when one
// breaks the report names it. Steps whose feature is not built yet are listed
// below as test.fixme: they show as "skipped" with their name, and each one
// moves into the journey when its feature lands (the story's rule: the test
// grows week by week, it is never left for the last week).
const { test, expect } = require('@playwright/test');

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Site14-Demo-2026!';

// A new company each run, so the run never collides with earlier data.
const run = Date.now();
const owner = {
  company: `E2E Contracting ${run}`,
  name: 'Sara E2E',
  email: `sara+${run}@e2e.test`,
  password: 'e2e-Password-2026',
};

async function signIn(page, email, password) {
  await page.goto('/signin');
  await page.getByLabel('EMAIL').fill(email);
  await page.getByLabel('PASSWORD').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
}

test('critical journey', async ({ page }) => {
  await test.step('1. register a company', async () => {
    await page.goto('/signup');
    await page.getByLabel('COMPANY NAME').fill(owner.company);
    await page.getByLabel('YOUR NAME').fill(owner.name);
    await page.getByLabel('EMAIL').fill(owner.email);
    await page.getByLabel('PASSWORD').fill(owner.password);
    const answer = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/register'));
    await page.getByRole('button', { name: 'Continue' }).click();
    expect((await answer).status()).toBe(201);
  });

  await test.step('2. log in as the new company admin', async () => {
    await signIn(page, owner.email, owner.password);
    await expect(page.getByText(`Signed in as ${owner.name}`)).toBeVisible();
    await expect(page.getByText('company_admin')).toBeVisible();
  });

  await test.step('3. sign out', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  await test.step('4. log in as the seeded site manager (SITE-75 data)', async () => {
    await signIn(page, 'manager@albina.test', SEED_PASSWORD);
    await expect(page.getByText('site_manager')).toBeVisible();
  });

  // Steps 5 onwards are added here as their features land.
});

test('a wrong password is refused on screen', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('EMAIL').fill('manager@albina.test');
  await page.getByLabel('PASSWORD').fill('not-the-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Email or password is incorrect')).toBeVisible();
  await expect(page).toHaveURL(/\/signin$/);
});

// ---- Not built yet. Each one becomes a step of the journey above. ----
test.fixme('5. create a site', async () => {});
test.fixme('6. draw a zone on the site map', async () => {});
test.fixme('7. add an employee and record their consent', async () => {});
test.fixme('8. register a device and assign it to the employee', async () => {});
test.fixme('9. the simulator drives the worker out of the zone and the alert appears on the dashboard', async () => {});
test.fixme('10. open the daily record', async () => {});
test.fixme('11. generate the report', async () => {});
