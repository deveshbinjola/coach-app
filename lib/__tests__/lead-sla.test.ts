// Tests for lib/lead-sla.ts
//
// SLA state drives the Lead Rescue queue, the SlaBadge color, and the
// "going cold" copy in CommandHero. Threshold drift would silently
// move what gets surfaced for action — exactly the kind of regression
// these tests block.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { assessSla, sortBySla, slaStateOf } from "@/lib/lead-sla";
import { makeLead, TEST_NOW, hoursAgo } from "./factories";

// sortBySla and slaStateOf don't accept a `now` parameter — they fall back
// to Date.now(). Pin system time for the whole file so factory `hoursAgo()`
// offsets line up with what those internals see.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEST_NOW));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("assessSla — terminal statuses", () => {
  it("client → not_applicable", () => {
    const r = assessSla(makeLead({ status: "client" }), TEST_NOW);
    expect(r.state).toBe("not_applicable");
    expect(r.label).toBe("Client");
  });

  it("closed_lost → not_applicable", () => {
    const r = assessSla(makeLead({ status: "closed_lost" }), TEST_NOW);
    expect(r.state).toBe("not_applicable");
    expect(r.label).toBe("Closed");
  });
});

describe("assessSla — new lead thresholds", () => {
  // NEW thresholds: <2h on_pace, 2h–24h warning, >24h overdue
  it("new + 1h elapsed → on_pace", () => {
    const r = assessSla(
      makeLead({ status: "new", created_at: hoursAgo(1) }),
      TEST_NOW
    );
    expect(r.state).toBe("on_pace");
    expect(r.clockAnchor).toBe("created_at");
  });

  it("new + 5h elapsed → warning", () => {
    const r = assessSla(
      makeLead({ status: "new", created_at: hoursAgo(5) }),
      TEST_NOW
    );
    expect(r.state).toBe("warning");
  });

  it("new + 26h elapsed → overdue", () => {
    const r = assessSla(
      makeLead({ status: "new", created_at: hoursAgo(26) }),
      TEST_NOW
    );
    expect(r.state).toBe("overdue");
  });

  it("new at exactly 2h boundary → warning (boundary inclusive of warning)", () => {
    const r = assessSla(
      makeLead({ status: "new", created_at: hoursAgo(2) }),
      TEST_NOW
    );
    expect(r.state).toBe("warning");
  });

  it("new at exactly 24h boundary → overdue", () => {
    const r = assessSla(
      makeLead({ status: "new", created_at: hoursAgo(24) }),
      TEST_NOW
    );
    expect(r.state).toBe("overdue");
  });
});

describe("assessSla — active lead thresholds", () => {
  // ACTIVE thresholds: <72h on_pace, 72h–168h warning, >168h overdue
  it("contacted + 24h since last_contact → on_pace", () => {
    const r = assessSla(
      makeLead({ status: "contacted", last_contact_at: hoursAgo(24) }),
      TEST_NOW
    );
    expect(r.state).toBe("on_pace");
  });

  it("contacted + 96h (4d) → warning", () => {
    const r = assessSla(
      makeLead({ status: "contacted", last_contact_at: hoursAgo(96) }),
      TEST_NOW
    );
    expect(r.state).toBe("warning");
  });

  it("contacted + 200h (>1w) → overdue", () => {
    const r = assessSla(
      makeLead({ status: "contacted", last_contact_at: hoursAgo(200) }),
      TEST_NOW
    );
    expect(r.state).toBe("overdue");
  });

  it("falls back to created_at when last_contact_at is null", () => {
    const r = assessSla(
      makeLead({
        status:          "qualified",
        last_contact_at: null,
        created_at:      hoursAgo(96),
      }),
      TEST_NOW
    );
    expect(r.clockAnchor).toBe("created_at");
    expect(r.state).toBe("warning");
  });

  it("uses last_contact_at when available, not created_at", () => {
    // Created long ago but recently contacted → should be on_pace.
    const r = assessSla(
      makeLead({
        status:          "qualified",
        created_at:      hoursAgo(1000),
        last_contact_at: hoursAgo(2),
      }),
      TEST_NOW
    );
    expect(r.clockAnchor).toBe("last_contact_at");
    expect(r.state).toBe("on_pace");
  });
});

describe("assessSla — defensive guards", () => {
  // The neutral helper returns state: "on_pace" + label "No timestamp". Choice is
  // intentional: unknown leads shouldn't alarm the rescue queue.
  it("returns neutral state when given undefined", () => {
    const r = assessSla(undefined as unknown as never, TEST_NOW);
    expect(r.state).toBe("on_pace");
    expect(r.label).toBe("No timestamp");
    expect(r.hoursElapsed).toBeNull();
  });

  it("returns neutral state when status field missing", () => {
    const r = assessSla({ id: "x" } as unknown as never, TEST_NOW);
    expect(r.state).toBe("on_pace");
    expect(r.label).toBe("No timestamp");
  });
});

describe("sortBySla — overdue first, then warning, then on_pace", () => {
  it("ranks states correctly", () => {
    const onPace = makeLead({ id: "p", status: "contacted", last_contact_at: hoursAgo(1) });
    const warn   = makeLead({ id: "w", status: "contacted", last_contact_at: hoursAgo(96) });
    const over   = makeLead({ id: "o", status: "contacted", last_contact_at: hoursAgo(200) });
    const term   = makeLead({ id: "t", status: "client" });
    expect(sortBySla([onPace, term, warn, over]).map((l) => l.id)).toEqual([
      "o",
      "w",
      "p",
      "t",
    ]);
  });

  it("breaks within-state ties by longest elapsed first", () => {
    const a = makeLead({ id: "a", status: "contacted", last_contact_at: hoursAgo(180) });
    const b = makeLead({ id: "b", status: "contacted", last_contact_at: hoursAgo(220) });
    expect(sortBySla([a, b]).map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("slaStateOf — convenience accessor", () => {
  it("returns just the state field", () => {
    const lead = makeLead({ status: "contacted", last_contact_at: hoursAgo(96) });
    expect(slaStateOf(lead)).toBe("warning");
  });
});
