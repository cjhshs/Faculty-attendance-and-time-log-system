"use client";

import { useEffect, useRef, type ReactNode } from "react";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type Direction = "ascending" | "descending";

// Reorders an existing node within its parent, preserving the parent's other
// children (used to keep a "no rows" placeholder row last).
function moveIntoPlace(parent: HTMLElement, node: Node, before: Node | null) {
  const movable = parent as HTMLElement & {
    moveBefore?: (n: Node, b: Node | null) => void;
  };
  if (typeof movable.moveBefore === "function") movable.moveBefore(node, before);
  else parent.insertBefore(node, before);
}

/**
 * Progressive-enhancement column sorting for a static (server-rendered) table.
 *
 * Put a `<button type="button">Column</button>` inside each sortable
 * `<th scope="col">`; the wrapper wires the buttons, tracks `aria-sort` on the
 * active header, reorders the existing `<tr>`s, and announces the result from a
 * single polite status region. Declare numeric columns with `data-type="number"`
 * and give formatted cells a raw `data-value` so numbers/dates sort correctly.
 *
 * Use this only for tables React does not re-render while mounted (see
 * ScheduleTable for the state-driven variant).
 */
export function SortableTable({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Table name used only in the screen-reader sort announcement. */
  label?: string;
}) {
  const ref = useRef<HTMLTableElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const head = table.tHead;
    const tbody = table.tBodies[0];
    if (!head || !tbody) return;
    if (head.querySelector("th > button") === null) return;

    function sortBy(th: HTMLTableCellElement, button: HTMLButtonElement) {
      const direction: Direction =
        th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
      for (const header of Array.from(head!.rows[0]?.cells ?? [])) {
        header.removeAttribute("aria-sort");
      }
      th.setAttribute("aria-sort", direction);

      const index = th.cellIndex;
      const numeric = th.dataset.type === "number";
      const factor = direction === "ascending" ? 1 : -1;

      const rows = Array.from(tbody!.rows);
      // A single spanning cell is a "no rows" message, not data — keep it last.
      const placeholder =
        rows.find((row) => row.cells.length === 1 && row.cells[0].colSpan > 1) ?? null;
      const sortable = rows.filter((row) => row !== placeholder);

      const readValue = (row: HTMLTableRowElement) => {
        const cell = row.cells[index];
        if (!cell) return "";
        return cell.dataset.value ?? (cell.textContent ?? "").trim();
      };

      const ordered = sortable.slice().sort((a, b) => {
        if (numeric) {
          const av = Number(readValue(a));
          const bv = Number(readValue(b));
          return factor * ((Number.isNaN(av) ? 0 : av) - (Number.isNaN(bv) ? 0 : bv));
        }
        return factor * collator.compare(readValue(a), readValue(b));
      });

      for (const row of ordered) moveIntoPlace(tbody!, row, placeholder);

      if (statusRef.current) {
        statusRef.current.textContent =
          `Sorted by ${(button.textContent ?? "").trim()}, ${direction}` +
          (label ? ` (${label})` : "");
      }
    }

    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>("th > button");
      if (!button || !head!.contains(button)) return;
      const th = button.closest("th");
      if (th) sortBy(th as HTMLTableCellElement, button);
    }

    table.addEventListener("click", onClick);
    return () => table.removeEventListener("click", onClick);
  }, [label]);

  return (
    <>
      <table ref={ref} className={className}>
        {children}
      </table>
      <span ref={statusRef} role="status" aria-live="polite" className="visually-hidden" />
    </>
  );
}
