import { describe, it, expect } from "vitest";
import { modelFor, buildLLMRequest } from "@/lib/llm";

describe("modelFor", () => {
  it("uses a cheap model for distill and chat", () => {
    expect(modelFor("distill")).toMatch(/gemini|deepseek/i);
    expect(modelFor("chat")).toMatch(/gemini|deepseek/i);
  });
  it("uses Sonnet for draft", () => {
    expect(modelFor("draft")).toMatch(/sonnet/i);
  });
});
describe("buildLLMRequest", () => {
  it("shapes an OpenAI-compatible body", () => {
    const body = buildLLMRequest({ task: "distill", system: "S", user: "U" });
    expect(body.model).toBe(modelFor("distill"));
    expect(body.messages[0]).toEqual({ role: "system", content: "S" });
    expect(body.messages[1]).toEqual({ role: "user", content: "U" });
  });
});
