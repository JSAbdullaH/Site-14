const { parse } = require('csv-parse/sync');
const AppError = require('../utils/AppError');
const { ensureCategory } = require('./employee.service');
const displayId = require('../utils/displayId');

// worker_id is optional and not in the template: it is the ID this system gave a
// worker (AI-E-100012), present when a file downloaded after an import is sent again.
const FIELDS = ['full_name', 'employee_number', 'job_category', 'site_name', 'worker_id'];
const TEMPLATE_FIELDS = FIELDS.filter((f) => f !== 'worker_id');
const REQUIRED = ['full_name', 'job_category'];
const MAX_ROWS = 1000;

const TEMPLATE = `${TEMPLATE_FIELDS.join(',')}\n`;

const bad = (message) => new AppError(422, 'INVALID_FILE', message);

function readFile(file, columnMap) {
  if (!file || !file.buffer || file.buffer.length === 0) throw bad('Choose a CSV file to upload');
  let records;
  try {
    records = parse(file.buffer, { bom: true, columns: true, skip_empty_lines: true, trim: true });
  } catch {
    throw bad('The file is not a valid CSV. Download the template and use its headers.');
  }
  if (records.length === 0) throw bad('The file has no rows under the header');
  if (records.length > MAX_ROWS) throw bad(`At most ${MAX_ROWS} rows per file`);

  const header = Object.keys(records[0]);
  const columnOf = (field) => columnMap[field] || field;
  const missing = REQUIRED.filter((f) => !header.includes(columnOf(f))).map(columnOf);
  if (missing.length) throw bad(`Missing column: ${missing.join(', ')}`);

  return records.map((r, i) => {
    const row = { row: i + 2 };
    for (const f of FIELDS) row[f] = (r[columnOf(f)] ?? '').trim();
    return row;
  });
}

const personKey = (fullName, jobCategory) =>
  `${fullName.trim().replace(/\s+/g, ' ').toLowerCase()}|${jobCategory.trim().toLowerCase()}`;

// The worker number in a worker_id cell, if the cell is one of this company's
// employee IDs. `false` for a cell that is filled but is not.
function workerNumber(cell, companyKey) {
  if (!cell) return null;
  const match = cell.trim().toUpperCase().match(/^([A-Z]{2,5})-E-(\d{6})$/);
  return match && match[1] === companyKey ? Number(match[2]) : false;
}

async function check(db, rows, auth) {
  const numbers = rows.map((r) => r.employee_number).filter(Boolean);
  const company = await db.company.findUnique({ where: { id: auth.companyId }, select: { key: true } });
  const workerNumbers = rows.map((r) => workerNumber(r.worker_id, company.key)).filter(Boolean);
  const [sites, existing, people, known] = await Promise.all([
    db.site.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { employeeNumber: { in: numbers } }, select: { employeeNumber: true } }),
    db.employee.findMany({ where: { status: 'active' }, select: { fullName: true, jobCategory: true } }),
    db.employee.findMany({ where: { displayNumber: { in: workerNumbers } }, select: { displayNumber: true } }),
  ]);
  const onFile = new Set(known.map((e) => e.displayNumber));
  const siteByName = new Map(sites.map((s) => [s.name.toLowerCase(), s]));
  const taken = new Set(existing.map((e) => e.employeeNumber));
  const seen = new Set();
  const knownPeople = new Set(people.map((p) => personKey(p.fullName, p.jobCategory)));
  const seenPeople = new Set();
  const unchecked = [];

  const valid = [];
  const invalid = [];
  const duplicates = [];
  for (const r of rows) {
    const reasons = [];
    if (r.full_name.length < 2 || r.full_name.length > 120) reasons.push('full_name is missing or too long');
    if (r.job_category.length < 2 || r.job_category.length > 60) reasons.push('job_category is missing or too long');
    if (r.employee_number.length > 30) reasons.push('employee_number is longer than 30 characters');
    const worker = workerNumber(r.worker_id, company.key);
    if (worker === false || (worker && !onFile.has(worker))) {
      reasons.push(`worker_id "${r.worker_id}" is not one of your workers. Leave it empty for a new worker.`);
    }
    const site = r.site_name ? siteByName.get(r.site_name.toLowerCase()) : null;
    if (r.site_name && !site) reasons.push(`no site named "${r.site_name}"`);
    if (reasons.length) {
      invalid.push({ row: r.row, reason: reasons.join('; ') });
      continue;
    }
    if (worker) {
      duplicates.push({
        row: r.row,
        employee_number: r.employee_number || null,
        worker_id: displayId.format(company.key, 'employee', worker),
        reason: 'Already on file with this worker ID',
      });
      continue;
    }
    if (r.employee_number && (taken.has(r.employee_number) || seen.has(r.employee_number))) {
      duplicates.push({
        row: r.row,
        employee_number: r.employee_number,
        reason: taken.has(r.employee_number) ? 'Worker number already exists' : 'Worker number repeated in the file',
      });
      continue;
    }
    if (!r.employee_number) {
      const key = personKey(r.full_name, r.job_category);
      let warning = null;
      if (knownPeople.has(key)) warning = 'An employee with this name and job category is already on file';
      else if (seenPeople.has(key)) warning = 'The same name and job category appear earlier in this file';
      unchecked.push({ row: r.row, full_name: r.full_name, warning });
      seenPeople.add(key);
    }
    if (r.employee_number) seen.add(r.employee_number);
    valid.push({ ...r, job_category: r.job_category.toLowerCase(), site_id: site ? site.id : null });
  }
  return { valid, invalid, duplicates, unchecked, companyKey: company.key };
}

async function preview(auth, file, columnMap) {
  const { valid, invalid, duplicates, unchecked, companyKey } = await check(auth.db, readFile(file, columnMap), auth);
  // The IDs the rows would get if imported now, in file order. Another employee added
  // in between moves them on by one, so the screen calls them expected.
  const counter = await auth.db.idCounter.findUnique({ where: { companyId: auth.companyId }, select: { employeeLast: true } });
  const last = counter ? counter.employeeLast : 100000;
  return {
    total_rows: valid.length + invalid.length + duplicates.length,
    valid_rows: valid.map(({ row, full_name, employee_number, job_category, site_name }, i) => ({
      row,
      full_name,
      employee_number: employee_number || null,
      job_category,
      site_name: site_name || null,
      expected_worker_id: displayId.format(companyKey, 'employee', last + i + 1),
    })),
    invalid_rows: invalid,
    duplicates,
    unchecked_rows: unchecked,
  };
}

async function commit(auth, file, columnMap) {
  const rows = readFile(file, columnMap);
  return auth.db.$transaction(async (tx) => {
    const { valid, invalid, duplicates, companyKey } = await check(tx, rows, auth);
    for (const category of new Set(valid.map((r) => r.job_category))) {
      await ensureCategory(tx, category);
    }
    let added = [];
    if (valid.length) {
      added = await tx.employee.createManyAndReturn({
        data: valid.map((r) => ({
          fullName: r.full_name,
          employeeNumber: r.employee_number || null,
          jobCategory: r.job_category,
          siteId: r.site_id,
        })),
        select: { displayNumber: true },
      });
    }
    // The trigger numbers the rows in the order they were sent, so the numbers,
    // sorted, line up with `valid`.
    const numbers = added.map((e) => e.displayNumber).sort((a, b) => a - b);
    const employees = valid.map((r, i) => ({
      row: r.row,
      worker_id: displayId.format(companyKey, 'employee', numbers[i]),
      full_name: r.full_name,
      employee_number: r.employee_number || null,
      job_category: r.job_category,
      site_name: r.site_name || null,
    }));
    return { created: valid.length, employees, skipped: duplicates, errors: invalid };
  });
}

module.exports = { preview, commit, TEMPLATE };
