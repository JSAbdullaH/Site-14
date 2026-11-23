-- Readable IDs, like Jira keys. Each company has a key (AI for "Apple Inc"), and each
-- employee, task and site gets a number of its own type inside that company:
--   AI-E-100012   employee     AI-T-100305   task     AI-S-100003   site
-- The database hands out the numbers, so every way of inserting (API, CSV import,
-- seed, raw SQL) gets one, and two inserts at the same moment never share one.
-- Errors: ID001 a key or number cannot change, ID002 a company ran out of numbers.

-- ---------- Company key ----------

-- Initials of the words in the name (Apple Inc -> AI). One word gives its first two
-- letters (Albina -> AL). A name with no Latin letters gives CO. Taken keys get a
-- letter added or changed (AI -> AIA, AIB ...). Sign-up does not ask for a key: the
-- company gets this one, and it is fixed from then on.
CREATE FUNCTION "suggest_company_key"(company_name TEXT) RETURNS VARCHAR(5) AS $$
DECLARE
    words TEXT[];
    base TEXT := '';
    candidate TEXT;
    letter INT;
BEGIN
    words := regexp_split_to_array(trim(regexp_replace(upper(coalesce(company_name, '')), '[^A-Z]+', ' ', 'g')), ' ');
    IF array_length(words, 1) IS NULL OR words[1] = '' THEN
        base := 'CO';
    ELSIF array_length(words, 1) = 1 THEN
        base := left(words[1], 2);
    ELSE
        SELECT string_agg(left(w, 1), '') INTO base FROM unnest(words[1:5]) AS w;
    END IF;
    IF length(base) < 2 THEN
        base := rpad(base, 2, 'X');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "companies" WHERE "key" = base) THEN
        RETURN base;
    END IF;
    FOR letter IN 0..25 LOOP
        candidate := left(base, 4) || chr(65 + letter);
        IF NOT EXISTS (SELECT 1 FROM "companies" WHERE "key" = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
    LOOP
        candidate := left(base, 2) || chr(65 + floor(random() * 26)::INT)
            || chr(65 + floor(random() * 26)::INT) || chr(65 + floor(random() * 26)::INT);
        IF NOT EXISTS (SELECT 1 FROM "companies" WHERE "key" = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "companies" ADD COLUMN "key" VARCHAR(5);

DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN SELECT "id", "name" FROM "companies" ORDER BY "created_at", "id" LOOP
        UPDATE "companies" SET "key" = "suggest_company_key"(c."name") WHERE "id" = c."id";
    END LOOP;
END;
$$;

ALTER TABLE "companies" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "companies" ADD CONSTRAINT "companies_key_format" CHECK ("key" ~ '^[A-Z]{2,5}$');
CREATE UNIQUE INDEX "companies_key_key" ON "companies"("key");

-- A company left without a key gets the suggested one. Once set, the key never changes,
-- because every ID already printed or shared starts with it.
CREATE FUNCTION "company_key_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."key" IS NULL OR NEW."key" = '' THEN
            NEW."key" := "suggest_company_key"(NEW."name");
        END IF;
    ELSIF NEW."key" IS DISTINCT FROM OLD."key" THEN
        RAISE EXCEPTION 'the company key cannot change' USING ERRCODE = 'ID001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "companies_key_guard" BEFORE INSERT OR UPDATE OF "key" ON "companies"
    FOR EACH ROW EXECUTE FUNCTION "company_key_guard"();

-- ---------- Counters: one row per company ----------

CREATE TABLE "id_counters" (
    "company_id" UUID NOT NULL,
    "employee_last" INTEGER NOT NULL DEFAULT 100000,
    "task_last" INTEGER NOT NULL DEFAULT 100000,
    "site_last" INTEGER NOT NULL DEFAULT 100000,

    CONSTRAINT "id_counters_pkey" PRIMARY KEY ("company_id")
);

ALTER TABLE "id_counters" ADD CONSTRAINT "id_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Numbers on employees, tasks and sites ----------

ALTER TABLE "employees" ADD COLUMN "display_number" INTEGER;
ALTER TABLE "tasks" ADD COLUMN "display_number" INTEGER;
ALTER TABLE "sites" ADD COLUMN "display_number" INTEGER;

-- Rows that already exist are numbered in the order they were created.
UPDATE "employees" t SET "display_number" = n.num
FROM (SELECT "id", 100000 + row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS num FROM "employees") n
WHERE t."id" = n."id";
UPDATE "tasks" t SET "display_number" = n.num
FROM (SELECT "id", 100000 + row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS num FROM "tasks") n
WHERE t."id" = n."id";
UPDATE "sites" t SET "display_number" = n.num
FROM (SELECT "id", 100000 + row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS num FROM "sites") n
WHERE t."id" = n."id";

INSERT INTO "id_counters" ("company_id", "employee_last", "task_last", "site_last")
SELECT c."id",
       coalesce((SELECT max("display_number") FROM "employees" WHERE "company_id" = c."id"), 100000),
       coalesce((SELECT max("display_number") FROM "tasks" WHERE "company_id" = c."id"), 100000),
       coalesce((SELECT max("display_number") FROM "sites" WHERE "company_id" = c."id"), 100000)
FROM "companies" c;

ALTER TABLE "employees" ALTER COLUMN "display_number" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "display_number" SET NOT NULL;
ALTER TABLE "sites" ALTER COLUMN "display_number" SET NOT NULL;

ALTER TABLE "employees" ADD CONSTRAINT "employees_display_number_range" CHECK ("display_number" BETWEEN 100001 AND 999999);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_display_number_range" CHECK ("display_number" BETWEEN 100001 AND 999999);
ALTER TABLE "sites" ADD CONSTRAINT "sites_display_number_range" CHECK ("display_number" BETWEEN 100001 AND 999999);

CREATE UNIQUE INDEX "employees_company_id_display_number_key" ON "employees"("company_id", "display_number");
CREATE UNIQUE INDEX "tasks_company_id_display_number_key" ON "tasks"("company_id", "display_number");
CREATE UNIQUE INDEX "sites_company_id_display_number_key" ON "sites"("company_id", "display_number");

-- The next number of the row's type in its company. The UPDATE locks the company's
-- counter row until the transaction ends, so two inserts at the same moment wait
-- for each other instead of taking the same number. A rolled-back insert gives its
-- number back. Any number sent with the insert is ignored.
-- TG_ARGV[0] names the counter column: employee_last, task_last or site_last.
CREATE FUNCTION "assign_display_number"() RETURNS TRIGGER AS $$
DECLARE
    next_number INTEGER;
BEGIN
    INSERT INTO "id_counters" ("company_id") VALUES (NEW."company_id") ON CONFLICT ("company_id") DO NOTHING;
    EXECUTE format(
        'UPDATE "id_counters" SET %1$I = %1$I + 1 WHERE "company_id" = $1 RETURNING %1$I',
        TG_ARGV[0]
    ) INTO next_number USING NEW."company_id";
    IF next_number > 999999 THEN
        RAISE EXCEPTION 'company % has no % numbers left', NEW."company_id", TG_TABLE_NAME USING ERRCODE = 'ID002';
    END IF;
    NEW."display_number" := next_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "display_number_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF NEW."display_number" IS DISTINCT FROM OLD."display_number" THEN
        RAISE EXCEPTION 'the display number of a row on % cannot change', TG_TABLE_NAME USING ERRCODE = 'ID001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "employees_display_number" BEFORE INSERT ON "employees"
    FOR EACH ROW EXECUTE FUNCTION "assign_display_number"('employee_last');
CREATE TRIGGER "tasks_display_number" BEFORE INSERT ON "tasks"
    FOR EACH ROW EXECUTE FUNCTION "assign_display_number"('task_last');
CREATE TRIGGER "sites_display_number" BEFORE INSERT ON "sites"
    FOR EACH ROW EXECUTE FUNCTION "assign_display_number"('site_last');

CREATE TRIGGER "employees_display_number_guard" BEFORE UPDATE OF "display_number" ON "employees"
    FOR EACH ROW EXECUTE FUNCTION "display_number_guard"();
CREATE TRIGGER "tasks_display_number_guard" BEFORE UPDATE OF "display_number" ON "tasks"
    FOR EACH ROW EXECUTE FUNCTION "display_number_guard"();
CREATE TRIGGER "sites_display_number_guard" BEFORE UPDATE OF "display_number" ON "sites"
    FOR EACH ROW EXECUTE FUNCTION "display_number_guard"();

-- The API role (20261103000000) reads and writes new tables through default privileges.
-- It needs no more: it never writes id_counters itself, the triggers do.
