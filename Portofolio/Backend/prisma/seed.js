// SITE-75: demo data for development, testing and the final presentation.
//   npm run db:seed          (run it after `npm run db:reset`)
//
// Running it again empties every table and seeds again, so the result is the
// same each time (no duplicates). It refuses to run in production, and on a
// database that is not on this machine unless ALLOW_REMOTE_RESET=true.
//
// What it creates:
//   Al-Bina Advanced Contracting (the demo company)
//     2 sites, 3 zones (Roof is outdoor), 20 tracked employees with 20 devices,
//     2 more employees waiting for consent, the past 7 days of shifts with
//     readings every 10 minutes, today's live shifts, alerts, tasks and one
//     correction.
//   Nadeef Facility Services (a small second company, to check that companies
//     never see each other's data)
//
// Every demo user signs in with SEED_PASSWORD (see .env.example).
// Dates are relative to the moment the seed runs, so "today" is always live.
require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const { prisma } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { assertSafeTarget } = require('./safety');

const MINUTE = 60_000;
const RIYADH_OFFSET = 3 * 60 * MINUTE; // UTC+3, no daylight saving
const READING_EVERY_MIN = 10;

// ---------------------------------------------------------------- helpers

// Same random numbers on every run, so the demo looks the same each time.
function randomGenerator(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Both are set again at the start of every run (see seed()).
let random = randomGenerator(2026);
let NOW = new Date();
const between = (min, max) => min + Math.floor(random() * (max - min + 1));

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00Z`); // TIME columns
const addMinutes = (date, m) => new Date(date.getTime() + m * MINUTE);

// A Riyadh calendar day, `offset` days from today.
function riyadhDay(offset) {
  const now = new Date(NOW.getTime() + RIYADH_OFFSET);
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  return {
    date: day, // midnight UTC of that day: what DATE columns expect
    isFriday: day.getUTCDay() === 5,
    at: (hh, mm = 0) => new Date(day.getTime() + (hh * 60 + mm) * MINUTE - RIYADH_OFFSET),
  };
}

// Small square polygon. GeoJSON order is [longitude, latitude].
function square(lng, lat, half) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - half, lat - half], [lng + half, lat - half],
      [lng + half, lat + half], [lng - half, lat + half],
      [lng - half, lat - half],
    ]],
  };
}

// A point inside an area, moving a little around its centre.
const jitter = (area) => ({
  latitude: area.lat + (random() - 0.5) * area.half,
  longitude: area.lng + (random() - 0.5) * area.half,
});

// Empties every table in the schema (whatever tables exist), keeping
// Prisma's own migration history. TRUNCATE is allowed on the append-only
// tables: their triggers block UPDATE and DELETE only.
async function emptyAllTables() {
  const rows = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// ---------------------------------------------------------------- demo data

const WORKER_NAMES = [
  'Ahmed Saleh', 'Khalid Omar', 'Yousef Nasser', 'Mohammed Ali', 'Abdulrahman Fahd',
  'Imran Qureshi', 'Rashid Khan', 'Saeed Hamdan', 'Bilal Ahmed', 'Omar Farouk',
  'Naveen Kumar', 'Tariq Aziz', 'Majed Sultan', 'Hassan Ibrahim', 'Waleed Mansour',
  'Sajid Hussain', 'Anwar Hossain', 'Ibrahim Musa', 'Nasser Alqahtani', 'Fahad Alotaibi',
];
const PENDING_NAMES = ['Faris Adel', 'Hamza Kareem'];

const ALBINA = {
  name: 'Al-Bina Advanced Contracting',
  domain: 'albina.test',
  serialPrefix: 'ALB',
  categories: [
    { name: 'construction', daily: 480 },
    { name: 'security', daily: 720 },
  ],
  sites: [
    {
      name: 'Al Malqa Tower', lng: 46.6290, lat: 24.8120,
      zones: [
        { name: 'Roof', outdoor: true, dLng: -0.0012, dLat: 0 },
        { name: 'Warehouse', outdoor: false, dLng: 0.0012, dLat: 0 },
      ],
      workers: 12, // workers 0-11; 10 and 11 are security
      security: [10, 11],
    },
    {
      name: 'Al Narjis Villas', lng: 46.6680, lat: 24.8650,
      zones: [{ name: 'Site Office', outdoor: false, dLng: 0, dLat: 0.0010 }],
      workers: 8, // workers 12-19; 18 and 19 are security
      security: [6, 7],
    },
  ],
};

async function createCompany(spec, passwordHash) {
  const company = await prisma.company.create({
    data: {
      name: spec.name,
      heartRateMaxBpm: 150,
      heartRateMinBpm: 45,
    },
  });
  await prisma.jobCategoryRule.createMany({
    data: spec.categories.map((c) => ({
      companyId: company.id, jobCategory: c.name, dailyLimitMinutes: c.daily,
    })),
  });
  const admin = await prisma.user.create({
    data: {
      companyId: company.id, fullName: 'Sara Alharbi', email: `admin@${spec.domain}`,
      passwordHash, role: 'company_admin', isEmailVerified: true,
    },
  });
  const manager = await prisma.user.create({
    data: {
      companyId: company.id, fullName: 'Majid Alzahrani', email: `manager@${spec.domain}`,
      passwordHash, role: 'site_manager', isEmailVerified: true,
    },
  });
  return { company, admin, manager };
}

async function createSite(companyId, spec) {
  const site = await prisma.site.create({
    data: {
      companyId, name: spec.name,
      boundary: square(spec.lng, spec.lat, 0.003),
      shiftStart: time('07:00'), shiftEnd: time('17:00'),
    },
  });
  const zones = [];
  for (const z of spec.zones) {
    const area = { lng: spec.lng + z.dLng, lat: spec.lat + z.dLat, half: 0.0008 };
    const geofence = await prisma.geofence.create({
      data: { siteId: site.id, name: z.name, isOutdoor: z.outdoor, boundary: square(area.lng, area.lat, area.half) },
    });
    zones.push({ ...geofence, area });
  }
  return { ...site, area: { lng: spec.lng, lat: spec.lat, half: 0.003 }, zones };
}

// One worker's shift: the session row, its readings, and the last reading.
async function createShift({ companyId, worker, start, end, heartSpikeAt }) {
  const session = await prisma.workSession.create({
    data: {
      companyId, employeeId: worker.employee.id, siteId: worker.site.id, deviceId: worker.device.id,
      startedAt: start,
      endedAt: end ?? null,
    },
  });
  const until = end ?? addMinutes(NOW, -1);
  const readings = [];
  let battery = between(85, 100);
  for (let t = start; t <= until; t = addMinutes(t, READING_EVERY_MIN)) {
    const spike = heartSpikeAt && t.getTime() === heartSpikeAt.getTime();
    readings.push({
      sessionId: session.id,
      ...jitter(worker.zone ? worker.zone.area : worker.site.area),
      batteryPercent: Math.max(battery, 5),
      heartRateBpm: spike ? between(155, 165) : between(72, 105),
      recordedAt: t,
    });
    battery -= random() < 0.5 ? 1 : 0;
  }
  return { session, readings, last: readings[readings.length - 1] };
}

async function seedAlbina(passwordHash) {
  const { company, admin, manager } = await createCompany(ALBINA, passwordHash);
  const limits = Object.fromEntries(ALBINA.categories.map((c) => [c.name, c.daily]));

  // Sites, zones, employees and devices.
  const workers = [];
  for (const siteSpec of ALBINA.sites) {
    const site = await createSite(company.id, siteSpec);
    for (let i = 0; i < siteSpec.workers; i += 1) {
      const n = workers.length;
      const category = siteSpec.security.includes(i) ? 'security' : 'construction';
      const employee = await prisma.employee.create({
        data: {
          companyId: company.id, siteId: site.id, fullName: WORKER_NAMES[n],
          employeeNumber: `E-${String(n + 1).padStart(3, '0')}`, jobCategory: category,
          consentGivenAt: riyadhDay(-30).at(9, n),
        },
      });
      const serial = `${ALBINA.serialPrefix}-GPS-${String(n + 1).padStart(3, '0')}`;
      const device = await prisma.device.create({
        data: { companyId: company.id, employeeId: employee.id, serialNumber: serial, apiKeyHash: sha256(`dev-key-${serial}`) },
      });
      workers.push({ employee, device, site, category, zone: site.zones[n % site.zones.length] });
    }
  }
  // Signed up but no consent yet: no device, and the database refuses a session for them.
  for (const [i, fullName] of PENDING_NAMES.entries()) {
    await prisma.employee.create({
      data: {
        companyId: company.id, siteId: workers[0].site.id, fullName,
        employeeNumber: `E-${String(WORKER_NAMES.length + i + 1).padStart(3, '0')}`, jobCategory: 'construction',
      },
    });
  }

  const telemetry = [];
  const alerts = [];
  const lastEnd = new Map();

  // The past 7 days (no work on Fridays).
  for (let offset = -7; offset <= -1; offset += 1) {
    const day = riyadhDay(offset);
    if (day.isFriday) continue;
    for (const [n, worker] of workers.entries()) {
      if (random() < 0.07) continue; // the odd day off
      const start = day.at(7, between(-10, 20));
      // Most shifts stay inside the daily limit; about one in eight runs over.
      const overtime = random() < 0.12 ? between(20, 70) : 0;
      const length = (worker.category === 'security' ? between(640, 715) : between(430, 478)) + overtime;
      const end = addMinutes(start, length);
      const heartSpikeAt = offset === -3 && n === 4 ? addMinutes(start, 240) : null;
      const shift = await createShift({ companyId: company.id, worker, start, end, heartSpikeAt });
      telemetry.push(...shift.readings);
      lastEnd.set(worker.employee.id, end);

      // Over the daily limit: an hour_limit alert, handled by the manager.
      const limit = limits[worker.category];
      if (length > limit) {
        const at = addMinutes(start, limit);
        alerts.push({
          sessionId: shift.session.id, alertType: 'hour_limit', ...jitter(worker.site.area),
          limitMinutes: limit, observedMinutes: length, triggeredAt: at,
          acknowledgedBy: manager.id, acknowledgedAt: addMinutes(at, 6), resolvedAt: end,
        });
      }
      if (heartSpikeAt) {
        alerts.push({
          sessionId: shift.session.id, alertType: 'heart_rate_high', ...jitter(worker.site.area),
          limitBpm: 150, observedBpm: 158, triggeredAt: heartSpikeAt,
          acknowledgedBy: manager.id, acknowledgedAt: addMinutes(heartSpikeAt, 3), resolvedAt: addMinutes(heartSpikeAt, 30),
        });
      }
      if (random() < 0.06 && worker.zone) {
        const at = addMinutes(start, between(60, 300));
        alerts.push({
          sessionId: shift.session.id, alertType: 'zone_exit', geofenceId: worker.zone.id,
          ...jitter(worker.site.area), triggeredAt: at,
          acknowledgedBy: manager.id, acknowledgedAt: addMinutes(at, 4), resolvedAt: addMinutes(at, 15),
        });
      }
    }
  }

  // Today: 16 of the 20 are on site right now, so the live map has people on it.
  const live = [];
  for (const [n, worker] of workers.entries()) {
    if (n % 5 === 4) continue; // workers 4, 9, 14, 19 are off today
    const earliest = addMinutes(lastEnd.get(worker.employee.id) ?? riyadhDay(-1).at(0), 60);
    let start = addMinutes(NOW, -between(60, 300));
    if (start < earliest) start = earliest;
    start = new Date(Math.floor(start.getTime() / MINUTE) * MINUTE);
    const shift = await createShift({ companyId: company.id, worker, start });
    telemetry.push(...shift.readings);
    live.push({ worker, ...shift });
  }

  // Today's open alerts: one worker outside his zone, one with a high heart rate.
  const outside = live[2];
  alerts.push({
    sessionId: outside.session.id, alertType: 'zone_exit', geofenceId: outside.worker.zone.id,
    latitude: outside.worker.site.area.lat + 0.0025, longitude: outside.worker.site.area.lng,
    triggeredAt: outside.last.recordedAt,
  });
  const racing = live[5];
  racing.last.heartRateBpm = 156;
  alerts.push({
    sessionId: racing.session.id, alertType: 'heart_rate_high', latitude: racing.last.latitude,
    longitude: racing.last.longitude, limitBpm: 150, observedBpm: 156, triggeredAt: racing.last.recordedAt,
  });
  // Seen by the manager but not closed yet.
  const late = live[7];
  alerts.push({
    sessionId: late.session.id, alertType: 'zone_exit', geofenceId: late.worker.zone.id,
    ...jitter(late.worker.site.area), triggeredAt: addMinutes(late.last.recordedAt, -20),
    acknowledgedBy: manager.id, acknowledgedAt: addMinutes(late.last.recordedAt, -15),
  });

  for (let i = 0; i < telemetry.length; i += 5000) {
    await prisma.telemetryLog.createMany({ data: telemetry.slice(i, i + 5000) });
  }
  await prisma.alert.createMany({ data: alerts });

  // The hot table the live map reads: one row per worker on site.
  await prisma.employeeCurrentState.createMany({
    data: live.map(({ worker, session, last }) => ({
      employeeId: worker.employee.id, sessionId: session.id,
      geofenceId: worker === outside.worker ? null : worker.zone.id,
      latitude: worker === outside.worker ? outside.worker.site.area.lat + 0.0025 : last.latitude,
      longitude: last.longitude, batteryPercent: last.batteryPercent,
      heartRateBpm: last.heartRateBpm, recordedAt: last.recordedAt,
    })),
  });

  // Tasks: done in the past, mixed today.
  const today = riyadhDay(0);
  const taskRows = [];
  const pastDay = riyadhDay(-2).isFriday ? riyadhDay(-3) : riyadhDay(-2);
  const titles = ['Inspect scaffolding', 'Pour concrete on level 3', 'Check fire extinguishers',
    'Clear debris from the gate', 'Install window frames', 'Night patrol log review'];
  for (const [i, worker] of workers.entries()) {
    if (i % 2 !== 0) continue;
    taskRows.push({
      companyId: company.id, siteId: worker.site.id, employeeId: worker.employee.id,
      createdBy: manager.id, title: titles[i % titles.length], status: 'done',
      scheduledFor: pastDay.date, completedAt: pastDay.at(13, i),
    });
  }
  const statuses = ['todo', 'in_progress', 'done'];
  for (const [i, { worker }] of live.slice(0, 6).entries()) {
    const status = statuses[i % 3];
    taskRows.push({
      companyId: company.id, siteId: worker.site.id, employeeId: worker.employee.id,
      createdBy: i < 3 ? admin.id : manager.id, title: titles[(i + 3) % titles.length], status,
      scheduledFor: today.date, completedAt: status === 'done' ? addMinutes(NOW, -30) : null,
    });
  }
  await prisma.task.createMany({ data: taskRows });

  // A correction is a new row; the original record is never edited.
  const corrected = workers[1];
  await prisma.recordCorrection.create({
    data: {
      companyId: company.id, employeeId: corrected.employee.id, siteId: corrected.site.id,
      workDate: pastDay.date, field: 'worked_minutes', originalValue: '512', correctedValue: '480',
      reason: 'Device left in the site office after the shift; supervisor confirmed exit at 15:10.',
      correctedBy: manager.id,
    },
  });

  return { company, workers: workers.length, live: live.length, readings: telemetry.length, alerts: alerts.length };
}

// The second company: just enough to see that companies are kept apart.
async function seedNadeef(passwordHash) {
  const spec = { name: 'Nadeef Facility Services', domain: 'nadeef.test', categories: [{ name: 'cleaning', daily: 720 }] };
  const { company, manager } = await createCompany(spec, passwordHash);
  const site = await createSite(company.id, {
    name: 'King Fahd Mall', lng: 46.6750, lat: 24.7130,
    zones: [{ name: 'Parking', outdoor: true, dLng: -0.0012, dLat: 0 }, { name: 'Food Court', outdoor: false, dLng: 0.0012, dLat: 0 }],
  });
  const employee = await prisma.employee.create({
    data: {
      companyId: company.id, siteId: site.id, fullName: 'Imran Ali', employeeNumber: 'E-001',
      jobCategory: 'cleaning', consentGivenAt: riyadhDay(-10).at(9),
    },
  });
  await prisma.employee.create({
    data: { companyId: company.id, siteId: site.id, fullName: 'Sami Haddad', employeeNumber: 'E-002', jobCategory: 'cleaning' },
  });
  const device = await prisma.device.create({
    data: { companyId: company.id, employeeId: employee.id, serialNumber: 'NAD-GPS-001', apiKeyHash: sha256('dev-key-NAD-GPS-001') },
  });
  const worker = { employee, device, site, zone: site.zones[1] };
  const shift = await createShift({ companyId: company.id, worker, start: addMinutes(NOW, -90) });
  await prisma.telemetryLog.createMany({ data: shift.readings });
  await prisma.employeeCurrentState.create({
    data: {
      employeeId: employee.id, sessionId: shift.session.id, geofenceId: worker.zone.id,
      latitude: shift.last.latitude, longitude: shift.last.longitude,
      batteryPercent: shift.last.batteryPercent, heartRateBpm: shift.last.heartRateBpm, recordedAt: shift.last.recordedAt,
    },
  });
  await prisma.task.create({
    data: {
      companyId: company.id, siteId: site.id, employeeId: employee.id,
      createdBy: manager.id, title: 'Deep clean the food court', scheduledFor: riyadhDay(0).date,
    },
  });
  return company;
}

async function seed() {
  random = randomGenerator(2026);
  NOW = new Date(Math.floor(Date.now() / MINUTE) * MINUTE);
  assertSafeTarget(process.env.DATABASE_URL, 'seed');
  await emptyAllTables();
  const passwordHash = await hashPassword(process.env.SEED_PASSWORD || 'Site14-Demo-2026!');
  const albina = await seedAlbina(passwordHash);
  await seedNadeef(passwordHash);
  return albina;
}

if (require.main === module) {
  const started = Date.now();
  seed()
    .then((r) => {
      console.log(`Seeded ${r.company.name}: ${r.workers} workers (${r.live} on site now), ` +
        `${r.readings} readings, ${r.alerts} alerts, in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
      console.log('Sign in with admin@albina.test or manager@albina.test (password: SEED_PASSWORD).');
      console.log('Second company: admin@nadeef.test');
    })
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seed };
