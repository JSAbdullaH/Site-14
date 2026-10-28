# Bug fixes after the branch merges

Branch: `Laila-Frontend-Structure`, after merging `origin/Faisal-employee` and `origin/Abdullah-Multiple-sites`.

The merges left no `<<<<<<<` conflict markers. The problems were code from different branches that did not work together, plus some older bugs found along the way.

**Result:** the backend tests pass (155/155; before the fixes, 12 failed). The frontend type-checks and builds. The main sites flow was tested in a real browser: sign in, list sites, create a site, assign an employee, and a blocked deactivation.

---

## 1. Merge conflicts: backend

`Faisal-employee` and `Abdullah-Multiple-sites` both changed the employee API, in different ways.

| Problem | Effect | Fix | File |
|---|---|---|---|
| The merge dropped `page` and `limit` from `listEmployeesQuery` | Every `GET /employees` returned **500** | Restored `page` (default 1) and `limit` (default 25, max 100) | `Backend/src/utils/schemas.js` |
| `site_id=none` (list unassigned workers) was lost | The multi-site filter returned 422 | `site_id` now accepts a UUID or `none` | `Backend/src/utils/schemas.js`, `Backend/src/services/employee.service.js` |
| Two response shapes: `employees.test.js` expects `site: {id, name}`, `sites.test.js` expects `site_id` and `site_name` | One test suite always failed | Employee responses now include `site`, `site_id` and `site_name` | `Backend/src/services/employee.service.js` |
| The assignment rules from the multi-site branch were lost | An inactive employee could be assigned to a site; assigning to a deactivated site gave the wrong error | `PATCH /employees/:id` returns `409 EMPLOYEE_INACTIVE` and `409 SITE_INACTIVE` again. An unknown site still returns 422. The checks run only when `site_id` changes. | `Backend/src/services/employee.service.js` |
| The controller exported `assignSite`, which calls `employeeService.assignSite`. That function no longer exists. | Dead code that would crash if a route used it | Removed `assignSite` | `Backend/src/controllers/employee.controller.js` |
| `employee.model.js` was no longer imported anywhere | Dead code | Deleted | `Backend/src/models/employee.model.js` |
| `assignEmployeeSchema` was no longer used | Dead code | Removed | `Backend/src/utils/schemas.js` |

## 2. Merge conflicts: frontend

Laila's branch moved the frontend to `features/` and `shared/` with shadcn components. The multi-site branch built its pages in the old layout (`pages/`, `components/`, `lib/`). The merge kept Laila's routes and **dropped the multi-site pages**, so creating sites, editing sites and assigning employees disappeared, and the leftover files were orphaned.

| Problem | Fix |
|---|---|
| `src/pages/Home.tsx` imported `../components/AppShell`, which no longer exists, so `tsc` failed | Deleted |
| `Sites.tsx` and `SiteEdit.tsx` were lost; `SiteProvider`, `SiteSelector`, `SiteEmployees` and `lib/{api,auth,sites}.ts` were orphaned | Rebuilt in the new structure (below) and deleted the old files |
| The Sites page could only list sites (name, status, date) | Rebuilt `features/sites/SitesPage.tsx`: client, shift, assigned count, on-site count, a **New site** button (admins only), click a row to edit, and **Open map** |
| No way to create or edit a site | New `features/sites/SiteEditPage.tsx`: name, client, shift times, boundary corners with a live outline preview, errors shown under each field, and deactivate/reactivate |
| No way to assign employees to a site | New `features/sites/components/SiteEmployees.tsx`: search, assign or move, and remove |
| Site types only had `id`, `name`, `boundary`, `is_active` | `features/sites/types.ts` now matches the API (`client`, `shift_start`, `shift_end`, `employee_count`, `on_site_count`, …) and adds `shiftLabel()` |
| The active site was stored with two different keys (`site14.activeSite` and `site14_active_site`) | One shared `getActiveSiteId()` / `setActiveSiteId()` in `features/sites/api.ts`, used by the map and sites pages |
| Missing routes | Added `/sites/new` and `/sites/:id` in `App.tsx` |

## 3. Other bugs fixed

### Frontend
| Bug | Effect | Fix | File |
|---|---|---|---|
| Sign-in never saved the user | The sidebar always said "Account"; the Account page showed "Not set" for name, email and role | `Signin.tsx` calls `saveUser(session.user)` | `features/auth/Signin.tsx` |
| `ApiError` dropped the backend's `code` and `fields` | Forms could not show errors under the right field | `ApiError` now has `code` and `fields` | `shared/lib/api.ts` |
| No way to check the user's role in the new structure | Admin-only actions could not be hidden | Added `isAdmin()`. It falls back to the role in the access token for sessions started before this fix. | `shared/lib/auth.ts` |
| Pending invitations showed as **"Deactivated"** | The code relied on `invited_at`, which `GET /users` never returns | Uses `invitation_pending` instead | `features/team/types.ts` |
| Site managers saw a 403 error on Team → Managers | `/users` is admin-only | The Managers tab is shown only to company admins | `features/team/TeamPage.tsx` |
| The employee list showed only the first 25 people | The API's default page size | Requests up to 100; `listEmployees()` also accepts `search` and `limit` | `features/employees/api.ts`, `components/EmployeesTab.tsx` |
| Broken class name `text-muted-foreground-foreground-foreground` (from a bad find/replace) | Muted text and placeholders had no color | Fixed in 14 places | `components/ui/*.tsx` |
| Garbled characters (`â€”`, `â€¦`, `â”¬â•–`) | Showed as junk text, including on the map's worker markers | Restored `—`, `…` and `·` | `SitesPage.tsx`, `MapPage.tsx`, `LiveMap.tsx`, `ZonePanel.tsx` |
| The sidebar linked to Tasks, Devices, History and Reports, which have no pages | Clicking them showed a blank screen | Shown as disabled with a **Soon** label | `shared/components/AppShell.tsx` |
| Unknown URLs showed a blank page | — | A catch-all route redirects to `/` | `App.tsx` |

### Backend tooling
| Bug | Fix | File |
|---|---|---|
| The E2E web server ran `node prisma/seed.js && node src/server.js` without `--experimental-strip-types` | Fails on Node 22.6–23.5, which `engines` allows, because the Prisma client is TypeScript. Now runs `npm run db:seed && npm start`. | `Backend/tests/e2e/playwright.config.js` |

---

## 4. Known issues not fixed

- **The live map shows "Route not found".** It calls `GET /geofences` and `GET /locations/live`, and the backend has neither yet. That is a missing feature, not a merge problem.
- **The E2E journey test cannot pass.** `tests/e2e/journey.spec.js` was already out of date before these branches: it expects a `/welcome` page, uppercase labels (`EMAIL`) and "Signed in as …" text. It also cannot complete the sign-in code step, because the code is only sent by email. It needs a test-only way to read the code before it can be updated.
- **`oxlint` warnings** (no errors) remain. They are all in code that was there before, mostly `LiveMap.tsx`.

## 5. How it was checked

```bash
# Backend
cd Portofolio/Backend && npm test              # 5 suites, 155 tests, all passing

# Frontend
cd Portofolio/FrontEnd/Portfolio
npx tsc -b && npx vite build                   # no errors
```

In the browser, signed in as the seeded admin (`admin@albina.test`):
- the sidebar shows the user's name;
- the sites list shows 2 active sites;
- creating a site works;
- assigning an employee shows "moved from Al Malqa Tower";
- deactivating a site that still has employees is blocked with a clear message;
- the Managers tab lists users.
