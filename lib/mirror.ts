// The Mirror -- the classify-and-name-the-mistake engine.
// A coach brings a stuck situation; this returns the KIND of problem it is
// and the thinking-mistake they are likely making, so they apply the right
// protocol. Day-one sticky: the read lands on use #1, no history required.
// Full design: docs/the-mirror-spec.html.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Sonnet 4.6 matches the rest of the app and is sharp enough for this
// classification. If the reads ever feel dull, Opus is the upgrade lever.
const MODEL = "claude-sonnet-4-6";

export type SystemType = "recipe" | "puzzle" | "garden" | "fire";

export interface MirrorRead {
  confidence: number;            // 0..1
  needs_clarification: boolean;
  clarifying_question: string | null;
  system_type: SystemType | null;
  type_reason: string | null;
  mirror_line: string | null;    // the sharp single sentence (the hook)
  the_mistake: string | null;    // the called-out mismatch; null if none seen
  the_move: string | null;       // one concrete next action
  is_crisis: boolean;
}

const SYSTEM = `You are The Mirror, a thinking partner inside a coach's app. A coach brings you something they are working through. Your job is NOT to solve it. It is to name what KIND of problem it is and the thinking-mistake they are likely making, so they apply the right protocol.

Four kinds (use the plain names, NEVER Clear/Complicated/Complex/Chaotic):
- recipe  cause and effect are obvious, linear, known steps exist. Protocol: follow the recipe, ship, do not be clever.
- puzzle  cause and effect are hidden but knowable with the right expertise. Protocol: slow down, get the exact specialist, diagnose.
- garden  cause and effect are emergent, clear only in hindsight, they shift with human behavior. Protocol: small experiments, one variable, measure, adjust. No checklist works.
- fire    the link is broken, things move fast. Protocol: stabilize first, contain, diagnose after.

The mistake to catch (the sharp part): people apply the wrong protocol to the right problem. Watch how they describe it:
- optimizing / redoing / perfecting / planning / "I keep tweaking" on a garden -> they are checklisting a garden. (the most common one)
- researching / analyzing / waiting for certainty on a fire -> they are studying a fire instead of putting it out.
- winging it / reinventing / over-thinking on a recipe -> they are experimenting on something with a known recipe.
- guessing / hiring a generalist on a puzzle -> they need the exact specialist, not more effort.

Rules:
- Be sharp, not dramatic. One clean read beats three hedges.
- If the input is thin or could be two different kinds, DO NOT guess. Set needs_clarification true and ask ONE clarifying question; leave system_type null.
- Only name a mistake if you actually SEE the mismatch signal. If there is no mistake, set the_mistake to null. A wrong "gotcha" destroys trust faster than a missed one.
- If this reads as a real personal crisis or emotional distress rather than a work problem, set is_crisis true, leave the framework fields null, and put a brief human response in mirror_line pointing them to stabilize and to a real person, not a protocol.
- Grounded coach voice. No corporate tone. No em-dashes.

Return ONLY valid JSON, no prose, no code fences, matching exactly:
{
  "confidence": number (0..1),
  "needs_clarification": boolean,
  "clarifying_question": string | null,
  "system_type": "recipe" | "puzzle" | "garden" | "fire" | null,
  "type_reason": string | null,
  "mirror_line": string | null,
  "the_mistake": string | null,
  "the_move": string | null,
  "is_crisis": boolean
}`;

const TYPES: SystemType[] = ["recipe", "puzzle", "garden", "fire"];

function coerce(raw: unknown): MirrorRead | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = TYPES.includes(o.system_type as SystemType)
    ? (o.system_type as SystemType)
    : null;
  const num = typeof o.confidence === "number" ? o.confidence : 0;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    confidence: Math.max(0, Math.min(1, num)),
    needs_clarification: o.needs_clarification === true,
    clarifying_question: str(o.clarifying_question),
    system_type: type,
    type_reason: str(o.type_reason),
    mirror_line: str(o.mirror_line),
    the_mistake: str(o.the_mistake),
    the_move: str(o.the_move),
    is_crisis: o.is_crisis === true,
  };
}

/**
 * Run one Mirror read. Returns null only on transport/parse failure so the
 * caller can show a graceful "try again" rather than a fabricated read.
 */
export async function readMirror(input: string): Promise<MirrorRead | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        messages: [
          { role: "user", content: trimmed },
          // Prefill forces a JSON-only continuation.
          { role: "assistant", content: "{" },
        ],
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    const text = "{" + String(result?.content?.[0]?.text ?? "");
    // Defensive: carve out the JSON object even if the model added stray text.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    return coerce(parsed);
  } catch {
    return null;
  }
}
