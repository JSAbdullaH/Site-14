-- SITE-69: undoes 20261015000000_init/migration.sql.
-- Run with `npm run db:rollback`. It deletes every table and all their data.
-- Afterwards the database is empty, with no tables, view, functions or types
-- left behind, and `npm run db:deploy` builds it again from scratch.
--
-- Prisma reads only migration.sql from this folder; this file is ours.
-- When a new migration is added, it gets its own down.sql next to it.

BEGIN;

DROP VIEW IF EXISTS "daily_work_records";

-- Children before parents. Dropping a table also drops its triggers,
-- indexes and constraints.
DROP TABLE IF EXISTS "reports";
DROP TABLE IF EXISTS "record_corrections";
DROP TABLE IF EXISTS "tasks";
DROP TABLE IF EXISTS "employee_current_state";
DROP TABLE IF EXISTS "alerts";
DROP TABLE IF EXISTS "telemetry_logs";
DROP TABLE IF EXISTS "work_sessions";
DROP TABLE IF EXISTS "geofences";
DROP TABLE IF EXISTS "devices";
DROP TABLE IF EXISTS "employees";
DROP TABLE IF EXISTS "sites";
DROP TABLE IF EXISTS "refresh_tokens";
DROP TABLE IF EXISTS "auth_tokens";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "job_category_rules";
DROP TABLE IF EXISTS "companies";

DROP FUNCTION IF EXISTS "require_consent"();
DROP FUNCTION IF EXISTS "reject_change"();
DROP FUNCTION IF EXISTS "alerts_handling_only"();

DROP TYPE IF EXISTS "report_type";
DROP TYPE IF EXISTS "task_status";
DROP TYPE IF EXISTS "alert_type";
DROP TYPE IF EXISTS "employee_status";
DROP TYPE IF EXISTS "auth_token_type";
DROP TYPE IF EXISTS "user_role";

COMMIT;
