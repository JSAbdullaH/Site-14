const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { FIELDS, toPublic, newKey, healthWhere, ONLINE_WINDOW_MS } = require('../models/device.model');
const { DEVICE_TYPES } = require('../utils/userAgent');

const notFound = () => new AppError(404, 'NOT_FOUND', 'Device not found');
const invalid = (field, message) => new AppError(422, 'VALIDATION_ERROR', 'One or more fields are invalid', { [field]: message });
const isUniqueViolation = (err) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const serialTaken = (serials) =>
  new AppError(409, 'SERIAL_TAKEN', 'A device with this serial number is already registered', {
    serial_numbers: `Already registered: ${serials.join(', ')}`,
  });

function filters(q) {
  return {
    AND: [
      q.status !== 'all' ? { isActive: q.status === 'active' } : {},
      q.assigned !== undefined ? { employeeId: q.assigned ? { not: null } : null } : {},
      q.type ? { deviceType: q.type } : {},
      q.source ? { source: q.source } : {},
      q.health ? healthWhere(q.health) : {},
      q.search
        ? {
            OR: [
              { serialNumber: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
              { model: { contains: q.search, mode: 'insensitive' } },
              { employee: { fullName: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {},
    ],
  };
}

async function list(auth, q) {
  const where = filters(q);
  const [rows, total] = await Promise.all([
    auth.db.device.findMany({
      where,
      select: FIELDS,
      orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { serialNumber: 'asc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    auth.db.device.count({ where }),
  ]);
  return { data: rows.map(toPublic), page: q.page, limit: q.limit, total };
}

async function summary(auth) {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [active, inactive, online, never, unassigned, byType, inTransit, pendingPairings] = await Promise.all([
    auth.db.device.count({ where: { isActive: true } }),
    auth.db.device.count({ where: { isActive: false } }),
    auth.db.device.count({ where: { isActive: true, lastSeenAt: { gte: cutoff } } }),
    auth.db.device.count({ where: { isActive: true, lastSeenAt: null } }),
    auth.db.device.count({ where: { isActive: true, employeeId: null } }),
    auth.db.device.groupBy({ by: ['deviceType'], where: { isActive: true }, _count: { _all: true } }),
    auth.db.device.count({ where: { orderItem: { order: { status: { in: ['placed', 'shipped'] } } } } }),
    auth.db.devicePairing.count({ where: { status: 'pending', expiresAt: { gt: new Date() } } }),
  ]);
  const types = Object.fromEntries(DEVICE_TYPES.map((t) => [t, 0]));
  for (const row of byType) types[row.deviceType] = row._count._all;
  return {
    active,
    online,
    offline: active - online - never,
    never,
    unassigned,
    inactive,
    in_transit: inTransit,
    pending_pairings: pendingPairings,
    by_type: types,
  };
}

async function register(auth, serials, deviceType, name) {
  const repeated = [...new Set(serials.filter((s, i) => serials.indexOf(s) !== i))];
  if (repeated.length) throw invalid('serial_numbers', `Listed more than once: ${repeated.join(', ')}`);

  const taken = await prisma.device.findMany({ where: { serialNumber: { in: serials } }, select: { serialNumber: true } });
  if (taken.length) throw serialTaken(taken.map((d) => d.serialNumber).sort());

  const keys = serials.map(() => newKey());
  try {
    const created = await auth.db.device.createManyAndReturn({
      data: serials.map((serialNumber, i) => ({
        serialNumber,
        apiKeyHash: keys[i].apiKeyHash,
        deviceType,
        source: 'registered',
        name: name ?? null,
      })),
      select: { id: true, serialNumber: true },
    });
    const ids = new Map(created.map((d) => [d.serialNumber, d.id]));
    const rows = await auth.db.device.findMany({ where: { id: { in: [...ids.values()] } }, select: FIELDS });
    const byId = new Map(rows.map((d) => [d.id, d]));
    return serials.map((serial, i) => ({ ...toPublic(byId.get(ids.get(serial))), api_key: keys[i].apiKey }));
  } catch (err) {
    if (isUniqueViolation(err)) throw serialTaken(serials);
    throw err;
  }
}

async function create(auth, input) {
  try {
    const [device] = await register(auth, [input.serial_number], input.device_type, input.name);
    return device;
  } catch (err) {
    if (err instanceof AppError && err.code === 'SERIAL_TAKEN') {
      throw new AppError(409, 'SERIAL_TAKEN', err.message, { serial_number: 'This serial number is already registered' });
    }
    throw err;
  }
}

async function createBatch(auth, input) {
  const data = await register(auth, input.serial_numbers, input.device_type);
  return { created: data.length, data };
}

async function get(auth, id) {
  const device = await auth.db.device.findUnique({ where: { id }, select: FIELDS });
  if (!device) throw notFound();
  return toPublic(device);
}

async function checkEmployee(db, deviceId, employeeId) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { status: true, device: { select: { id: true, serialNumber: true } } },
  });
  if (!employee) throw invalid('employee_id', 'Employee not found');
  if (employee.status !== 'active') {
    throw new AppError(409, 'EMPLOYEE_INACTIVE', 'This employee is deactivated and cannot carry a device');
  }
  if (employee.device && employee.device.id !== deviceId) {
    throw new AppError(409, 'EMPLOYEE_HAS_DEVICE', `This employee already carries ${employee.device.serialNumber}. Unassign it first.`);
  }
}

async function update(auth, id, input) {
  const current = await auth.db.device.findUnique({
    where: { id },
    select: { employeeId: true, isActive: true, source: true, workSessions: { where: { endedAt: null }, select: { id: true } } },
  });
  if (!current) throw notFound();

  const willBeActive = input.is_active ?? current.isActive;
  const employeeId = willBeActive ? (input.employee_id !== undefined ? input.employee_id : current.employeeId) : null;

  if (employeeId !== current.employeeId && current.workSessions.length) {
    throw new AppError(409, 'ON_SHIFT', 'The wearer is on site. Change the device after the shift ends.');
  }
  if (input.employee_id && !willBeActive) {
    throw new AppError(409, 'DEVICE_INACTIVE', 'Reactivate the device before assigning it');
  }
  if (input.device_type && current.source !== 'registered') {
    throw new AppError(409, 'TYPE_LOCKED', 'The type of a paired or purchased device is detected and cannot be changed');
  }
  if (employeeId && employeeId !== current.employeeId) await checkEmployee(auth.db, id, employeeId);

  try {
    const device = await auth.db.device.update({
      where: { id },
      data: {
        employeeId,
        isActive: willBeActive,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.device_type && { deviceType: input.device_type }),
      },
      select: FIELDS,
    });
    return toPublic(device);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'EMPLOYEE_HAS_DEVICE', 'This employee already carries another device. Unassign it first.');
    }
    throw err;
  }
}

async function rotateKey(auth, id) {
  const current = await auth.db.device.findUnique({
    where: { id },
    select: { orderItem: { select: { order: { select: { status: true } } } } },
  });
  if (!current) throw notFound();
  const status = current.orderItem?.order.status;
  if (status === 'placed' || status === 'shipped') {
    throw new AppError(409, 'IN_TRANSIT', 'This device is on its way to you with its key already loaded. Wait until it is delivered.');
  }
  const { apiKey, apiKeyHash } = newKey();
  const device = await auth.db.device.update({ where: { id }, data: { apiKeyHash }, select: FIELDS });
  return { ...toPublic(device), api_key: apiKey };
}

async function remove(auth, id) {
  const device = await auth.db.device.findUnique({
    where: { id },
    select: { source: true, _count: { select: { workSessions: true } } },
  });
  if (!device) throw notFound();
  if (device.source === 'marketplace') {
    throw new AppError(409, 'PURCHASED_DEVICE', 'A purchased device stays in your inventory. Deactivate it instead.');
  }
  if (device._count.workSessions) {
    throw new AppError(409, 'HAS_HISTORY', 'This device has recorded shifts, so it is kept for the records. Deactivate it instead.');
  }
  await auth.db.device.delete({ where: { id } });
}

module.exports = { list, summary, get, create, createBatch, update, rotateKey, remove };
