-- A device can be deleted even after it recorded shifts. Its shifts stay with the
-- employee; device_id is cleared first (see device.service.js).
ALTER TABLE "work_sessions" ALTER COLUMN "device_id" DROP NOT NULL;
