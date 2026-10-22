// Canonical display names for every program. The actual catalog (with college
// assignment and official/unofficial status) lives in `college-catalog.ts`; this
// module keeps the old name-based API used by the seed and importer.

import { programForCode } from "@/lib/college-catalog";

export function programNameFor(code: string): string | null {
  return programForCode(code)?.name ?? null;
}
