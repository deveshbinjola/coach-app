// lib/llm.ts
//
// One OpenAI-compatible call via OpenRouter, with per-task model selection.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type LLMTask = "distill" | "chat" | "draft";

const DEFAULTS: Record<LLMTask, string> = {
  distill: "google/gemini-2.5-flash",
  chat: "google/gemini-2.5-flash",
  draft: "anthropic/claude-sonnet-4-6",
};

export function modelFor(task: LLMTask): string {
  const env =
    task === "distill" ? process.env.LLM_MODEL_DISTILL :
    task === "chat" ? process.env.LLM_MODEL_CHAT :
    process.env.LLM_MODEL_DRAFT;
  return env || DEFAULTS[task];
}

export function buildLLMRequest(opts: { task: LLMTask; system: string; user: string; maxTokens?: number }) {
  return {
    model: modelFor(opts.task),
    max_tokens: opts.maxTokens ?? 1200,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
}

/** Returns the model's text. Throws with a clear message on misconfig / non-2xx. */
export async function callLLM(opts: { task: LLMTask; system: string; user: string; maxTokens?: number }): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildLLMRequest(opts)),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}
