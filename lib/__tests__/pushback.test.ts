// Tests for lib/pushback.ts
//
// pushback's getContentPushBack and getContentPushBackQueue drive the
// "Content critic" surface in CommandCenter and the inline Fix-it
// chips on Content Pipeline. The severity hierarchy
// (blocker > warning > opportunity > clear) is what determines what
// shows up in the queue and in what order — the tests pin that contract.

import { describe, it, expect } from "vitest";
import {
  getContentPushBack,
  getContentPushBackQueue,
} from "@/lib/pushback";
import { makeContent } from "./factories";

describe("getContentPushBack — blocker conditions", () => {
  it("flags failed publishes as blocker", () => {
    const r = getContentPushBack(makeContent({ status: "failed" }));
    expect(r.tone).toBe("blocker");
    expect(r.items[0]?.severity).toBe("blocker");
  });

  it("flags missing body as blocker", () => {
    const r = getContentPushBack(makeContent({ body: "" }));
    expect(r.tone).toBe("blocker");
    expect(r.items[0]?.title).toMatch(/no body/i);
  });

  it("treats whitespace-only body as missing", () => {
    const r = getContentPushBack(makeContent({ body: "   \n  \t  " }));
    expect(r.tone).toBe("blocker");
  });
});

describe("getContentPushBack — warning conditions", () => {
  it("flags too-thin body (<220 chars, non-story)", () => {
    const r = getContentPushBack(
      makeContent({
        body: "Short post.",
        content_type: "post",
      })
    );
    expect(r.items.some((i) => i.severity === "warning" && /thin/i.test(i.title))).toBe(true);
  });

  it("does NOT flag short stories — the 'too thin' rule excludes story type", () => {
    const r = getContentPushBack(
      makeContent({
        body: "Short story note.",
        content_type: "story",
        title: "A real moment from yesterday",
        pillar: "story",
      })
    );
    expect(r.items.every((i) => !/thin/i.test(i.title))).toBe(true);
  });

  it("flags missing pillar as warning", () => {
    const r = getContentPushBack(makeContent({ pillar: null }));
    expect(r.items.some((i) => /content job/i.test(i.title))).toBe(true);
  });

  it("flags missing CTA in non-published drafts", () => {
    const r = getContentPushBack(
      makeContent({
        body: "Plenty of body copy here, well over 220 characters because we want to make sure the body-too-thin rule doesn't fire instead. The post explains an idea but never gives the reader a way to act on it. The CTA is the part that turns a thought into demand.",
        title: "An idea without a next step",
      })
    );
    expect(r.items.some((i) => /cta|next step/i.test(i.title))).toBe(true);
  });
});

describe("getContentPushBack — clear path", () => {
  it("returns 'clear' when post has substantial body (>=220 chars), pillar, and CTA", () => {
    // Body MUST be >= 220 chars to escape the "too thin" warning. This
    // is the threshold that protects coaches from shipping anemic posts.
    const r = getContentPushBack(
      makeContent({
        body:
          "A complete post that explains an idea, demonstrates the proof through a concrete example, and gives the reader something specific to do. It says enough to be useful, with one lived moment readers can recognize, and ends with a real question to bring them in. Worth a chat?",
        pillar: "authority",
      })
    );
    expect(r.tone).toBe("clear");
    expect(r.verdict).toBe("Clear to move");
  });
});

describe("getContentPushBackQueue — queue ordering", () => {
  it("filters out clear items", () => {
    const cleanItem = makeContent({
      id:     "clean",
      body:
        "A complete post with everything it needs, well over two hundred and twenty characters of real content that earns the reader's attention by being specific, grounded, and offering one moment they can recognize from their own experience, ending in a clear next step. Worth a chat?",
      pillar: "authority",
    });
    const blocked = makeContent({ id: "blocked", body: "" });
    const queue = getContentPushBackQueue([cleanItem, blocked]);
    expect(queue.map((q) => q.content.id)).toEqual(["blocked"]);
  });

  it("ranks blockers before warnings", () => {
    const blocker = makeContent({ id: "b", body: "" });
    const warn    = makeContent({
      id: "w",
      body: "Short body.",
      content_type: "post",
    });
    const queue = getContentPushBackQueue([warn, blocker]);
    expect(queue.map((q) => q.content.id)).toEqual(["b", "w"]);
  });

  it("respects the limit param", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeContent({ id: `bad-${i}`, body: "" })
    );
    expect(getContentPushBackQueue(items, 3)).toHaveLength(3);
  });

  it("default limit caps at 4", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeContent({ id: `bad-${i}`, body: "" })
    );
    expect(getContentPushBackQueue(items)).toHaveLength(4);
  });
});

describe("getContentPushBack — caps to 3 items per summary", () => {
  it("trims to top 3 even when more conditions trigger", () => {
    // Trigger ALL the warning conditions: missing body (blocker),
    // missing pillar, no CTA. That's at least 3 items; ensure cap holds.
    const r = getContentPushBack(
      makeContent({
        body:   "",
        pillar: null,
        title:  "",
      })
    );
    expect(r.items.length).toBeLessThanOrEqual(3);
  });
});
