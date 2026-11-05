const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const AppError = require('../utils/AppError');
const reportModel = require('../models/report.model');
const template = require('../templates/attendance.html');

const TZ = '+03:00';
const GAP_MINUTES = 10;
const STORAGE = path.join(__dirname, '..', '..', 'storage', 'reports');

const dayStart = (isoDate) => new Date(`${isoDate}T00:00:00${TZ}`);
const dayEnd = (isoDate) => new Date(`${isoDate}T24:00:00${TZ}`);
const minutesBetween = (a, b) => Math.max(0, Math.round((b - a) / 60000));
const hhmmOf = (t) => new Date(t).toISOString().slice(11, 16);
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

const longDate = (isoDate) =>
  new Date(`${isoDate}T12:00:00${TZ}`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

function reference() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `SITE14-R-${stamp}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function buildDailyRecords(auth, siteId, from, to) {
  const start = dayStart(from);
  const end = dayEnd(to);
  const now = new Date();
  const periodDays = Math.round((end - start) / 86400000);

  const site = await auth.db.site.findFirst({
    where: { id: siteId },
    select: { id: true, name: true, client: true, shiftStart: true, shiftEnd: true },
  });
  if (!site) throw new AppError(404, 'NOT_FOUND', 'Site not found');

  const [employees, sessions, doneTasks] = await Promise.all([
    auth.db.employee.findMany({
      where: { siteId, status: 'active' },
      select: { id: true, fullName: true, employeeNumber: true, jobCategory: true, consentGivenAt: true },
      orderBy: { fullName: 'asc' },
    }),
    auth.db.workSession.findMany({
      where: {
        siteId,
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      select: {
        employeeId: true,
        startedAt: true,
        endedAt: true,
        alerts: { select: { alertType: true, triggeredAt: true, geofence: { select: { name: true } } } },
      },
      orderBy: { startedAt: 'asc' },
    }),
    auth.db.task.groupBy({
      by: ['employeeId'],
      where: { siteId, status: 'done', scheduledFor: { gte: new Date(from), lte: new Date(to) } },
      _count: { _all: true },
    }),
  ]);

  const byEmployee = new Map(employees.map((e) => [e.id, []]));
  for (const s of sessions) byEmployee.get(s.employeeId)?.push(s);

  const tasksBy = new Map(doneTasks.map((t) => [t.employeeId, t._count._all]));
  const alerts = [];
  let provisional = dayEnd(to) > now;

  const records = employees.map((e) => {
    const own = byEmployee.get(e.id) ?? [];
    const base = {
      employee_id: e.id,
      full_name: e.fullName,
      employee_number: e.employeeNumber,
      job_category: e.jobCategory,
      tasks_done: tasksBy.get(e.id) ?? 0,
    };

    for (const s of own) {
      for (const a of s.alerts) {
        alerts.push({
          full_name: e.fullName,
          alert_type: a.alertType,
          triggered_at: a.triggeredAt,
          zone: a.geofence?.name ?? null,
        });
      }
    }

    if (!e.consentGivenAt) {
      return {
        ...base,
        state: 'no_consent',
        first_seen: null,
        last_seen: null,
        total_minutes: 0,
        has_gap: false,
        days_present: null,
        days_absent: null,
        avg_minutes: null,
      };
    }

    if (own.length === 0) {
      return {
        ...base,
        state: 'absent',
        first_seen: null,
        last_seen: null,
        total_minutes: 0,
        has_gap: false,
        days_present: 0,
        days_absent: periodDays,
        avg_minutes: 0,
      };
    }

    let minutes = 0;
    let hasGap = false;
    let previousEnd = null;
    let firstSeen = null;
    let lastSeen = null;
    const days = new Set();

    for (const s of own) {
      const a = s.startedAt < start ? start : s.startedAt;
      const rawEnd = s.endedAt ?? now;
      const b = rawEnd > end ? end : rawEnd;

      if (s.endedAt === null) provisional = true;
      if (firstSeen === null) firstSeen = a;
      lastSeen = s.endedAt === null ? null : b;

      days.add(dayKey(a));
      days.add(dayKey(b));
      minutes += minutesBetween(a, b);
      if (previousEnd && minutesBetween(previousEnd, a) > GAP_MINUTES) hasGap = true;
      previousEnd = b;
    }

    const daysPresent = days.size;

    return {
      ...base,
      state: 'present',
      first_seen: firstSeen,
      last_seen: lastSeen,
      total_minutes: minutes,
      has_gap: hasGap,
      days_present: daysPresent,
      days_absent: Math.max(0, periodDays - daysPresent),
      avg_minutes: daysPresent ? Math.round(minutes / daysPresent) : 0,
    };
  });

  alerts.sort((x, y) => x.triggered_at - y.triggered_at);

  const totals = {
    roster: records.length,
    present: records.filter((r) => r.state === 'present').length,
    absent: records.filter((r) => r.state === 'absent').length,
    no_consent: records.filter((r) => r.state === 'no_consent').length,
    minutes: records.reduce((sum, r) => sum + r.total_minutes, 0),
  };

  return { site, records, alerts, totals, provisional, periodDays };
}

let browser = null;

async function getBrowser() {
  if (!browser) {
    // Loaded on first use: puppeteer is ESM-only, and only the PDF export needs it.
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  return browser;
}

async function toPdf(html, ref) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:8px;color:#6B6B6B;width:100%;padding:0 12mm;display:flex;justify-content:space-between">' +
        `<span>Ref ${ref}</span>` +
        '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>' +
        '</div>',
      margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await page.close();
  }
}

async function generate(auth, { site_id: siteId, report_type: reportType, from, to }) {
  const data = await buildDailyRecords(auth, siteId, from, to);
  const user = await auth.db.user.findFirst({ where: { id: auth.userId }, select: { fullName: true } });

  const ref = reference();

  const html = template.render({
    reference: ref,
    site: {
      name: data.site.name,
      client: data.site.client,
      shift: `${hhmmOf(data.site.shiftStart)} to ${hhmmOf(data.site.shiftEnd)}`,
    },
    period: {
      label: from === to ? longDate(from) : `${longDate(from)} to ${longDate(to)}`,
      days: data.periodDays,
    },
    aggregate: reportType !== 'daily',
    issuer: {
      name: user?.fullName ?? 'Unknown',
      at: `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    },
    records: data.records,
    alerts: data.alerts,
    totals: data.totals,
    provisional: data.provisional,
  });

  const pdf = await toPdf(html, ref);
  const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');

  await fs.mkdir(STORAGE, { recursive: true });
  const filePath = path.join(STORAGE, `${ref}.pdf`);
  await fs.writeFile(filePath, pdf);

  try {
    await reportModel.create(auth.db, {
      siteId,
      createdBy: auth.userId,
      referenceNumber: ref,
      reportType,
      periodStart: new Date(from),
      periodEnd: new Date(to),
      filePath,
      fileSizeBytes: pdf.length,
      sha256,
    });
  } catch (err) {
    await fs.unlink(filePath).catch(() => {});
    throw err;
  }

  return { pdf, reference: ref, sha256 };
}

async function verify(referenceNumber) {
  const row = await reportModel.findByReference(referenceNumber);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'No report was issued with this reference');
  return {
    reference_number: row.referenceNumber,
    report_type: row.reportType,
    period_start: row.periodStart.toISOString().slice(0, 10),
    period_end: row.periodEnd.toISOString().slice(0, 10),
    sha256: row.sha256,
    file_size_bytes: row.fileSizeBytes,
    issued_at: row.createdAt.toISOString(),
    issued_by: row.creator.fullName,
    site: row.site.name,
    client: row.site.client,
  };
}

process.on('beforeExit', async () => {
  if (browser) await browser.close().catch(() => {});
});

module.exports = { generate, verify, buildDailyRecords };
