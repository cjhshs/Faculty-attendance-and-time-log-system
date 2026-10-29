"use client";

// Print actions. The default variant is the fixed, slightly translucent action
// bar used on long print previews: it stays reachable, is hidden while printing,
// and the page reserves bottom padding so it never covers the last row.
// The inline variant is a normal toolbar button for compact controls.
export function PrintButton({
  label = "Print",
  title,
  variant = "floating",
}: {
  label?: string;
  title?: string;
  variant?: "floating" | "inline";
}) {
  const button = (
    <button
      type="button"
      title={title ?? label}
      aria-label={title ?? label}
      className="btn btn-primary"
      onClick={() => window.print()}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M6 2.75A.75.75 0 016.75 2h6.5a.75.75 0 01.75.75V5h1.25A2.25 2.25 0 0117.5 7.25v5A2.25 2.25 0 0115.25 14H15v2.25a.75.75 0 01-.75.75h-8.5a.75.75 0 01-.75-.75V14h-.25A2.25 2.25 0 012.5 11.75v-5A2.25 2.25 0 014.75 5H6V2.75zM7.5 5h5V3.5h-5V5zm-.25 4.5a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5zM7 13.25v2.25h6v-3.5H7v1.25z" />
      </svg>
      <span>{label}</span>
    </button>
  );

  if (variant === "inline") return button;

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
      <div className="pointer-events-auto">{button}</div>
    </div>
  );
}
