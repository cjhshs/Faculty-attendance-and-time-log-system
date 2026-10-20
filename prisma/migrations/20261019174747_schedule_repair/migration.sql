-- CreateTable
CREATE TABLE "repair_sources" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "school_year" TEXT,
    "semester" TEXT,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "created_by_id" INTEGER,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_findings" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "certainty" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "cn" TEXT,
    "original" TEXT,
    "proposed" TEXT,
    "evidence" TEXT,
    "explanation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "applied_value" TEXT,
    "decided_by_id" INTEGER,
    "decided_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repair_sources_checksum_key" ON "repair_sources"("checksum");

-- CreateIndex
CREATE INDEX "repair_sources_created_at_idx" ON "repair_sources"("created_at");

-- CreateIndex
CREATE INDEX "repair_findings_source_id_status_idx" ON "repair_findings"("source_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "repair_findings_source_id_row_number_code_field_key" ON "repair_findings"("source_id", "row_number", "code", "field");

-- AddForeignKey
ALTER TABLE "repair_sources" ADD CONSTRAINT "repair_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_findings" ADD CONSTRAINT "repair_findings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "repair_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_findings" ADD CONSTRAINT "repair_findings_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
