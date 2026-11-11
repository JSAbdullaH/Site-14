const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { DEVICE_TYPES } = require('../utils/userAgent');
const { FIELDS, toPublic, newKey, healthWhere, ONLINE_WINDOW_MS } = require('../models/device.model');
const { PRODUCT_FIELDS, ORDER_FIELDS, toPublicProduct, toPublicOrder } = require('./marketplace.service');

const DAY = 24 * 60 * 60_000;
const RIYADH_OFFSET = 3 * 60 * 60_000;
const LOW_STOCK = 5;

const orderNotFound = () => new AppError(404, 'NOT_FOUND', 'Order not found');
const isUniqueViolation = (err) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const countBy = (rows, key, keys) => {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) out[row[key]] = row._count._all;
  return out;
};

async function overview() {
  const now = Date.now();
  const cutoff = new Date(now - ONLINE_WINDOW_MS);
  const monthAgo = new Date(now - 30 * DAY);
  const paid = { status: { not: 'cancelled' } };
  const todayRiyadh = Math.floor((now + RIYADH_OFFSET) / DAY) * DAY;
  const seriesStart = new Date(todayRiyadh - 13 * DAY - RIYADH_OFFSET);

  const [
    companies,
    newCompanies,
    users,
    employees,
    devices,
    online,
    devicesByType,
    devicesBySource,
    ordersByStatus,
    revenue,
    revenue30,
    recentOrders,
    lowStock,
    daily,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.employee.count({ where: { status: 'active' } }),
    prisma.device.count({ where: { isActive: true } }),
    prisma.device.count({ where: { isActive: true, lastSeenAt: { gte: cutoff } } }),
    prisma.device.groupBy({ by: ['deviceType'], where: { isActive: true }, _count: { _all: true } }),
    prisma.device.groupBy({ by: ['source'], where: { isActive: true }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.aggregate({ where: paid, _sum: { totalHalalas: true } }),
    prisma.order.aggregate({ where: { ...paid, createdAt: { gte: monthAgo } }, _sum: { totalHalalas: true } }),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: ORDER_FIELDS }),
    prisma.product.findMany({ where: { isActive: true, stock: { lte: LOW_STOCK } }, orderBy: { stock: 'asc' }, select: PRODUCT_FIELDS }),
    prisma.$queryRaw`
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM-DD') AS day,
             count(*)::int AS orders,
             coalesce(sum(total_halalas), 0)::bigint AS revenue
        FROM orders
       WHERE status <> 'cancelled' AND created_at >= ${seriesStart}
       GROUP BY 1
       ORDER BY 1`,
  ]);

  const byDay = new Map(daily.map((r) => [r.day, r]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(todayRiyadh - (13 - i) * DAY).toISOString().slice(0, 10);
    const row = byDay.get(day);
    return { day, orders: row ? row.orders : 0, revenue_halalas: row ? Number(row.revenue) : 0 };
  });

  return {
    companies: { total: companies, new_30d: newCompanies },
    users: { active: users },
    employees: { active: employees },
    devices: {
      active: devices,
      online,
      by_type: countBy(devicesByType, 'deviceType', DEVICE_TYPES),
      by_source: countBy(devicesBySource, 'source', ['registered', 'paired', 'marketplace']),
    },
    orders: {
      by_status: countBy(ordersByStatus, 'status', ['placed', 'shipped', 'delivered', 'cancelled']),
      revenue_halalas: revenue._sum.totalHalalas || 0,
      revenue_30d_halalas: revenue30._sum.totalHalalas || 0,
      daily: series,
      recent: recentOrders.map(toPublicOrder),
    },
    low_stock: lowStock.map((p) => toPublicProduct(p, { internal: true })),
  };
}

async function companies(q) {
  const where = q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {};
  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        name: true,
        commercialRegistration: true,
        createdAt: true,
        _count: { select: { users: true, employees: true, sites: true, devices: true, orders: true } },
        users: { where: { role: 'company_admin' }, orderBy: { createdAt: 'asc' }, take: 1, select: { fullName: true, email: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  const ids = rows.map((c) => c.id);
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [online, spend] = await Promise.all([
    prisma.device.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, isActive: true, lastSeenAt: { gte: cutoff } }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, status: { not: 'cancelled' } }, _sum: { totalHalalas: true } }),
  ]);
  const onlineBy = new Map(online.map((r) => [r.companyId, r._count._all]));
  const spendBy = new Map(spend.map((r) => [r.companyId, r._sum.totalHalalas || 0]));

  return {
    data: rows.map((c) => ({
      id: c.id,
      name: c.name,
      commercial_registration: c.commercialRegistration,
      owner: c.users[0] ? { full_name: c.users[0].fullName, email: c.users[0].email } : null,
      users: c._count.users,
      employees: c._count.employees,
      sites: c._count.sites,
      devices: c._count.devices,
      devices_online: onlineBy.get(c.id) || 0,
      orders: c._count.orders,
      spent_halalas: spendBy.get(c.id) || 0,
      created_at: c.createdAt.toISOString(),
    })),
    page: q.page,
    limit: q.limit,
    total,
  };
}

async function devices(q) {
  const where = {
    AND: [
      q.type ? { deviceType: q.type } : {},
      q.company_id ? { companyId: q.company_id } : {},
      q.health ? healthWhere(q.health) : {},
      q.search
        ? {
            OR: [
              { serialNumber: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
              { model: { contains: q.search, mode: 'insensitive' } },
              { company: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.device.findMany({
      where,
      orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: { ...FIELDS, company: { select: { id: true, name: true } } },
    }),
    prisma.device.count({ where }),
  ]);
  return { data: rows.map((d) => ({ ...toPublic(d), company: d.company })), page: q.page, limit: q.limit, total };
}

async function listProducts() {
  const rows = await prisma.product.findMany({ orderBy: [{ isActive: 'desc' }, { deviceType: 'asc' }, { name: 'asc' }], select: PRODUCT_FIELDS });
  return { data: rows.map((p) => toPublicProduct(p, { internal: true })) };
}

function productData(input) {
  const map = {
    name: 'name',
    description: 'description',
    device_type: 'deviceType',
    manufacturer: 'manufacturer',
    model: 'model',
    serial_prefix: 'serialPrefix',
    price_halalas: 'priceHalalas',
    stock: 'stock',
    features: 'features',
    image_url: 'imageUrl',
    is_active: 'isActive',
  };
  return Object.fromEntries(Object.entries(input).filter(([k]) => map[k]).map(([k, v]) => [map[k], v]));
}

async function createProduct(input) {
  try {
    const product = await prisma.product.create({ data: { sku: input.sku, ...productData(input) }, select: PRODUCT_FIELDS });
    return toPublicProduct(product, { internal: true });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'SKU_TAKEN', 'A product with this SKU already exists', { sku: 'This SKU is already used' });
    throw err;
  }
}

async function updateProduct(id, input) {
  const product = await prisma.product.update({ where: { id }, data: productData(input), select: PRODUCT_FIELDS });
  return toPublicProduct(product, { internal: true });
}

async function listOrders(q) {
  const where = {
    AND: [
      q.status ? { status: q.status } : {},
      q.search
        ? {
            OR: [
              { referenceNumber: { contains: q.search, mode: 'insensitive' } },
              { company: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit, select: ORDER_FIELDS }),
    prisma.order.count({ where }),
  ]);
  return { data: rows.map(toPublicOrder), page: q.page, limit: q.limit, total };
}

async function getOrder(id) {
  const order = await prisma.order.findUnique({ where: { id }, select: ORDER_FIELDS });
  if (!order) throw orderNotFound();
  return toPublicOrder(order);
}

async function transition(tx, id, from, data) {
  const { count } = await tx.order.updateMany({ where: { id, status: from }, data });
  if (count) return;
  const order = await tx.order.findUnique({ where: { id }, select: { status: true } });
  if (!order) throw orderNotFound();
  throw new AppError(409, 'INVALID_ORDER_STATUS', `This order is ${order.status} and cannot be changed this way`);
}

async function shipOrder(id) {
  const keys = await prisma.$transaction(async (tx) => {
    await transition(tx, id, 'placed', { status: 'shipped', shippedAt: new Date() });
    const units = await tx.device.findMany({
      where: { orderItem: { orderId: id } },
      orderBy: { serialNumber: 'asc' },
      select: { id: true, serialNumber: true, deviceType: true, name: true },
    });
    const out = [];
    for (const unit of units) {
      const { apiKey, apiKeyHash } = newKey();
      await tx.device.update({ where: { id: unit.id }, data: { apiKeyHash } });
      out.push({ serial_number: unit.serialNumber, device_type: unit.deviceType, name: unit.name, api_key: apiKey });
    }
    return out;
  });
  return { order: await getOrder(id), keys };
}

async function deliverOrder(id) {
  await prisma.$transaction((tx) => transition(tx, id, 'shipped', { status: 'delivered', deliveredAt: new Date() }));
  return getOrder(id);
}

async function cancelOrder(id) {
  await prisma.$transaction(async (tx) => {
    await transition(tx, id, 'placed', { status: 'cancelled', cancelledAt: new Date() });
    const items = await tx.orderItem.findMany({ where: { orderId: id }, select: { id: true, productId: true, quantity: true } });
    await tx.device.deleteMany({ where: { orderItemId: { in: items.map((i) => i.id) } } });
    for (const item of items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
  });
  return getOrder(id);
}

module.exports = {
  overview,
  companies,
  devices,
  listProducts,
  createProduct,
  updateProduct,
  listOrders,
  getOrder,
  shipOrder,
  deliverOrder,
  cancelOrder,
};
