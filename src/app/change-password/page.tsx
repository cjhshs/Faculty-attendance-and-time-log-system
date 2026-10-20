import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ChangePasswordForm } from "./ChangePasswordForm";
import logo1 from "@/app/logo/logo1.png";
import logo2 from "@/app/logo/logo2.png";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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
              <img src={logo1.src} alt="" className="h-14 w-14 shrink-0 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo2.src} alt="" className="h-14 w-14 shrink-0 object-contain" />
            </div>
            <h1 className="text-[17px] font-bold uppercase leading-tight tracking-wide text-navy">
              Ramon Magsaysay Memorial Colleges
            </h1>
          </div>
          <div className="px-6 py-6">
            <h2 className="mb-1 section-title">Change your password</h2>
            {user.mustChangePassword ? (
              <p className="mb-4 text-sm text-muted">
                You must set a new password before continuing.
              </p>
            ) : (
              <p className="mb-4 text-sm text-muted">Set a new password for your account.</p>
            )}
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
