# Portfolio Project - MVP Development and Execution (Stage 4)

## Introduction

Stage 4 is about turning the technical plan into a working product. In this stage we build the **Minimum Viable Product** in short iterations, track progress in Jira, review what each iteration delivered, and test that the parts work together before the MVP is presented.

The value of this stage is that it shows how the plan held up against real work. Stage 3 described how we intended to build and manage the system; this document records how we actually did it, what we changed along the way, and why. Where practice differed from the plan, we say so and explain the decision, because an honest record of deviations is more useful to the team than a document that only repeats the plan.

This document builds on our [Project Charter](./Stage2.md) and our [Technical Documentation](./Stage3.md).

> **Full Jira report:** [SITE14 Jira Project Report (PDF)](./stage4-evidence/jira/site14-jira-report.pdf) — every ticket by sprint with its description and status, the reason for each blocked or Won't Do ticket, all bugs, and all 83 QA test cases with their results.

> **Note:** All evidence referred to here — Jira exports, screenshots and test results — is stored in [`stage4-evidence/`](./stage4-evidence/), so it can be read without access to our Jira site. Our Jira site is private: if a Jira link asks you to sign in, the same information is in that folder.

## Table of Contents
- [0. Sprint Reviews](#0-sprint-reviews)
- [1. Retrospectives](#1-retrospectives)
- [2. Sprint Planning](#2-sprint-planning)
- [3. Source Repository](#3-source-repository)
- [4. Bug Tracking](#4-bug-tracking)
- [5. Testing Evidence and Results](#5-testing-evidence-and-results)
- [6. Production Environment](#6-production-environment)
- [7. Authors](#7-authors)
---

## 0. Sprint Reviews

**Links:** [Jira board](https://laila000k.atlassian.net/jira/software/projects/SITE/boards/34) · [Sprint summary](./stage4-evidence/jira/site14-jira-report.pdf) · [All tickets](./stage4-evidence/jira/site14-jira-report.pdf)

We held a review at the end of every sprint, with all four members present, either in person or on Discord. Each review followed the same four steps:

1. **Review what was built** against the sprint's tickets.
2. **Code review and unit tests** on the work delivered, before it was accepted.
3. **Decide what to build next and who owns it**, in dependency order.
4. **Decide what we will not build**, and record why.

The sprint dates and goals are in [Section 2.1](#21-sprint-timeline), and the completion figures in [Section 2.6](#26-velocity-and-completion).

### Sprint 1 · 20 – 27 Sep

* **Delivered:** the GitHub repository and the Jira project.
* **Next:** the remaining time went to the Stage 3 technical documentation, from 28 September to 10 October. Development started with the technical foundation in Sprint 2.

### Sprint 2 · 10 – 17 Oct

* **Delivered:** the initial database migration, the API error and validation format, the Tailwind theme from the SITE14 design tokens, demo seed data, the end-to-end test skeleton and deployment.
* **Next:** authentication and tenant isolation, because every later feature depends on knowing which company a request belongs to.

### Sprint 3 · 18 – 25 Oct

* **Delivered:** company registration, sign-in and sign-out, JWT access and refresh tokens, email verification, one-time-code sign-in, Site Manager invitations, password reset, tenant isolation and the landing page.
* **Next:** sites, employees and the live map, so that a company could set up its operations.

### Sprint 5 · 27 – 31 Oct

* **Delivered:** sites and running several sites at once, employee management and CSV import, the live map, worker markers coloured by status, drawing and saving work zones, zone entry and exit detection, and work sessions opened and closed from readings.
* **Next:** devices and telemetry, tasks, the daily record and reports, which complete the journey from a worker's reading to a client's report.

### Sprint 6 · 2 – 6 Nov, closed 21 Nov

* **Delivered:** device registration and assignment, bulk registration from a serial list, telemetry ingest that is idempotent and rate-limited, the device simulator, tasks on the backend and frontend, the tamper-evident activity log, the daily record, corrections that append rather than overwrite, movement history and path replay, and PDF reports with a verifiable reference.
* **Not building:** integration with a smartwatch. When we reached devices and IoT integration, no wearable met our requirements within the MVP, so the review decided to use the worker's phone as the tracking device instead ([Section 2.7](#27-adjustments-and-scope-changes)).
* **Next:** a final sprint to run UAT on every feature, finish the carried enhancements and get the MVP ready to present.

### Sprint 7 · 21 – 27 Nov · Final UAT, Enhancements & Presentation Ready

In progress. Its review on 27 November closes the MVP: every feature through final UAT, and the demo journey ready to present.

---

## 1. Retrospectives

At the end of each sprint we asked three questions: what went well, what challenges we faced, and what we will change in the next sprint.

> **TODO (team):** confirm each retrospective below reflects what was discussed.

### Sprint 1 · 20 – 27 Sep

* *Went well:* the repository and Jira project were ready before development started.
* *Challenge:* the sprint closed after one day; the rest of the time went to Stage 3 documentation.
* *Change:* plan the next sprint around the foundation work so development starts on solid ground.

### Sprint 2 · 10 – 17 Oct

* *Went well:* the schema, error format and theme were settled once, so later features followed one pattern.
* *Challenge:* three tickets were marked Done without an artifact in the repository — Docker Compose, the CI pipeline and the API contract — which we only discovered in the Stage 4 review.
* *Change:* a ticket moves to Done only with a link to the merged code or file that delivers it.

### Sprint 3 · 18 – 25 Oct

* *Went well:* authentication and tenant isolation were in place before any feature that depends on them.
* *Challenge:* 13 of 18 tickets carried over; most were built but not closed, so the board did not show real progress.
* *Change:* update ticket status at the stand-up, not at the end of the sprint.

### Sprint 5 · 27 – 31 Oct

* *Went well:* the map became usable end to end, from a device reading to a marker on the screen.
* *Challenge:* merging feature branches directly into each other broke the employee list, dropped the multi-site pages and failed 12 tests; fixing it cost time we had planned for features.
* *Change:* integrate through `develop` with a pull request and one review, and run the test suite before every merge.

### Sprint 6 · 2 – 6 Nov, closed 21 Nov

* *Went well:* the product now covers the full journey in our Charter, from a worker's reading to a verifiable report.
* *Challenge:* the sprint ran two weeks past its end date; the weekly and monthly report layout was lost in a merge (`SITE-194`); and the hardware decision came late in the build.
* *Change:* keep sprints to their end date and carry work forward explicitly; close Sprint 7 on 27 November whatever its state.

### Overall

| What worked | What we will change |
|---|---|
| One-week sprints kept the scope of each iteration small | Enter the sprint goal in Jira at planning |
| Splitting stories by layer gave every ticket one owner | Move a ticket to Done only with proof of delivery |
| Enforcing isolation, validation and append-only rules in code rather than by convention | Merge through pull requests with one review |
| Recording each scope change as a decision with its reason | Keep tester and builder different people on every QA story |

---

## 2. Sprint Planning

**Links:** [Jira board](https://laila000k.atlassian.net/jira/software/projects/SITE/boards/34) · [Backlog](https://laila000k.atlassian.net/jira/software/projects/SITE/boards/34/backlog) · [All tickets](./stage4-evidence/jira/site14-jira-report.pdf) · [Sprint summary](./stage4-evidence/jira/site14-jira-report.pdf)

We ran the MVP in **one-week sprints** on a Jira Scrum board (project `SITE`). Each sprint opened with planning on its first day and closed with a review on its last. The user stories written in Stage 3 were split by layer into frontend `[FE]`, backend `[BE]` and database `[DB]` tickets, so that each ticket had a single owner and could be estimated on its own.

Our process for each sprint:

1. **Planning:** Pull the next stories from the ranked backlog in dependency order, assign an owner to each, and agree the sprint goal.
2. **Development:** Each owner works on a feature branch for their area.
3. **Integration:** Branches are merged and the result is checked against the automated tests.
4. **QA:** Completed tickets move to `In QA` and are tested against their acceptance criteria.
5. **Review:** The sprint closes with a review of what was delivered and what carries over.

### 2.1 Sprint Timeline

Stage 3 planned six one-week iterations from 11 October to 21 November. In practice the first sprint started earlier for repository setup, and a final sprint was added for UAT, enhancements and presentation readiness.

| Sprint | Dates | Goal | Main epics |
|---|---|---|---|
| Sprint 1 | 20 – 27 Sep 2026 | Set up the repository and the team workflow | Setup |
| — | 28 Sep – 9 Oct | Stage 3 technical documentation | — |
| Sprint 2 | 10 – 17 Oct | Lay the technical foundation: schema, API conventions, theme, seed data, deployment | Technical Foundation |
| Sprint 3 | 18 – 25 Oct | Let a company register, sign in and invite managers, with each company's data isolated | Company Account & Authentication, Landing Page |
| Sprint 5 | 27 – 31 Oct | Run several sites, manage employees and see them on a live map with work zones | Multiple Sites, Employee & Device Management, Live Map & Geofencing |
| Sprint 6 | 2 – 6 Nov, closed 21 Nov | Receive device readings, assign tasks, keep a tamper-evident record, and issue verifiable PDF reports | IoT Data Integration, Task & Workload Assignment, History & Records, Reports & Exports |
| Sprint 7 | 21 – 27 Nov | Final UAT, enhancements and presentation readiness: run final UAT on every feature, finish the reports and alert rules carried from earlier sprints, complete the landing page, and make the full demo journey work end to end | QA, Reports & Exports, Automated Alerts, Landing Page |

> Sprint numbering in Jira skips 4: Sprint 5 followed Sprint 3 directly. Sprint goals were agreed in planning but not entered in Jira's goal field until Sprint 7; this is addressed in the retrospective.

> **TODO (Laila):** confirm what the team did between 28 Sep and 9 Oct.

### 2.2 Prioritization (MoSCoW)

Priorities follow the MoSCoW ranking from [Stage 3, Section 0.2](./Stage3.md#02-prioritized-user-stories), updated with the scope decisions taken during development ([Section 2.7](#27-adjustments-and-scope-changes)).

| Priority | Scope |
|---|---|
| **Must have** | Company registration and secure sign-in with JWT access and refresh tokens · tenant isolation · sites · employees and CSV import · devices and phone pairing · location ingest · work sessions · live map · work zones and zone-exit alerts · tamper-evident record · daily PDF report with a verifiable reference |
| **Should have** | Site Manager invitations · email verification · tasks · alert review and acknowledgement · weekly and monthly reports · movement history · offline-device detection |
| **Could have** | One-time-code sign-in · marker colours by status · battery level · path replay · employee search and filters · first-setup guide |
| **Won't have (this MVP)** | Health and heart-rate monitoring · smartwatch hardware and the Traccar bridge · per-category threshold editing · Docker Compose · CI pipeline · OpenAPI contract file |

### 2.3 Dependencies

Work was ordered so that each layer was ready before the one that needed it:

1. **Technical Foundation** — database migration, error format, tenant isolation
2. **Authentication** — registration, sign-in, tokens
3. **Sites** — every employee, device and zone belongs to a site
4. **Employees and Devices** — a reading needs a device assigned to an employee
5. **Ingest** — device readings validated and timestamped
6. **Work sessions** — opened and closed from readings
7. **Live map and Zones** — built on current state and sessions
8. **Alerts and Records** — built on sessions and zones
9. **Reports** — built on records

Tasks depended only on Sites and Employees, so they ran in parallel with steps 5 to 8.

### 2.4 Roles and Responsibilities

| Member | Role | Areas owned |
|---|---|---|
| Laila Khalid | Project Manager, Frontend Lead | Sprint planning and Jira, theme, live map UI, landing page, manager accounts and invitations, reports, tenant isolation |
| Abdullah Alzara | Source Control Manager, Backend | Repository and deployment, registration and sign-in, device ingest and simulator, devices, sites, work sessions, phone pairing, marketplace, platform admin, notifications |
| Saad Alatar | Backend | Tokens, email verification, one-time code, zones and zone detection, live map API, alerts, tasks |
| Faisal Alshahrani | Database, QA | Migration and seed data, data isolation, employees and CSV import, append-only record, daily record, history, end-to-end test |

Each area had a lead; the other members worked alongside as full-stack developers.

> **TODO (Laila):** confirm the SCM and QA owners.

### 2.5 Stand-ups and Tracking

> **TODO (Laila):** describe how and how often the team met for stand-ups, and where (for example, a daily call on Discord).

Every ticket moved through the Jira workflow defined in Stage 3: `To Do` → `In Dev` → `Code Review` → `In QA` → `UAT` → `Done`, plus `Blocked`. During the Stage 4 review we added a `Won't Do` status, so that a ticket we decided not to build is closed with its reason rather than left open or marked Done.

![Jira board](./stage4-evidence/screenshots/board.png)

### 2.6 Velocity and Completion

A ticket counts towards the sprint in which it reached `Done`. Tickets still open at the end of a sprint carried over to the next.

| Sprint | Tickets in sprint | Completed | Closed as Won't Do | Carried over | Completion |
|---|---|---|---|---|---|
| Sprint 1 | 1 | 1 | 0 | 0 | 100% |
| Sprint 2 | 9 | 1 | 3 | 5 | 11% |
| Sprint 3 | 18 | 5 | 0 | 13 | 28% |
| Sprint 5 | 28 | 3 | 0 | 25 | 11% |
| Sprint 6 | 58 | 47 | 0 | 11 | 81% |
| Sprint 7 | 30 | in progress | — | — | — |

Source: [Sprint summary](./stage4-evidence/jira/site14-jira-report.pdf), exported from Jira on 21 Nov 2026.

**Reading the numbers.** The low completion in Sprints 2 to 5 does not mean little was built: most of those tickets were built in their sprint but were not moved to `Done`, so they carried forward until the status review on 21 November. 31 tickets passed through more than one sprint, and 12 of them through three. The spike in Sprint 6 is that backlog being closed, not one week's work. We treat this as a tracking failure and address it in the [retrospective](#1-retrospectives).

### 2.7 Adjustments and Scope Changes

The plan changed during development. Each change below is recorded as a decision with its reason, and traced to its Jira tickets.

| Change | Reason | Effect in Jira |
|---|---|---|
| Repositioned from a safety platform to an operations tracking platform | The value we offer is a record of field operations; safety is a supporting benefit | Midday-ban and working-hour alerts `SITE-35`, `SITE-37` and their evaluator `SITE-92` moved to Sprint 7 |
| Removed health and heart-rate monitoring | Out of scope for operations tracking, as stated in the Project Charter | Leftovers in the code are tracked as `SITE-196` |
| Replaced smartwatch hardware with the worker's phone | No wearable met our three requirements within the MVP time and budget: run our own software permanently, report live location to our server, and carry sensors we can extend later | Traccar bridge `SITE-89` closed as Won't Do; phone pairing `SITE-197` and the App Store app `SITE-198` added |
| Removed in-device worker consent and communication | Not feasible in the MVP | Consent is recorded by the manager; workers without it show as *No consent*, not as absent |
| Replaced data analytics with PDF reports | A referenced, hashed report gives the client evidence it can verify | Reports & Exports epic |
| Did not build Docker Compose, the CI pipeline, the OpenAPI file or the threshold editor | Not needed for the product to work; deprioritized against feature delivery | `SITE-74`, `SITE-76`, `SITE-71`, `SITE-41` closed as Won't Do |

**Status review on 21 November.** Before closing Sprint 6 we checked every ticket against the code:

* 6 tickets marked `To Do` were already built and moved to `In QA`, each with the file that proves it.
* 3 tickets marked `Done` had no artifact in the repository (`SITE-71`, `SITE-74`, `SITE-76`); they were reopened and closed as `Won't Do` with the reason.
* 5 tickets were created for work that had been built without one: phone pairing, the App Store app, the marketplace, the platform admin console and notifications.
* 47 tickets in `UAT` were accepted and moved to `Done`, and Sprint 6 was closed.

---

## 3. Source Repository

**Links:** [github.com/JSAbdullaH/Portfolio-Project](https://github.com/JSAbdullaH/Portfolio-Project) · [Pull request #6](https://github.com/JSAbdullaH/Portfolio-Project/pull/6) · [Merge fixes](../Portofolio/Bug-fix.md)

### 3.1 The Stack as Built

The backend was built as designed in Stage 3. On the frontend, the infrastructure and the IoT path, we changed course during development:

| Area | Planned in Stage 3 | Built | Why we changed |
|---|---|---|---|
| Frontend | Next.js with TypeScript | **Vite + React 19 + TypeScript**, Tailwind CSS v4, shadcn components | The dashboard is a client-side application behind sign-in; server rendering added setup without benefit. Vite gave faster builds for four developers. |
| Backend | Express.js | Express 5 with Prisma ORM and zod validation | As planned |
| Database | PostgreSQL | PostgreSQL with Prisma migrations, append-only triggers and a revoked `UPDATE`/`DELETE` role | As planned |
| Infrastructure | Docker and Docker Compose | **Railway**, building from `package.json` | Railway runs the backend without a Dockerfile, and the team shares one cloud database, so Compose was not needed ([Section 2.7](#27-adjustments-and-scope-changes)). |
| IoT middleware | Traccar | **Phone pairing**: the worker's phone becomes the tracking device | No wearable met our requirements within the MVP ([Section 2.7](#27-adjustments-and-scope-changes)). |

### 3.2 Coding Standards

Each developer worked on the tickets assigned to them in the sprint ([Section 2.4](#24-roles-and-responsibilities)). Coding standards were enforced in the code rather than by convention alone:

* **Tenant isolation in one place.** Every query runs through a company-scoped Prisma client, so a request from one company cannot read another company's data (`SITE-79`).
* **Validation at the edge.** Every request body, query and path parameter is checked by a zod schema before it reaches a controller (`SITE-70`).
* **One error format.** Every failed response has the shape `{ error: { code, message, fields? } }`, so the frontend handles errors the same way everywhere.
* **Append-only records.** The database refuses updates and deletes on telemetry, corrections, reports and alerts, so the record cannot be rewritten (`SITE-93`).

### 3.3 Source Control Management

* **Repository:** one mono-repository on GitHub with `Portofolio/Backend` and `Portofolio/FrontEnd`.
* **Branches:** the GitFlow branches from Stage 3 were created — `main`, `develop`, `feature`, `bugfix`, `hotfix` — and each member developed on a feature branch for their area: `Company-account-and-auth`, `Laila-Frontend-Structure`, `Faisal-employee`, `Abdullah-multiple-site`, `Saad-map`, `Saad-tasks`.
* **Activity:** 113 commits from all four members.

| Member | Commits (excluding merges) |
|---|---|
| Laila Khalid | 36 |
| Abdullah Alzara | 36 |
| Faisal Alshahrani | 16 |
| Saad Alatar | 14 |

**Where practice differed from the plan.** Stage 3 planned protected branches, a pull request for every merge and one approving review. In practice, of 11 merges, one went through a pull request ([#6](https://github.com/JSAbdullaH/Portfolio-Project/pull/6)); the others were merged directly between feature branches. 39 of 102 commit messages follow the Conventional Commits types, and 16 carry a Jira key. The cost showed in Sprint 5: merging the employee and multi-site branches broke the employee list and dropped the multi-site pages, and 12 backend tests failed until the conflicts were resolved. The fixes are recorded in [`Bug-fix.md`](../Portofolio/Bug-fix.md). We return to this in the [retrospective](#1-retrospectives).

> **TODO (Abdullah):** add a link to the final pull request into `main` once it is opened.

### 3.4 QA During Development

* **Automated tests** were written with the features: Jest and Supertest suites for the API and the database rules, and a Playwright journey through the critical path ([Section 5.1](#51-automated-tests)).
* **Manual API checks** used Apidog in place of Postman.
* **Acceptance testing** was planned as one QA story per feature with one test case per acceptance criterion ([Section 5.2](#52-manual-qa-plan)).

---

## 4. Bug Tracking

**Links:** [Bug Fixes epic SITE-97](https://laila000k.atlassian.net/browse/SITE-97) · [All bugs in Jira](https://laila000k.atlassian.net/issues/?jql=project%20%3D%20SITE%20AND%20issuetype%20%3D%20Bug%20ORDER%20BY%20priority%20DESC) · [Merge fixes](../Portofolio/Bug-fix.md) · [All tickets](./stage4-evidence/jira/site14-jira-report.pdf)

Defects are logged as Jira `Bug` issues under the Bug Fixes epic, with steps to reproduce, the expected and actual result, the environment, and the test case that found them. Priorities follow the scale in [Stage 3, Section 5.2.4](./Stage3.md#524-defect-management).

| Source | Count | Status |
|---|---|---|
| Merge defects fixed after integrating the feature branches | 12 failing tests, plus the code defects behind them | All fixed — [`Bug-fix.md`](../Portofolio/Bug-fix.md) |
| Bugs logged in Jira | 6 | 5 in development, 1 in QA — all in Sprint 7 |

| Key | Bug | Priority |
|---|---|---|
| `SITE-98` | CSV import creates duplicate people when a row has no worker number | Highest |
| `SITE-193` | Report prints the uncorrected hours and never says a record was corrected | Highest |
| `SITE-194` | Monthly report uses the daily layout and counts open sessions up to now | Highest |
| `SITE-99` | Work sessions carry no zone, so hours cannot be attributed per zone | High |
| `SITE-195` | PDF generation can fail when the cached Chrome process has closed | Medium |
| `SITE-196` | Heart-rate alerts still appear although health monitoring is out of scope | Medium |

---

## 5. Testing Evidence and Results

**Links:** [QA epic SITE-100](https://laila000k.atlassian.net/browse/SITE-100) · [Test cases](./stage4-evidence/jira/site14-jira-report.pdf) · [Automated tests](https://github.com/JSAbdullaH/Portfolio-Project/tree/main/Portofolio/Backend/tests)

### 5.1 Automated Tests

| Suite | Type | What it covers |
|---|---|---|
| `geo.test.js` | Unit | Point-in-polygon and zone geometry, without a database |
| `auth`, `users`, `sites`, `employees`, `devices`, `geofences`, `tasks`, `records`, `pairing`, `marketplace`, `presence`, `ingest`, `simulator` | API integration | Each endpoint through Express and Supertest against a real PostgreSQL test database: status codes, response shapes, and the rule that a request from one company for another company's data returns 404 |
| `database.test.js` | Database integration | Triggers and constraints: append-only tables, revoked updates and deletes, consent |
| `e2e/journey.spec.js` | End to end | The critical journey through the browser with Playwright |

288 tests across 15 Jest files, plus the Playwright journey. The suite refuses to run against any database whose name does not contain `test`, because its setup rebuilds the target database; this protects the shared team database.

**Results.** After the Sprint 5 merge fixes, the backend suite passed in full at the time (155 of 155).

> **TODO (team):** run `npm test` against a local test database and add the output as `stage4-evidence/screenshots/jest-results.png`.

![Jest results](./stage4-evidence/screenshots/jest-results.png)

### 5.2 Manual QA Plan

The QA epic `SITE-100` holds one QA story per feature and one test case per acceptance criterion, written as steps with an expected result. The builder of a feature does not test it.

| QA story | Feature | Test cases |
|---|---|---|
| `SITE-101` | Authentication and session | 12 |
| `SITE-102` | Employees and CSV import | 14 |
| `SITE-103` | Daily record and corrections | 9 |
| `SITE-104` | Reports and verifiable reference | 12 |
| `SITE-152` | Sites and zones | 8 |
| `SITE-161` | Tasks | 8 |
| `SITE-170` | Devices and pairing | 8 |
| `SITE-179` | Live map | 6 |
| `SITE-186` | Landing page and registration | 6 |
| | **Total** | **83** |

Full list: [QA test cases](./stage4-evidence/jira/site14-jira-report.pdf).

**Status on 21 November:** 7 test cases passed, 3 blocked, 73 to run in Sprint 7. The Reports run (`SITE-104`) found four of the six open bugs in [Section 4](#4-bug-tracking), which is the purpose of the plan.

### 5.3 Integration Checks

* **Frontend and backend.** The frontend calls the API under `/api/v1`; in development Vite forwards these calls to the backend, and in production the frontend uses the deployed API address. Expired access tokens are renewed through the refresh cookie and the original request is retried.
* **Database.** Tenant isolation, append-only rules and consent are enforced by the database as well as the API, and verified by `database.test.js`.
* **Devices.** The simulator and the paired phone post readings to the same ingest endpoint, which is how a wearable will connect later without backend changes.

### 5.4 Test Case Evidence

> **TODO (Laila):** run five or six test cases on the deployed site, save a screenshot of each in `stage4-evidence/screenshots/`, and list them here.

| Test case | Result | Evidence |
|---|---|---|
| TC: Sign in with a valid email and password | | ![](./stage4-evidence/screenshots/tc-signin.png) |
| TC: Import employees from a CSV file | | ![](./stage4-evidence/screenshots/tc-csv-import.png) |
| TC: Generate a daily PDF report | | ![](./stage4-evidence/screenshots/tc-report.png) |

---

## 6. Production Environment

**Links:** TODO: live site URL · TODO: API URL

| Part | Where it runs |
|---|---|
| Backend API | Railway, built from `package.json` with a health check on `/health` and a restart on failure ([`railway.json`](../Portofolio/Backend/railway.json)) |
| Frontend dashboard | TODO: where the frontend is hosted |
| Database | Cloud PostgreSQL, shared by the team; secrets are kept in environment variables and never committed |
| Worker tracking app | Submitted to the Apple App Store and awaiting review (`SITE-198`) |

> **TODO (Abdullah):** add the live URLs and confirm which branch Railway deploys from.

---

## 7. Authors

* **Laila Khalid** — [GitHub](https://github.com/laila-khalid)
* **Abdullah Alzara** — [GitHub](https://github.com/JSAbdullaH)
* **Faisal Alshahrani** — [GitHub](https://github.com/call-me-prof)
* **Saad Alatar** — [GitHub](https://github.com/SaadTAr)
