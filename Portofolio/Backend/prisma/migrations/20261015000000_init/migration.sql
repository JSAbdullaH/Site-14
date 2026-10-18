-- SITE-69: initial schema, 16 tables + 1 view (Stage3 section 2.2, v2.1 with heart rate)
-- Part 1 follows Prisma's own naming so `prisma migrate diff` stays clean.
-- Part 2 holds what schema.prisma cannot express: CHECKs, partial unique
-- indexes, triggers and the view.

-- =====================================================================
-- PART 1: tables, keys and indexes (mirrors prisma/schema.prisma)
-- =====================================================================

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('company_admin', 'site_manager');

-- CreateEnum
CREATE TYPE "auth_token_type" AS ENUM ('email_verify', 'invitation', 'password_reset', 'login_otp');

-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "session_end_reason" AS ENUM ('left_site', 'shift_ended', 'device_offline');

-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('zone_exit', 'hour_limit', 'midday_ban', 'heart_rate_high', 'heart_rate_low');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('todo', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "commercial_registration" VARCHAR(50),
    "midday_ban_from_date" DATE,
    "midday_ban_to_date" DATE,
    "midday_ban_start_time" TIME(6) NOT NULL DEFAULT '12:00:00'::time without time zone,
    "midday_ban_end_time" TIME(6) NOT NULL DEFAULT '15:00:00'::time without time zone,
    "heart_rate_max_bpm" SMALLINT,
    "heart_rate_min_bpm" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_category_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "job_category" VARCHAR(60) NOT NULL,
    "daily_limit_minutes" SMALLINT NOT NULL DEFAULT 480,
    "ramadan_limit_minutes" SMALLINT,
    "ban_lead_minutes" SMALLINT NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "role" "user_role" NOT NULL,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" SMALLINT NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_type" "auth_token_type" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "client" VARCHAR(150),
    "boundary" JSONB NOT NULL,
    "shift_start" TIME(6) NOT NULL,
    "shift_end" TIME(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "site_id" UUID,
    "employee_number" VARCHAR(30),
    "full_name" VARCHAR(120) NOT NULL,
    "job_category" VARCHAR(60) NOT NULL,
    "phone" VARCHAR(20),
    "consent_given_at" TIMESTAMPTZ(6),
    "status" "employee_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "employee_id" UUID,
    "serial_number" VARCHAR(64) NOT NULL,
    "api_key_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "boundary" JSONB NOT NULL,
    "is_outdoor" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" BIGSERIAL NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" "session_end_reason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_logs" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "battery_percent" SMALLINT,
    "heart_rate_bpm" SMALLINT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" BIGINT NOT NULL,
    "alert_type" "alert_type" NOT NULL,
    "geofence_id" UUID,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "limit_minutes" INTEGER,
    "observed_minutes" INTEGER,
    "limit_bpm" SMALLINT,
    "observed_bpm" SMALLINT,
    "triggered_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_current_state" (
    "employee_id" UUID NOT NULL,
    "session_id" BIGINT,
    "geofence_id" UUID,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "battery_percent" SMALLINT,
    "heart_rate_bpm" SMALLINT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_current_state_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "geofence_id" UUID,
    "employee_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'todo',
    "scheduled_for" DATE NOT NULL DEFAULT (timezone('Asia/Riyadh'::text, now()))::date,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_corrections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "original_value" TEXT NOT NULL,
    "corrected_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "corrected_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "reference_number" VARCHAR(40) NOT NULL,
    "report_type" "report_type" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    "file_size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_category_rules_company_id_job_category_key" ON "job_category_rules"("company_id", "job_category");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_id_key" ON "users"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_idx" ON "auth_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_company_id_id_key" ON "sites"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_company_id_name_key" ON "sites"("company_id", "name");

-- CreateIndex
CREATE INDEX "employees_site_id_idx" ON "employees"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_id_key" ON "employees"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_employee_number_key" ON "employees"("company_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "devices_employee_id_key" ON "devices"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "devices_company_id_id_key" ON "devices"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_company_id_employee_id_key" ON "devices"("company_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "geofences_site_id_id_key" ON "geofences"("site_id", "id");

-- CreateIndex
CREATE INDEX "work_sessions_employee_id_started_at_idx" ON "work_sessions"("employee_id", "started_at");

-- CreateIndex
CREATE INDEX "work_sessions_site_id_started_at_idx" ON "work_sessions"("site_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_logs_session_id_recorded_at_key" ON "telemetry_logs"("session_id", "recorded_at");

-- CreateIndex
CREATE INDEX "alerts_session_id_idx" ON "alerts"("session_id");

-- CreateIndex
CREATE INDEX "tasks_site_id_scheduled_for_idx" ON "tasks"("site_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "tasks_employee_id_scheduled_for_idx" ON "tasks"("employee_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "record_corrections_employee_id_work_date_idx" ON "record_corrections"("employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reference_number_key" ON "reports"("reference_number");

-- CreateIndex
CREATE INDEX "reports_site_id_period_start_idx" ON "reports"("site_id", "period_start");

-- AddForeignKey
ALTER TABLE "job_category_rules" ADD CONSTRAINT "job_category_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_site_id_fkey" FOREIGN KEY ("company_id", "site_id") REFERENCES "sites"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_job_category_fkey" FOREIGN KEY ("company_id", "job_category") REFERENCES "job_category_rules"("company_id", "job_category") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_company_id_site_id_fkey" FOREIGN KEY ("company_id", "site_id") REFERENCES "sites"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_company_id_device_id_fkey" FOREIGN KEY ("company_id", "device_id") REFERENCES "devices"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_logs" ADD CONSTRAINT "telemetry_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_current_state" ADD CONSTRAINT "employee_current_state_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_current_state" ADD CONSTRAINT "employee_current_state_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_current_state" ADD CONSTRAINT "employee_current_state_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_site_id_fkey" FOREIGN KEY ("company_id", "site_id") REFERENCES "sites"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_site_id_geofence_id_fkey" FOREIGN KEY ("site_id", "geofence_id") REFERENCES "geofences"("site_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_created_by_fkey" FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_corrections" ADD CONSTRAINT "record_corrections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_corrections" ADD CONSTRAINT "record_corrections_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_corrections" ADD CONSTRAINT "record_corrections_company_id_site_id_fkey" FOREIGN KEY ("company_id", "site_id") REFERENCES "sites"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_corrections" ADD CONSTRAINT "record_corrections_company_id_corrected_by_fkey" FOREIGN KEY ("company_id", "corrected_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_site_id_fkey" FOREIGN KEY ("company_id", "site_id") REFERENCES "sites"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_created_by_fkey" FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- PART 2: rules schema.prisma cannot express
-- =====================================================================

-- ---------- CHECK constraints ----------

-- Emails are stored lower-case, so users_email_key is case-insensitive.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email"));

ALTER TABLE "companies" ADD CONSTRAINT "companies_midday_ban_window_chk"
    CHECK ("midday_ban_start_time" < "midday_ban_end_time");
ALTER TABLE "companies" ADD CONSTRAINT "companies_heart_rate_range_chk"
    CHECK (("heart_rate_min_bpm" IS NULL OR "heart_rate_min_bpm" BETWEEN 20 AND 250)
       AND ("heart_rate_max_bpm" IS NULL OR "heart_rate_max_bpm" BETWEEN 20 AND 250)
       AND ("heart_rate_min_bpm" IS NULL OR "heart_rate_max_bpm" IS NULL OR "heart_rate_min_bpm" < "heart_rate_max_bpm"));

ALTER TABLE "job_category_rules" ADD CONSTRAINT "job_category_rules_limits_chk"
    CHECK ("daily_limit_minutes" BETWEEN 1 AND 1440
       AND ("ramadan_limit_minutes" IS NULL OR "ramadan_limit_minutes" BETWEEN 1 AND 1440)
       AND "ban_lead_minutes" >= 0);

ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_attempt_count_chk" CHECK ("attempt_count" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_chk" CHECK ("failed_login_count" >= 0);

ALTER TABLE "sites" ADD CONSTRAINT "sites_boundary_polygon_chk"
    CHECK (jsonb_typeof("boundary") = 'object' AND "boundary"->>'type' = 'Polygon');
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_boundary_polygon_chk"
    CHECK (jsonb_typeof("boundary") = 'object' AND "boundary"->>'type' = 'Polygon');

ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_period_chk"
    CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_end_reason_chk"
    CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL));

ALTER TABLE "telemetry_logs" ADD CONSTRAINT "telemetry_logs_position_chk"
    CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "telemetry_logs" ADD CONSTRAINT "telemetry_logs_battery_chk"
    CHECK ("battery_percent" IS NULL OR "battery_percent" BETWEEN 0 AND 100);
ALTER TABLE "telemetry_logs" ADD CONSTRAINT "telemetry_logs_heart_rate_chk"
    CHECK ("heart_rate_bpm" IS NULL OR "heart_rate_bpm" BETWEEN 20 AND 250);

ALTER TABLE "employee_current_state" ADD CONSTRAINT "employee_current_state_position_chk"
    CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "employee_current_state" ADD CONSTRAINT "employee_current_state_battery_chk"
    CHECK ("battery_percent" IS NULL OR "battery_percent" BETWEEN 0 AND 100);
ALTER TABLE "employee_current_state" ADD CONSTRAINT "employee_current_state_heart_rate_chk"
    CHECK ("heart_rate_bpm" IS NULL OR "heart_rate_bpm" BETWEEN 20 AND 250);

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_position_chk"
    CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
-- Each alert type carries exactly the fields it needs.
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_payload_chk" CHECK (
    CASE "alert_type"
        WHEN 'midday_ban' THEN "geofence_id" IS NOT NULL
        WHEN 'hour_limit' THEN "limit_minutes" IS NOT NULL AND "observed_minutes" IS NOT NULL
        WHEN 'heart_rate_high' THEN "limit_bpm" IS NOT NULL AND "observed_bpm" IS NOT NULL
        WHEN 'heart_rate_low' THEN "limit_bpm" IS NOT NULL AND "observed_bpm" IS NOT NULL
        ELSE TRUE
    END);
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_pair_chk"
    CHECK (("acknowledged_by" IS NULL) = ("acknowledged_at" IS NULL));

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_chk"
    CHECK (("status" = 'done') = ("completed_at" IS NOT NULL));

ALTER TABLE "record_corrections" ADD CONSTRAINT "record_corrections_reason_chk"
    CHECK (length(btrim("reason")) > 0);

ALTER TABLE "reports" ADD CONSTRAINT "reports_period_chk" CHECK ("period_end" >= "period_start");
ALTER TABLE "reports" ADD CONSTRAINT "reports_file_size_chk" CHECK ("file_size_bytes" >= 0);
ALTER TABLE "reports" ADD CONSTRAINT "reports_sha256_hex_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- ---------- Partial unique indexes ----------

-- At most one open work session per employee.
CREATE UNIQUE INDEX "work_sessions_one_open_per_employee"
    ON "work_sessions" ("employee_id") WHERE "ended_at" IS NULL;

-- At most one unresolved alert of each type per session (Stage3 decision 7).
CREATE UNIQUE INDEX "alerts_one_open_per_type_per_session"
    ON "alerts" ("session_id", "alert_type") WHERE "resolved_at" IS NULL;

-- ---------- Triggers ----------

-- Charter item 7: no work session (and so no stored position) without consent.
CREATE FUNCTION "require_consent"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "employees"
        WHERE "id" = NEW."employee_id" AND "consent_given_at" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'employee % has not given consent to tracking', NEW."employee_id"
            USING ERRCODE = 'RC002';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "work_sessions_require_consent"
    BEFORE INSERT ON "work_sessions"
    FOR EACH ROW EXECUTE FUNCTION "require_consent"();

-- Append-only record (Stage3 decision 5). Implemented with triggers instead of
-- REVOKE because REVOKE does not bind the table owner, and the app connects as
-- the owner today. Triggers bind every role. TRUNCATE is not blocked (tests use it).
CREATE FUNCTION "reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% on % is not allowed: the record is append-only', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'AO001';
END;
$$;

CREATE TRIGGER "telemetry_logs_append_only"
    BEFORE UPDATE OR DELETE ON "telemetry_logs"
    FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "record_corrections_append_only"
    BEFORE UPDATE OR DELETE ON "record_corrections"
    FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "reports_append_only"
    BEFORE UPDATE OR DELETE ON "reports"
    FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "alerts_no_delete"
    BEFORE DELETE ON "alerts"
    FOR EACH ROW EXECUTE FUNCTION "reject_change"();

-- Alerts: what the evaluator found is fixed. Only the handling columns may be
-- filled in, once each (acknowledged, then resolved).
CREATE FUNCTION "alerts_handling_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW."id", NEW."session_id", NEW."alert_type", NEW."geofence_id", NEW."latitude", NEW."longitude",
        NEW."limit_minutes", NEW."observed_minutes", NEW."limit_bpm", NEW."observed_bpm",
        NEW."triggered_at", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."session_id", OLD."alert_type", OLD."geofence_id", OLD."latitude", OLD."longitude",
        OLD."limit_minutes", OLD."observed_minutes", OLD."limit_bpm", OLD."observed_bpm",
        OLD."triggered_at", OLD."created_at") THEN
        RAISE EXCEPTION 'only the handling columns of an alert can change' USING ERRCODE = 'AO001';
    END IF;
    IF (OLD."acknowledged_at" IS NOT NULL AND NEW."acknowledged_at" IS DISTINCT FROM OLD."acknowledged_at")
       OR (OLD."acknowledged_by" IS NOT NULL AND NEW."acknowledged_by" IS DISTINCT FROM OLD."acknowledged_by")
       OR (OLD."resolved_at" IS NOT NULL AND NEW."resolved_at" IS DISTINCT FROM OLD."resolved_at") THEN
        RAISE EXCEPTION 'alert handling is already recorded and cannot be rewritten' USING ERRCODE = 'AO001';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "alerts_update_handling_only"
    BEFORE UPDATE ON "alerts"
    FOR EACH ROW EXECUTE FUNCTION "alerts_handling_only"();

-- ---------- View ----------

-- Minutes per worker, site and Saudi calendar day, summed from the sessions.
-- An open session counts up to now. A session is counted on the day it started.
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
