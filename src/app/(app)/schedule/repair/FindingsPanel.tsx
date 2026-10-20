"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  decideRepairFinding,
  suggestRepairFinding,
  type RepairDecideState,
  type RepairSuggestState,
} from "./actions";

export type FindingItem = {
  id: number;
  rowNumber: number;
  code: string;
  label: string;
  severity: string;
  field: string;
  cn: string | null;
  original: string | null;
  proposed: string | null;
  appliedValue: string | null;
  explanation: string;
  status: string;
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-zinc-100 text-zinc-700",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-zinc-200 text-zinc-700",
  unresolved: "bg-red-100 text-red-800",
  applied: "bg-blue-100 text-blue-800",
};

const SEVERITY_TONE: Record<string, string> = {
  error: "bg-red-100 text-red-800",
  review: "bg-amber-100 text-amber-800",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
};

export function FindingsPanel({
  items,
  page,
  pageSize,
  total,
  prevHref,
  nextHref,
  aiEnabled,
}: {
  items: FindingItem[];
  page: number;
  pageSize: number;
  total: number;
  prevHref: string;
  nextHref: string;
  aiEnabled: boolean;
}) {
  if (total === 0) {
    return <div className="card text-sm text-muted">No findings match this filter.</div>;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title mb-0">
          Findings {from}–{to} of {total}
        </h2>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={prevHref} className="btn btn-sm">
              Previous
            </Link>
          ) : null}
          {to < total ? (
            <Link href={nextHref} className="btn btn-sm">
              Next
            </Link>
          ) : null}
        </div>
      </div>

      <ul className="divide-y divide-line">
        {items.map((f) => (
          <FindingRow key={f.id} finding={f} aiEnabled={aiEnabled} />
        ))}
      </ul>
    </div>
  );
}

const decideInitial: RepairDecideState = { ok: false, message: "" };
const suggestInitial: RepairSuggestState = { ok: false, message: "" };

function FindingRow({ finding, aiEnabled }: { finding: FindingItem; aiEnabled: boolean }) {
  const [state, action, pending] = useActionState(decideRepairFinding, decideInitial);
  const [suggestion, suggestAction, suggesting] = useActionState(suggestRepairFinding, suggestInitial);
  const needsValue = finding.proposed === null;
  const baseValue = finding.appliedValue ?? finding.proposed ?? finding.original ?? "";
  // A successful AI suggestion pre-fills the field by remounting it (keyed), so
  // no state synchronisation effect is needed and any typed edit is preserved.
  const suggested = suggestion.ok && suggestion.value ? suggestion.value : null;
  const fieldValue = suggested ?? baseValue;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted">Row {finding.rowNumber}</span>
        {finding.cn ? <span className="font-mono text-xs text-muted">CN {finding.cn}</span> : null}
        <span className={"badge " + (SEVERITY_TONE[finding.severity] ?? "bg-zinc-100")}>{finding.severity}</span>
        <span className="badge bg-navy/5 text-navy">{finding.label}</span>
        <span className={"badge " + (STATUS_TONE[finding.status] ?? "bg-zinc-100")}>{finding.status}</span>
      </div>
      <p className="mt-1 text-sm text-navy">{finding.explanation}</p>
      <p className="mt-1 text-xs text-muted">
        <span className="font-mono">{finding.field}</span>:{" "}
        <span className="line-through">{finding.original || "(empty)"}</span>
        {finding.proposed ? (
          <>
            {" "}
            → <span className="font-semibold text-green-700">{finding.proposed}</span>
          </>
        ) : null}
      </p>

      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="findingId" value={finding.id} />
        <input
          key={fieldValue}
          name="value"
          defaultValue={fieldValue}
          className="input max-w-md text-xs"
          placeholder={needsValue ? "Enter the corrected value" : "Value (defaults to the proposal)"}
        />
        <button type="submit" name="action" value="accept" className="btn btn-sm btn-primary" disabled={pending}>
          Accept
        </button>
        <button type="submit" name="action" value="reject" className="btn btn-sm" disabled={pending}>
          Reject
        </button>
        <button type="submit" name="action" value="unresolved" className="btn btn-sm btn-danger" disabled={pending}>
          Unresolved
        </button>
        {state.message ? (
          <span className={"text-xs " + (state.ok ? "text-green-700" : "text-red-700")}>{state.message}</span>
        ) : null}
      </form>

      {aiEnabled ? (
        <form action={suggestAction} className="mt-1 flex items-center gap-2">
          <input type="hidden" name="findingId" value={finding.id} />
          <button type="submit" className="btn btn-sm btn-ghost" disabled={suggesting}>
            {suggesting ? "Asking AI…" : "Ask AI for a suggestion"}
          </button>
          {suggestion.message ? (
            <span className={"text-xs " + (suggestion.ok ? "text-muted" : "text-red-700")}>{suggestion.message}</span>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}
