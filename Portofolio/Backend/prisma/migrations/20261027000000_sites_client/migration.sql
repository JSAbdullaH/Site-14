-- SITE-47, SITE-48: the client a site is built for, and when it was last edited.
-- AlterTable
ALTER TABLE "sites" ADD COLUMN "client" VARCHAR(150),
ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- A shift that starts and ends at the same minute has no length.
ALTER TABLE "sites" ADD CONSTRAINT "sites_shift_chk" CHECK ("shift_start" <> "shift_end");
