-- Undoes 20261104000000_device_health/migration.sql.
-- Run it before the init down.sql, or on its own to step back one migration:
--   prisma db execute --file prisma/migrations/20261104000000_device_health/down.sql

BEGIN;

ALTER TABLE "devices" DROP COLUMN IF EXISTS "clock_offset_seconds";
ALTER TABLE "devices" DROP COLUMN IF EXISTS "last_recorded_at";
ALTER TABLE "devices" DROP COLUMN IF EXISTS "last_seen_at";
-- Forget the migration, so `npm run db:deploy` applies it again.
DO $$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261104000000_device_health';
    END IF;
END;
$$;

COMMIT;
