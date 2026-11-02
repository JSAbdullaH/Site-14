const { Pool } = require('pg');
const { PrismaClient, Prisma } = require('../generated/prisma/client.mts');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./index');
const AppError = require('../utils/AppError');

const pool = new Pool({ connectionString: config.DATABASE_URL, allowExitOnIdle: true });
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'").catch(() => {});
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OWNER = {
  Company: (c) => ({ id: c }),
  JobCategoryRule: (c) => ({ companyId: c }),
  User: (c) => ({ companyId: c }),
  Site: (c) => ({ companyId: c }),
  Employee: (c) => ({ companyId: c }),
  Device: (c) => ({ companyId: c }),
  WorkSession: (c) => ({ companyId: c }),
  Task: (c) => ({ companyId: c }),
  RecordCorrection: (c) => ({ companyId: c }),
  Report: (c) => ({ companyId: c }),
  AuthToken: (c) => ({ user: { companyId: c } }),
  RefreshToken: (c) => ({ user: { companyId: c } }),
  Geofence: (c) => ({ site: { companyId: c } }),
  TelemetryLog: (c) => ({ session: { companyId: c } }),
  Alert: (c) => ({ session: { companyId: c } }),
  EmployeeCurrentState: (c) => ({ employee: { companyId: c } }),
};

const PARENT = {
  AuthToken: ['user', 'userId'],
  RefreshToken: ['user', 'userId'],
  Geofence: ['site', 'siteId'],
  TelemetryLog: ['workSession', 'sessionId'],
  Alert: ['workSession', 'sessionId'],
  EmployeeCurrentState: ['employee', 'employeeId'],
};

const unscoped = Object.values(Prisma.ModelName).filter((m) => !OWNER[m]);
if (unscoped.length) {
  throw new Error(`Tenant scope missing for: ${unscoped.join(', ')}. Add them to OWNER in src/config/db.js.`);
}

const UNIQUE = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);
const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

const notFound = () => new AppError(404, 'NOT_FOUND', 'Not found');

async function claim(model, companyId, data) {
  if (model === 'Company') throw new Error('A company cannot be created through a company-scoped client');
  if (!PARENT[model]) return { ...data, companyId };
  const [parent, key] = PARENT[model];
  const found = await prisma[parent].count({ where: { id: data[key], ...OWNER[cap(parent)](companyId) } });
  if (!found) throw notFound();
  return data;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function forCompany(companyId) {
  if (!companyId) throw new Error('forCompany needs a company id');
  return prisma.$extends({
    name: `company:${companyId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scope = OWNER[model](companyId);
          const a = { ...args };

          if (operation !== 'create' && operation !== 'createMany' && operation !== 'createManyAndReturn') {
            a.where = UNIQUE.has(operation) ? { ...a.where, ...scope } : { AND: [a.where ?? {}, scope] };
          }
          const changes = operation === 'upsert' ? a.update : a.data;
          if (!WRITES.has(operation) || operation === 'upsert') {
            if (changes && 'companyId' in changes && changes.companyId !== companyId) throw notFound();
          }
          if (WRITES.has(operation)) {
            const key = operation === 'upsert' ? 'create' : 'data';
            a[key] = Array.isArray(a[key])
              ? await Promise.all(a[key].map((row) => claim(model, companyId, row)))
              : await claim(model, companyId, a[key]);
          }
          return query(a);
        },
      },
    },
  });
}

module.exports = { prisma, Prisma, forCompany };
