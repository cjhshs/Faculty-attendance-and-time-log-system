import { requirePermission, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import {
  assignRoles,
  createRole,
  createUser,
  resetPassword,
  toggleUserActive,
  updateRolePermissions,
  deleteRole,
} from "./actions";

export default async function UsersPage() {
  const actor = await requirePermission(PERMISSIONS.USERS_VIEW);
  const canManageUsers = hasPermission(actor, PERMISSIONS.USERS_MANAGE);
  const canManageRoles = hasPermission(actor, PERMISSIONS.ROLES_MANAGE);

  const [users, roles, permissions] = await Promise.all([
    prisma.user.findMany({
      include: { userRoles: { include: { role: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.permission.findMany({ orderBy: { name: "asc" } }),
  ]);

  const grouped = new Map<string, typeof permissions>();
  for (const p of permissions) {
    const group = p.name.split(".")[0];
    const list = grouped.get(group) ?? [];
    list.push(p);
    grouped.set(group, list);
  }

  const canGrant = (name: string) => actor.permissions.includes(name);

  return (
    <div className="space-y-8">
      <h1 className="page-title">Users and Roles</h1>

      {canManageUsers ? (
        <section className="card">
          <h2 className="mb-3 section-title">Create user</h2>
          <ActionForm action={createUser} submitLabel="Create user" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label req" htmlFor="uname">
                  Full name
                </label>
                <input id="uname" name="name" className="input" required />
              </div>
              <div>
                <label className="label req" htmlFor="uusername">
                  Username
                </label>
                <input id="uusername" name="username" className="input" required />
              </div>
              <div>
                <label className="label req" htmlFor="upassword">
                  Temporary password
                </label>
                <input id="upassword" name="password" type="text" className="input" required />
              </div>
            </div>
            <div className="mt-3">
              <p className="label">Roles</p>
              <div className="flex flex-wrap gap-3">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="roleIds" value={role.id} />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <section className="card overflow-auto">
        <h2 className="mb-3 section-title">Users ({users.length})</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Roles</th>
              <th>Status</th>
              {canManageUsers ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="font-mono text-xs">{u.username}</td>
                <td>{u.userRoles.map((ur) => ur.role.name).join(", ")}</td>
                <td>
                  {u.active ? (
                    <span className="badge bg-green-100 text-green-800">Active</span>
                  ) : (
                    <span className="badge bg-zinc-200 text-zinc-600">Inactive</span>
                  )}
                </td>
                {canManageUsers ? (
                  <td className="space-y-2">
                    <ActionButton
                      action={toggleUserActive}
                      label={u.active ? "Deactivate" : "Activate"}
                      fields={{ userId: u.id }}
                    />
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-navy-2">Manage</summary>
                      <div className="mt-2 w-64 space-y-2">
                        <ActionForm action={assignRoles} submitLabel="Save roles">
                          <input type="hidden" name="userId" value={u.id} />
                          <div className="flex flex-wrap gap-2">
                            {roles.map((role) => (
                              <label key={role.id} className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  name="roleIds"
                                  value={role.id}
                                  defaultChecked={u.userRoles.some((ur) => ur.roleId === role.id)}
                                />
                                {role.name}
                              </label>
                            ))}
                          </div>
                        </ActionForm>
                        <ActionForm action={resetPassword} submitLabel="Reset password">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            name="password"
                            type="text"
                            className="input"
                            placeholder="New temporary password"
                          />
                        </ActionForm>
                      </div>
                    </details>
                    </td>
                  ) : null}
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {canManageRoles ? (
        <section className="card">
          <h2 className="mb-3 section-title">Create role</h2>
          <ActionForm action={createRole} submitLabel="Create role" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label req" htmlFor="rname">
                  Role name
                </label>
                <input id="rname" name="name" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="rdesc">
                  Description
                </label>
                <input id="rdesc" name="description" className="input" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {Array.from(grouped.entries()).map(([group, list]) => (
                <div key={group}>
                  <p className="text-xs font-semibold uppercase text-muted">{group}</p>
                  <div className="flex flex-wrap gap-3">
                    {list.map((p) => (
                      <label key={p.id} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="permissionIds" value={p.id} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ActionForm>
        </section>
      ) : null}

      <section className="card space-y-4">
        <h2 className="section-title">Roles ({roles.length})</h2>
        {roles.map((role) => (
          <div key={role.id} className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {role.name} {!role.canDelete ? <span className="text-xs text-muted">(protected)</span> : null}
                </p>
                <p className="text-xs text-muted">{role.description}</p>
              </div>
              {canManageRoles && role.canDelete ? (
                <ActionButton
                  action={deleteRole}
                  label="Delete role"
                  variant="danger"
                  fields={{ roleId: role.id }}
                  confirm={`Delete role ${role.name}?`}
                />
              ) : null}
            </div>
            {canManageRoles ? (
              <ActionForm action={updateRolePermissions} submitLabel="Save permissions">
                <input type="hidden" name="roleId" value={role.id} />
                <div className="space-y-2">
                  {Array.from(grouped.entries()).map(([group, list]) => (
                    <div key={group}>
                      <p className="text-xs font-semibold uppercase text-muted">{group}</p>
                      <div className="flex flex-wrap gap-3">
                        {list.map((p) => {
                          const assigned = role.rolePermissions.some(
                            (rp) => rp.permissionId === p.id,
                          );
                          const grantable = canGrant(p.name);
                          if (!grantable) {
                            return assigned ? (
                              <span key={p.id} className="text-xs text-muted">
                                {p.name}
                                <input type="hidden" name="permissionIds" value={p.id} />
                              </span>
                            ) : null;
                          }
                          return (
                            <label key={p.id} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                name="permissionIds"
                                value={p.id}
                                defaultChecked={assigned}
                              />
                              {p.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ActionForm>
            ) : (
              <p className="text-xs text-muted">
                {role.rolePermissions.map((rp) => rp.permission.name).join(", ")}
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
