# UI Audit — Faculty Attendance and Time Log System

> [!NOTE]
> **Historical document — superseded.** This 2026-11-19 lead list predates the v1.0.2 UI refinement pass. Several findings below were already resolved before that pass, and the Bootstrap discrepancy is no longer open (the app uses Tailwind CSS v4 by design). The current source of truth is `.impeccable/audit/2026-11-20T12-15-28Z__project.md` plus the post-refinement verification results. Do not treat the priorities below as current without re-checking the code.

**Date:** 2026-11-19
**Scope:** Front-end UI only (Next.js App Router pages + `src/app/globals.css` design tokens). No code changed.
**Method:** Static review of all `src/app/**/*.tsx` and `globals.css`, checked against the `modern-web-guidance` skill (search + retrieve, skill version `2026_11_10-47b4c80e`).

---

## ⚠️ Important discrepancy before we start

You asked to **keep "Bootstrap 5"**. **There is no Bootstrap in this project.** A full-repo grep finds zero Bootstrap imports, classes, or dependencies. The actual stack is:

| Layer | Actual |
|---|---|
| Framework | Next.js 16.4.2 (App Router, React Server Components + Server Actions) |
| React | 19.3.0 |
| Styling | **Tailwind CSS v4** (`@import "tailwindcss"`, `@tailwindcss/turbopack` 4.3.3) |
| Design system | Hand-written `@layer components` classes in `src/app/globals.css` (`.btn`, `.card`, `.input`, `.data-table`, `.badge`, `.alert*`, etc.) |
| Fonts | Inter + Geist Mono via `next/font` |

So "keep Bootstrap 5" cannot be satisfied literally — there is nothing to keep. My assumption is that the intent was **"keep the existing design system and don't rip out the styling layer."** I will preserve the current Tailwind v4 + `globals.css` token system and only refine it. **Please confirm** (see the question at the end).

Also note the project guidance block: *"This is NOT the Next.js you know."* Any implementation will be checked against `node_modules/next/dist/docs/` before coding.

---

## Summary of findings

| # | Area | Priority |
|---|---|---|
| F1 | Custom portal modals instead of native `<dialog>` | **High** |
| F2 | `window.confirm` / `window.alert` blocking dialogs | **High** |
| F3 | Form validation & error handling (no `:user-invalid`, no ARIA sync) | **High** |
| F4 | Navigation: no `aria-current`, off-screen scroller, tall sticky header | **High** |
| F5 | Data tables not responsive (no sticky header / stacking) | **High** |
| F6 | Clutter: competing scroll regions on Master Data | **High** |
| F7 | Focus rings too faint (below 3:1) | Medium |
| F8 | Touch targets below 44px on coarse pointers | Medium |
| F9 | No dark mode / `color-scheme` | Medium |
| F10 | Low-contrast muted/slate text | Medium |
| F11 | Hand-rolled autocomplete has no combobox ARIA/keyboard | Medium |
| F12 | Toasts / save status not announced to screen readers | Medium |
| F13 | Loading spinner not semantic / ignores reduced motion | Medium |
| F14 | Repeated ad-hoc style strings (inconsistent tones) | Medium |
| F15 | Search semantics + hint placement | Medium |
| F16 | Encode grid custom scroll behaviour | Medium |
| F17 | No sortable columns | Low |
| F18 | Typography not fluid / no `text-wrap` balance | Low |
| F19 | `PersistForm` silently restores stale filters | Low |
| F20 | Print preview minor issues | Low |
| F21 | Missing table captions / `scope`, decorative logos | Low |

---

# High priority

## F1 — Custom portal modals instead of the native `<dialog>` element

- **Pages / components:**
  - `src/app/(app)/schedule/ScheduleTable.tsx` — `EditModal` (lines 273–564) and `DeleteModal` (lines 189–271)
  - `src/app/(app)/system-reset/ResetClient.tsx` — `ModalShell`
  - `src/app/(app)/schedule/ClearSchedules.tsx` — `ConfirmModal`
  - `src/app/(app)/attendance/SignatureFab.tsx` — floating editor
- **Existing problem:** Every modal is a hand-rolled `createPortal` overlay. They re-implement what the browser gives for free and do it inconsistently:
  - Manual `keydown` Escape listeners; no focus trap/containment; **no focus return to the invoking button**; background is not `inert`.
  - Backdrop-dismiss differs between siblings: `EditModal` uses `onMouseDown` + `e.target === e.currentTarget`; `DeleteModal` uses `onClick` + `stopPropagation`. Drag-to-select that ends on the backdrop behaves differently in each.
  - No page-scroll lock (`overscroll-behavior`), so scrolling over the backdrop scrolls the page behind.
  - `role="dialog"` + `aria-modal="true"` are set by hand on every overlay.
- **Recommended improvement:** Replace all four with the native `<dialog>` element opened via `showModal()`. Use `<form method="dialog">` for Cancel/confirm, `autofocus` on the safe action, `::backdrop` for the scrim, `closedby` to pick dismissal, and `overscroll-behavior: contain` on `dialog:modal` and `::backdrop`. Remove all manual Escape handlers, focus traps and `aria-modal`. The browser returns focus to the invoker automatically.
- **Relevant modern web guidance:** `dialog` (Rule 1: blocking overlay), `light-dismiss-a-dialog`, `prevent-page-scroll-under-modal-dialog`, `declarative-dialog-popover-control`. Explicit guidance: *"DON'T add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling or an `Esc` handler."*
- **Priority:** High (accessibility + consistency; also removes ~150 lines of duplicated overlay code).

## F2 — `window.confirm` / `window.alert` blocking dialogs

- **Pages / components (exact usages):**
  - `ActionForm.tsx:81` — delete confirmations for courses/rooms
  - `attendance/AttendanceSheets.tsx:157`
  - `attendance/encode/EncodeClient.tsx:225, 323`
  - `schedule/repair/ApplyPanel.tsx:77`
  - `schedule/import/ImportClient.tsx:129, 153`
  - `attendance/ExcludedFacultyBanner.tsx` — `alert(...)` on failure (×2)
- **Existing problem:** Native browser dialogs are unstyled, block the JS thread, cannot be themed to match the app, and are the single biggest "unfinished/old-school" tell in the UI. They also sit next to the app's own polished modals, so the product feels inconsistent. `alert()` gives no recovery path.
- **Recommended improvement:** Replace each with a native `<dialog>` confirmation that mirrors the existing styled confirmation (danger button for destructive, safe action autofocused, visible message). Reserve blocking dialogs for consequential actions and use inline non-blocking messages elsewhere.
- **Relevant modern web guidance:** `dialog`, `content-first-noise-reduction` (*"Match the interruption to the stakes: use a blocking dialog only for consequential actions"*), `natural-interactions`.
- **Priority:** High (perceived quality + consistency).

## F3 — Form validation and error handling

- **Pages / components:** `login/LoginForm.tsx`, `change-password/ChangePasswordForm.tsx`, `(app)/ActionForm.tsx`, and every server-action form (`master`, `settings`, `calendar`, `users`, `schedule/import`, `schedule/repair`, `system-reset`).
- **Existing problem:**
  - Errors are a **single top-level banner** (`state.error` / `state.message`). There is no per-field error, no `aria-invalid`, no `aria-describedby` linking a field to its message, and no focus move to the first invalid field.
  - No `:user-invalid` / `:user-valid` styling, so browser-native constraint feedback is unstyled and inconsistent with the server messages.
  - `ActionForm`'s status message is a plain `<p>` with no `role="status"`/`aria-live`, so screen readers don't announce success/failure. (Interestingly, `ActionButton` *does* use `role="status"` — inconsistent.)
  - `ActionForm` renders many forms on one page with no `aria-labelledby` and no `<fieldset>`/`<legend>` grouping.
- **Recommended improvement:** Keep server-side validation, but (a) style with `:user-invalid`/`:user-valid`, (b) sync `aria-invalid` and list the error `id` in `aria-describedby` only while invalid (`data-error` pattern), (c) move focus to the first invalid field / error summary on submit, (d) give `ActionForm`'s status a `role="status"` and announce via one polite live region, (e) group related controls in `<fieldset>`/`<legend>`.
- **Relevant modern web guidance:** `forms` (§2 labeling, §4 constraints/validation, `:user-invalid`), `validate-input-after-interaction` (Validation Event Timing Matrix), `accessible-error-announcement`.
- **Priority:** High (core data-entry workflow; WCAG 3.3.1/3.3.3/4.1.3).

## F4 — Navigation: active state, overflow, and header height

- **Pages / components:** `(app)/Nav.tsx`, `(app)/layout.tsx`.
- **Existing problem:**
  - The active link is conveyed by **color/background only** — there is no `aria-current="page"` (WCAG 1.4.1 Use of Color, and screen readers can't tell the current page).
  - On narrow screens the nav is `overflow-x-auto`: links scroll off-screen with **no affordance or menu button**, so users may never discover "Audit", "Users", etc.
  - The sticky header is **two stacked rows** (brand block + nav) and is fairly tall — over the recommended compact persistent-bar budget, and it never gets out of the way while scrolling long tables.
- **Recommended improvement:** Add `aria-current="page"` to the active link and style on `[aria-current="page"]`. When links don't fit, collapse them into a **native popover menu** triggered by a labelled Menu button (`popover`, `popovertarget`) instead of an invisible horizontal scroller. Keep the bar to one row where possible and consider hiding it on scroll-down / restoring on scroll-up.
- **Relevant modern web guidance:** `navbar` (one semantic nav tree + native popover when links don't fit; *"Use `aria-current="page"`"*), `content-first-noise-reduction` (*"Keep every fixed or sticky bar under 12% of the viewport height"*, hide-on-scroll pattern).
- **Priority:** High (navigation is used on every page).

## F5 — Data tables are not responsive

- **Pages / components:** `globals.css` `.data-table` (lines 122–137); `schedule/ScheduleTable.tsx`; `master/page.tsx`; `summary/page.tsx`; `audit/page.tsx`; `schedule/import/ImportClient.tsx`; `schedule/repair/*`.
- **Existing problem:** Wide tables (Schedule has 10 columns) rely purely on horizontal scrolling. There is **no sticky header**, no sticky first column, and no container-query "stacked" fallback for narrow screens. Some `<th>` omit `scope="col"`; no table has a `<caption>`.
- **Recommended improvement:** Make `.data-table` sticky (`thead` sticky; sticky first column on the wide grid tables), and add a `@container`-driven stacked layout (hide `thead`, inject labels via `data-label`/`::before`) below a width threshold. Add `scope="col"` and a `<caption>` (may be visually hidden). Wrap horizontally-scrollable regions with `tabindex="0"`, `role="region"`, and an accessible name.
- **Relevant modern web guidance:** `responsive-table` (semantic foundation, sticky headers/row headers, `@container` stacking, label injection), `form-factor-adaptation` (*"Make that container keyboard-scrollable with `tabindex="0"`, and give it `role="region"`"*).
- **Priority:** High (the app is table-heavy and is used on phones/laptops).

## F6 — Clutter and competing scroll regions (Master Data and similar)

- **Pages / components:** `master/page.tsx` (primary); also `settings/page.tsx`, `users/page.tsx`, `summary/page.tsx`.
- **Existing problem:** Master Data puts **three independent tables side-by-side**, each with its own search box, its own inline "add" form, and its own `max-h-96 overflow-auto` inner scroll. On one screen the user faces three equal-weight tasks and three nested scroll areas — noisy and hard to scan; it is the strongest "AI-generated dashboard" impression in the app.
- **Recommended improvement:** Use **tabs** (or `<details>` disclosures) for Faculty / Programs / Rooms so only one table shows at a time with one scroll region; move each "add" form into a `<details>` or a dialog behind a single primary "Add" button. Apply the same progressive-disclosure principle to Settings (many forms) and Summary (stats + filters + wide tables).
- **Relevant modern web guidance:** `content-first-noise-reduction` (*"show secondary content only when asked"*, `details` for long/rarely needed content, popovers/drawers for secondary UI), `tabs`, `search-hidden-content`.
- **Priority:** High (information architecture / first-impression quality).

---

# Medium priority

## F7 — Focus rings are too faint

- **Page / component:** `globals.css` — `.btn` uses `focus-visible:ring-2 focus-visible:ring-navy-2/40`; `.input/.select/.textarea` use `focus-visible:ring-navy-2/25`.
- **Existing problem:** 25–40% opacity rings are very likely below the **3:1 non-text contrast** requirement, so keyboard users can barely see focus.
- **Recommended improvement:** Use a solid `outline: 2px solid` with `outline-offset: 2–3px` under `:focus-visible` (a colour with ≥3:1 against the background), and verify the ring on white and navy surfaces.
- **Relevant modern web guidance:** `natural-interactions` (*"DO NOT remove focus outlines… without an equally visible replacement with at least a 3:1 contrast ratio"*), `color` (Non-text Contrast).
- **Priority:** Medium.

## F8 — Touch targets below 44px

- **Page / component:** `globals.css` — `.btn-sm` is `h-8` (32px); table action icon buttons are ~14px icons inside 32px buttons (`ScheduleTable.tsx`, `master/page.tsx`).
- **Existing problem:** Targets fall below the 44×44 CSS-pixel guidance for touch, and some are near the 24px minimum.
- **Recommended improvement:** On `@media (pointer: coarse)` raise interactive controls to `min-block-size`/`min-inline-size: 44px`; expand small icon buttons with a `::after` hit-area that doesn't overlap neighbours.
- **Relevant modern web guidance:** `form-factor-adaptation` (Size targets for the input method).
- **Priority:** Medium.

## F9 — No dark mode and no `color-scheme`

- **Page / component:** `globals.css` (`:root` tokens, no `color-scheme`); `layout.tsx`.
- **Existing problem:** The UI only defines a light palette and never declares `color-scheme`, so it ignores the OS theme and UA-rendered surfaces (scrollbars, form controls) stay light.
- **Recommended improvement:** Either explicitly opt out with `color-scheme: light`, or add a dark palette behind `@media (prefers-color-scheme: dark)` plus `color-scheme: light dark`. Centralise it in the existing token layer.
- **Relevant modern web guidance:** `color` (light/dark schemes), `dark-mode`, `browser-ui-theming`.
- **Priority:** Medium (depends on whether dark mode is in scope).

## F10 — Low-contrast muted / slate text

- **Page / component:** `login/page.tsx:44` (`text-slate-400` address), `(app)/layout.tsx:63` (`text-slate-400` role) and `:52` (`text-slate-300` subtitle on navy), plus `text-muted` (`#667085`) on white.
- **Existing problem:** `slate-400`/`slate-300` on white/navy are likely under 4.5:1 (normal text) and may be under 3:1 for large text.
- **Recommended improvement:** Verify each with a contrast checker and bump to `slate-500`/`slate-600` or dedicated AA-passing tokens; keep the muted token but confirm it meets 4.5:1 on white.
- **Relevant modern web guidance:** `color` (Contrast), `contrast-color`.
- **Priority:** Medium.

## F11 — Hand-rolled autocomplete is not an accessible combobox

- **Page / component:** `attendance/CustomFacultySearch.tsx`.
- **Existing problem:** The faculty search builds its own dropdown with outside-click close but exposes **no combobox semantics**: no `role="combobox"`, `aria-expanded`, `aria-controls`, or `aria-activedescendant`, and no arrow-key navigation. Keyboard and screen-reader users can't operate it reliably.
- **Recommended improvement:** For a small, known list use `<input list>` + `<datalist>` (native, accessible). If richer behaviour is needed, implement the ARIA combobox pattern with full keyboard support (`ArrowUp/Down`, `Enter`, `Esc`, `aria-activedescendant`).
- **Relevant modern web guidance:** `forms` (Selection Control Decision Matrix — `<datalist>` for dynamic sets), `accessibility`.
- **Priority:** Medium.

## F12 — Toasts and save status aren't announced

- **Page / component:** `schedule/ScheduleTable.tsx:180` (toast div), `(app)/PersistForm.tsx` (`saving`/`saved`), `EncodeClient.tsx` save state.
- **Existing problem:** Confirmation toasts and "Saved" indicators have no `role="status"`/`aria-live`, so screen-reader users miss them entirely.
- **Recommended improvement:** Give toasts `role="status"` (polite) and errors `role="alert"` (assertive); route them through one central polite live region and debounce rapid updates.
- **Relevant modern web guidance:** `accessibility` (Live Regions urgency table), `spinner`.
- **Priority:** Medium.

## F13 — Loading spinner isn't semantic and ignores reduced motion

- **Page / component:** `login/LoginForm.tsx:68` (hand-rolled `animate-spin` div).
- **Existing problem:** The spinner is a decorative `div` with no accessible progress semantics, and the infinite spin doesn't respect `prefers-reduced-motion`.
- **Recommended improvement:** Use the native `<progress>` element styled as a spinner (indeterminate, correct announcement), and slow/drop the animation under `prefers-reduced-motion`.
- **Relevant modern web guidance:** `spinner`.
- **Priority:** Medium.

## F14 — Repeated ad-hoc style strings and inconsistent tones

- **Page / component:** `schedule/repair/FindingsPanel.tsx` (`STATUS_TONE`, `SEVERITY_TONE`), plus duplicated alert/badge class strings across `ActionForm.tsx`, `CollapsibleAlert.tsx`, `ImportClient.tsx`, etc.
- **Existing problem:** The same visual concepts (success/warn/error/info, status pills) are re-typed as raw Tailwind classes in many files with slightly different palettes. This is the main source of subtle inconsistency ("AI-generated" look) and is hard to keep uniform.
- **Recommended improvement:** Promote badges/status pills and alert tones into `@layer components` variants in `globals.css` (e.g. `.badge-success`, `.badge-warn`, `.badge-neutral`) and reference them everywhere; keep one canonical tone map.
- **Relevant modern web guidance:** `reduce-style-repetition`, `color` (state must not rely on color alone — pair with icon/text).
- **Priority:** Medium.

## F15 — Search semantics and hint placement

- **Page / component:** `(app)/SearchForm.tsx` (`<form role="search">`), `ActionForm`/forms with `.hint` below inputs.
- **Existing problem:** Guidance prefers the `<search>` element around the form; hints are placed **below** inputs, where autofill/autocomplete popovers can cover them while editing. Identifier fields don't set `autocorrect/autocapitalize/spellcheck` off.
- **Recommended improvement:** Wrap searches in `<search>`; move format hints above the input; add `enterkeyhint`, and disable text correction on usernames/codes/search.
- **Relevant modern web guidance:** `forms` (§1 semantic structure, §3 autofill/hints), `validate-input-after-interaction` (*"Place format hints above the input"*).
- **Priority:** Medium.

## F16 — Encode grid custom scroll behaviour

- **Page / component:** `attendance/encode/EncodeClient.tsx` + `(app)/ScrollArea.tsx`.
- **Existing problem:** A custom `wheel` (Shift+wheel) handler plus drag-to-scroll with `cursor: grab` re-implements native scrolling; it can fight the browser and the region isn't exposed as a keyboard-scrollable region.
- **Recommended improvement:** Rely on native overflow scrolling first; if 2D scrolling is genuinely required, keep the drag affordance but add `role="region"`, an `aria-label`, and `tabindex="0"`, and don't `preventDefault` native wheel gestures.
- **Relevant modern web guidance:** `natural-interactions` (native overflow scrolling gives swiping its physics), `form-factor-adaptation` (keyboard-scrollable regions).
- **Priority:** Medium.

---

# Low priority

## F17 — No sortable columns
Tables are static. Add `<th><button>` + `aria-sort` sorting to the key tables (Schedule, Audit, Master) where users compare rows.
**Guidance:** `sortable-table`. **Priority:** Low.

## F18 — Typography not fluid; no `text-wrap`
Fixed px sizes (`22/26px` titles, `13px` labels, `text-xs`). Add `clamp()` for page titles and `text-wrap: balance` on headings / `pretty` on paragraphs.
**Guidance:** `responsive-design`, `form-factor-adaptation`. **Priority:** Low.

## F19 — `PersistForm` silently restores stale filters
LocalStorage restore can surprise users with old filters. Add a visible "filters restored — clear" affordance.
**Guidance:** `forms`, `content-first-noise-reduction`. **Priority:** Low.

## F20 — Print preview minor issues
Floating action bars / `SignatureFab` can obscure content; add `scroll-padding-bottom`. `AutoPrint`'s 400 ms `setTimeout` is fragile.
**Guidance:** `form-factor-adaptation` (focus not obscured). **Priority:** Low.

## F21 — Table captions / `scope`, decorative logos
Add `<caption>` and complete `scope` attributes; the brand logos use `alt=""` (acceptable if truly decorative, but the login/header logos arguably convey identity).
**Guidance:** `accessibility`, `responsive-table`. **Priority:** Low.

---

## Suggested implementation phases (after approval)

1. **Foundations (low risk, high leverage):** F7 focus rings, F8 touch targets, F9 `color-scheme`/dark tokens, F10 contrast, F14 tone tokens. All live in `globals.css` + small class swaps.
2. **Overlays:** F1 native `<dialog>` for the four custom modals, then F2 replace `window.confirm`/`alert`. Shared `<ConfirmDialog>` + `<Modal>` components.
3. **Forms:** F3 validation/ARIA, F12 announcements, F15 search semantics.
4. **Navigation & tables:** F4 nav (aria-current + popover menu), F5 responsive tables, F6 Master Data restructure (tabs).
5. **Polish:** F11, F13, F16–F21.

## What I will NOT touch
- All Prisma schema, server actions, `lib/*` data/permission logic, API routes, print logic, and the attendance/schedule computation. Changes are limited to markup, class names, and new presentational components.
- The Tailwind v4 + `globals.css` design-system approach (pending your confirmation on the Bootstrap note).

---

## Approval requested
1. **Confirm the styling basis:** keep the existing **Tailwind CSS v4 + `globals.css` tokens** (no Bootstrap exists)? 
2. **Confirm scope/phasing:** implement in the phases above, or do you want a subset first?
3. **Dark mode:** in scope, or explicitly opt out with `color-scheme: light`?
