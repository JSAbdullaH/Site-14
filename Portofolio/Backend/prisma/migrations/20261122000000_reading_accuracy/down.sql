BEGIN;

ALTER TABLE "telemetry_logs" DROP COLUMN IF EXISTS "accuracy_m";

DO $$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261122000000_reading_accuracy';
    END IF;
END;
$$;

COMMIT;
