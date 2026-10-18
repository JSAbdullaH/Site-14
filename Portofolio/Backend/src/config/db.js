// One Prisma Client for the whole app.
// Prisma 7 talks to PostgreSQL through a driver adapter (node-postgres here).
// The client is generated into src/generated/prisma by `npx prisma generate`
// (runs automatically after `npm install`).
const { PrismaClient, Prisma } = require('../generated/prisma/client.mts');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./index');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
});

module.exports = { prisma, Prisma };
