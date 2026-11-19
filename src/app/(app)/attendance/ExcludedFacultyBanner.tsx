"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../confirm";

export function ExcludedFacultyBanner({
  sheetKey,
  excludedFaculty,
}: {
  sheetKey: string;
  excludedFaculty: { id: number; fullName: string }[];
}) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const { alert, dialog } = useConfirm();

  if (excludedFaculty.length === 0) return null;

  async function handleRestore(facultyId: number) {
    setRestoringId(facultyId);
    try {
      const res = await fetch("/api/attendance/custom-faculty/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetKey, facultyId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        await alert({
          title: "Could not restore faculty member",
          message: data.error ?? "Failed to restore faculty member.",
          tone: "danger",
        });
        return;
      }
      router.refresh();
    } catch (err) {
      await alert({
        title: "Could not restore faculty member",
        message: err instanceof Error ? err.message : "Failed to restore faculty member.",
        tone: "danger",
      });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
      {dialog}
      <span className="font-medium text-slate-600">
        Removed / Excluded from this sheet ({excludedFaculty.length}):
      </span>
      {excludedFaculty.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
        >
          <span>{f.fullName}</span>
          <button
            type="button"
            onClick={() => handleRestore(f.id)}
            disabled={restoringId === f.id}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
          >
            {restoringId === f.id ? "Restoring..." : "Restore"}
          </button>
        </span>
      ))}
    </div>
  );
}
