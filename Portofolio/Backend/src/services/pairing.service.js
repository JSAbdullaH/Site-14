const config = require('../config');
const { prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { sha256 } = require('../utils/tokens');
const { detectDevice, defaultName } = require('../utils/userAgent');
const { FIELDS, TYPE_PREFIX, toPublic, newKey, randomChars, uniqueSerials } = require('../models/device.model');

const CODE_LENGTH = 8;
const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

const notFound = () => new AppError(404, 'PAIRING_NOT_FOUND', 'This pairing code is not valid. Ask for a new one.');
const expired = () => new AppError(410, 'PAIRING_EXPIRED', 'This pairing code has expired. Ask for a new one.');
const used = () => new AppError(409, 'PAIRING_USED', 'This pairing code was already used to connect a device.');

const format = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

function normalize(input) {
  const code = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

const isExpired = (p, now = new Date()) => p.status === 'pending' && p.expiresAt <= now;

const statusOf = (p) => (isExpired(p) ? 'expired' : p.status);

const PAIRING_FIELDS = {
  id: true,
  status: true,
  label: true,
  expiresAt: true,
  claimedAt: true,
  createdAt: true,
  employee: { select: { id: true, fullName: true } },
  device: { select: FIELDS },
};

function toPublicPairing(p) {
  return {
    id: p.id,
    status: statusOf(p),
    label: p.label,
    employee: p.employee ? { id: p.employee.id, full_name: p.employee.fullName } : null,
    device: p.device ? toPublic(p.device) : null,
    expires_at: p.expiresAt.toISOString(),
    claimed_at: p.claimedAt ? p.claimedAt.toISOString() : null,
    created_at: p.createdAt.toISOString(),
  };
}

async function checkEmployee(db, employeeId) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { status: true, fullName: true, device: { select: { serialNumber: true } } },
  });
  if (!employee) throw new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { employee_id: 'Employee not found' });
  if (employee.status !== 'active') throw new AppError(409, 'EMPLOYEE_INACTIVE', 'This employee is deactivated and cannot carry a device');
  if (employee.device) {
    throw new AppError(409, 'EMPLOYEE_HAS_DEVICE', `${employee.fullName} already carries ${employee.device.serialNumber}. Unassign it first.`);
  }
}

async function create(auth, input) {
  if (input.employee_id) await checkEmployee(auth.db, input.employee_id);

  const expiresAt = new Date(Date.now() + config.PAIRING_TTL_MINUTES * 60_000);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomChars(CODE_LENGTH);
    const taken = await prisma.devicePairing.count({ where: { codeHash: sha256(code) } });
    if (taken) continue;
    const pairing = await auth.db.devicePairing.create({
      data: {
        createdBy: auth.userId,
        employeeId: input.employee_id ?? null,
        label: input.label ?? null,
        codeHash: sha256(code),
        expiresAt,
      },
      select: PAIRING_FIELDS,
    });
    return { ...toPublicPairing(pairing), code: format(code) };
  }
  throw new AppError(503, 'PAIRING_UNAVAILABLE', 'Could not create a pairing code. Try again.');
}

async function get(auth, id) {
  const pairing = await auth.db.devicePairing.findUnique({ where: { id }, select: PAIRING_FIELDS });
  if (!pairing) throw new AppError(404, 'NOT_FOUND', 'Pairing not found');
  return toPublicPairing(pairing);
}

async function listPending(auth) {
  const rows = await auth.db.devicePairing.findMany({
    where: { status: 'pending', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: PAIRING_FIELDS,
  });
  return { data: rows.map(toPublicPairing) };
}

async function cancel(auth, id) {
  const { count } = await auth.db.devicePairing.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled' } });
  if (!count) throw new AppError(409, 'PAIRING_CLOSED', 'This pairing is no longer waiting for a device');
}

async function findByCode(db, input) {
  const code = normalize(input);
  if (!code) throw notFound();
  const pairing = await db.devicePairing.findUnique({
    where: { codeHash: sha256(code) },
    select: {
      id: true,
      companyId: true,
      employeeId: true,
      label: true,
      status: true,
      expiresAt: true,
      company: { select: { name: true } },
      employee: { select: { fullName: true } },
    },
  });
  if (!pairing || pairing.status === 'cancelled') throw notFound();
  if (pairing.status === 'claimed') throw used();
  if (isExpired(pairing)) throw expired();
  return pairing;
}

async function lookup(input) {
  const p = await findByCode(prisma, input);
  return {
    company_name: p.company.name,
    employee: p.employee ? { full_name: p.employee.fullName } : null,
    label: p.label,
    expires_at: p.expiresAt.toISOString(),
  };
}

async function claim(input, reported, headers) {
  const detected = detectDevice(headers, reported);
  const name = reported.name || defaultName(detected);

  return prisma.$transaction(async (tx) => {
    const found = await findByCode(tx, input);
    const [locked] = await tx.$queryRaw`SELECT status FROM device_pairings WHERE id = ${found.id}::uuid FOR UPDATE`;
    if (locked.status !== 'pending') throw used();

    let employeeId = null;
    if (found.employeeId) {
      const employee = await tx.employee.findUnique({
        where: { id: found.employeeId },
        select: { status: true, device: { select: { id: true } } },
      });
      if (employee && employee.status === 'active' && !employee.device) employeeId = found.employeeId;
    }

    const [serialNumber] = await uniqueSerials(tx, TYPE_PREFIX[detected.deviceType], 1);
    const { apiKey, apiKeyHash } = newKey();
    const now = new Date();
    const device = await tx.device.create({
      data: {
        companyId: found.companyId,
        employeeId,
        serialNumber,
        apiKeyHash,
        source: 'paired',
        deviceType: detected.deviceType,
        name: found.label || name,
        manufacturer: detected.manufacturer,
        model: detected.model,
        osName: detected.osName,
        osVersion: detected.osVersion,
        browser: detected.browser,
        userAgent: detected.userAgent,
        lastBatteryPercent: reported.battery_percent ?? null,
        pairedAt: now,
        lastSeenAt: now,
      },
      select: FIELDS,
    });
    await tx.devicePairing.update({ where: { id: found.id }, data: { status: 'claimed', claimedAt: now, deviceId: device.id } });

    return {
      company_name: found.company.name,
      serial_number: serialNumber,
      api_key: apiKey,
      device: toPublic(device),
    };
  });
}

module.exports = { create, get, listPending, cancel, lookup, claim, normalize };
