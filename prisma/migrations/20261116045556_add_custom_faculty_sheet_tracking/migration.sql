-- CreateTable
CREATE TABLE "custom_faculty" (
    "id" SERIAL NOT NULL,
    "faculty_id" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_custom_faculty" (
    "id" SERIAL NOT NULL,
    "sheet_key" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "faculty_id" INTEGER NOT NULL,
    "course_id" INTEGER,
    "custom_faculty_id" INTEGER,
    "action" TEXT NOT NULL DEFAULT 'CUSTOM_ADD',
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_custom_faculty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_faculty_faculty_id_key" ON "custom_faculty"("faculty_id");

-- CreateIndex
CREATE INDEX "sheet_custom_faculty_sheet_key_idx" ON "sheet_custom_faculty"("sheet_key");

-- CreateIndex
CREATE INDEX "sheet_custom_faculty_faculty_id_idx" ON "sheet_custom_faculty"("faculty_id");

-- CreateIndex
CREATE INDEX "sheet_custom_faculty_date_idx" ON "sheet_custom_faculty"("date");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_custom_faculty_sheet_key_faculty_id_key" ON "sheet_custom_faculty"("sheet_key", "faculty_id");

-- AddForeignKey
ALTER TABLE "custom_faculty" ADD CONSTRAINT "custom_faculty_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_custom_faculty" ADD CONSTRAINT "sheet_custom_faculty_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_custom_faculty" ADD CONSTRAINT "sheet_custom_faculty_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_custom_faculty" ADD CONSTRAINT "sheet_custom_faculty_custom_faculty_id_fkey" FOREIGN KEY ("custom_faculty_id") REFERENCES "custom_faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_custom_faculty" ADD CONSTRAINT "sheet_custom_faculty_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
