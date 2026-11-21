BEGIN;

ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_order_item_id_fkey";
DROP TABLE IF EXISTS "device_pairings";
DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "orders";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "platform_admins";

DROP INDEX IF EXISTS "devices_company_id_device_type_idx";
DROP INDEX IF EXISTS "devices_order_item_id_idx";
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_last_battery_percent_chk";
ALTER TABLE "devices"
    DROP COLUMN IF EXISTS "browser",
    DROP COLUMN IF EXISTS "device_type",
    DROP COLUMN IF EXISTS "last_battery_percent",
    DROP COLUMN IF EXISTS "manufacturer",
    DROP COLUMN IF EXISTS "model",
    DROP COLUMN IF EXISTS "name",
    DROP COLUMN IF EXISTS "order_item_id",
    DROP COLUMN IF EXISTS "os_name",
    DROP COLUMN IF EXISTS "os_version",
    DROP COLUMN IF EXISTS "paired_at",
    DROP COLUMN IF EXISTS "source",
    DROP COLUMN IF EXISTS "user_agent";

DROP TYPE IF EXISTS "order_status";
DROP TYPE IF EXISTS "pairing_status";
DROP TYPE IF EXISTS "device_source";
DROP TYPE IF EXISTS "device_type";

DO $$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261111000000_devices_marketplace_platform';
    END IF;
END;
$$;

COMMIT;
