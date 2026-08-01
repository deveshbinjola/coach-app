import { describe, it, expect } from "vitest";
import {
  EXAMPLE_INBOX,
  INBOX_MAX,
  MAX_MESSAGES,
  buildParsePrompt,
  parseMessages,
  safeSlaLabel,
  toLead,
  triage,
  validateInbox,
  type ParsedMessage,
} from "@/lib/landing/triage";

const NOW = new Date("2026-08-01T12:00:00Z").getTime();

function msg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    name: "Marcus",
    quote: "I'm ready to actually do something.",
    daysAgo: 2,
    temperature: "hot",
    source: "newsletter",
    readiness: "ready_now",
    incomeBand: "10k_30k_mo",
    painSignals: ["relationship_conflict"],
    hadCall: false,
    underneath: "He has been putting this off for months.",
    ...over,
  };
}

describe("validateInbox", () => {
  it("accepts the shipped example", () => {
    expect(validateInbox({ inbox: EXAMPLE_INBOX }).ok).toBe(true);
  });

  it("rejects a paste too short to triage", () => {
    expect(validateInbox({ inbox: "hey what are your rates" }).ok).toBe(false);
  });

  it("does not let whitespace pad out the length floor", () => {
    expect(validateInbox({ inbox: " ".repeat(500) }).ok).toBe(false);
  });

  it("truncates an entire mailbox rather than rejecting it", () => {
    const result = validateInbox({ inbox: "a".repeat(INBOX_MAX + 2000) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(INBOX_MAX);
  });

  it("rejects non-string input", () => {
    expect(validateInbox({ inbox: 42 }).ok).toBe(false);
    expect(validateInbox(null).ok).toBe(false);
  });
});

describe("buildParsePrompt", () => {
  it("tells the model to perceive, not to rank", () => {
    const { system } = buildParsePrompt("...");
    expect(system).toMatch(/do not rank/i);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/em dash/i);
  });

  it("names every real enum value so the model cannot invent one", () => {
    const { system } = buildParsePrompt("...");
    for (const value of ["on_fire", "tire_kicker", "30k_plus_mo", "burnout", "referral"]) {
      expect(system).toContain(value);
    }
  });
});

describe("parseMessages", () => {
  it("parses a well formed payload", () => {
    const parsed = parseMessages(JSON.stringify({ messages: [msg()] }));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Marcus");
  });

  it("survives a fenced block", () => {
    const parsed = parseMessages("```json\n" + JSON.stringify({ messages: [msg()] }) + "\n```");
    expect(parsed).toHaveLength(1);
  });

  it("falls back to safe values rather than trusting invented enums", () => {
    const parsed = parseMessages(
      JSON.stringify({
        messages: [{ ...msg(), temperature: "scorching", readiness: "vibes", incomeBand: "rich", source: "telepathy" }],
      }),
    );
    expect(parsed[0].temperature).toBe("warm");
    expect(parsed[0].readiness).toBe("researching");
    expect(parsed[0].incomeBand).toBe("unknown");
    expect(parsed[0].source).toBe("other");
  });

  it("drops invented pain signals but keeps the real ones", () => {
    const parsed = parseMessages(
      JSON.stringify({ messages: [{ ...msg(), painSignals: ["burnout", "existential_dread", "burnout"] }] }),
    );
    expect(parsed[0].painSignals).toEqual(["burnout"]);
  });

  it("drops entries with no name or no quote", () => {
    const parsed = parseMessages(
      JSON.stringify({ messages: [msg(), { ...msg(), name: "" }, { ...msg(), quote: "  " }] }),
    );
    expect(parsed).toHaveLength(1);
  });

  it("caps the number of messages so one paste cannot blow up the page", () => {
    const many = Array.from({ length: 40 }, (_, i) => msg({ name: `Person ${i}` }));
    expect(parseMessages(JSON.stringify({ messages: many }))).toHaveLength(MAX_MESSAGES);
  });

  it("clamps a nonsense daysAgo instead of producing an impossible date", () => {
    const parsed = parseMessages(JSON.stringify({ messages: [msg({ daysAgo: -50 })] }));
    expect(parsed[0].daysAgo).toBe(0);
    const far = parseMessages(JSON.stringify({ messages: [msg({ daysAgo: 99999 })] }));
    expect(far[0].daysAgo).toBe(365);
  });

  it("returns empty on junk rather than throwing", () => {
    expect(parseMessages("I read the inbox and here is what I think")).toEqual([]);
    expect(parseMessages("")).toEqual([]);
    expect(parseMessages(JSON.stringify({ messages: "nope" }))).toEqual([]);
  });

  it("strips em dashes out of quoted text", () => {
    const parsed = parseMessages(
      JSON.stringify({ messages: [msg({ quote: "I want in — soon", underneath: "Scared — of cost" })] }),
    );
    expect(`${parsed[0].quote}${parsed[0].underneath}`).not.toContain("—");
  });
});

describe("toLead", () => {
  it("puts a brand new message on the fast SLA clock and an old one on the slow clock", () => {
    expect(toLead(msg({ daysAgo: 0, hadCall: false }), 0, NOW).status).toBe("new");
    expect(toLead(msg({ daysAgo: 6, hadCall: false }), 0, NOW).status).toBe("contacted");
    expect(toLead(msg({ daysAgo: 6, hadCall: true }), 0, NOW).status).toBe("qualified");
  });

  it("dates the lead from daysAgo so the real SLA engine can measure it", () => {
    const lead = toLead(msg({ daysAgo: 11 }), 0, NOW);
    const days = (NOW - new Date(lead.last_contact_at!).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(11);
  });
});

describe("triage", () => {
  it("ranks by the real scoring engine, hottest first", () => {
    const result = triage(
      [
        msg({ name: "Cold", temperature: "cold", painSignals: [], daysAgo: 40 }),
        msg({ name: "Hot", temperature: "on_fire", painSignals: ["burnout", "purpose_confusion"], daysAgo: 1 }),
      ],
      NOW,
    );
    expect(result.ranked[0].name).toBe("Hot");
    expect(result.ranked[0].score).toBeGreaterThan(result.ranked[1].score);
  });

  it("flags someone who went quiet as going cold", () => {
    const result = triage([msg({ name: "Priya", daysAgo: 11, hadCall: true })], NOW);
    expect(["warning", "overdue"]).toContain(result.ranked[0].sla.state);
  });

  it("names the person who is not a fit", () => {
    const result = triage(
      [msg({ name: "Nadia", readiness: "tire_kicker", incomeBand: "under_10k_mo", source: "other", temperature: "cold" })],
      NOW,
    );
    expect(result.notAFit.map((l) => l.name)).toContain("Nadia");
  });

  it("does not hand the morning to a hot tire kicker", () => {
    // The whole point of fit being separate from score: someone can look
    // urgent and still not be the person worth answering first.
    const result = triage(
      [
        msg({
          name: "Loud",
          temperature: "on_fire",
          painSignals: ["burnout", "heartbreak"],
          daysAgo: 0,
          readiness: "tire_kicker",
          incomeBand: "under_10k_mo",
          source: "other",
        }),
        msg({ name: "Real", temperature: "warm", readiness: "ready_now", incomeBand: "30k_plus_mo", source: "referral" }),
      ],
      NOW,
    );
    expect(result.ranked[0].name).toBe("Loud");
    expect(result.answerFirst?.name).toBe("Real");
  });

  it("never lists the same person as both answer-first and going cold", () => {
    const result = triage(
      [msg({ name: "Tom", daysAgo: 6, temperature: "hot", readiness: "ready_now", incomeBand: "30k_plus_mo" })],
      NOW,
    );
    expect(result.goingCold.map((l) => l.name)).not.toContain(result.answerFirst?.name);
  });

  it("returns an empty read rather than throwing on no messages", () => {
    const result = triage([], NOW);
    expect(result.ranked).toEqual([]);
    expect(result.answerFirst).toBeNull();
  });

  it("produces no em dash in any label the page will render", () => {
    const result = triage([msg(), msg({ name: "Priya", daysAgo: 11 })], NOW);
    const rendered = result.ranked
      .map((l) => `${l.name}${l.quote}${l.underneath}${safeSlaLabel(l.sla)}${l.painLabels.join("")}${l.fit.reasons.join("")}`)
      .join("");
    expect(rendered).not.toContain("—");
  });
});

describe("em dash boundary", () => {
  it("scrubs an em dash coming out of the fit engine, not just the SLA label", () => {
    // assessFit really did return "Below the $2K floor — may need lower offer".
    // That string is fixed at source now; this guards the boundary so the next
    // engine string that forgets the rule cannot reach the landing page.
    const result = triage(
      [msg({ name: "Nadia", incomeBand: "under_10k_mo", readiness: "dormant_explorer" })],
      NOW,
    );
    const everything = JSON.stringify(result);
    expect(everything).not.toContain("—");
    expect(everything).not.toContain("–");
  });
});
