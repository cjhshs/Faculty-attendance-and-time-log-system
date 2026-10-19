import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-sm">
        <div className="card">
          <h1 className="mb-1 text-base font-semibold">Change your password</h1>
          {user.mustChangePassword ? (
            <p className="mb-4 text-sm text-zinc-500">
              You must set a new password before continuing.
            </p>
          ) : (
            <p className="mb-4 text-sm text-zinc-500">Set a new password for your account.</p>
          )}
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
