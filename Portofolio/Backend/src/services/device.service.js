const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { sha256, randomToken } = require('../utils/tokens');

const notFound = () => new AppError(404, 'NOT_FOUND', 'Device not found');
const invalid = (field, message) => new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { [field]: message });

const FIELDS = {
  id: true,
  serialNumber: true,
  isActive: true,
  createdAt: true,
  lastSeenAt: true,
  lastRecordedAt: true,
  clockOffsetSeconds: true,
  employee: { select: { id: true, fullName: true, site: { select: { id: true, name: true } } } },
};

const iso = (d) => (d ? d.toISOString() : null);

function toPublic(d) {
  return {
    id: d.id,
    serial_number: d.serialNumber,
    is_active: d.isActive,
    employee: d.employee ? { id: d.employee.id, full_name: d.employee.fullName, site: d.employee.site } : null,
    last_seen_at: iso(d.lastSeenAt),
    last_recorded_at: iso(d.lastRecordedAt),
    clock_offset_seconds: d.clockOffsetSeconds,
    created_at: d.createdAt.toISOString(),
  };
}

// The key is shown once, when it is made. Only its hash is stored, like a password.
function newKey() {
  const apiKey = `dk_${randomToken()}`;
  return { apiKey, apiKeyHash: sha256(apiKey) };
}

const serialTaken = (serials) =>
  new AppError(409, 'SERIAL_TAKEN', 'A device with this serial number is already registered', {
    serial_numbers: `Already registered: ${serials.join(', ')}`,
  });

async function list(auth, q) {
  const where = {
    ...(q.status !== 'all' && { isActive: q.status === 'active' }),
    ...(q.assigned !== undefined && { employeeId: q.assigned ? { not: null } : null }),
    ...(q.search && {
      OR: [
        { serialNumber: { contains: q.search, mode: 'insensitive' } },
        { employee: { fullName: { contains: q.search, mode: 'insensitive' } } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    auth.db.device.findMany({
      where,
      select: FIELDS,
      orderBy: [{ serialNumber: 'asc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    auth.db.device.count({ where }),
  ]);
  return { data: rows.map(toPublic), page: q.page, limit: q.limit, total };
}

// Registers every serial or none, so a half-registered batch never needs cleaning up.
async function register(auth, serials) {
  const repeated = [...new Set(serials.filter((s, i) => serials.indexOf(s) !== i))];
  if (repeated.length) throw invalid('serial_numbers', `Listed more than once: ${repeated.join(', ')}`);

  // Serials are unique across all companies, so look outside this one. Which company holds it is not said.
  const taken = await prisma.device.findMany({ where: { serialNumber: { in: serials } }, select: { serialNumber: true } });
  if (taken.length) throw serialTaken(taken.map((d) => d.serialNumber).sort());

  const keys = serials.map(() => newKey());
  try {
    const created = await auth.db.device.createManyAndReturn({
      data: serials.map((serialNumber, i) => ({ serialNumber, apiKeyHash: keys[i].apiKeyHash })),
      select: { id: true, serialNumber: true },
    });
    const ids = new Map(created.map((d) => [d.serialNumber, d.id]));
    const rows = await auth.db.device.findMany({ where: { id: { in: [...ids.values()] } }, select: FIELDS });
    const byId = new Map(rows.map((d) => [d.id, d]));
    return serials.map((serial, i) => ({ ...toPublic(byId.get(ids.get(serial))), api_key: keys[i].apiKey }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw serialTaken(serials);
    throw err;
  }
}

async function create(auth, input) {
  try {
    const [device] = await register(auth, [input.serial_number]);
    return device;
  } catch (err) {
    if (err instanceof AppError && err.code === 'SERIAL_TAKEN') {
      throw new AppError(409, 'SERIAL_TAKEN', err.message, { serial_number: 'This serial number is already registered' });
    }
    throw err;
  }
}

async function createBatch(auth, input) {
  const data = await register(auth, input.serial_numbers);
  return { created: data.length, data };
}

async function checkEmployee(db, deviceId, employeeId) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { status: true, device: { select: { id: true, serialNumber: true } } },
  });
  if (!employee) throw invalid('employee_id', 'Employee not found');
  if (employee.status !== 'active') {
    throw new AppError(409, 'EMPLOYEE_INACTIVE', 'This employee is deactivated and cannot wear a device');
  }
  if (employee.device && employee.device.id !== deviceId) {
    throw new AppError(409, 'EMPLOYEE_HAS_DEVICE', `This employee already wears ${employee.device.serialNumber}. Unassign it first.`);
  }
}

async function update(auth, id, input) {
  const current = await auth.db.device.findUnique({
    where: { id },
    select: { employeeId: true, isActive: true, workSessions: { where: { endedAt: null }, select: { id: true } } },
  });
  if (!current) throw notFound();

  const willBeActive = input.is_active ?? current.isActive;
  const employeeId = willBeActive ? (input.employee_id !== undefined ? input.employee_id : current.employeeId) : null;

  // Hours already counted belong to the session's wearer, so the wearer cannot change mid-shift.
  if (employeeId !== current.employeeId && current.workSessions.length) {
    throw new AppError(409, 'ON_SHIFT', 'The wearer is on site. Change the device after the shift ends.');
  }
  if (input.employee_id && !willBeActive) {
    throw new AppError(409, 'DEVICE_INACTIVE', 'Reactivate the device before assigning it');
  }
  if (employeeId && employeeId !== current.employeeId) await checkEmployee(auth.db, id, employeeId);

  try {
    const device = await auth.db.device.update({
      where: { id },
      data: { employeeId, isActive: willBeActive },
      select: FIELDS,
    });
    return toPublic(device);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMPLOYEE_HAS_DEVICE', 'This employee already wears another device. Unassign it first.');
    }
    throw err;
  }
}

// For a lost or leaked key. The old key stops working at once.
async function rotateKey(auth, id) {
  const { apiKey, apiKeyHash } = newKey();
  const device = await auth.db.device.update({ where: { id }, data: { apiKeyHash }, select: FIELDS });
  return { ...toPublic(device), api_key: apiKey };
}

module.exports = { list, create, createBatch, update, rotateKey };
