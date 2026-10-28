-- Undoes 20261027000000_sites_client/migration.sql.
-- Run it before the init down.sql, or on its own to step back one migration:
--   prisma db execute --file prisma/migrations/20261027000000_sites_client/down.sql

BEGIN;

ALTER TABLE "sites" DROP CONSTRAINT IF EXISTS "sites_shift_chk";
ALTER TABLE "sites" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE "sites" DROP COLUMN IF EXISTS "client";
-- Forget the migration, so `npm run db:deploy` applies it again.
DO $$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261027000000_sites_client';
    END IF;
END;
$$;

COMMIT;
