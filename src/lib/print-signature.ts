import { prisma } from "@/lib/prisma";
import type { SettingsMap } from "@/lib/settings";

export type SignatureValues = {
  preparedBy: string;
  preparedDesignation: string;
  checkedBy: string;
  checkedDesignation: string;
};

export const EMPTY_SIGNATURE: SignatureValues = {
  preparedBy: "",
  preparedDesignation: "",
  checkedBy: "",
  checkedDesignation: "",
};

export function attendanceSignatureScopeKey(input: {
  department?: string | null;
  programs?: string[];
  schoolYear: string;
  semester: string;
}): string {
  const department = (input.department ?? "").trim().toUpperCase();
  const programs = (input.programs ?? []).map((p) => p.trim().toUpperCase()).sort();
  const joined = programs.join(",");
  const scope = department
    ? `dept-${department}`
    : programs.length > 0
      ? joined.length <= 120
        ? `programs-${joined}`
        : `programs-${programs.length}-${shortHash(joined)}`
      : "all";
  return `attendance:${scope}:${input.schoolYear}:${input.semester}`;
}

// Stable compact hash so a long program list cannot push the scope key past the
// API/database limit while still keeping each list's signatures separate.
function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function clampSignatureField(value: unknown, max = 160): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Saved values for this scope win; the global Settings names are the fallback so
// existing installations keep printing the names they already configured.
export async function getSignatureValues(
  scopeKey: string,
  settings: SettingsMap,
): Promise<SignatureValues> {
  const saved = await prisma.reportSignature.findUnique({ where: { scopeKey } });
  return {
    preparedBy: saved?.preparedBy || settings.prepared_by || "",
    preparedDesignation: saved?.preparedDesignation || "",
    checkedBy: saved?.checkedBy || settings.checked_by || "",
    checkedDesignation: saved?.checkedDesignation || "",
  };
}
