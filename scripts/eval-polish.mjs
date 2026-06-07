// scripts/eval-polish.mjs
//
// Runs the golden set through the polish model and reports red/green.
// Two layers: deterministic checks (mirrors lib/content/polish-core
// guardrails) + an LLM judge scoring voice fidelity / faithfulness /
// improvement. Calibrate the judge against human ratings before trusting it.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/eval-polish.mjs

import { readFileSync } from "node:fs";

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("ANTHROPIC_API_KEY required"); process.exit(2); }

const pairs = readFileSync("eval/polish/golden.jsonl", "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const SYSTEM = [
  "You are an editor for a coach. EDIT the draft, do not rewrite or invent.",
  "Keep ideas, claims, structure, and voice. No new facts/names/numbers.",
  "No em-dashes. Output strict JSON: { \"polished\": \"...\", \"changes\": [\"...\"] }",
].join(" ");

async function call(system, user, maxTokens = 1500) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j?.content?.[0]?.text ?? "";
}

function extractJson(raw) {
  const t = raw.trim();
  if (t.startsWith("{") && t.endsWith("}")) return t;
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) return f[1].trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : null;
}

function deterministic(raw, polished) {
  const fails = [];
  if (polished.includes("—")) fails.push("em_dash");
  const nums = (s) => new Set((s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")));
  const r = nums(raw); for (const n of nums(polished)) if (!r.has(n)) fails.push(`number_added:${n}`);
  const w = (s) => s.trim().split(/\s+/).filter(Boolean).length;
  if (w(polished) > w(raw) * 1.4) fails.push("ballooned");
  return fails;
}

const JUDGE = (raw, ideal, got) => [
  "Rate this coaching-content edit on three axes, 1-5 each. Output strict JSON",
  '{ "voice": n, "faithful": n, "improved": n, "why": "one line" }.',
  "voice = still sounds like the coach. faithful = invented nothing. improved = tighter/clearer.",
  `\nRAW:\n${raw}\n\nA STRONG HUMAN EDIT (reference):\n${ideal}\n\nMODEL EDIT:\n${got}`,
].join("\n");

let pass = 0, fail = 0;
for (const p of pairs) {
  let got = "";
  try {
    const out = await call(SYSTEM, `Edit and return JSON:\n"""\n${p.raw}\n"""`);
    got = JSON.parse(extractJson(out) ?? "{}").polished ?? out;
  } catch (e) { console.log(`✗ ${p.id} — model error: ${e.message}`); fail++; continue; }

  const det = deterministic(p.raw, got);
  let scores = { voice: 0, faithful: 0, improved: 0, why: "judge error" };
  try { scores = JSON.parse(extractJson(await call("You are a strict editing judge.", JUDGE(p.raw, p.ideal, got))) ?? "{}"); } catch {}

  const ok = det.length === 0 && scores.voice >= 4 && scores.faithful >= 4 && scores.improved >= 3;
  console.log(`${ok ? "✓" : "✗"} ${p.id} — det:[${det.join(",")}] voice:${scores.voice} faithful:${scores.faithful} improved:${scores.improved} — ${scores.why}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
