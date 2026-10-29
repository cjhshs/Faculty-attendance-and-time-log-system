-- Academic periods and duplicate-import detection.
--
-- Additive / non-destructive:
--   * existing schedule slots and import batches are untouched;
--   * existing (school year, semester) pairs are registered as periods with no
--     dates and no status, because their real boundaries are unknown;
--   * import checksums are nullable so historical batches remain valid.

CREATE TYPE "academic_period_status" AS ENUM ('active', 'upcoming', 'archived');

CREATE TABLE "academic_periods" (
    "id" SERIAL NOT NULL,
    "school_year" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" "academic_period_status",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academic_periods_school_year_semester_key"
    ON "academic_periods"("school_year", "semester");
CREATE INDEX "academic_periods_school_year_semester_idx"
    ON "academic_periods"("school_year", "semester");

-- Register every term that already exists on a schedule. Dates stay NULL: the
-- real semester boundaries are not stored anywhere, so inventing them would be
-- a guess. An administrator can fill them in later.
INSERT INTO "academic_periods" ("school_year", "semester", "updated_at")
SELECT DISTINCT "school_year", "semester", CURRENT_TIMESTAMP
FROM "schedule_slots"
WHERE "school_year" IS NOT NULL AND "semester" IS NOT NULL
ON CONFLICT ("school_year", "semester") DO NOTHING;

-- Also register terms that only appear in import history.
INSERT INTO "academic_periods" ("school_year", "semester", "updated_at")
SELECT DISTINCT "school_year", "semester", CURRENT_TIMESTAMP
FROM "import_batches"
WHERE "school_year" IS NOT NULL AND "semester" IS NOT NULL
ON CONFLICT ("school_year", "semester") DO NOTHING;

ALTER TABLE "import_batches" ADD COLUMN "checksum" TEXT;

CREATE INDEX "import_batches_school_year_semester_checksum_idx"
    ON "import_batches"("school_year", "semester", "checksum");
