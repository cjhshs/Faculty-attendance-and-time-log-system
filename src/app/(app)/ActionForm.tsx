"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/app/(app)/master/actions";

type Action = (formData: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className = "",
  resetOnSuccess = false,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );

  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess && state?.ok ? state.message : undefined}
    >
      {children}
      {state ? (
        <p
          className={
            "mt-2 rounded-lg border px-2.5 py-1.5 text-xs " +
            (state.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary mt-2" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function ActionButton({
  action,
  label,
  fields,
  variant = "default",
  confirm,
  title,
}: {
  action: Action;
  label: string;
  fields: Record<string, string | number>;
  variant?: "default" | "danger";
  confirm?: string;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );
  return (
    <form action={formAction} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        title={title}
        onClick={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
        className={"btn btn-sm " + (variant === "danger" ? "btn-danger" : "")}
      >
        {pending ? "…" : label}
      </button>
      {state ? (
        <span
          role="status"
          className={
            "ml-2 rounded-lg border px-2.5 py-1.5 text-xs " +
            (state.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
