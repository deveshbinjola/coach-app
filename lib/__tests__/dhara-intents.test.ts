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

describe("matchIntent — navigation", () => {
  it("take me to leads -> /clients", () => {
    expect(matchIntent("take me to leads")).toEqual({ type: "navigate", target: "leads", route: "/clients" });
  });
  it("give me the dashboard -> /command-center", () => {
    expect(matchIntent("give me the dashboard")).toEqual({ type: "navigate", target: "dashboard", route: "/command-center" });
  });
  it("open content -> /content", () => {
    expect(matchIntent("open content")).toEqual({ type: "navigate", target: "content", route: "/content" });
  });
  it("show me my quizzes -> /funnels", () => {
    expect(matchIntent("show me my quizzes")).toEqual({ type: "navigate", target: "quizzes", route: "/funnels" });
  });
  it("a bare destination word navigates", () => {
    expect(matchIntent("dashboard")).toEqual({ type: "navigate", target: "dashboard", route: "/command-center" });
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
