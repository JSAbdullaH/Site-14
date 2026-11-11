BEGIN;

DROP TABLE IF EXISTS "presence_events";
ALTER TABLE "devices" DROP COLUMN IF EXISTS "offline_notified_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifications_read_at";
DROP TYPE IF EXISTS "presence_event_type";

DO $$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261112000000_presence_alerts';
    END IF;
END;
$$;

COMMIT;
