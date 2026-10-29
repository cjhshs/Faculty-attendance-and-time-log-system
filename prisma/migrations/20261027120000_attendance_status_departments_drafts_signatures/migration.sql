-- Faculty departments, nullable attendance status, private drafts and
-- printable-sheet signatures.
--
-- Additive / non-destructive:
--   * existing attendance rows keep their present true/false value;
--   * no faculty row is assigned a department automatically (NULL = needs review);
--   * no schedule, session or user data is deleted.

-- 1. Faculty belong to an official department, independent of the programs they
--    teach. NULL means the department has not been reviewed yet.
ALTER TABLE "faculty" ADD COLUMN "department_id" INTEGER;

CREATE INDEX "faculty_department_id_idx" ON "faculty"("department_id");

ALTER TABLE "faculty"
    ADD CONSTRAINT "faculty_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "colleges"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Attendance status is tri-state: NULL = not encoded, true = present,
--    false = absent. Existing true/false rows are preserved as-is.
ALTER TABLE "attendance" ALTER COLUMN "present" DROP DEFAULT;
ALTER TABLE "attendance" ALTER COLUMN "present" DROP NOT NULL;

-- 3. Per-user attendance drafts (never official attendance).
CREATE TABLE "attendance_drafts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "scope_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_drafts_user_id_scope_key_key"
    ON "attendance_drafts"("user_id", "scope_key");
CREATE INDEX "attendance_drafts_updated_at_idx" ON "attendance_drafts"("updated_at");

ALTER TABLE "attendance_drafts"
    ADD CONSTRAINT "attendance_drafts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Persisted prepared-by / checked-by values per print scope.
CREATE TABLE "report_signatures" (
    "id" SERIAL NOT NULL,
    "scope_key" TEXT NOT NULL,
    "prepared_by" TEXT NOT NULL DEFAULT '',
    "prepared_designation" TEXT NOT NULL DEFAULT '',
    "checked_by" TEXT NOT NULL DEFAULT '',
    "checked_designation" TEXT NOT NULL DEFAULT '',
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_signatures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_signatures_scope_key_key" ON "report_signatures"("scope_key");
CREATE INDEX "report_signatures_updated_at_idx" ON "report_signatures"("updated_at");

ALTER TABLE "report_signatures"
    ADD CONSTRAINT "report_signatures_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
