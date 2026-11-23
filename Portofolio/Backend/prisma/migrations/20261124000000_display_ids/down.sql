BEGIN;

DROP TRIGGER IF EXISTS "employees_display_number_guard" ON "employees";
DROP TRIGGER IF EXISTS "tasks_display_number_guard" ON "tasks";
DROP TRIGGER IF EXISTS "sites_display_number_guard" ON "sites";
DROP TRIGGER IF EXISTS "employees_display_number" ON "employees";
DROP TRIGGER IF EXISTS "tasks_display_number" ON "tasks";
DROP TRIGGER IF EXISTS "sites_display_number" ON "sites";
DROP TRIGGER IF EXISTS "companies_key_guard" ON "companies";

DROP FUNCTION IF EXISTS "display_number_guard"();
DROP FUNCTION IF EXISTS "assign_display_number"();
DROP FUNCTION IF EXISTS "company_key_guard"();
DROP FUNCTION IF EXISTS "suggest_company_key"(TEXT);

ALTER TABLE "employees" DROP COLUMN IF EXISTS "display_number";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "display_number";
ALTER TABLE "sites" DROP COLUMN IF EXISTS "display_number";

DROP TABLE IF EXISTS "id_counters";

ALTER TABLE "companies" DROP COLUMN IF EXISTS "key";

DO $$
BEGIN
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124000000_display_ids';
    END IF;
END;
$$;

COMMIT;
