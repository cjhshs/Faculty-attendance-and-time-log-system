import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatLong } from "@/lib/dates";
import { ScrollArea } from "../ScrollArea";
import { SearchForm } from "../SearchForm";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 50;
  const where = params.action
    ? { action: { contains: params.action, mode: "insensitive" as const } }
    : undefined;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const query = params.action ? `&action=${encodeURIComponent(params.action)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Audit Log</h1>
        <span className="text-sm text-muted">{total} entr{total === 1 ? "y" : "ies"}</span>
      </div>

      <SearchForm
        action="/audit"
        name="action"
        defaultValue={params.action ?? ""}
        placeholder="Search action..."
        className="card"
      />

      <ScrollArea className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">User</th>
              <th scope="col">Action</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap">{formatLong(log.createdAt)}</td>
                <td>{log.user?.name ?? "—"}</td>
                <td className="font-mono text-xs">{log.action}</td>
                <td>{log.details}</td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-muted">
                  No audit entries.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollArea>

      <div className="flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link className="btn" href={`/audit?page=${page - 1}${query}`}>
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="text-zinc-500">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link className="btn" href={`/audit?page=${page + 1}${query}`}>
            Next
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
