CREATE TYPE "presence_event_type" AS ENUM ('site_enter', 'site_exit', 'zone_enter', 'zone_exit', 'device_offline', 'device_online');

ALTER TABLE "users" ADD COLUMN     "notifications_read_at" TIMESTAMPTZ(6);

ALTER TABLE "devices" ADD COLUMN     "offline_notified_at" TIMESTAMPTZ(6);

CREATE TABLE "presence_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "device_id" UUID,
    "event_type" "presence_event_type" NOT NULL,
    "geofence_id" UUID,
    "zone_name" VARCHAR(120),
    "from_zone_name" VARCHAR(120),
    "alert_id" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presence_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "presence_events_company_id_created_at_idx" ON "presence_events"("company_id", "created_at" DESC);

CREATE INDEX "presence_events_employee_id_occurred_at_idx" ON "presence_events"("employee_id", "occurred_at");

ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_company_id_site_id_fkey" FOREIGN KEY ("company_id", "site_id") REFERENCES "sites"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "presence_events" ADD CONSTRAINT "presence_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

