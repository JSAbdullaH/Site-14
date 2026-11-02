// Every database test, in four groups:
//   1. schema rules    the rules from Stage3 section 2.2, checked with plain SQL.
//                      Each test names the SQLSTATE the database answers with:
//                      23503 foreign key  23505 unique  23514 check
//                      RC002 no consent   AO001 append-only (raised by our triggers)
//   2. Prisma models   one row through each model, so schema.prisma and the SQL agree
//   3. seed            SITE-75 demo data; running it again resets cleanly
//   4. rollback        SITE-69 down.sql leaves an empty database
const fs = require('node:fs');
const path = require('node:path');
const globalSetup = require('./setup');
const {
  pool, SCHEMA_TABLES, SCHEMA_COLUMNS, listTables, truncateAll, makeCompany, openSession, sqlState, square,
} = require('./setup');
const { prisma, Prisma, forCompany } = require('../src/config/db');
const { seed, assertSafeTarget } = require('../prisma/seed');

const DOWN_SQL = path.join(__dirname, '..', 'prisma', 'migrations', '20261015000000_init', 'down.sql');

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

// ================================================================ 1. schema rules

describe('schema rules', () => {
  beforeEach(truncateAll);

  describe('structure', () => {
    test('has every table schema.prisma declares, and the daily_work_records view', async () => {
      expect(SCHEMA_TABLES.length).toBeGreaterThan(0);
      expect(await listTables()).toEqual([...SCHEMA_TABLES].sort());
      const view = await pool.query("SELECT 1 FROM information_schema.views WHERE table_name = 'daily_work_records'");
      expect(view.rowCount).toBe(1);
    });

    test('every table has exactly the columns schema.prisma declares (migration and schema agree)', async () => {
      const { rows } = await pool.query(`
        SELECT c.table_name, array_agg(c.column_name::text ORDER BY c.column_name) AS columns
        FROM information_schema.columns c
        JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = 'public'
        WHERE c.table_schema = 'public' AND c.table_name <> '_prisma_migrations'
        GROUP BY c.table_name`);
      const inDatabase = Object.fromEntries(rows.map((r) => [r.table_name, r.columns.sort()]));
      expect(inDatabase).toEqual(SCHEMA_COLUMNS);
    });

    test('alert_type includes the heart rate alerts', async () => {
      const { rows } = await pool.query('SELECT unnest(enum_range(NULL::alert_type))::text AS v');
      expect(rows.map((r) => r.v)).toEqual(['zone_exit', 'hour_limit', 'midday_ban', 'heart_rate_high', 'heart_rate_low']);
    });
  });

  describe('tenant isolation (composite foreign keys)', () => {
    test('an employee cannot be placed on a site of another company', async () => {
      const a = await makeCompany('A');
      const b = await makeCompany('B');
      const code = await sqlState(
        "INSERT INTO employees (company_id, site_id, full_name, job_category) VALUES ($1, $2, 'X', 'construction')",
        [b.companyId, a.siteId],
      );
      expect(code).toBe('23503');
    });

    test('a session cannot use a device of another company', async () => {
      const a = await makeCompany('A');
      const b = await makeCompany('B');
      const code = await sqlState(
        'INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at) VALUES ($1, $2, $3, $4, now())',
        [a.companyId, a.employeeId, a.siteId, b.deviceId],
      );
      expect(code).toBe('23503');
    });

    test('a task cannot go to an employee of another company', async () => {
      const a = await makeCompany('A');
      const b = await makeCompany('B');
      const code = await sqlState(
        "INSERT INTO tasks (company_id, site_id, employee_id, created_by, title) VALUES ($1, $2, $3, $4, 'T')",
        [a.companyId, a.siteId, b.employeeId, a.userId],
      );
      expect(code).toBe('23503');
    });
  });

  describe('privacy and sessions', () => {
    test('no session opens for a worker without consent (RC002)', async () => {
      const c = await makeCompany('A', { consent: false });
      await expect(openSession(c)).rejects.toMatchObject({ code: 'RC002' });
    });

    test('a worker has at most one open session', async () => {
      const c = await makeCompany('A');
      await openSession(c);
      await expect(openSession(c)).rejects.toMatchObject({ code: '23505' });
    });

    test('a session cannot end before it starts', async () => {
      const c = await makeCompany('A');
      const id = await openSession(c);
      const code = await sqlState(
        "UPDATE work_sessions SET ended_at = started_at - interval '1 minute' WHERE id = $1",
        [id],
      );
      expect(code).toBe('23514');
    });
  });

  describe('telemetry_logs (append-only)', () => {
    const insert = (sessionId, at, bpm = 90) =>
      pool.query(
        'INSERT INTO telemetry_logs (session_id, latitude, longitude, heart_rate_bpm, recorded_at) VALUES ($1, 24.7, 46.6, $2, $3)',
        [sessionId, bpm, at],
      );

    test('the same reading sent twice is stored once', async () => {
      const id = await openSession(await makeCompany('A'));
      const at = new Date();
      await insert(id, at);
      await expect(insert(id, at)).rejects.toMatchObject({ code: '23505' });
    });

    test('UPDATE and DELETE are refused (AO001)', async () => {
      const id = await openSession(await makeCompany('A'));
      await insert(id, new Date());
      expect(await sqlState('UPDATE telemetry_logs SET latitude = 0')).toBe('AO001');
      expect(await sqlState('DELETE FROM telemetry_logs')).toBe('AO001');
    });

    test('heart rate outside 20..250 is refused', async () => {
      const id = await openSession(await makeCompany('A'));
      await expect(insert(id, new Date(), 300)).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('alerts', () => {
    const insertAlert = (sessionId, type, extra = {}) =>
      pool.query(
        `INSERT INTO alerts (session_id, alert_type, geofence_id, latitude, longitude, limit_bpm, observed_bpm, triggered_at)
         VALUES ($1, $2, $3, 24.7, 46.6, $4, $5, now()) RETURNING id`,
        [sessionId, type, extra.geofenceId ?? null, extra.limitBpm ?? null, extra.observedBpm ?? null],
      );
    const heart = { limitBpm: 150, observedBpm: 160 };

    test('only one open alert of a type per session; a new one after it is resolved', async () => {
      const id = await openSession(await makeCompany('A'));
      const first = (await insertAlert(id, 'heart_rate_high', heart)).rows[0].id;
      await expect(insertAlert(id, 'heart_rate_high', heart)).rejects.toMatchObject({ code: '23505' });
      await pool.query('UPDATE alerts SET resolved_at = now() WHERE id = $1', [first]);
      await expect(insertAlert(id, 'heart_rate_high', heart)).resolves.toBeTruthy();
    });

    test('each type carries its own fields', async () => {
      const id = await openSession(await makeCompany('A'));
      await expect(insertAlert(id, 'midday_ban')).rejects.toMatchObject({ code: '23514' });
      await expect(insertAlert(id, 'heart_rate_low')).rejects.toMatchObject({ code: '23514' });
    });

    test('handling columns can be filled once; findings and deletes are refused', async () => {
      const c = await makeCompany('A');
      const id = await openSession(c);
      const alertId = (await insertAlert(id, 'heart_rate_high', heart)).rows[0].id;

      expect(await sqlState('UPDATE alerts SET observed_bpm = 120 WHERE id = $1', [alertId])).toBe('AO001');
      expect(
        await sqlState('UPDATE alerts SET acknowledged_by = $2, acknowledged_at = now() WHERE id = $1', [alertId, c.userId]),
      ).toBeNull();
      expect(await sqlState('UPDATE alerts SET acknowledged_at = now() WHERE id = $1', [alertId])).toBe('AO001');
      expect(await sqlState('DELETE FROM alerts WHERE id = $1', [alertId])).toBe('AO001');
    });
  });

  describe('other rules', () => {
    test('emails are stored lower-case', async () => {
      const c = await makeCompany('A');
      const code = await sqlState(
        "INSERT INTO users (company_id, full_name, email, role) VALUES ($1, 'X', 'Upper@Example.test', 'site_manager')",
        [c.companyId],
      );
      expect(code).toBe('23514');
    });

    test('a company with history cannot be deleted (RESTRICT)', async () => {
      const c = await makeCompany('A');
      const code = await sqlState('DELETE FROM companies WHERE id = $1', [c.companyId]);
      // PostgreSQL 17 and older answer 23503, PostgreSQL 18 answers 23001.
      expect(['23503', '23001']).toContain(code);
    });

    test('reports keep a valid fingerprint and cannot be changed', async () => {
      const c = await makeCompany('A');
      const insert = (sha) =>
        pool.query(
          `INSERT INTO reports (company_id, site_id, created_by, reference_number, report_type, period_start, period_end, file_path, file_size_bytes, sha256)
           VALUES ($1, $2, $3, $4, 'daily', current_date, current_date, '/r.pdf', 1024, $5)`,
          [c.companyId, c.siteId, c.userId, `R-${sha.slice(0, 6)}`, sha],
        );
      await expect(insert('not-a-hash'.padEnd(64, 'z'))).rejects.toMatchObject({ code: '23514' });
      await insert('a'.repeat(64));
      expect(await sqlState("UPDATE reports SET file_path = '/other.pdf'")).toBe('AO001');
    });

    test('record corrections are append-only and need a reason', async () => {
      const c = await makeCompany('A');
      const insert = (reason) =>
        pool.query(
          `INSERT INTO record_corrections (company_id, employee_id, site_id, work_date, field, original_value, corrected_value, reason, corrected_by)
           VALUES ($1, $2, $3, current_date, 'worked_minutes', '420', '480', $4, $5)`,
          [c.companyId, c.employeeId, c.siteId, reason, c.userId],
        );
      await expect(insert('   ')).rejects.toMatchObject({ code: '23514' });
      await insert('Device battery died for one hour');
      expect(await sqlState("UPDATE record_corrections SET corrected_value = '500'")).toBe('AO001');
    });
  });

  describe('daily_work_records view', () => {
    test('sums closed sessions of the same Saudi day', async () => {
      const c = await makeCompany('A');
      // 08:00 to 10:00 and 11:00 to 12:30 Riyadh time (UTC+3) on 2026-10-14
      for (const [start, end] of [['05:00', '07:00'], ['08:00', '09:30']]) {
        await pool.query(
          `INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.companyId, c.employeeId, c.siteId, c.deviceId, `2026-10-14T${start}:00Z`, `2026-10-14T${end}:00Z`],
        );
      }
      const { rows } = await pool.query(
        'SELECT work_date::text, session_count, worked_minutes, is_open FROM daily_work_records WHERE employee_id = $1',
        [c.employeeId],
      );
      expect(rows).toEqual([{ work_date: '2026-10-14', session_count: 2, worked_minutes: 210, is_open: false }]);
    });
  });
});

// ================================================================ 2. Prisma models

describe('Prisma models', () => {
  beforeAll(truncateAll);

  test('every model round-trips through Prisma', async () => {
    const company = await prisma.company.create({ data: { name: 'Prisma Co', heartRateMaxBpm: 150 } });
    await prisma.jobCategoryRule.create({ data: { companyId: company.id, jobCategory: 'construction' } });
    const user = await prisma.user.create({
      data: { companyId: company.id, fullName: 'Admin', email: 'admin@prisma.test', role: 'company_admin' },
    });
    await prisma.authToken.create({
      data: { userId: user.id, tokenType: 'password_reset', tokenHash: 'h1', expiresAt: new Date(Date.now() + 3600e3) },
    });
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: 'h2', expiresAt: new Date(Date.now() + 3600e3) },
    });
    const site = await prisma.site.create({
      data: {
        companyId: company.id, name: 'Site', boundary: square(46.6, 24.7),
        shiftStart: new Date('1970-01-01T07:00:00Z'), shiftEnd: new Date('1970-01-01T17:00:00Z'),
      },
    });
    const zone = await prisma.geofence.create({
      data: { siteId: site.id, name: 'Roof', boundary: square(46.6, 24.7, 0.0005), isOutdoor: true },
    });
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id, siteId: site.id, fullName: 'Ahmed', jobCategory: 'construction',
        consentGivenAt: new Date(),
      },
    });
    const device = await prisma.device.create({
      data: { companyId: company.id, employeeId: employee.id, serialNumber: 'GPS-1', apiKeyHash: 'k' },
    });
    const session = await prisma.workSession.create({
      data: { companyId: company.id, employeeId: employee.id, siteId: site.id, deviceId: device.id, startedAt: new Date() },
    });
    expect(typeof session.id).toBe('bigint');

    await prisma.telemetryLog.create({
      data: { sessionId: session.id, latitude: 24.7, longitude: 46.6, heartRateBpm: 95, recordedAt: new Date() },
    });
    const alert = await prisma.alert.create({
      data: {
        sessionId: session.id, alertType: 'midday_ban', geofenceId: zone.id,
        latitude: 24.7, longitude: 46.6, triggeredAt: new Date(),
      },
    });
    await prisma.alert.update({
      where: { id: alert.id },
      data: { acknowledgedBy: user.id, acknowledgedAt: new Date() },
    });
    await prisma.employeeCurrentState.create({
      data: {
        employeeId: employee.id, sessionId: session.id, geofenceId: zone.id,
        latitude: 24.7, longitude: 46.6, heartRateBpm: 95, recordedAt: new Date(),
      },
    });
    const task = await prisma.task.create({
      data: { companyId: company.id, siteId: site.id, employeeId: employee.id, createdBy: user.id, title: 'Pour concrete' },
    });
    expect(task.status).toBe('todo');
    await prisma.recordCorrection.create({
      data: {
        companyId: company.id, employeeId: employee.id, siteId: site.id, workDate: new Date('2026-10-14'),
        field: 'worked_minutes', originalValue: '420', correctedValue: '480', reason: 'Device off', correctedBy: user.id,
      },
    });
    await prisma.report.create({
      data: {
        companyId: company.id, siteId: site.id, createdBy: user.id, referenceNumber: 'SITE14-2026-0001',
        reportType: 'daily', periodStart: new Date('2026-10-14'), periodEnd: new Date('2026-10-14'),
        filePath: '/reports/1.pdf', fileSizeBytes: 2048, sha256: 'b'.repeat(64),
      },
    });

    // Read back through relations: the live-map query shape.
    const live = await prisma.employeeCurrentState.findMany({
      where: { employee: { companyId: company.id } },
      include: { employee: { select: { fullName: true } }, geofence: { select: { name: true, isOutdoor: true } } },
    });
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ heartRateBpm: 95, employee: { fullName: 'Ahmed' }, geofence: { name: 'Roof', isOutdoor: true } });

    const counts = await Promise.all([
      prisma.company.count(), prisma.jobCategoryRule.count(), prisma.user.count(), prisma.authToken.count(),
      prisma.refreshToken.count(), prisma.site.count(), prisma.employee.count(), prisma.device.count(),
      prisma.geofence.count(), prisma.workSession.count(), prisma.telemetryLog.count(), prisma.alert.count(),
      prisma.employeeCurrentState.count(), prisma.task.count(), prisma.recordCorrection.count(), prisma.report.count(),
    ]);
    expect(counts).toEqual(Array(counts.length).fill(1));
  });

  test('Prisma reports the database error codes the services rely on', async () => {
    const company = await prisma.company.findFirstOrThrow();
    // Duplicate email: Prisma P2002 (unique), which auth.service treats as "already registered".
    await expect(
      prisma.user.create({ data: { companyId: company.id, fullName: 'X', email: 'admin@prisma.test', role: 'site_manager' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

// ================================================================ 3. seed (SITE-75)

describe('seed', () => {
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
});

describe('tenant scope', () => {
  let a;
  let b;
  let dbA;
  beforeAll(async () => {
    await truncateAll();
    a = await makeCompany('A');
    b = await makeCompany('B');
    for (const c of [a, b]) {
      c.sessionId = await openSession(c);
      await pool.query('INSERT INTO telemetry_logs (session_id, latitude, longitude, recorded_at) VALUES ($1, 24.7, 46.6, now())', [c.sessionId]);
      await pool.query("INSERT INTO alerts (session_id, alert_type, latitude, longitude, triggered_at) VALUES ($1, 'zone_exit', 24.7, 46.6, now())", [c.sessionId]);
      await pool.query('INSERT INTO employee_current_state (employee_id, session_id, latitude, longitude, recorded_at) VALUES ($1, $2, 24.7, 46.6, now())', [c.employeeId, c.sessionId]);
      await pool.query("INSERT INTO tasks (company_id, site_id, employee_id, created_by, title) VALUES ($1, $2, $3, $4, 'T')", [c.companyId, c.siteId, c.employeeId, c.userId]);
      await pool.query("INSERT INTO record_corrections (company_id, employee_id, site_id, work_date, field, original_value, corrected_value, reason, corrected_by) VALUES ($1, $2, $3, '2026-10-20', 'worked_minutes', '1', '2', 'r', $4)", [c.companyId, c.employeeId, c.siteId, c.userId]);
      await pool.query("INSERT INTO reports (company_id, site_id, created_by, reference_number, report_type, period_start, period_end, file_path, file_size_bytes, sha256) VALUES ($1, $2, $3, $4, 'daily', '2026-10-20', '2026-10-20', '/r.pdf', 1, $5)", [c.companyId, c.siteId, c.userId, `R-${c.companyId}`, 'a'.repeat(64)]);
      await pool.query("INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at) VALUES ($1, 'password_reset', $2, now() + interval '1 hour')", [c.userId, `h-${c.userId}`]);
      await pool.query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [c.userId, `r-${c.userId}`]);
    }
    dbA = forCompany(a.companyId);
  });

  const lower = (m) => m[0].toLowerCase() + m.slice(1);
  const MODELS = Object.values(Prisma.ModelName);

  test('every table in the schema has a company scope', () => {
    expect(MODELS.length).toBe(SCHEMA_TABLES.length);
  });

  test.each(MODELS)('%s: lists and counts only the own company rows', async (model) => {
    const all = await prisma[lower(model)].count();
    expect(all).toBe(2);
    expect(await dbA[lower(model)].count()).toBe(1);
    expect(await dbA[lower(model)].findMany()).toHaveLength(1);
  });

  test("another company's row is not found by id, and cannot be changed or deleted", async () => {
    expect(await dbA.site.findUnique({ where: { id: b.siteId } })).toBeNull();
    expect(await dbA.employee.findFirst({ where: { id: b.employeeId } })).toBeNull();
    await expect(dbA.site.update({ where: { id: b.siteId }, data: { name: 'x' } })).rejects.toMatchObject({ code: 'P2025' });
    await expect(dbA.geofence.update({ where: { id: b.geofenceId }, data: { name: 'x' } })).rejects.toMatchObject({ code: 'P2025' });
    expect((await dbA.site.updateMany({ data: { name: 'renamed' } })).count).toBe(1);
    const name = async (id) => (await pool.query('SELECT name FROM sites WHERE id = $1', [id])).rows[0].name;
    expect(await name(a.siteId)).toBe('renamed');
    expect(await name(b.siteId)).toBe('Site B');
  });

  test('new rows are stamped with the own company, whatever the caller sends', async () => {
    const site = await dbA.site.create({
      data: { companyId: b.companyId, name: 'New', boundary: square(46.6, 24.7), shiftStart: new Date('1970-01-01T07:00:00Z'), shiftEnd: new Date('1970-01-01T17:00:00Z') },
    });
    expect(site.companyId).toBe(a.companyId);
  });

  test("a child row cannot be attached to another company's parent", async () => {
    await expect(dbA.geofence.create({ data: { siteId: b.siteId, name: 'Z', boundary: square(46.6, 24.7) } }))
      .rejects.toMatchObject({ status: 404 });
    const ok = await dbA.geofence.create({ data: { siteId: a.siteId, name: 'Z', boundary: square(46.6, 24.7) } });
    expect(ok.siteId).toBe(a.siteId);
  });

  test('a row cannot be moved to another company', async () => {
    await expect(dbA.employee.update({ where: { id: a.employeeId }, data: { companyId: b.companyId } }))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ================================================================ 4. rollback (SITE-69)

describe('rollback', () => {
  afterAll(globalSetup); // build the test database again for the next run

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

    await pool.query(fs.readFileSync(DOWN_SQL, 'utf8'));
    expect(await leftovers()).toEqual([]); // no tables, view, functions, enum types or sequences

    await globalSetup();
    expect(await listTables()).toEqual([...SCHEMA_TABLES].sort());
  });

  test('the seed refuses production and remote databases', () => {
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
});
