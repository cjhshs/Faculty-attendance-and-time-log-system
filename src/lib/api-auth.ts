// Shared rule for unauthenticated requests. Pages redirect to the login form;
// API requests must receive JSON with the real HTTP status so a fetch() caller
// can keep its draft and explain the expiry instead of parsing login HTML.

export type UnauthenticatedResponseKind = "json" | "redirect";

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function unauthenticatedResponseKind(pathname: string): UnauthenticatedResponseKind {
  return isApiPath(pathname) ? "json" : "redirect";
}

export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Sign in again; unsaved work in this tab has not been finalized.";
