-- SITE14 staff can open the owner portal with their company account.
ALTER TABLE "users" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
