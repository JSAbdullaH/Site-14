// Writes and reads one row in each of the 16 models through Prisma Client.
// If schema.prisma and the migration SQL ever disagree (a column name, a type,
// a relation), one of these calls fails.
const { prisma } = require('../src/config/db');
const { pool, truncateAll, square } = require('./setup');

beforeAll(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

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
    data: { companyId: company.id, siteId: site.id, geofenceId: zone.id, employeeId: employee.id, createdBy: user.id, title: 'Pour concrete' },
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
  expect(counts).toEqual(Array(16).fill(1));
});

test('Prisma reports the database error codes the services rely on', async () => {
  const company = await prisma.company.findFirstOrThrow();
  // Duplicate email: Prisma P2002 (unique), which auth.service treats as "already registered".
  await expect(
    prisma.user.create({ data: { companyId: company.id, fullName: 'X', email: 'admin@prisma.test', role: 'site_manager' } }),
  ).rejects.toMatchObject({ code: 'P2002' });
});
