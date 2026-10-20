const { Pool } = require('pg');
const { PrismaClient, Prisma } = require('../generated/prisma/client.mts');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./index');

const pool = new Pool({ connectionString: config.DATABASE_URL, allowExitOnIdle: true });
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'").catch(() => {});
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

module.exports = { prisma, Prisma };
