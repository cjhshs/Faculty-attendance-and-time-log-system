import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatLong } from "@/lib/dates";

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
        <h1 className="text-xl font-bold">Audit Log</h1>
        <span className="text-sm text-zinc-500">{total} entr{total === 1 ? "y" : "ies"}</span>
      </div>

      <form className="card flex flex-wrap items-end gap-4" method="get">
        <div>
          <label className="label" htmlFor="action">
            Action contains
          </label>
          <input id="action" name="action" className="input" defaultValue={params.action ?? ""} />
        </div>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>

      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
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
                <td colSpan={4} className="text-center text-zinc-400">
                  No audit entries.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
