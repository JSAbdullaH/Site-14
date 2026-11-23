const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const AppError = require('../utils/AppError');
const reportModel = require('../models/report.model');
const template = require('../templates/attendance.html');
const { findChrome } = require('../utils/chrome');
const { sessionEnd, dayAttendance, applyCorrections } = require('../utils/attendance');
const { clockInRiyadh } = require('../utils/day');
const displayId = require('../utils/displayId');

const TZ = '+03:00';
const GAP_MINUTES = 10;
const STORAGE = path.join(__dirname, '..', '..', 'storage', 'reports');

const dayStart = (isoDate) => new Date(`${isoDate}T00:00:00${TZ}`);
const dayEnd = (isoDate) => new Date(`${isoDate}T24:00:00${TZ}`);
const minutesBetween = (a, b) => Math.max(0, Math.round((b - a) / 60000));
const hhmmOf = (t) => new Date(t).toISOString().slice(11, 16);
const riyadhDay = (t) => new Date(t.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

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

function workingDays(from, to, now) {
  const last = riyadhDay(now) < to ? riyadhDay(now) : to;
  let count = 0;
  for (let d = new Date(`${from}T12:00:00${TZ}`); riyadhDay(d) <= last; d = new Date(d.getTime() + 86400_000)) {
    if (new Date(`${riyadhDay(d)}T12:00:00${TZ}`).getUTCDay() !== 5) count += 1;
  }
  return count;
}

async function buildDailyRecords(auth, siteId, from, to) {
  const start = dayStart(from);
  const end = dayEnd(to);
  const now = new Date();
  const today = riyadhDay(now);

  const site = await auth.db.site.findFirst({
    where: { id: siteId },
    select: { id: true, name: true, client: true, shiftStart: true, shiftEnd: true },
  });
  if (!site) throw new AppError(404, 'NOT_FOUND', 'Site not found');

  const [sessions, doneTasks, corrections] = await Promise.all([
    auth.db.workSession.findMany({
      where: { siteId, startedAt: { gte: start, lt: end } },
      select: {
        employeeId: true,
        startedAt: true,
        endedAt: true,
        telemetryLogs: { orderBy: { recordedAt: 'desc' }, take: 1, select: { recordedAt: true } },
        alerts: {
          where: { triggeredAt: { gte: start, lt: end } },
          select: { alertType: true, triggeredAt: true, geofence: { select: { name: true } } },
        },
      },
      orderBy: { startedAt: 'asc' },
    }),
    auth.db.task.groupBy({
      by: ['employeeId'],
      where: { siteId, status: 'done', scheduledFor: { gte: new Date(from), lte: new Date(to) } },
      _count: { _all: true },
    }),
    auth.db.recordCorrection.findMany({
      where: { siteId, workDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { employeeId: true, workDate: true, field: true, correctedValue: true },
    }),
  ]);

  // The register lists today's crew, plus anyone who worked here during the period and has
  // since moved to another site or been removed: their hours on this site stay on record.
  const workedHere = [...new Set(sessions.map((s) => s.employeeId))];
  const employees = await auth.db.employee.findMany({
    where: { OR: [{ siteId, status: 'active' }, { id: { in: workedHere } }] },
    select: {
      id: true, fullName: true, employeeNumber: true, jobCategory: true, consentGivenAt: true,
      displayNumber: true, company: { select: { key: true } },
    },
    orderBy: { fullName: 'asc' },
  });

  const days = new Map();
  for (const s of sessions) {
    const key = `${s.employeeId}|${riyadhDay(s.startedAt)}`;
    const session = { ...s, lastReadingAt: s.telemetryLogs[0]?.recordedAt ?? null };
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(session);
  }
  const correctionsOf = (employeeId, day) =>
    corrections.filter((c) => c.employeeId === employeeId && c.workDate.toISOString().slice(0, 10) === day);

  const tasksBy = new Map(doneTasks.map((t) => [t.employeeId, t._count._all]));
  const workdays = workingDays(from, to, now);
  const alerts = [];
  let provisional = dayEnd(to) > now;

  const records = employees.map((e) => {
    const base = {
      employee_id: e.id,
      display_id: displayId.format(e.company.key, 'employee', e.displayNumber),
      full_name: e.fullName,
      employee_number: e.employeeNumber,
      job_category: e.jobCategory,
      tasks_done: tasksBy.get(e.id) ?? 0,
    };

    const own = [...days.entries()]
      .filter(([key]) => key.startsWith(`${e.id}|`))
      .map(([key, list]) => ({ day: key.split('|')[1], sessions: list }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    for (const { sessions: list } of own) {
      for (const s of list) {
        for (const a of s.alerts) {
          alerts.push({ full_name: e.fullName, alert_type: a.alertType, triggered_at: a.triggeredAt, zone: a.geofence?.name ?? null });
        }
      }
    }

    // Recorded shifts count even if consent was withdrawn afterwards; without any, a worker
    // who never consented could not have been tracked, which is not the same as absent.
    if (own.length === 0) {
      const state = e.consentGivenAt ? 'absent' : 'no_consent';
      return {
        ...base,
        state,
        first_seen: null,
        last_seen: null,
        total_minutes: 0,
        has_gap: false,
        corrected: false,
        days_present: 0,
        days_absent: state === 'absent' ? workdays : null,
        avg_minutes: 0,
      };
    }

    let minutes = 0;
    let hasGap = false;
    let corrected = false;
    let firstSeen = null;
    let lastSeen = null;

    for (const { day, sessions: list } of own) {
      const attendance = dayAttendance(list);
      const fixes = correctionsOf(e.id, day);
      const values = applyCorrections(
        {
          first_seen: clockInRiyadh(attendance.first_seen),
          last_seen: clockInRiyadh(attendance.last_seen),
          worked_minutes: attendance.worked_minutes,
        },
        fixes,
      );
      minutes += values.worked_minutes.value;
      if (fixes.length) corrected = true;
      const stillOn = attendance.open && day === today;
      if (stillOn) provisional = true;
      if (firstSeen === null) firstSeen = values.first_seen.value;
      lastSeen = stillOn ? null : values.last_seen.value;

      let previousEnd = null;
      for (const s of list) {
        if (previousEnd && minutesBetween(previousEnd, s.startedAt) > GAP_MINUTES) hasGap = true;
        const endAt = sessionEnd(s);
        if (!previousEnd || endAt > previousEnd) previousEnd = endAt;
      }
    }

    return {
      ...base,
      state: 'present',
      first_seen: firstSeen,
      last_seen: lastSeen,
      total_minutes: minutes,
      has_gap: hasGap,
      corrected,
      days_present: own.length,
      days_absent: Math.max(0, workdays - own.length),
      avg_minutes: Math.round(minutes / own.length),
    };
  });

  alerts.sort((x, y) => x.triggered_at - y.triggered_at);

  const totals = {
    roster: records.length,
    present: records.filter((r) => r.state === 'present').length,
    absent: records.filter((r) => r.state === 'absent').length,
    no_consent: records.filter((r) => r.state === 'no_consent').length,
    corrected: records.filter((r) => r.corrected).length,
    minutes: records.reduce((sum, r) => sum + r.total_minutes, 0),
  };

  return { site, records, alerts, totals, provisional, workdays };
}

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    const executablePath = findChrome();
    if (!executablePath) {
      throw new AppError(503, 'PDF_UNAVAILABLE', 'PDF export needs Chrome or Chromium on the server. Install it or set CHROME_PATH.');
    }
    const puppeteer = require('puppeteer-core');
    const launched = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    launched.on('disconnected', () => {
      if (browser === launched) browser = null;
    });
    browser = launched;
  }
  return browser;
}

async function openPage() {
  try {
    return await (await getBrowser()).newPage();
  } catch (err) {
    if (err instanceof AppError) throw err;
    const stale = browser;
    browser = null;
    if (stale) await stale.close().catch(() => {});
    return (await getBrowser()).newPage();
  }
}

async function toPdf(html, ref) {
  const page = await openPage();
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
    layout: from === to ? 'day' : 'period',
    period: { label: from === to ? longDate(from) : `${longDate(from)} to ${longDate(to)} (${data.workdays} working days)` },
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

module.exports = { generate, verify, buildDailyRecords, getBrowser, openPage };
