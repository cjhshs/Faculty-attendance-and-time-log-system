-- Add the calendar range selected for each schedule import. Both columns stay
-- NULL for older batches and for imports that use the semester default when no
-- reviewed semester dates are configured.
ALTER TABLE "import_batches"
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE;
