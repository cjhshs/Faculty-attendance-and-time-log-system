"use client";

import { useEffect } from "react";

// Keeps ARIA in sync with the CSS :user-invalid state and announces errors from
// one polite live region. Native :user-invalid gives the visual state; this
// bridge gives the programmatic one (aria-invalid + aria-describedby), as
// recommended by the "validate-input-after-interaction" / "accessible-error-
// announcement" guidance. Mounted once for the whole app.
export function FormValidation() {
  useEffect(() => {
    // List the field's error message (the id in data-error) in aria-describedby
    // only while it's shown: text referenced by aria-describedby is announced
    // even when hidden.
    const linkError = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, shown: boolean) => {
      const errorId = el.dataset.error;
      if (!errorId) return;
      const ids = (el.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (shown) ids.push(errorId);
      if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
      else el.removeAttribute("aria-describedby");
    };

    // One polite live region for the page.
    const announcer = document.createElement("div");
    announcer.setAttribute("aria-live", "polite");
    announcer.classList.add("visually-hidden");
    document.body.append(announcer);
    let announceTimer: ReturnType<typeof setTimeout> | undefined;
    let announcedField: Element | null = null;

    const spokenText = (node: Element) => {
      const copy = node.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      copy.querySelectorAll('[role="img"][aria-label]').forEach((n) =>
        n.replaceWith(`${n.getAttribute("aria-label")}: `),
      );
      return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    };

    const announceError = (el: HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null }) => {
      const error = el.dataset.error ? document.getElementById(el.dataset.error) : null;
      if (!error) return;
      const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : "";
      clearTimeout(announceTimer);
      announcer.textContent = "";
      announcedField = el;
      // Wait until the screen reader has announced the field that receives focus next.
      announceTimer = setTimeout(() => {
        announcer.textContent = label + spokenText(error);
      }, 500);
    };

    const flagged = new WeakSet<Element>();
    const announced = new WeakSet<Element>();

    const syncAria = (el: Element, announce = false) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement))
        return;
      const invalid = el.matches(":user-invalid");
      if (invalid) {
        if (announce && !announced.has(el)) {
          announceError(el);
          announced.add(el);
        }
        el.setAttribute("aria-invalid", "true");
        linkError(el, true);
        flagged.add(el);
      } else if (flagged.has(el) || el.getAttribute("aria-invalid") !== "true") {
        el.setAttribute("aria-invalid", "false");
        linkError(el, false);
        flagged.delete(el);
        announced.delete(el);
        if (announcedField === el) {
          clearTimeout(announceTimer);
          announcer.textContent = "";
        }
      }
    };

    const syncAll = (root: ParentNode = document) =>
      root.querySelectorAll("input, select, textarea").forEach((el) => syncAria(el));

    syncAll();

    const onBlur = (e: Event) => syncAria(e.target as Element, true);
    const onInput = (e: Event) => {
      const target = e.target as Element;
      if (target.hasAttribute?.("aria-invalid")) syncAria(target);
    };
    const onChange = (e: Event) => syncAria(e.target as Element, true);
    const onInvalid = (e: Event) => {
      announced.add(e.target as Element);
      syncAria(e.target as Element);
    };
    const onReset = (e: Event) => {
      const form = e.target as HTMLFormElement;
      setTimeout(() => [...form.elements].forEach((el) => syncAria(el)), 0);
    };

    document.addEventListener("blur", onBlur, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("reset", onReset, true);

    // Newly rendered fields (for example after a client-side navigation or a
    // dialog opens) start at aria-invalid="false" too.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            if (node.matches("input, select, textarea")) syncAria(node);
            syncAll(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("reset", onReset, true);
      observer.disconnect();
      clearTimeout(announceTimer);
      announcer.remove();
    };
  }, []);

  return null;
}
