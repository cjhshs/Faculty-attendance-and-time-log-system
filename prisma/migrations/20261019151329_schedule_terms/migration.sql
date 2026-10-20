-- AlterTable
ALTER TABLE "schedule_slots" ADD COLUMN     "school_year" TEXT;

-- CreateIndex
CREATE INDEX "schedule_slots_school_year_semester_idx" ON "schedule_slots"("school_year", "semester");

-- Backfill: all existing schedules belong to the current academic year.
UPDATE "schedule_slots"
SET "school_year" = '2026-2027'
WHERE "school_year" IS NULL;

-- Normalise existing semester labels to the canonical set
-- ("1st Semester", "2nd Semester", "Summer") without losing any records.
UPDATE "schedule_slots"
SET "semester" = CASE
  WHEN "semester" ILIKE '1st%' OR "semester" = '1' THEN '1st Semester'
  WHEN "semester" ILIKE '2nd%' OR "semester" = '2' THEN '2nd Semester'
  WHEN "semester" ILIKE 'summer%' OR "semester" ILIKE 'midyear%' OR "semester" ~* '3rd\s*sem' THEN 'Summer'
  ELSE "semester"
END
WHERE "semester" IS NOT NULL;

-- Seed the active academic term (reused by the Schedule tab and attendance encoding).
INSERT INTO "settings" ("key", "value", "created_at", "updated_at")
VALUES
  ('active_school_year', '2026-2027', now(), now()),
  ('active_semester', '1st Semester', now(), now())
ON CONFLICT ("key") DO NOTHING;
