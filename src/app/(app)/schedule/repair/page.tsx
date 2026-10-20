import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveTerm, normalizeSemester } from "@/lib/terms";
import { ISSUE_LABELS, type RepairSummary } from "@/lib/schedule-repair";
import { isRepairAiEnabled } from "@/lib/schedule-repair-ai";
import { RepairClient } from "./RepairClient";
import { FindingsPanel } from "./FindingsPanel";
import { ApplyPanel } from "./ApplyPanel";

const CATEGORIES: { key: string; label: string; codes: string[] | null }[] = [
  { key: "all", label: "All", codes: null },
  {
    key: "time",
    label: "Times",
    codes: ["TIME_ZERO_LENGTH", "TIME_BACKWARDS", "TIME_TOO_LONG", "TIME_UNREADABLE", "DAY_UNKNOWN", "SCHEDULE_UNPARSEABLE"],
  },
  { key: "instructor", label: "Instructors", codes: ["MISSING_INSTRUCTOR", "NAME_UNMATCHED", "NAME_AMBIGUOUS", "NAME_FORMAT"] },
  { key: "room", label: "Rooms", codes: ["ROOM_MISSING", "ROOM_LAB_SUFFIX"] },
  { key: "duplicates", label: "Duplicates", codes: ["DUP_EXACT", "DUP_POSSIBLE"] },
  { key: "conflicts", label: "Conflicts", codes: ["CONFLICT_OVERLAP"] },
  { key: "hours", label: "Hours", codes: ["HOURS_MISMATCH", "SLOT_DUP_IN_CELL"] },
  { key: "whitespace", label: "Formatting", codes: ["WS_WHITESPACE"] },
];

const PAGE_SIZE = 100;

function q(params: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const merged = { ...params, ...patch };
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) search.set(k, v);
  const s = search.toString();
  return `/schedule/repair${s ? `?${s}` : ""}`;
}

export default async function RepairPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(PERMISSIONS.SCHEDULE_REPAIR);
  const params = await searchParams;
  const activeTerm = await getActiveTerm();

  const sources = await prisma.repairSource.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const requestedId = Number(params.sourceId);
  const source = Number.isInteger(requestedId) && requestedId > 0
    ? await prisma.repairSource.findUnique({ where: { id: requestedId } })
    : sources[0] ?? null;

  let panel: React.ReactNode = null;

  if (source) {
    const category = CATEGORIES.find((c) => c.key === (params.category ?? "all")) ?? CATEGORIES[0];
    const severity = params.severity ?? "";
    const status = params.status ?? "";
    const page = Math.max(1, Number(params.page) || 1);

    const where = {
      sourceId: source.id,
      ...(category.codes ? { code: { in: category.codes } } : {}),
      ...(severity ? { severity } : {}),
      ...(status ? { status } : {}),
    };

    const [items, total, statusGroups, severityGroups] = await Promise.all([
      prisma.repairFinding.findMany({
        where,
        orderBy: [{ rowNumber: "asc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.repairFinding.count({ where }),
      prisma.repairFinding.groupBy({ by: ["status"], where: { sourceId: source.id }, _count: { _all: true } }),
      prisma.repairFinding.groupBy({ by: ["severity"], where: { sourceId: source.id }, _count: { _all: true } }),
    ]);

    const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
    const sevCounts = Object.fromEntries(severityGroups.map((g) => [g.severity, g._count._all]));
    const summary = (source.summary as unknown as RepairSummary) ?? null;
    const baseParams: Record<string, string | undefined> = {
      sourceId: String(source.id),
      category: category.key,
      severity,
      status,
    };

    panel = (
      <div className="space-y-5">
        <SourceHeader source={source} summary={summary} counts={counts} sevCounts={sevCounts} />

        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Category</span>
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href={q(baseParams, { category: c.key, page: "1" })}
                className={"badge " + (c.key === category.key ? "bg-navy text-white" : "bg-zinc-100 text-zinc-700")}
              >
                {c.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Severity</span>
            {["", "error", "review", "warning", "info"].map((s) => (
              <Link
                key={s || "any"}
                href={q(baseParams, { severity: s, page: "1" })}
                className={"badge " + (s === severity ? "bg-navy text-white" : "bg-zinc-100 text-zinc-700")}
              >
                {s === "" ? "Any" : `${s} (${sevCounts[s] ?? 0})`}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Status</span>
            {["", "open", "accepted", "rejected", "unresolved", "applied"].map((s) => (
              <Link
                key={s || "any"}
                href={q(baseParams, { status: s, page: "1" })}
                className={"badge " + (s === status ? "bg-navy text-white" : "bg-zinc-100 text-zinc-700")}
              >
                {s === "" ? "Any" : `${s} (${counts[s] ?? 0})`}
              </Link>
            ))}
          </div>
        </div>

        <FindingsPanel
          items={items.map((f) => ({
            id: f.id,
            rowNumber: f.rowNumber,
            code: f.code,
            label: ISSUE_LABELS[f.code] ?? f.code,
            severity: f.severity,
            field: f.field,
            cn: f.cn,
            original: f.original,
            proposed: f.proposed,
            appliedValue: f.appliedValue,
            explanation: f.explanation,
            status: f.status,
          }))}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          prevHref={q(baseParams, { page: String(page - 1) })}
          nextHref={q(baseParams, { page: String(page + 1) })}
          aiEnabled={isRepairAiEnabled()}
        />

        <ApplyPanel
          sourceId={source.id}
          applied={Boolean(source.appliedAt)}
          defaultSchoolYear={source.schoolYear ?? activeTerm.schoolYear}
          defaultSemester={normalizeSemester(source.semester) ?? activeTerm.semester}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Repair Schedule</h1>
        <p className="page-subtitle">
          Analyze a schedule workbook, review every issue, approve the corrections, then apply the
          cleaned schedule. Nothing is written until you apply.
        </p>
      </div>

      <RepairClient
        defaultSchoolYear={activeTerm.schoolYear}
        defaultSemester={activeTerm.semester}
      />

      {sources.length > 0 ? (
        <div className="card">
          <h2 className="section-title">Recent analyses</h2>
          <ul className="space-y-1 text-sm">
            {sources.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/schedule/repair?sourceId=${s.id}`}
                  className={s.id === source?.id ? "font-semibold text-navy" : "text-navy hover:underline"}
                >
                  #{s.id} · {s.filename}
                </Link>
                <span className="text-muted">
                  {" "}
                  — {s.rowCount} rows, {s.createdAt.toISOString().slice(0, 10)}
                  {s.appliedAt ? " · applied" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel}
    </div>
  );
}

function SourceHeader({
  source,
  summary,
  counts,
  sevCounts,
}: {
  source: { id: number; filename: string; rowCount: number; appliedAt: Date | null };
  summary: RepairSummary | null;
  counts: Record<string, number>;
  sevCounts: Record<string, number>;
}) {
  if (!summary) return null;
  const stats: { label: string; value: number | string; tone?: string }[] = [
    { label: "Rows", value: summary.rowsInspected },
    { label: "Clean", value: summary.cleanRows, tone: "text-green-700" },
    { label: "Review", value: summary.reviewRows, tone: "text-amber-700" },
    { label: "Cannot print", value: summary.invalidRows, tone: "text-red-700" },
    { label: "Conflicts", value: summary.conflictFindings, tone: "text-red-700" },
    { label: "Possible dupes", value: summary.possibleDuplicateGroups },
    { label: "Scheduled hrs", value: summary.scheduledHours },
    { label: "Sheet hrs", value: summary.sheetHours },
  ];
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title mb-0">
          Analysis #{source.id} — {source.filename}
        </h2>
        {source.appliedAt ? <span className="badge bg-green-100 text-green-800">Applied</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p>
            <p className={`mt-1 text-lg font-bold ${s.tone ?? "text-navy"}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Decisions — open: {counts.open ?? 0} · accepted: {counts.accepted ?? 0} · rejected:{" "}
        {counts.rejected ?? 0} · unresolved: {counts.unresolved ?? 0} · applied: {counts.applied ?? 0}
        {" · "}
        errors: {sevCounts.error ?? 0} · review: {sevCounts.review ?? 0} · info: {sevCounts.info ?? 0}
      </p>
      {summary.roomsToCreate.length || summary.programsToCreate.length || summary.facultyToCreate.length ? (
        <p className="text-xs text-muted">
          Applying will create {summary.programsToCreate.length} program(s),{" "}
          {summary.roomsToCreate.length} room(s) and {summary.facultyToCreate.length} faculty record(s)
          as needed.
        </p>
      ) : null}
    </div>
  );
}
