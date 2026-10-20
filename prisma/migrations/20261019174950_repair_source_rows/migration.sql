-- AlterTable
ALTER TABLE "repair_sources" ADD COLUMN     "applied_batch_id" INTEGER,
ADD COLUMN     "rows" JSONB;
