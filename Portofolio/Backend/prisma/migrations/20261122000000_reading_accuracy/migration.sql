-- Horizontal accuracy the device reported for each reading, in metres. NULL for older devices.
ALTER TABLE "telemetry_logs" ADD COLUMN "accuracy_m" REAL;
