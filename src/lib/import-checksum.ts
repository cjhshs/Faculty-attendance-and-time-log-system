import { createHash } from "crypto";

// Duplicate-import recognition. A workbook is identified by its exact bytes, so
// reformatting the same records produces a different checksum and is treated as
// a new (reviewed) import. The checksum is scoped to one school year + semester:
// the same file may legitimately be imported into a different period.

export type ImportBatchFingerprint = {
  id: number;
  filename: string;
  schoolYear: string;
  semester: string;
  slotCount: number;
  checksum: string | null;
  createdAt: Date | string;
};

export function importChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function isDuplicateImport(
  batch: Pick<ImportBatchFingerprint, "schoolYear" | "semester" | "checksum"> | null | undefined,
  target: { schoolYear: string; semester: string } | null | undefined,
  checksum: string | null | undefined,
): boolean {
  if (!batch || !target || !checksum) return false;
  return (
    batch.schoolYear === target.schoolYear &&
    batch.semester === target.semester &&
    batch.checksum === checksum
  );
}

export function describeDuplicateImport(batch: ImportBatchFingerprint): string {
  const when =
    batch.createdAt instanceof Date
      ? batch.createdAt.toISOString().slice(0, 16).replace("T", " ")
      : String(batch.createdAt).slice(0, 16).replace("T", " ");
  return `This exact file was already imported into ${batch.schoolYear} · ${batch.semester} on ${when} (batch #${batch.id}, ${batch.slotCount} slot${batch.slotCount === 1 ? "" : "s"} written). Importing it again will re-apply the same records; nothing is deleted.`;
}
