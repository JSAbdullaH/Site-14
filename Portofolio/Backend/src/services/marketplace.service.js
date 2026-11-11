const crypto = require('node:crypto');
const config = require('../config');
const { prisma, Prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const { sha256, randomToken } = require('../utils/tokens');
const { uniqueSerials } = require('../models/device.model');

const PRODUCT_FIELDS = {
  id: true,
  sku: true,
  name: true,
  description: true,
  deviceType: true,
  manufacturer: true,
  model: true,
  serialPrefix: true,
  priceHalalas: true,
  stock: true,
  features: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const ORDER_FIELDS = {
  id: true,
  referenceNumber: true,
  status: true,
  subtotalHalalas: true,
  vatHalalas: true,
  totalHalalas: true,
  shippingAddress: true,
  contactPhone: true,
  notes: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
  creator: { select: { id: true, fullName: true, email: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      quantity: true,
      unitPriceHalalas: true,
      product: { select: { deviceType: true, sku: true } },
      devices: { select: { id: true, serialNumber: true, employeeId: true, lastSeenAt: true }, orderBy: { serialNumber: 'asc' } },
    },
  },
};

const iso = (d) => (d ? d.toISOString() : null);

function toPublicProduct(p, { internal = false } = {}) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    device_type: p.deviceType,
    manufacturer: p.manufacturer,
    model: p.model,
    price_halalas: p.priceHalalas,
    in_stock: p.stock > 0,
    stock: p.stock,
    features: Array.isArray(p.features) ? p.features : [],
    image_url: p.imageUrl,
    ...(internal && {
      serial_prefix: p.serialPrefix,
      is_active: p.isActive,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString(),
    }),
  };
}

function toPublicOrder(o) {
  return {
    id: o.id,
    reference_number: o.referenceNumber,
    status: o.status,
    company: o.company,
    placed_by: o.creator ? { id: o.creator.id, full_name: o.creator.fullName, email: o.creator.email } : null,
    subtotal_halalas: o.subtotalHalalas,
    vat_halalas: o.vatHalalas,
    total_halalas: o.totalHalalas,
    shipping_address: o.shippingAddress,
    contact_phone: o.contactPhone,
    notes: o.notes,
    device_count: o.items.reduce((n, i) => n + i.quantity, 0),
    items: o.items.map((i) => ({
      id: i.id,
      product_id: i.productId,
      product_name: i.productName,
      device_type: i.product.deviceType,
      sku: i.product.sku,
      quantity: i.quantity,
      unit_price_halalas: i.unitPriceHalalas,
      line_total_halalas: i.unitPriceHalalas * i.quantity,
      devices: i.devices.map((d) => ({
        id: d.id,
        serial_number: d.serialNumber,
        assigned: Boolean(d.employeeId),
        connected: Boolean(d.lastSeenAt),
      })),
    })),
    shipped_at: iso(o.shippedAt),
    delivered_at: iso(o.deliveredAt),
    cancelled_at: iso(o.cancelledAt),
    created_at: o.createdAt.toISOString(),
  };
}

function referenceNumber(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `SITE14-O-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function listProducts() {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ deviceType: 'asc' }, { priceHalalas: 'asc' }],
    select: PRODUCT_FIELDS,
  });
  return { data: rows.map((p) => toPublicProduct(p)), vat_percent: config.VAT_PERCENT };
}

function mergeItems(items) {
  const quantities = new Map();
  for (const item of items) quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

async function placeOrder(auth, input) {
  const items = mergeItems(input.items);
  const ids = items.map((i) => i.productId);

  const orderId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
    const products = await tx.product.findMany({ where: { id: { in: ids } }, select: PRODUCT_FIELDS });
    const byId = new Map(products.map((p) => [p.id, p]));

    const problems = {};
    items.forEach((item, index) => {
      const product = byId.get(item.productId);
      if (!product || !product.isActive) problems[`items.${index}.product_id`] = 'This product is no longer available';
      else if (product.stock < item.quantity) {
        problems[`items.${index}.quantity`] = product.stock ? `Only ${product.stock} left in stock` : 'Out of stock';
      }
    });
    if (Object.keys(problems).length) throw new AppError(409, 'OUT_OF_STOCK', 'Some products are not available in the quantity requested', problems);

    const subtotal = items.reduce((sum, i) => sum + byId.get(i.productId).priceHalalas * i.quantity, 0);
    const vat = Math.round((subtotal * config.VAT_PERCENT) / 100);

    const order = await tx.order.create({
      data: {
        companyId: auth.companyId,
        createdBy: auth.userId,
        referenceNumber: referenceNumber(),
        subtotalHalalas: subtotal,
        vatHalalas: vat,
        totalHalalas: subtotal + vat,
        shippingAddress: input.shipping_address,
        contactPhone: input.contact_phone,
        notes: input.notes || null,
      },
      select: { id: true },
    });

    for (const item of items) {
      const product = byId.get(item.productId);
      const line = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPriceHalalas: product.priceHalalas,
        },
        select: { id: true },
      });
      await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: item.quantity } } });

      const serials = await uniqueSerials(tx, product.serialPrefix, item.quantity);
      await tx.device.createMany({
        data: serials.map((serialNumber) => ({
          companyId: auth.companyId,
          serialNumber,
          apiKeyHash: sha256(randomToken()),
          deviceType: product.deviceType,
          source: 'marketplace',
          name: product.name,
          manufacturer: product.manufacturer,
          model: product.model,
          orderItemId: line.id,
        })),
      });
    }
    return order.id;
  });

  return getOrder(auth, orderId);
}

async function listOrders(auth, q) {
  const where = q.status ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    auth.db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: ORDER_FIELDS,
    }),
    auth.db.order.count({ where }),
  ]);
  return { data: rows.map(toPublicOrder), page: q.page, limit: q.limit, total };
}

async function getOrder(auth, id) {
  const order = await auth.db.order.findUnique({ where: { id }, select: ORDER_FIELDS });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  return toPublicOrder(order);
}

module.exports = { PRODUCT_FIELDS, ORDER_FIELDS, toPublicProduct, toPublicOrder, listProducts, placeOrder, listOrders, getOrder };
