// SITE-69: undo the newest migration.   npm run db:rollback
//
// Prisma Migrate only goes forward, so each migration folder carries its own
// down.sql. This script finds the newest applied migration, runs its down.sql,
// and removes it from Prisma's history (_prisma_migrations). Rolling back the
// first migration leaves the database completely empty.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const MIGRATIONS = path.join(__dirname, 'migrations');

// Guard shared by the scripts that wipe data (this one and seed.js).
// They run only on a database on this machine, never in production,
// unless ALLOW_REMOTE_RESET=true says the remote database is disposable.
function assertSafeTarget(url, action) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Refusing to ${action}: NODE_ENV is production.`);
  }
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!local && process.env.ALLOW_REMOTE_RESET !== 'true') {
    throw new Error(
      `Refusing to ${action} on ${host}: it deletes data. ` +
      'Set ALLOW_REMOTE_RESET=true only if that database holds demo data.',
    );
  }
}

async function rollback(url = process.env.DATABASE_URL) {
  assertSafeTarget(url, 'roll back');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const history = await client.query("SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present");
    let name;
    if (history.rows[0].present) {
      const { rows } = await client.query(
        `SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ORDER BY migration_name DESC LIMIT 1`,
      );
      name = rows[0]?.migration_name;
    } else {
      // Built without Prisma (the test database): take the newest folder.
      name = fs.readdirSync(MIGRATIONS).filter((f) => fs.statSync(path.join(MIGRATIONS, f)).isDirectory()).sort().pop();
    }
    if (!name) return null;

    const down = path.join(MIGRATIONS, name, 'down.sql');
    if (!fs.existsSync(down)) throw new Error(`${name} has no down.sql, so it cannot be rolled back.`);
    await client.query(fs.readFileSync(down, 'utf8'));

    if (history.rows[0].present) {
      await client.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [name]);
      const left = await client.query('SELECT count(*)::int AS n FROM _prisma_migrations');
      if (left.rows[0].n === 0) await client.query('DROP TABLE _prisma_migrations');
    }
    return name;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  rollback()
    .then((name) => console.log(name ? `Rolled back ${name}.` : 'Nothing to roll back.'))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}

module.exports = { rollback, assertSafeTarget };
