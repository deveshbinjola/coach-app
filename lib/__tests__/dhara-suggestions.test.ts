import { describe, it, expect } from "vitest";
import { deriveSuggestions } from "@/lib/dhara/suggestions";

describe("deriveSuggestions", () => {
  const leads = [{ id: "l1", name: "Marcus Lee" }, { id: "l2", name: "Dana" }];
  it("offers a navigate suggestion for a lead named in the reply", () => {
    const s = deriveSuggestions("Marcus has gone quiet. Reach out?", leads);
    expect(s.some((x) => x.kind === "navigate" && x.href === "/leads/l1")).toBe(true);
  });
  it("includes a disabled compose 'soon' suggestion when a lead is mentioned", () => {
    const s = deriveSuggestions("Marcus has gone quiet.", leads);
    expect(s.some((x) => x.kind === "compose" && x.level === "suggest" && x.enabled === false)).toBe(true);
  });
  it("returns [] when no known lead is mentioned", () => {
    expect(deriveSuggestions("Your month looks steady.", leads)).toEqual([]);
  });
  it("does not false-positive a short first name inside another word", () => {
    const sam = [{ id: "l3", name: "Sam Cole" }];
    expect(deriveSuggestions("We discussed the same approach.", sam)).toEqual([]);
  });
});
