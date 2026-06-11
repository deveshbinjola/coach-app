// scripts/eval-distill.mjs
//
// Runs the golden set through the distill model (cheap, via OpenRouter)
// and reports red/green. Two layers: deterministic checks (evidence must
// be a real substring, no em-dashes, no empty text) + an LLM judge scoring
// signal accuracy + prep usefulness. Calibrate the judge against Sunny's
// ratings before trusting it.
//
// Usage: OPENROUTER_API_KEY=... node scripts/eval-distill.mjs

import { readFileSync } from "node:fs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.LLM_MODEL_DISTILL || "google/gemini-2.5-flash";
const JUDGE_MODEL = process.env.LLM_MODEL_JUDGE || "google/gemini-2.5-flash";
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("OPENROUTER_API_KEY required"); process.exit(2); }

const pairs = readFileSync("eval/distill/golden.jsonl", "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

// Mirrors lib/distill/session-distill.ts buildDistillPrompt.
const DISTILL_PROMPT = (notes) => [
  "You distill raw coaching-session notes into a structured prep card.",
  "Extract ONLY what is actually present in the notes. Do not infer, invent, or embellish.",
  "For every item include `evidence`: the exact source phrase from the notes it came from.",
  "No em-dashes anywhere.",
  "Return strict JSON, no prose, no code fences:",
  '{ "topics": [{"text":"","evidence":""}], "commitments": [{"text":"","evidence":""}], "patterns": [{"text":"","evidence":""}], "somatic": [{"text":"","evidence":""}] }',
  "topics = what was worked on. commitments = concrete actions the client agreed to.",
  "patterns = recurring behaviors/beliefs. somatic = body/nervous-system signals observed.",
  "If a category has nothing present, return an empty array for it.",
  `\nNOTES:\n"""\n${notes}\n"""`,
].join("\n");

async function call(model, system, user, maxTokens = 1500) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

function extractJson(raw) {
  const t = raw.trim();
  if (t.startsWith("{") && t.endsWith("}")) return t;
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) return f[1].trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : null;
}

const CATS = ["topics", "commitments", "patterns", "somatic"];

function deterministic(notes, out) {
  const fails = [];
  for (const cat of CATS) {
    const items = Array.isArray(out?.[cat]) ? out[cat] : [];
    for (const it of items) {
      const text = (it?.text ?? "").trim();
      const ev = (it?.evidence ?? "").trim();
      if (!text) fails.push(`${cat}:empty_text`);
      if (text.includes("—") || ev.includes("—")) fails.push(`${cat}:em_dash`);
      if (!ev || !notes.includes(ev)) fails.push(`${cat}:evidence_not_substring`);
    }
  }
  return fails;
}

const JUDGE = (notes, expected, got) => [
  "Score how well a distill model turned raw coaching notes into a prep card. 1-5 each.",
  "Output strict JSON: { \"accuracy\": n, \"prep_usefulness\": n, \"why\": \"one line\" }.",
  "accuracy = captured the expected signals without inventing anything not in the notes.",
  "prep_usefulness = would this make a useful coaching-prep card a coach could glance at before a session.",
  `\nNOTES:\n${notes}`,
  `\nEXPECTED SIGNALS (hand-labeled, defines the taxonomy):\n${JSON.stringify(expected, null, 2)}`,
  `\nMODEL OUTPUT:\n${JSON.stringify(got, null, 2)}`,
].join("\n");

let pass = 0, fail = 0;
for (const p of pairs) {
  let out = {};
  try {
    const raw = await call(MODEL, "Return only the JSON described.", DISTILL_PROMPT(p.notes));
    out = JSON.parse(extractJson(raw) ?? "{}");
  } catch (e) { console.log(`✗ ${p.id} — model error: ${e.message}`); fail++; continue; }

  const det = deterministic(p.notes, out);
  let scores = { accuracy: 0, prep_usefulness: 0, why: "judge error" };
  try {
    scores = JSON.parse(extractJson(await call(JUDGE_MODEL, "You are a strict distill judge.", JUDGE(p.notes, p.expected, out))) ?? "{}");
  } catch {}

  const ok = det.length === 0 && scores.accuracy >= 4 && scores.prep_usefulness >= 3;
  console.log(`${ok ? "✓" : "✗"} ${p.id} — det:[${det.join(",")}] accuracy:${scores.accuracy} prep_usefulness:${scores.prep_usefulness} — ${scores.why}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
