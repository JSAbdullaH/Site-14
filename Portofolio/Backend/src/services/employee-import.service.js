const { parse } = require('csv-parse/sync');
const AppError = require('../utils/AppError');
const { ensureCategory } = require('./employee.service');

const FIELDS = ['full_name', 'employee_number', 'job_category', 'site_name'];
const REQUIRED = ['full_name', 'job_category'];
const MAX_ROWS = 1000;

const TEMPLATE = `${FIELDS.join(',')}\n`;

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

async function check(db, rows) {
  const numbers = rows.map((r) => r.employee_number).filter(Boolean);
  const [sites, existing] = await Promise.all([
    db.site.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { employeeNumber: { in: numbers } }, select: { employeeNumber: true } }),
  ]);
  const siteByName = new Map(sites.map((s) => [s.name.toLowerCase(), s]));
  const taken = new Set(existing.map((e) => e.employeeNumber));
  const seen = new Set();

  const valid = [];
  const invalid = [];
  const duplicates = [];
  for (const r of rows) {
    const reasons = [];
    if (r.full_name.length < 2 || r.full_name.length > 120) reasons.push('full_name is missing or too long');
    if (r.job_category.length < 2 || r.job_category.length > 60) reasons.push('job_category is missing or too long');
    if (r.employee_number.length > 30) reasons.push('employee_number is longer than 30 characters');
    const site = r.site_name ? siteByName.get(r.site_name.toLowerCase()) : null;
    if (r.site_name && !site) reasons.push(`no site named "${r.site_name}"`);
    if (reasons.length) {
      invalid.push({ row: r.row, reason: reasons.join('; ') });
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
    if (r.employee_number) seen.add(r.employee_number);
    valid.push({ ...r, job_category: r.job_category.toLowerCase(), site_id: site ? site.id : null });
  }
  return { valid, invalid, duplicates };
}

async function preview(auth, file, columnMap) {
  const { valid, invalid, duplicates } = await check(auth.db, readFile(file, columnMap));
  return {
    total_rows: valid.length + invalid.length + duplicates.length,
    valid_rows: valid.map(({ row, full_name, employee_number, job_category, site_name }) => ({
      row,
      full_name,
      employee_number: employee_number || null,
      job_category,
      site_name: site_name || null,
    })),
    invalid_rows: invalid,
    duplicates,
  };
}

async function commit(auth, file, columnMap) {
  const rows = readFile(file, columnMap);
  return auth.db.$transaction(async (tx) => {
    const { valid, invalid, duplicates } = await check(tx, rows);
    for (const category of new Set(valid.map((r) => r.job_category))) {
      await ensureCategory(tx, category);
    }
    if (valid.length) {
      await tx.employee.createMany({
        data: valid.map((r) => ({
          fullName: r.full_name,
          employeeNumber: r.employee_number || null,
          jobCategory: r.job_category,
          siteId: r.site_id,
        })),
      });
    }
    return { created: valid.length, skipped: duplicates, errors: invalid };
  });
}

module.exports = { preview, commit, TEMPLATE };
