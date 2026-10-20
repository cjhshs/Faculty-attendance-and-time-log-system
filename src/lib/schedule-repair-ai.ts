// Optional, strictly-bounded AI helper for the schedule repair workflow.
//
// Design guarantees:
//  - Pure and never touches the database or writes anything.
//  - Completely dormant unless explicitly enabled (SCHEDULE_REPAIR_AI=1) and an
//    API key is present. With no key every call is a no-op.
//  - Strict response schema. A suggestion is only ever *advice*: it is returned
//    to the reviewer, who must accept it, and it is re-verified (see
//    `verifySuggestion`) before it can affect a schedule.
//  - It can never override a deterministic engine result.

export type RepairAiInput = {
  code: string;
  field: string;
  rowSummary: string;
  currentValue: string;
  options?: string[];
};

export type RepairAiSuggestion =
  | { status: "disabled" }
  | { status: "ok"; value: string; reason: string }
  | { status: "error"; error: string };

export function isRepairAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SCHEDULE_REPAIR_AI === "1" && Boolean(env.OPENAI_API_KEY);
}

// Validate and normalise a raw model response. Exposed for testing so the strict
// schema can be exercised without any network access.
export function parseSuggestion(
  content: unknown,
  input: Pick<RepairAiInput, "options">,
): RepairAiSuggestion {
  if (typeof content !== "string" || content.trim() === "") {
    return { status: "error", error: "Empty AI response." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { status: "error", error: "AI response was not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { status: "error", error: "AI response had the wrong shape." };
  }
  const value = (parsed as Record<string, unknown>).value;
  const reason = (parsed as Record<string, unknown>).reason;
  if (typeof value !== "string") return { status: "error", error: "AI 'value' must be a string." };
  const trimmed = value.trim();
  if (trimmed === "") return { status: "error", error: "AI declined to suggest a value." };
  if (trimmed.length > 300) return { status: "error", error: "AI 'value' is too long." };
  if (input.options && input.options.length > 0) {
    const allowed = input.options.some((o) => o.trim().toLowerCase() === trimmed.toLowerCase());
    if (!allowed) {
      return { status: "error", error: "AI suggested a value that is not one of the allowed options." };
    }
  }
  return { status: "ok", value: trimmed, reason: typeof reason === "string" ? reason.trim() : "" };
}

// A suggestion is independently re-verified before use. `verify` is the same
// deterministic check the engine uses (e.g. the value parses, or is a real
// instructor). It must be supplied by the caller; a suggestion that fails is
// discarded.
export function verifySuggestion(
  suggestion: RepairAiSuggestion,
  verify: (value: string) => boolean,
): RepairAiSuggestion {
  if (suggestion.status !== "ok") return suggestion;
  return verify(suggestion.value)
    ? suggestion
    : { status: "error", error: "AI suggestion failed independent verification." };
}

const SYSTEM_PROMPT =
  "You correct university scheduling data. Reply with ONLY a JSON object of the form " +
  '{"value": string, "reason": string}. Use exactly the value that belongs in the field. ' +
  'If you are not certain, reply {"value": "", "reason": "unsure"}. Never invent instructors, rooms or times.';

export async function suggestRepairValue(
  input: RepairAiInput,
  deps: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<RepairAiSuggestion> {
  const env = deps.env ?? process.env;
  if (!isRepairAiEnabled(env)) return { status: "disabled" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = env.SCHEDULE_REPAIR_AI_MODEL || "gpt-4o-mini";

  try {
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!res.ok) return { status: "error", error: `AI request failed (${res.status}).` };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    return parseSuggestion(data.choices?.[0]?.message?.content, input);
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "AI request failed." };
  }
}
