import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/dhara/intents";

describe("matchIntent — data questions", () => {
  it("counts leads", () => {
    expect(matchIntent("How many leads do I have?")).toEqual({ type: "count_leads" });
  });
  it("counts clients", () => {
    expect(matchIntent("how many clients do you have")).toEqual({ type: "count_clients" });
  });
  it("revenue", () => {
    expect(matchIntent("how much revenue did I make?")).toEqual({ type: "revenue" });
    expect(matchIntent("what's my revenue")).toEqual({ type: "revenue" });
    expect(matchIntent("how much money have I made")).toEqual({ type: "revenue" });
  });
  it("counts quizzes", () => {
    expect(matchIntent("how many quizzes do I have")).toEqual({ type: "count_quizzes" });
  });
  it("counts sessions", () => {
    expect(matchIntent("how many sessions this month")).toEqual({ type: "count_sessions" });
  });
  it("pain points", () => {
    expect(matchIntent("which pain points do most leads have?")).toEqual({ type: "pain_points" });
    expect(matchIntent("what's the most common pain")).toEqual({ type: "pain_points" });
  });
});

describe("matchIntent — navigation (many phrasings)", () => {
  const f = (route: string, target: string) => ({ type: "navigate", target, route });
  it.each([
    ["take me to leads", f("/clients", "leads")],
    ["give me the dashboard", f("/command-center", "dashboard")],
    ["open content", f("/content", "content")],
    ["show me my quizzes", f("/funnels", "quizzes")],
    ["show my quizzes", f("/funnels", "quizzes")],          // the reported bug
    ["open my quizzes", f("/funnels", "quizzes")],
    ["view content", f("/content", "content")],
    ["pull up my clients", f("/clients", "clients")],
    ["where are my quizzes", f("/funnels", "quizzes")],
    ["go to inbox", f("/inbox", "inbox")],
    ["take me to the command center", f("/command-center", "command center")],
    ["dashboard", f("/command-center", "dashboard")],
    ["my quizzes", f("/funnels", "quizzes")],
  ])("'%s' navigates", (input, expected) => {
    expect(matchIntent(input)).toEqual(expected);
  });
});

describe("matchIntent — does NOT false-navigate", () => {
  it.each([
    "show me content ideas",          // ends with "ideas", not a place
    "I want to write about content",
    "what should I do about my leads",
    "help me with my leads strategy",
  ])("'%s' is not a navigation", (input) => {
    const r = matchIntent(input);
    expect(r?.type === "navigate").toBe(false);
  });
});

describe("matchIntent — distinguishes question vs navigation", () => {
  it("'how many leads' is a count, not navigation", () => {
    expect(matchIntent("how many leads do I have")).toEqual({ type: "count_leads" });
  });
});

describe("matchIntent — falls through", () => {
  it("returns null for open-ended messages", () => {
    expect(matchIntent("write me a poem about burnout")).toBeNull();
    expect(matchIntent("I'm feeling stuck with my launch")).toBeNull();
  });
});
