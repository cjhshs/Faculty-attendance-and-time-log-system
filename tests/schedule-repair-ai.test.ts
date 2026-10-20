import { describe, it, expect, vi } from "vitest";
import {
  isRepairAiEnabled,
  parseSuggestion,
  suggestRepairValue,
  verifySuggestion,
} from "@/lib/schedule-repair-ai";

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as unknown as NodeJS.ProcessEnv;

describe("isRepairAiEnabled", () => {
  it("is off without the flag or without a key", () => {
    expect(isRepairAiEnabled(env({}))).toBe(false);
    expect(isRepairAiEnabled(env({ SCHEDULE_REPAIR_AI: "1" }))).toBe(false);
    expect(isRepairAiEnabled(env({ OPENAI_API_KEY: "x" }))).toBe(false);
  });

  it("is on only when both the flag and a key are present", () => {
    expect(isRepairAiEnabled(env({ SCHEDULE_REPAIR_AI: "1", OPENAI_API_KEY: "x" }))).toBe(true);
  });
});

describe("suggestRepairValue — disabled", () => {
  it("is a no-op with no key and never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await suggestRepairValue(
      { code: "MISSING_INSTRUCTOR", field: "Instructor", rowSummary: "", currentValue: "TBA" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, env: env({}) },
    );
    expect(result).toEqual({ status: "disabled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("parseSuggestion — strict schema", () => {
  it("accepts a well-formed suggestion", () => {
    expect(parseSuggestion('{"value":"AVR","reason":"closest room"}', {})).toEqual({
      status: "ok",
      value: "AVR",
      reason: "closest room",
    });
  });

  it("rejects non-JSON, wrong shapes and empty values", () => {
    expect(parseSuggestion("not json", {}).status).toBe("error");
    expect(parseSuggestion('{"value":5}', {}).status).toBe("error");
    expect(parseSuggestion('{"value":""}', {}).status).toBe("error");
    expect(parseSuggestion('{"value":"x"}', {}).status).toBe("ok");
  });

  it("rejects an over-long value", () => {
    expect(parseSuggestion(JSON.stringify({ value: "x".repeat(400) }), {}).status).toBe("error");
  });

  it("enforces the allowed-options list when provided", () => {
    const options = ["Buhat, Alvin Zamora", "Claver, Priscilla De Leon"];
    expect(parseSuggestion('{"value":"buhat, alvin zamora","reason":""}', { options }).status).toBe("ok");
    expect(parseSuggestion('{"value":"Unknown Person","reason":""}', { options }).status).toBe("error");
  });
});

describe("verifySuggestion", () => {
  it("discards a suggestion that fails independent verification", () => {
    const ok = verifySuggestion({ status: "ok", value: "AVR", reason: "" }, () => true);
    expect(ok.status).toBe("ok");
    const bad = verifySuggestion({ status: "ok", value: "AVR", reason: "" }, () => false);
    expect(bad.status).toBe("error");
  });

  it("passes through non-ok states unchanged", () => {
    expect(verifySuggestion({ status: "disabled" }, () => true)).toEqual({ status: "disabled" });
  });
});

describe("suggestRepairValue — enabled", () => {
  const enabled = env({ SCHEDULE_REPAIR_AI: "1", OPENAI_API_KEY: "k" });

  it("returns the parsed, verified suggestion", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"value":"AVR","reason":"r"}' } }] }),
    });
    const result = await suggestRepairValue(
      { code: "ROOM_MISSING", field: "Schedule", rowSummary: "x", currentValue: "TBA" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, env: enabled },
    );
    expect(result).toEqual({ status: "ok", value: "AVR", reason: "r" });
  });

  it("surfaces a transport failure as an error without throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await suggestRepairValue(
      { code: "ROOM_MISSING", field: "Schedule", rowSummary: "x", currentValue: "TBA" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, env: enabled },
    );
    expect(result.status).toBe("error");
  });
});
