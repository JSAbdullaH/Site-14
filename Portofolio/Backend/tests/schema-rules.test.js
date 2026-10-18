// The database rules from Stage3 section 2.2, checked one by one with plain SQL.
// Each test names the SQLSTATE the database must answer with.
//   23503 foreign key  23505 unique  23514 check
//   RC002 no consent   AO001 append-only (our own codes, raised by triggers)
const { pool, TABLES, truncateAll, makeCompany, openSession, sqlState } = require('./setup');

beforeEach(truncateAll);
afterAll(() => pool.end());

describe('structure', () => {
  test('has the 16 tables and the daily_work_records view', async () => {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TABLES].sort());
    const view = await pool.query("SELECT 1 FROM information_schema.views WHERE table_name = 'daily_work_records'");
    expect(view.rowCount).toBe(1);
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

  test('a task zone must belong to the task site', async () => {
    const a = await makeCompany('A');
    const b = await makeCompany('B');
    const code = await sqlState(
      "INSERT INTO tasks (company_id, site_id, geofence_id, employee_id, created_by, title) VALUES ($1, $2, $3, $4, $5, 'T')",
      [a.companyId, a.siteId, b.geofenceId, a.employeeId, a.userId],
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
      "UPDATE work_sessions SET ended_at = started_at - interval '1 minute', end_reason = 'left_site' WHERE id = $1",
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
        `INSERT INTO work_sessions (company_id, employee_id, site_id, device_id, started_at, ended_at, end_reason)
         VALUES ($1, $2, $3, $4, $5, $6, 'left_site')`,
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
