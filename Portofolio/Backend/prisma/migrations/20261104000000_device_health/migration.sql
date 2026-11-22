-- Device health, written by every ingest call (POST /ingest/readings).
-- Off-site readings are not stored, so these columns are the only trace that a
-- device is alive while its wearer is away from the site.
--   last_seen_at          server clock of the last call
--   last_recorded_at      device clock of the newest accepted reading; later
--                         readings must be newer (retries are dropped)
--   clock_offset_seconds  server minus device clock, measured from the batch's sent_at
-- AlterTable
ALTER TABLE "devices" ADD COLUMN "last_seen_at" TIMESTAMPTZ(6),
ADD COLUMN "last_recorded_at" TIMESTAMPTZ(6),
ADD COLUMN "clock_offset_seconds" INTEGER;
