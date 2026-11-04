BEGIN;

DROP VIEW IF EXISTS "daily_work_records";
CREATE VIEW "daily_work_records" AS
SELECT
    ws."company_id",
    ws."employee_id",
    ws."site_id",
    (ws."started_at" AT TIME ZONE 'Asia/Riyadh')::date AS "work_date",
    count(*)::integer AS "session_count",
    min(ws."started_at") AS "first_in",
    max(COALESCE(ws."ended_at", now())) AS "last_out",
    (sum(EXTRACT(EPOCH FROM (COALESCE(ws."ended_at", now()) - ws."started_at"))) / 60)::integer AS "worked_minutes",
    bool_or(ws."ended_at" IS NULL) AS "is_open"
FROM "work_sessions" ws
GROUP BY ws."company_id", ws."employee_id", ws."site_id", (ws."started_at" AT TIME ZONE 'Asia/Riyadh')::date;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site14_app') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM site14_app;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM site14_app;
        REVOKE USAGE ON SCHEMA public FROM site14_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM site14_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM site14_app;
    END IF;
    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261103000000_append_only_role';
    END IF;
END;
$$;

COMMIT;
