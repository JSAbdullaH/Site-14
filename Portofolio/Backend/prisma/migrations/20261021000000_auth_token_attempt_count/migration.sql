-- AlterTable
ALTER TABLE "auth_tokens" ADD COLUMN "attempt_count" SMALLINT NOT NULL DEFAULT 0;
