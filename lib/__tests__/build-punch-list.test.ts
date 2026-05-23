import { describe, it, expect } from "vitest";
import { buildPunchList } from "@/lib/build-punch-list";
import { makeLead, makeContent, TEST_NOW } from "./factories";
import type { JustLandedItem } from "@/components/command-center/CommandCenterView";

// ── Local helpers ────────────────────────────────────────────────────────────

function makeRescue(overrides: { id?: string; full_name?: string; reason?: string } = {}) {
  return {
    lead: {
      id:        overrides.id        ?? "00000000-0000-0000-0000-000000000010",
      full_name: overrides.full_name ?? "Test Lead",
    },
    reason: overrides.reason ?? "no reply in 5 days",
  };
}

function makeJustLanded(overrides: Partial<JustLandedItem> = {}): JustLandedItem {
  return {
    draft_id:     "draft-001",
    lead_id:      "00000000-0000-0000-0000-000000000020",
    lead_name:    "New Lead",
    source:       "ig",
    source_detail: null,
    preview:      "Hey, I need help with...",
    created_at:   new Date(TEST_NOW).toISOString(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildPunchList", () => {
  it("empty input → empty array", () => {
    // reachCount === reachTarget so no reach gap is generated
    const result = buildPunchList([], [], [], 5, 5);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("rescue items → correct id/type/label/href", () => {
    const rescue = makeRescue({ id: "abc123", full_name: "Jake Smith", reason: "no reply in 5 days" });
    const result = buildPunchList([rescue], [], [], 5, 5);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe("rescue:abc123");
    expect(item.type).toBe("rescue");
    expect(item.label).toBe("Jake Smith — no reply in 5 days");
    expect(item.href).toBe("/inbox?compose=open&ids=abc123&autoDraft=true");
  });

  it("just-landed items → correct type and href", () => {
    const jl = makeJustLanded({ lead_id: "jl-001", lead_name: "Marco Polo" });
    const result = buildPunchList([], [jl], [], 5, 5);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe("new-lead:jl-001");
    expect(item.type).toBe("new-lead");
    expect(item.label).toBe("Welcome Marco Polo — new lead");
    expect(item.href).toBe("/inbox?compose=open&ids=jl-001&autoDraft=true");
  });

  it("content items → link to /content", () => {
    const c = makeContent({ id: "cnt-001", title: "My Draft Post", status: "draft" });
    const result = buildPunchList([], [], [c], 5, 5);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe("content:cnt-001");
    expect(item.type).toBe("content");
    expect(item.label).toBe("Finish draft: My Draft Post");
    expect(item.href).toBe("/content");
  });

  it("reach gap → correct label when reachCount < reachTarget", () => {
    const result = buildPunchList([], [], [], 3, 10);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe("reach:gap");
    expect(item.type).toBe("reach");
    expect(item.label).toBe("Send 7 more to hit 10/week goal");
    expect(item.href).toBe("/inbox?compose=open");
  });

  it("no reach item when reachCount >= reachTarget", () => {
    const result = buildPunchList([], [], [], 10, 10);
    expect(result.items).toHaveLength(0);

    const result2 = buildPunchList([], [], [], 15, 10);
    expect(result2.items).toHaveLength(0);
  });

  it("priority order: rescue > new-lead > content > reach", () => {
    const rescue  = makeRescue({ id: "r1" });
    const jl      = makeJustLanded({ lead_id: "jl1" });
    const content = makeContent({ id: "c1", status: "draft" });
    // reachCount < reachTarget to trigger reach item
    const result = buildPunchList([rescue], [jl], [content], 2, 5);
    const types = result.items.map((i) => i.type);
    expect(types).toEqual(["rescue", "new-lead", "content", "reach"]);
  });

  it("caps rescue at 3 so other sources get slots", () => {
    const rescues = [
      makeRescue({ id: "r1" }),
      makeRescue({ id: "r2" }),
      makeRescue({ id: "r3" }),
      makeRescue({ id: "r4" }),
      makeRescue({ id: "r5" }),
    ];
    const jl = [
      makeJustLanded({ lead_id: "jl1", draft_id: "d1" }),
      makeJustLanded({ lead_id: "jl2", draft_id: "d2" }),
    ];
    const result = buildPunchList(rescues, jl, [], 0, 10);
    // 3 rescue (capped) + 2 just-landed + 1 reach = 6 total, capped at 5
    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(6);
    expect(result.items.filter((i) => i.type === "rescue")).toHaveLength(3);
    expect(result.items.filter((i) => i.type === "new-lead")).toHaveLength(2);
  });

  it("only includes draft content (skips published/scheduled)", () => {
    const draft     = makeContent({ id: "c-draft",     status: "draft" });
    const published = makeContent({ id: "c-published", status: "published" });
    const scheduled = makeContent({ id: "c-scheduled", status: "scheduled" });
    const result = buildPunchList([], [], [draft, published, scheduled], 5, 5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("content:c-draft");
  });
});

describe("buildPunchList — empty/early coach activation", () => {
  const NO_RESCUE: never[] = [];
  const NO_LANDED: never[] = [];
  const NO_CONTENT: never[] = [];

  it("emits activation items for an empty coach (no leads, no content)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15, {
      totalLeads: 0,
      hasContent: false,
      hasVoiceProfile: false,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain("activation:voice");
    expect(ids).toContain("activation:first-content");
    expect(ids).toContain("activation:first-lead");
    expect(items.filter((i) => i.id.startsWith("activation:")).every((i) => i.type === "activation")).toBe(true);
  });

  it("does NOT emit the reach-gap item for an empty coach (nonsensical at 0 leads)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15, {
      totalLeads: 0,
      hasContent: false,
      hasVoiceProfile: true,
    });
    expect(items.find((i) => i.type === "reach")).toBeUndefined();
  });

  it("omits the voice activation item when the coach already has a voice profile", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15, {
      totalLeads: 0,
      hasContent: false,
      hasVoiceProfile: true,
    });
    expect(items.find((i) => i.id === "activation:voice")).toBeUndefined();
  });

  it("is backward-compatible: omitting the activation arg preserves prior behavior (reach gap shows)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15);
    expect(items.find((i) => i.type === "reach")).toBeDefined();
    expect(items.find((i) => i.type === "activation")).toBeUndefined();
  });

  it("does NOT treat a coach with leads as early (no activation items)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 3, 15, {
      totalLeads: 4,
      hasContent: false,
      hasVoiceProfile: true,
    });
    expect(items.find((i) => i.type === "activation")).toBeUndefined();
  });
});
