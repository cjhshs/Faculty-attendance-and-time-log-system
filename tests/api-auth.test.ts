import { describe, it, expect } from "vitest";
import {
  isApiPath,
  SESSION_EXPIRED_MESSAGE,
  unauthenticatedResponseKind,
} from "@/lib/api-auth";

describe("unauthenticated request handling", () => {
  it("returns JSON for API paths, including nested routes", () => {
    expect(unauthenticatedResponseKind("/api/attendance/save")).toBe("json");
    expect(unauthenticatedResponseKind("/api/schedule/commit")).toBe("json");
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/")).toBe(true);
  });

  it("redirects page requests", () => {
    expect(unauthenticatedResponseKind("/attendance/encode")).toBe("redirect");
    expect(unauthenticatedResponseKind("/settings")).toBe("redirect");
    expect(unauthenticatedResponseKind("/login")).toBe("redirect");
  });

  it("does not mistake lookalike paths for API routes", () => {
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/attendance/api/notes")).toBe(false);
  });

  it("explains that work is preserved", () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/session has expired/i);
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/not been finalized/i);
  });
});
