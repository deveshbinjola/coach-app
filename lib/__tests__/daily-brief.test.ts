import { describe, it, expect } from "vitest";
import { hasSomethingToSay, briefSubject, decideBrief, renderBrief } from "@/lib/email/daily-brief";
import type { BusinessPulse, RightNowItem } from "@/lib/ambient";

const item = (over: Partial<RightNowItem> = {}): RightNowItem => ({
  id: "i1",
  priority: 1,
  reason: "promised a follow-up 3 days ago",
  action: { label: "Draft it", type: "compose" },
  source: "overdue",
  ...over,
});

const pulse = (over: Partial<BusinessPulse> = {}): BusinessPulse => ({
  heroItem: null,
  quietList: [],
  daySummary: { sessions: 0, draftsReady: 0, leadsWaiting: 0 },
  metrics: {
    revenue: { amount: 0, trend: "flat" },
    activeMembers: 0,
    sessionsThisMonth: 0,
    trustRate: null,
  },
  honestQuestion: "Which lead did you promise to follow up with, and when?",
  ...over,
});

describe("hasSomethingToSay — the anti-spam gate", () => {
  it("is false on a completely quiet day", () => {
    expect(hasSomethingToSay(pulse())).toBe(false);
  });

  it("is true when there is a hero item", () => {
    expect(hasSomethingToSay(pulse({ heroItem: item() }))).toBe(true);
  });

  it("is true when quieter items exist", () => {
    expect(hasSomethingToSay(pulse({ quietList: [item()] }))).toBe(true);
  });

  it.each([
    ["sessions", { sessions: 1, draftsReady: 0, leadsWaiting: 0 }],
    ["leads waiting", { sessions: 0, draftsReady: 0, leadsWaiting: 2 }],
    ["drafts ready", { sessions: 0, draftsReady: 3, leadsWaiting: 0 }],
  ])("is true when there are %s", (_label, daySummary) => {
    expect(hasSomethingToSay(pulse({ daySummary }))).toBe(true);
  });
});

describe("decideBrief", () => {
  it("sends nothing on a quiet day (silence is a valid outcome)", () => {
    const d = decideBrief({ firstName: "Sunny", pulse: pulse() });
    expect(d.send).toBe(false);
    if (!d.send) expect(d.reason).toBe("nothing_to_say");
  });

  it("renders when there is real signal", () => {
    const d = decideBrief({ firstName: "Sunny", pulse: pulse({ heroItem: item({ leadName: "Marcus" }) }) });
    expect(d.send).toBe(true);
    if (d.send) {
      expect(d.rendered.html).toContain("Marcus");
      expect(d.rendered.subject).toBe("Marcus needs you today");
    }
  });
});

describe("briefSubject names the most important thing", () => {
  it("uses the hero lead's name when there is one", () => {
    expect(briefSubject(pulse({ heroItem: item({ leadName: "Dana" }) }))).toBe("Dana needs you today");
  });

  it("falls back to session count", () => {
    expect(briefSubject(pulse({ daySummary: { sessions: 3, draftsReady: 0, leadsWaiting: 0 } })))
      .toBe("3 sessions today");
  });

  it("singularises correctly", () => {
    expect(briefSubject(pulse({ daySummary: { sessions: 0, draftsReady: 0, leadsWaiting: 1 } })))
      .toBe("One lead is waiting");
  });
});

describe("rendered brief", () => {
  const rendered = renderBrief({
    firstName: "Sunny",
    pulse: pulse({
      heroItem: item({ leadName: "Marcus", context: "Asked about pricing." }),
      quietList: [item({ id: "i2", leadName: "Dana", reason: "went quiet after the call" })],
      daySummary: { sessions: 1, draftsReady: 2, leadsWaiting: 1 },
    }),
  });

  it("carries an opt-out link (trust + CAN-SPAM)", () => {
    expect(rendered.html).toContain("/settings");
    expect(rendered.html.toLowerCase()).toContain("turn the brief off");
    expect(rendered.text.toLowerCase()).toContain("turn the brief off");
  });

  it("states the honest cadence promise, not a streak", () => {
    expect(rendered.html).toContain("You only get this when something needs you.");
    expect(rendered.html.toLowerCase()).not.toContain("streak");
    expect(rendered.html.toLowerCase()).not.toContain("don't break");
  });

  it("contains no em dash (brand copy rule)", () => {
    expect(rendered.html).not.toContain("—");
    expect(rendered.text).not.toContain("—");
    expect(rendered.subject).not.toContain("—");
  });

  it("escapes lead names rather than injecting raw HTML", () => {
    const evil = renderBrief({
      firstName: "Sunny",
      pulse: pulse({ heroItem: item({ leadName: "<script>alert(1)</script>" }) }),
    });
    expect(evil.html).not.toContain("<script>alert(1)</script>");
    expect(evil.html).toContain("&lt;script&gt;");
  });

  it("includes both the hero and the secondary items", () => {
    expect(rendered.html).toContain("Marcus");
    expect(rendered.html).toContain("Dana");
    expect(rendered.text).toContain("FIRST THING");
    expect(rendered.text).toContain("ALSO TODAY");
  });
});
