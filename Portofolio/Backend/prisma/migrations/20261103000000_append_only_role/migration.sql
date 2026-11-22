DO $$
DECLARE
    can_create boolean;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site14_app') THEN
        SELECT rolsuper OR rolcreaterole INTO can_create FROM pg_roles WHERE rolname = current_user;
        IF NOT can_create THEN
            RAISE NOTICE 'site14_app was not created: % cannot create roles. Create it as an administrator, then run this file again.', current_user;
            RETURN;
        END IF;
        CREATE ROLE site14_app NOLOGIN;
    END IF;

    GRANT USAGE ON SCHEMA public TO site14_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO site14_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO site14_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO site14_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO site14_app;

    IF to_regclass('_prisma_migrations') IS NOT NULL THEN
        REVOKE ALL ON "_prisma_migrations" FROM site14_app;
    END IF;
    REVOKE INSERT, UPDATE, DELETE ON "daily_work_records" FROM site14_app;

    REVOKE UPDATE, DELETE ON "telemetry_logs", "record_corrections", "reports", "alerts" FROM site14_app;
    GRANT UPDATE ("acknowledged_by", "acknowledged_at", "resolved_at") ON "alerts" TO site14_app;
END;
$$;

CREATE OR REPLACE VIEW "daily_work_records" AS
SELECT
    ws."company_id",
    ws."employee_id",
    ws."site_id",
    (ws."started_at" AT TIME ZONE 'Asia/Riyadh')::date AS "work_date",
    count(*)::integer AS "session_count",
    min(ws."started_at") AS "first_in",
    max(COALESCE(ws."ended_at", now())) AS "last_out",
    (sum(EXTRACT(EPOCH FROM (COALESCE(ws."ended_at", now()) - ws."started_at"))) / 60)::integer AS "worked_minutes",
    bool_or(ws."ended_at" IS NULL) AS "is_open",
    bool_or(EXISTS (
        SELECT 1 FROM "record_corrections" rc
        WHERE rc."employee_id" = ws."employee_id"
          AND rc."site_id" = ws."site_id"
          AND rc."work_date" = (ws."started_at" AT TIME ZONE 'Asia/Riyadh')::date
    )) AS "has_corrections"
FROM "work_sessions" ws
GROUP BY ws."company_id", ws."employee_id", ws."site_id", (ws."started_at" AT TIME ZONE 'Asia/Riyadh')::date;
