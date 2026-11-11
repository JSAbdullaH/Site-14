const crypto = require('node:crypto');
const config = require('../config');
const { sha256, randomToken } = require('../utils/tokens');

const ONLINE_WINDOW_MS = config.DEVICE_OFFLINE_MINUTES * 60_000;

const SERIAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TYPE_PREFIX = { phone: 'PH', tablet: 'TB', watch: 'WT', laptop: 'LT', desktop: 'PC', tracker: 'TR' };

const FIELDS = {
  id: true,
  serialNumber: true,
  deviceType: true,
  source: true,
  name: true,
  manufacturer: true,
  model: true,
  osName: true,
  osVersion: true,
  browser: true,
  isActive: true,
  createdAt: true,
  pairedAt: true,
  lastSeenAt: true,
  lastRecordedAt: true,
  lastBatteryPercent: true,
  clockOffsetSeconds: true,
  employee: { select: { id: true, fullName: true, site: { select: { id: true, name: true } } } },
  orderItem: { select: { order: { select: { id: true, referenceNumber: true, status: true } } } },
};

const iso = (d) => (d ? d.toISOString() : null);

function health(d, now = Date.now()) {
  if (!d.isActive) return 'inactive';
  if (!d.lastSeenAt) return 'never';
  return now - d.lastSeenAt.getTime() < ONLINE_WINDOW_MS ? 'online' : 'offline';
}

function toPublic(d) {
  const order = d.orderItem ? d.orderItem.order : null;
  return {
    id: d.id,
    serial_number: d.serialNumber,
    device_type: d.deviceType,
    source: d.source,
    name: d.name,
    manufacturer: d.manufacturer,
    model: d.model,
    os: d.osName ? { name: d.osName, version: d.osVersion } : null,
    browser: d.browser,
    is_active: d.isActive,
    health: health(d),
    employee: d.employee ? { id: d.employee.id, full_name: d.employee.fullName, site: d.employee.site } : null,
    order: order ? { id: order.id, reference_number: order.referenceNumber, status: order.status } : null,
    battery_percent: d.lastBatteryPercent,
    paired_at: iso(d.pairedAt),
    last_seen_at: iso(d.lastSeenAt),
    last_recorded_at: iso(d.lastRecordedAt),
    clock_offset_seconds: d.clockOffsetSeconds,
    created_at: d.createdAt.toISOString(),
  };
}

function newKey() {
  const apiKey = `dk_${randomToken()}`;
  return { apiKey, apiKeyHash: sha256(apiKey) };
}

function randomChars(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += SERIAL_ALPHABET[crypto.randomInt(SERIAL_ALPHABET.length)];
  return out;
}

const serialFor = (prefix) => `${prefix}-${randomChars(8)}`;

async function uniqueSerials(db, prefix, count) {
  const serials = new Set();
  while (serials.size < count) {
    const batch = Array.from({ length: count - serials.size }, () => serialFor(prefix));
    const taken = await db.device.findMany({ where: { serialNumber: { in: batch } }, select: { serialNumber: true } });
    const used = new Set(taken.map((d) => d.serialNumber));
    for (const serial of batch) if (!used.has(serial)) serials.add(serial);
  }
  return [...serials];
}

function healthWhere(value, now = Date.now()) {
  const cutoff = new Date(now - ONLINE_WINDOW_MS);
  if (value === 'online') return { isActive: true, lastSeenAt: { gte: cutoff } };
  if (value === 'offline') return { isActive: true, lastSeenAt: { lt: cutoff } };
  if (value === 'never') return { isActive: true, lastSeenAt: null };
  return {};
}

module.exports = {
  ONLINE_WINDOW_MS,
  TYPE_PREFIX,
  FIELDS,
  health,
  healthWhere,
  toPublic,
  newKey,
  randomChars,
  uniqueSerials,
};
