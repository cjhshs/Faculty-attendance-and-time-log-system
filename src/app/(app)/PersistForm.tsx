"use client";

import { useEffect, useRef, useState } from "react";

// Persists ordinary filter forms (date, department, program, search) in
// localStorage so a reload or a work-tab switch brings the same filters back.
// It deliberately stores only UI filters — attendance is never finalized and
// official records are never touched here.
export function PersistForm({
  storageKey,
  className = "",
  children,
  method = "get",
}: {
  storageKey: string;
  className?: string;
  children: React.ReactNode;
  method?: "get" | "post";
}) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    // A URL that already carries filters is authoritative (for example a link
    // from another page). Only a bare form URL restores an unsent draft.
    if (window.location.search.length > 0) return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (!saved || typeof saved !== "object") return;

      const checkboxes = new Map<string, string[]>();
      for (const name of Object.keys(saved)) {
        if (Array.isArray(saved[name])) checkboxes.set(name, saved[name] as string[]);
      }

      for (const element of Array.from(form.elements)) {
        if (
          !(
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
          )
        ) {
          continue;
        }
        const name = element.name;
        if (!name || !(name in saved)) continue;
        if (element instanceof HTMLInputElement) {
          if (element.type === "checkbox") {
            element.checked = (checkboxes.get(name) ?? []).includes(element.value);
          } else if (element.type === "radio") {
            element.checked = String(saved[name]) === element.value;
          } else {
            element.value = String(saved[name] ?? "");
          }
        } else if (element instanceof HTMLSelectElement && element.multiple) {
          const values = (checkboxes.get(name) ?? []).map(String);
          for (const option of Array.from(element.options)) {
            option.selected = values.includes(option.value);
          }
        } else {
          element.value = String(saved[name] ?? "");
        }
      }

      // Let controlled widgets (college/program/department pickers) restore
      // their React state too; otherwise their visible select and option list
      // would disagree with the restored DOM value.
      window.dispatchEvent(
        new CustomEvent("fa:draft-restored", { detail: { values: saved, storageKey } }),
      );
    } catch {
      // Corrupt or disabled storage: keep the server-rendered defaults.
    }
  }, [storageKey]);

  function collect(): Record<string, unknown> {
    const form = ref.current;
    const values: Record<string, unknown> = {};
    if (!form) return values;
    for (const element of Array.from(form.elements)) {
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        )
      ) {
        continue;
      }
      const name = element.name;
      if (!name || name === "listed") continue;
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox") {
          if (!element.checked) continue;
          const list = Array.isArray(values[name]) ? (values[name] as string[]) : [];
          list.push(element.value);
          values[name] = list;
        } else if (element.type === "radio") {
          if (element.checked) values[name] = element.value;
        } else if (element.type !== "submit" && element.type !== "button") {
          values[name] = element.value;
        }
      } else if (element instanceof HTMLSelectElement && element.multiple) {
        values[name] = Array.from(element.selectedOptions).map((option) => option.value);
      } else {
        values[name] = element.value;
      }
    }
    return values;
  }

  function persist(showIndicator: boolean) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(collect()));
      if (showIndicator) {
        setState("saved");
        window.setTimeout(() => setState("idle"), 1400);
      }
    } catch {
      setState("idle");
    }
  }

  function scheduleSave() {
    setState("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persist(true), 600);
  }

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <form
      ref={ref}
      method={method}
      className={className}
      onInput={scheduleSave}
      onChange={scheduleSave}
      onSubmit={() => persist(false)}
    >
      {children}
      <span className="no-print print:hidden" role="status" aria-live="polite">
        {state === "saving" ? (
          <span className="ml-2 text-xs text-amber-700">Saving…</span>
        ) : state === "saved" ? (
          <span className="ml-2 text-xs text-green-700">Saved</span>
        ) : null}
      </span>
    </form>
  );
}
