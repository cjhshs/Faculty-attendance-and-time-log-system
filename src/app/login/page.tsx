import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  const settings = await getSettings();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold tracking-tight text-zinc-900">
            {settings.school_header || "Faculty Attendance System"}
          </h1>
          <p className="text-sm text-zinc-500">{settings.college_header}</p>
        </div>
        <div className="card">
          <h2 className="mb-4 text-base font-semibold">Sign in</h2>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-zinc-400">
          Faculty Attendance and Time Log System
        </p>
      </div>
    </div>
  );
}
