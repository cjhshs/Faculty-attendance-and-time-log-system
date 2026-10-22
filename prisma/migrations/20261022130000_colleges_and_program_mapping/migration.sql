-- Multi-department support: colleges, and a college link on every program.
-- Additive only: no schedule, attendance or user rows are touched.

CREATE TABLE "colleges" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "colleges_code_key" ON "colleges"("code");

ALTER TABLE "courses"
    ADD COLUMN "college_id" INTEGER,
    ADD COLUMN "source_code" TEXT,
    ADD COLUMN "official" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "courses_college_id_idx" ON "courses"("college_id");

ALTER TABLE "courses"
    ADD CONSTRAINT "courses_college_id_fkey"
    FOREIGN KEY ("college_id") REFERENCES "colleges"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "colleges" ("code", "name", "sort_order", "updated_at") VALUES
    ('CET',   'College of Engineering and Technology', 10, CURRENT_TIMESTAMP),
    ('COAHS', 'College of Allied Health Sciences',     20, CURRENT_TIMESTAMP),
    ('CBE',   'College of Business Education',         30, CURRENT_TIMESTAMP),
    ('CTE',   'College of Teacher Education',          40, CURRENT_TIMESTAMP),
    ('CCJ',   'College of Criminal Justice',           50, CURRENT_TIMESTAMP),
    ('CAS',   'College of Arts and Sciences',          60, CURRENT_TIMESTAMP);

-- Preserve the original workbook value for every program already on file.
UPDATE "courses" SET "source_code" = "code" WHERE "source_code" IS NULL;

-- The only programs that existed before this migration are the five CET
-- programs, so their college is known reliably.
UPDATE "courses"
SET "college_id" = (SELECT "id" FROM "colleges" WHERE "code" = 'CET')
WHERE "code" IN ('BSCE-SE', 'BSCS', 'BSIT', 'BLIS', 'ACT');

-- "BSCE-SE" was named as a Computer Engineering program, but its subjects are
-- Civil Engineering. Correct the name only if it still has the old value, so an
-- administrator's later edit is never overwritten.
UPDATE "courses"
SET "name" = 'Bachelor of Science in Civil Engineering'
WHERE "code" = 'BSCE-SE'
  AND "name" = 'Bachelor of Science in Computer Engineering - Software Engineering';
