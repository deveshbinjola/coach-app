import { describe, it, expect } from "vitest";
import { buildQueue, queueCount, type QueueInput } from "@/lib/queue";

const NOW = new Date("2026-09-11T12:00:00Z").getTime();

const empty = (): QueueInput => ({
  now: NOW,
  pendingDrafts: [],
  failedEnrollments: [],
  contentDrafts: [],
});

const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("buildQueue ordering", () => {
  it("returns an empty queue on a clear day", () => {
    expect(buildQueue(empty())).toEqual([]);
    expect(queueCount([])).toBe(0);
  });

  it("puts pending drafts before failures before content, drafts oldest-first (speed-to-lead)", () => {
    const items = buildQueue({
      now: NOW,
      pendingDrafts: [
        { id: "d-new", lead_id: "l1", content: "Hey", created_at: hoursAgo(1), leadName: "Marcus" },
        { id: "d-old", lead_id: "l2", content: "Hey", created_at: hoursAgo(20), leadName: "Dana" },
      ],
      failedEnrollments: [
        { id: "f1", lead_id: "l3", created_at: hoursAgo(2), error: "smtp bounce", leadName: "Tom", sequenceName: "Welcome" },
      ],
      contentDrafts: [{ id: "c1", title: "Monday post", created_at: hoursAgo(50) }],
    });
    expect(items.map((i) => i.id)).toEqual([
      "first_response_draft:d-old",
      "first_response_draft:d-new",
      "failed_enrollment:f1",
      "content_draft:c1",
    ]);
  });
});

describe("buildQueue copy", () => {
  it("names the lead in the title and previews the draft", () => {
    const [item] = buildQueue({
      ...empty(),
      pendingDrafts: [
        { id: "d1", lead_id: "l1", content: "Hey Marcus,\n\ngreat to  hear from you", created_at: hoursAgo(1), leadName: "Marcus" },
      ],
    });
    expect(item.title).toBe("Reply to Marcus");
    expect(item.detail).toBe("Hey Marcus, great to hear from you");
    expect(item.href).toBe("/leads/l1");
    expect(item.draft).toEqual({ messageId: "d1", content: "Hey Marcus,\n\ngreat to  hear from you" });
  });

  it("truncates long previews to one glanceable line", () => {
    const [item] = buildQueue({
      ...empty(),
      pendingDrafts: [
        { id: "d1", lead_id: "l1", content: "x".repeat(400), created_at: hoursAgo(1), leadName: null },
      ],
    });
    expect(item.title).toBe("Reply to a new lead");
    expect(item.detail.length).toBeLessThanOrEqual(140);
  });

  it("joins sequence name and error for a stalled enrollment, with a fallback line", () => {
    const items = buildQueue({
      ...empty(),
      failedEnrollments: [
        { id: "f1", lead_id: "l1", created_at: hoursAgo(1), error: "smtp bounce", leadName: "Tom", sequenceName: "Welcome" },
        { id: "f2", lead_id: "l2", created_at: hoursAgo(2), error: null, leadName: null, sequenceName: null },
      ],
    });
    // Oldest failure first, same speed-first rule as drafts.
    expect(items[0]!.title).toBe("A sequence stalled");
    expect(items[0]!.detail).toContain("needs a human look");
    expect(items[1]!.detail).toBe("Welcome · smtp bounce");
  });

  it("tolerates a malformed created_at without NaN ages", () => {
    const [item] = buildQueue({
      ...empty(),
      contentDrafts: [{ id: "c1", title: null, created_at: "not-a-date" }],
    });
    expect(item.ageMs).toBe(0);
    expect(item.detail).toBe("Untitled draft");
  });
});
