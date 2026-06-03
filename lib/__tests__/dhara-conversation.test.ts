import { describe, it, expect } from "vitest";
import { toAnthropicMessages, type ConvRow } from "@/lib/dhara/conversation";

describe("toAnthropicMessages", () => {
  it("merges consecutive user turns (orphan user messages from failed replies)", () => {
    const rows: ConvRow[] = [
      { role: "user", content: "How's my month?" },
      { role: "user", content: "How many leads do I have?" },
    ];
    const out = toAnthropicMessages(rows);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toContain("How's my month?");
    expect(out[0].content).toContain("How many leads do I have?");
  });

  it("keeps a normal alternating conversation intact", () => {
    const rows: ConvRow[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "thanks" },
    ];
    expect(toAnthropicMessages(rows).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("drops empty-content turns", () => {
    const rows: ConvRow[] = [
      { role: "user", content: "real" },
      { role: "assistant", content: "   " },
      { role: "user", content: "again" },
    ];
    const out = toAnthropicMessages(rows);
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain("real");
    expect(out[0].content).toContain("again");
  });

  it("drops leading assistant turns so the array starts with user", () => {
    const rows: ConvRow[] = [
      { role: "assistant", content: "stray" },
      { role: "user", content: "first real" },
    ];
    const out = toAnthropicMessages(rows);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toBe("first real");
  });
});
