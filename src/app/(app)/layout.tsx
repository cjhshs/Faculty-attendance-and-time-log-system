import { requireUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { logoutAction } from "@/app/login/actions";
import { getSettings } from "@/lib/settings";
import { Nav, type NavItem } from "./Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();

  const items: NavItem[] = [{ href: "/dashboard", label: "Dashboard" }];
  if (hasPermission(user, PERMISSIONS.ATTENDANCE_PRINT))
    items.push({ href: "/attendance/print", label: "Print Sheet" });
  if (hasPermission(user, PERMISSIONS.ATTENDANCE_ENCODE))
    items.push({ href: "/attendance/encode", label: "Encode" });
  if (hasPermission(user, PERMISSIONS.SCHEDULE_IMPORT))
    items.push({ href: "/schedule/import", label: "Import Schedule" });
  if (hasPermission(user, PERMISSIONS.FACULTY_VIEW))
    items.push({ href: "/schedule", label: "Schedule" });
  if (hasPermission(user, PERMISSIONS.FACULTY_VIEW))
    items.push({ href: "/master", label: "Master Data" });
  if (hasPermission(user, PERMISSIONS.CALENDAR_MANAGE))
    items.push({ href: "/calendar", label: "Calendar" });
  if (hasPermission(user, PERMISSIONS.SUMMARY_VIEW))
    items.push({ href: "/summary", label: "Summary" });
  if (hasPermission(user, PERMISSIONS.SETTINGS_MANAGE))
    items.push({ href: "/settings", label: "Settings" });
  if (hasPermission(user, PERMISSIONS.USERS_VIEW))
    items.push({ href: "/users", label: "Users" });
  if (hasPermission(user, PERMISSIONS.AUDIT_VIEW))
    items.push({ href: "/audit", label: "Audit" });

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="leading-tight">
              <p className="text-sm font-bold text-zinc-900">
                {settings.school_header || "Faculty Attendance System"}
              </p>
              <p className="text-xs text-zinc-500">{settings.college_header}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-zinc-600">
                {user.name} <span className="text-zinc-400">({user.roles.join(", ")})</span>
              </span>
              <form action={logoutAction}>
                <button type="submit" className="btn">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <Nav items={items} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
