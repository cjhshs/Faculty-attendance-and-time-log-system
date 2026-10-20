import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./LoginForm";
import logo1 from "@/app/logo/logo1.png";
import logo2 from "@/app/logo/logo2.png";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  const settings = await getSettings();

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "radial-gradient(1200px 600px at 50% -10%, #234b73 0%, #0b1f38 55%)" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex flex-col items-center gap-3 border-b border-line px-6 py-6 text-center">
            <div className="flex items-center justify-center gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo1.src} alt="" className="h-16 w-16 shrink-0 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo2.src} alt="" className="h-16 w-16 shrink-0 object-contain" />
            </div>
            <div>
              <h1 className="text-[17px] font-bold uppercase leading-tight tracking-wide text-navy">
                Ramon Magsaysay Memorial Colleges
              </h1>
              <p className="mt-1 text-sm font-semibold text-navy-2">
                Faculty Attendance and Time Log System
              </p>
              {settings.college_header ? (
                <p className="mt-0.5 text-xs text-muted">{settings.college_header}</p>
              ) : null}
            </div>
          </div>
          <div className="px-6 py-6">
            <h2 className="mb-4 section-title">Sign in</h2>
            <LoginForm />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          {settings.address || "Ramon Magsaysay Memorial Colleges"}
        </p>
      </div>
    </div>
  );
}
