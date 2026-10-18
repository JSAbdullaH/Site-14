// SITE-75: demo data for development and demos. Never run against production.
//   npm run db:seed          (also runs after `npm run db:reset`)
//
// Two companies, so tenant isolation can be seen and tested by hand.
// Every demo user signs in with SEED_PASSWORD (see .env.example).
require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const { prisma } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00Z`);
const minutesAgo = (m) => new Date(Date.now() - m * 60_000);

// Small square polygon (GeoJSON order is [longitude, latitude]).
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

const COMPANIES = [
  {
    name: 'Al-Bina Advanced Contracting',
    domain: 'albina.test',
    site: { name: 'Al Malqa Tower', client: 'Malqa Real Estate', lng: 46.6290, lat: 24.8120 },
    zones: [{ name: 'Roof', outdoor: true }, { name: 'Warehouse', outdoor: false }],
    workers: ['Ahmed Saleh', 'Khalid Omar', 'Yousef Nasser'],
    category: { name: 'construction', daily: 480, ramadan: 360 },
  },
  {
    name: 'Nadeef Facility Services',
    domain: 'nadeef.test',
    site: { name: 'King Fahd Mall', client: 'KF Holdings', lng: 46.6750, lat: 24.7130 },
    zones: [{ name: 'Parking', outdoor: true }, { name: 'Food Court', outdoor: false }],
    workers: ['Imran Ali', 'Sami Haddad'],
    category: { name: 'cleaning', daily: 720, ramadan: 600 },
  },
];

async function seedCompany(spec, passwordHash) {
  const company = await prisma.company.create({
    data: {
      name: spec.name,
      middayBanFromDate: new Date('2026-06-15'),
      middayBanToDate: new Date('2026-09-15'),
      heartRateMaxBpm: 150,
      heartRateMinBpm: 45,
    },
  });

  await prisma.jobCategoryRule.create({
    data: {
      companyId: company.id,
      jobCategory: spec.category.name,
      dailyLimitMinutes: spec.category.daily,
      ramadanLimitMinutes: spec.category.ramadan,
    },
  });

  const admin = await prisma.user.create({
    data: {
      companyId: company.id, fullName: `${spec.name} Admin`, email: `admin@${spec.domain}`,
      passwordHash, role: 'company_admin', isEmailVerified: true,
    },
  });
  await prisma.user.create({
    data: {
      companyId: company.id, fullName: `${spec.name} Manager`, email: `manager@${spec.domain}`,
      passwordHash, role: 'site_manager', isEmailVerified: true,
    },
  });

  const { lng, lat } = spec.site;
  const site = await prisma.site.create({
    data: {
      companyId: company.id, name: spec.site.name, client: spec.site.client,
      boundary: square(lng, lat, 0.003), shiftStart: time('07:00'), shiftEnd: time('17:00'),
    },
  });

  const zones = [];
  for (const [i, z] of spec.zones.entries()) {
    zones.push(await prisma.geofence.create({
      data: {
        siteId: site.id, name: z.name, isOutdoor: z.outdoor,
        boundary: square(lng + (i === 0 ? -0.001 : 0.001), lat, 0.0008),
      },
    }));
  }

  const employees = [];
  for (const [i, fullName] of spec.workers.entries()) {
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id, siteId: site.id, fullName,
        employeeNumber: `E-${String(i + 1).padStart(3, '0')}`,
        jobCategory: spec.category.name,
        // The last worker has not consented yet, so no session can open for them.
        consentGivenAt: i < spec.workers.length - 1 ? minutesAgo(60 * 24 * 7) : null,
      },
    });
    const serial = `${spec.domain.split('.')[0].toUpperCase()}-GPS-${String(i + 1).padStart(3, '0')}`;
    const device = await prisma.device.create({
      data: {
        companyId: company.id, employeeId: employee.id, serialNumber: serial,
        apiKeyHash: sha256(`dev-key-${serial}`), lastSeenAt: employee.consentGivenAt ? minutesAgo(1) : null,
      },
    });
    employees.push({ employee, device });
  }

  // First worker: on site since 120 minutes ago, readings every 10 minutes.
  const { employee, device } = employees[0];
  const session = await prisma.workSession.create({
    data: {
      companyId: company.id, employeeId: employee.id, siteId: site.id,
      deviceId: device.id, startedAt: minutesAgo(120),
    },
  });
  const readings = [];
  for (let m = 120; m >= 0; m -= 10) {
    readings.push({
      sessionId: session.id,
      latitude: lat + (m % 30) * 0.00001, longitude: lng - 0.001,
      batteryPercent: 90 - Math.floor((120 - m) / 10),
      heartRateBpm: m === 0 ? 156 : 88 + (m % 20),
      recordedAt: minutesAgo(m),
    });
  }
  await prisma.telemetryLog.createMany({ data: readings });
  const last = readings[readings.length - 1];

  await prisma.employeeCurrentState.create({
    data: {
      employeeId: employee.id, sessionId: session.id, geofenceId: zones[0].id,
      latitude: last.latitude, longitude: last.longitude,
      batteryPercent: last.batteryPercent, heartRateBpm: last.heartRateBpm, recordedAt: last.recordedAt,
    },
  });

  await prisma.alert.create({
    data: {
      sessionId: session.id, alertType: 'heart_rate_high', latitude: last.latitude, longitude: last.longitude,
      limitBpm: 150, observedBpm: last.heartRateBpm, triggeredAt: last.recordedAt,
    },
  });

  await prisma.task.create({
    data: {
      companyId: company.id, siteId: site.id, geofenceId: zones[0].id, employeeId: employee.id,
      createdBy: admin.id, title: 'Inspect the roof area',
    },
  });

  return company;
}

async function main() {
  const existing = await prisma.company.count({ where: { name: { in: COMPANIES.map((c) => c.name) } } });
  if (existing > 0) {
    console.log('Seed data already present. Run `npm run db:reset` for a clean database.');
    return;
  }
  const passwordHash = await hashPassword(process.env.SEED_PASSWORD || 'Site14-Demo-2026!');
  for (const spec of COMPANIES) {
    const company = await seedCompany(spec, passwordHash);
    console.log(`Seeded ${company.name}: admin@${spec.domain}, manager@${spec.domain}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
