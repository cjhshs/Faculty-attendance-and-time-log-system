"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/app/login/actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="alert alert-error">
          <span>{state.error}</span>
        </p>
      ) : null}
      <div>
        <label className="label req" htmlFor="current">
          Current password
        </label>
        <input
          id="current"
          name="current"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label className="label req" htmlFor="next">
          New password
        </label>
        <input
          id="next"
          name="next"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="hint">At least 8 characters.</span>
      </div>
      <div>
        <label className="label req" htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
