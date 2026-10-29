import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_EXPIRED_MESSAGE,
  unauthenticatedResponseKind,
} from "@/lib/api-auth";

const PUBLIC_PATHS = ["/login", "/change-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p);
  const hasSession = request.cookies.has("fa_session");

  if (!isPublic && !hasSession) {
    // API callers must receive a machine-readable status, never the login page.
    // A redirect followed by HTML would look like success to fetch() helpers and
    // can silently discard an in-progress attendance draft.
    if (unauthenticatedResponseKind(pathname) === "json") {
      return NextResponse.json(
        { error: SESSION_EXPIRED_MESSAGE, code: "SESSION_EXPIRED" },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
