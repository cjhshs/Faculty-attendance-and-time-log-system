"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

// Stable "print page N" control. Page boundaries are computed on the server from
// the schedule data, so choosing page N never re-paginates the report.
export function PrintPageSelector({
  totalPages,
  currentPage,
}: {
  totalPages: number;
  currentPage: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(String(currentPage ?? 1));
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1),
    [totalPages],
  );

  function navigate(selected: number, autoPrint: boolean) {
    if (!Number.isInteger(selected) || selected < 1 || selected > totalPages) {
      setError(`Enter a page between 1 and ${totalPages}.`);
      return;
    }
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(selected));
    if (autoPrint) params.set("autoprint", "1");
    else params.delete("autoprint");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="no-print rounded-lg border border-line bg-white/80 p-3 shadow-sm print:hidden">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label mb-1" htmlFor="print-page">
            Print specific page
          </label>
          <div className="flex items-center gap-2">
            <select
              id="print-page"
              className="input h-9 w-24"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              aria-label="Page number to print"
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  Page {n}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">of {Math.max(1, totalPages)}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => navigate(Number(page), false)}
        >
          Preview page
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate(Number(page), true)}
        >
          Print selected page
        </button>
        {currentPage ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("page");
              params.delete("autoprint");
              router.push(`${pathname}?${params.toString()}`);
            }}
          >
            Show all pages
          </button>
        ) : (
          <span className="text-xs text-muted">
            All pages are shown. Choose a page to reprint only that sheet.
          </span>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {currentPage ? (
        <p className="mt-2 text-xs text-muted">
          Previewing page {currentPage} of {Math.max(1, totalPages)}. Only this page will print.
        </p>
      ) : null}
    </div>
  );
}
