-- CreateTable
CREATE TABLE "import_batches" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "school_year" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "slot_count" INTEGER NOT NULL DEFAULT 0,
    "imported_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "schedule_slots" ADD COLUMN "import_batch_id" INTEGER;

-- CreateIndex
CREATE INDEX "import_batches_school_year_semester_idx" ON "import_batches"("school_year", "semester");

-- CreateIndex
CREATE INDEX "import_batches_created_at_idx" ON "import_batches"("created_at");

-- CreateIndex
CREATE INDEX "schedule_slots_import_batch_id_idx" ON "schedule_slots"("import_batch_id");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
