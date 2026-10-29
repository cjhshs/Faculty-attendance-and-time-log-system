import { requireUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { logoutAction } from "@/app/login/actions";
import { getSettings } from "@/lib/settings";
import { Nav, type NavItem } from "./Nav";
import logo1 from "@/app/logo/logo1.png";
import logo2 from "@/app/logo/logo2.png";

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
  if (hasPermission(user, PERMISSIONS.SYSTEM_RESET))
    items.push({ href: "/system-reset", label: "System Reset" });
  if (hasPermission(user, PERMISSIONS.USERS_VIEW))
    items.push({ href: "/users", label: "Users" });
  if (hasPermission(user, PERMISSIONS.AUDIT_VIEW))
    items.push({ href: "/audit", label: "Audit" });

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-navy-deep bg-navy text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="flex items-center justify-center rounded-full bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo1.src} alt="" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-bold text-white sm:text-sm">
                  {settings.school_header || "Faculty Attendance System"}
                </p>
                <p className="hidden truncate text-xs text-slate-300 sm:block">
                  {settings.college_header}
                </p>
              </div>
              <span className="hidden items-center justify-center rounded-full bg-white p-1 sm:flex">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo2.src} alt="" className="h-9 w-9 object-contain" />
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="max-w-[9rem] truncate text-slate-200 sm:max-w-none">
                {user.name} <span className="text-slate-400">({user.roles.join(", ")})</span>
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="btn border-white/25 bg-white/10 text-white hover:bg-white/20"
                >
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
