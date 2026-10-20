// Prisma 7 reads its settings from this file. It does not load .env on its own,
// so dotenv is imported first.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --experimental-strip-types --no-warnings=ExperimentalWarning prisma/seed.js',
  },
  // Needed by migrate/db commands. Left undefined it still lets
  // `prisma generate` run on a fresh clone that has no .env yet.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
