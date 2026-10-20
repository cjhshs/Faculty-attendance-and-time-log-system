-- DropIndex
DROP INDEX "repair_findings_source_id_row_number_code_field_key";

-- CreateIndex
CREATE INDEX "repair_findings_source_id_row_number_idx" ON "repair_findings"("source_id", "row_number");
