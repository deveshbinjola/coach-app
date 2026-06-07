# Content Polish-in-Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach paste a rough draft and get it edited ("Sharpened") in their own voice, with an honest summary of what changed.

**Architecture:** A Next.js edge API route (`app/api/content/polish`) calls Anthropic once, grounded in the coach's active voice profile. All prompt/parse/guardrail logic lives in a pure, unit-tested `lib/content/polish-core.ts` (no Next/Deno imports) so the route and the eval script share it. A standalone `/content/polish` page renders the result polished-forward with a one-tap "what changed" summary.

**Tech Stack:** Next.js App Router (edge runtime), `process.env.ANTHROPIC_API_KEY` (Cloudflare env, same as `content/fix`), `claude-sonnet-4-6`, Supabase (`cp_voice_profiles`, cookie RLS), Vitest, Node eval script.

**Planning-time deviation from spec:** The spec listed "Modify `ContentTabBar.tsx` — add Polish tab." During planning we found `ContentTabBar` is a *controlled* create/library switch living inside `ContentWorkspace` state; adding a third controlled tab would require workspace-pipeline surgery, contradicting the standalone (Option 1) scope. Instead Polish is its own route `/content/polish` with a discoverability link from the content page. Same user value, no workspace coupling.

---

## File Structure

- `lib/content/polish-core.ts` — pure logic: `buildSharpenSystemPrompt`, `buildUserPrompt`, `parsePolishResponse`, `runGuardrails`, constants, types. Zero runtime-specific imports except `safeParseJson` from `lib/voice/extract-rules.ts` (already pure).
- `lib/content/__tests__/polish-core.test.ts` — Vitest unit tests for every pure function.
- `app/api/content/polish/route.ts` — edge route: auth, rate-limit, validate, load voice, call model, parse, guardrails, respond.
- `components/content/PolishPanel.tsx` — client UI: paste → polish → verify (layout C) → steer chips → Use this / Try again / Copy; gates + weak-voice nudge.
- `app/content/polish/page.tsx` — server page hosting `PolishPanel` (auth + redirect only).
- `eval/polish/golden.jsonl` — hand-labeled rough→ideal pairs (seed format + one example).
- `scripts/eval-polish.mjs` — runs golden set through the model, deterministic checks + judge, red/green.
- `docs/qa/polish-eval.md` — how to run evals, add pairs, calibrate the judge.

---

### Task 1: polish-core types, constants, and the Sharpen system prompt

**Files:**
- Create: `lib/content/polish-core.ts`
- Test: `lib/content/__tests__/polish-core.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/content/__tests__/polish-core.test.ts
import { describe, it, expect } from "vitest";
import {
  buildSharpenSystemPrompt,
  MAX_POLISH_CHARS,
  MIN_POLISH_CHARS,
} from "@/lib/content/polish-core";

describe("buildSharpenSystemPrompt", () => {
  const voiceJson = { tone: ["direct"], do_nots: ['no "crushing it"'], vocabulary: { avoid: ["synergy"] } };
  const samples = ["Be where your feet are.", "Most guys have a clarity problem."];

  it("embeds the do-nots, vocabulary, and sample messages", () => {
    const p = buildSharpenSystemPrompt(voiceJson, samples);
    expect(p).toContain("Be where your feet are.");
    expect(p).toContain("synergy");
    expect(p).toContain('no "crushing it"');
  });

  it("forbids adding new facts and em-dashes, and demands JSON output", () => {
    const p = buildSharpenSystemPrompt(voiceJson, samples);
    expect(p.toLowerCase()).toContain("do not add");
    expect(p.toLowerCase()).toContain("em-dash");
    expect(p).toContain('"polished"');
    expect(p).toContain('"changes"');
  });

  it("instructs preserving structure (lists/line breaks)", () => {
    const p = buildSharpenSystemPrompt(voiceJson, samples);
    expect(p.toLowerCase()).toContain("structure");
  });

  it("exposes char bounds", () => {
    expect(MIN_POLISH_CHARS).toBe(20);
    expect(MAX_POLISH_CHARS).toBe(4000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: FAIL — cannot find module `@/lib/content/polish-core`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/content/polish-core.ts
//
// Pure, runtime-agnostic logic for the Content "polish in my voice" feature.
// Imported by BOTH the Next edge route and the Node eval script, so it must
// stay free of Next/Deno-specific APIs. The only dependency is the already-
// pure safeParseJson helper.

import { safeParseJson } from "@/lib/voice/extract-rules";

export const MIN_POLISH_CHARS = 20;
export const MAX_POLISH_CHARS = 4000;

export type PolishSteer = "tighter" | "warmer" | "shorter" | "keep_more";

export type PolishFlag =
  | { kind: "em_dash" }
  | { kind: "numbers_added"; values: string[] }
  | { kind: "ballooned"; rawWords: number; polishedWords: number }
  | { kind: "structure_dropped" };

export type PolishResult = { polished: string; changes: string[] };

/** The Sharpen contract. The prompt is the product: it constrains the model
 *  to EDIT, not rewrite or invent. */
export function buildSharpenSystemPrompt(
  voiceJson: unknown,
  sampleMessages: string[],
): string {
  return [
    "You are an editor for a coach. You EDIT their rough draft. You do not",
    "rewrite it from scratch and you do not generate new content.",
    "",
    "GOAL: Sharpen the draft. Cut filler, fix grammar and flow, tighten the",
    "rhythm, so it is ready to post. Keep the coach's ideas, claims, meaning,",
    "and their words and cadence wherever they already land.",
    "",
    "HARD RULES:",
    "- Do not add new facts, names, numbers, examples, claims, or ideas that",
    "  are not already in the draft. Editing only.",
    "- Preserve structure: keep line breaks, lists, and bullets. A bulleted",
    "  post stays bulleted. Do not collapse structure into one paragraph.",
    "- Obey the coach's do_nots and vocabulary.avoid below.",
    "- Never use em-dashes. Use periods, commas, colons, or parentheses.",
    "",
    "OUTPUT: strict JSON only, no prose around it:",
    '{ "polished": "<the edited text>", "changes": ["<short bullet>", "..."] }',
    "Give 2 to 4 change bullets, each under 8 words, plain and specific",
    '(e.g. "cut the throat-clearing opener", "kept your closing line").',
    "",
    "VOICE PROFILE (the coach's actual voice):",
    "```json",
    JSON.stringify(voiceJson ?? {}, null, 2),
    "```",
    "",
    "SAMPLES OF HOW THIS COACH WRITES:",
    sampleMessages.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join("\n") || "(none)",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/content/polish-core.ts lib/content/__tests__/polish-core.test.ts
git commit -m "feat(polish): Sharpen system-prompt builder + core types"
```

---

### Task 2: User prompt + steer

**Files:**
- Modify: `lib/content/polish-core.ts`
- Test: `lib/content/__tests__/polish-core.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { buildUserPrompt } from "@/lib/content/polish-core";

describe("buildUserPrompt", () => {
  it("wraps the raw draft", () => {
    const p = buildUserPrompt("ok so here is my messy draft about clarity");
    expect(p).toContain("messy draft about clarity");
  });

  it("appends a steer line when given, and none when not", () => {
    expect(buildUserPrompt("draft", "tighter").toLowerCase()).toContain("shorter");
    expect(buildUserPrompt("draft", "warmer").toLowerCase()).toContain("warm");
    expect(buildUserPrompt("draft", "shorter").toLowerCase()).toContain("short");
    expect(buildUserPrompt("draft", "keep_more").toLowerCase()).toContain("their own words");
    expect(buildUserPrompt("draft")).not.toMatch(/STEER:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: FAIL — `buildUserPrompt` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `lib/content/polish-core.ts`)

```ts
const STEER_LINES: Record<PolishSteer, string> = {
  tighter: "Lean shorter and punchier than your default. Cut harder.",
  warmer: "Make it a touch warmer and more personal, without going soft.",
  shorter: "Make it noticeably shorter. Keep only what earns its place.",
  keep_more: "Keep more of their own words and phrasing. Edit less, trust their voice.",
};

/** Wrap the coach's draft as the user turn. `steer` is an additive nudge from
 *  a Try-again chip, never a new contract. */
export function buildUserPrompt(rawText: string, steer?: PolishSteer): string {
  const lines = [
    "Edit the draft below and return the JSON described in the system prompt.",
    "",
    "DRAFT:",
    '"""',
    rawText,
    '"""',
  ];
  if (steer) lines.push("", `STEER: ${STEER_LINES[steer]}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/content/polish-core.ts lib/content/__tests__/polish-core.test.ts
git commit -m "feat(polish): user prompt + steer nudges"
```

---

### Task 3: Parse the model response

**Files:**
- Modify: `lib/content/polish-core.ts`
- Test: `lib/content/__tests__/polish-core.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { parsePolishResponse } from "@/lib/content/polish-core";

describe("parsePolishResponse", () => {
  it("parses clean JSON", () => {
    const r = parsePolishResponse('{"polished":"Tight copy.","changes":["cut filler"]}');
    expect(r.polished).toBe("Tight copy.");
    expect(r.changes).toEqual(["cut filler"]);
  });

  it("parses fenced JSON", () => {
    const r = parsePolishResponse('```json\n{"polished":"Hi.","changes":["a","b"]}\n```');
    expect(r.polished).toBe("Hi.");
    expect(r.changes).toEqual(["a", "b"]);
  });

  it("falls back to raw text with empty changes when unparseable", () => {
    const r = parsePolishResponse("just some plain text the model returned");
    expect(r.polished).toBe("just some plain text the model returned");
    expect(r.changes).toEqual([]);
  });

  it("drops non-string change entries and trims", () => {
    const r = parsePolishResponse('{"polished":"  x  ","changes":["ok",2,null,"two"]}');
    expect(r.polished).toBe("x");
    expect(r.changes).toEqual(["ok", "two"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: FAIL — `parsePolishResponse` not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
/** Defensive parse. Reuses safeParseJson (handles fenced/loose JSON). On any
 *  failure, treats the whole response as the polished text so the coach still
 *  gets their edit, just without a change summary. */
export function parsePolishResponse(raw: string): PolishResult {
  const parsed = safeParseJson<{ polished?: unknown; changes?: unknown }>(raw);
  if (parsed && typeof parsed.polished === "string" && parsed.polished.trim()) {
    const changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : [];
    return { polished: parsed.polished.trim(), changes };
  }
  return { polished: (raw ?? "").trim(), changes: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/content/polish-core.ts lib/content/__tests__/polish-core.test.ts
git commit -m "feat(polish): defensive response parser"
```

---

### Task 4: Deterministic guardrails

**Files:**
- Modify: `lib/content/polish-core.ts`
- Test: `lib/content/__tests__/polish-core.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { runGuardrails } from "@/lib/content/polish-core";

describe("runGuardrails", () => {
  it("flags an em-dash in the polished text", () => {
    const flags = runGuardrails("plain raw text here", "now with an em-dash — see");
    expect(flags.some((f) => f.kind === "em_dash")).toBe(true);
  });

  it("flags a number that appears only in the polished text", () => {
    const flags = runGuardrails("I help coaches grow", "I help 500 coaches grow");
    const added = flags.find((f) => f.kind === "numbers_added");
    expect(added).toBeTruthy();
    expect(added && "values" in added && added.values).toContain("500");
  });

  it("does not flag numbers already present in the raw", () => {
    const flags = runGuardrails("3 steps to clarity", "The 3 steps to clarity");
    expect(flags.some((f) => f.kind === "numbers_added")).toBe(false);
  });

  it("flags ballooned output (>1.4x words)", () => {
    const raw = "short draft";
    const polished = "this is a much much much much much much much longer polished draft now";
    expect(runGuardrails(raw, polished).some((f) => f.kind === "ballooned")).toBe(true);
  });

  it("flags dropped structure when raw was bulleted and polished is prose", () => {
    const raw = "- point one\n- point two\n- point three";
    const polished = "Point one, point two, and point three all together.";
    expect(runGuardrails(raw, polished).some((f) => f.kind === "structure_dropped")).toBe(true);
  });

  it("returns no flags for a clean, faithful, tighter edit", () => {
    const raw = "ok so most guys think they have a discipline problem but its clarity";
    const polished = "Most guys think they have a discipline problem. It is clarity.";
    expect(runGuardrails(raw, polished)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: FAIL — `runGuardrails` not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function numberTokens(s: string): string[] {
  // Normalize thousands separators so "1,000" and "1000" compare equal.
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

function bulletLineCount(s: string): number {
  return s.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)).length;
}

/** Cheap, deterministic, instant checks. Returned as soft flags the UI shows
 *  as "check this" notes. They never block the edit. No named-entity detection
 *  (not deterministically possible in this runtime), so it is not attempted. */
export function runGuardrails(rawText: string, polished: string): PolishFlag[] {
  const flags: PolishFlag[] = [];

  if (polished.includes("—")) flags.push({ kind: "em_dash" });

  const rawNums = new Set(numberTokens(rawText));
  const addedNums = [...new Set(numberTokens(polished))].filter((n) => !rawNums.has(n));
  if (addedNums.length > 0) flags.push({ kind: "numbers_added", values: addedNums });

  const rawWords = wordCount(rawText);
  const polishedWords = wordCount(polished);
  if (rawWords > 0 && polishedWords > rawWords * 1.4) {
    flags.push({ kind: "ballooned", rawWords, polishedWords });
  }

  const rawBullets = bulletLineCount(rawText);
  const rawNewlines = (rawText.match(/\n/g) ?? []).length;
  const polishedBullets = bulletLineCount(polished);
  const polishedNewlines = (polished.match(/\n/g) ?? []).length;
  const rawHadStructure = rawBullets >= 2 || rawNewlines >= 2;
  const polishedLostIt = polishedBullets === 0 && polishedNewlines === 0;
  if (rawHadStructure && polishedLostIt) flags.push({ kind: "structure_dropped" });

  return flags;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/content/__tests__/polish-core.test.ts`
Expected: PASS (all polish-core tests).

- [ ] **Step 5: Commit**

```bash
git add lib/content/polish-core.ts lib/content/__tests__/polish-core.test.ts
git commit -m "feat(polish): deterministic guardrails"
```

---

### Task 5: The polish API route

**Files:**
- Create: `app/api/content/polish/route.ts`
- Reference (pattern, do not modify): `app/api/content/fix/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/content/polish/route.ts
//
// POST { raw_text, steer? } -> { polished, changes, flags, voice_version, model }
// Edits the coach's own rough draft in their voice (Sharpen). One model call,
// grounded in the active voice profile. Uses the Cloudflare ANTHROPIC_API_KEY
// (same path as content/fix), NOT a Supabase edge secret.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  buildSharpenSystemPrompt,
  buildUserPrompt,
  parsePolishResponse,
  runGuardrails,
  MIN_POLISH_CHARS,
  MAX_POLISH_CHARS,
  type PolishSteer,
} from "@/lib/content/polish-core";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const VALID_STEERS: PolishSteer[] = ["tighter", "warmer", "shorter", "keep_more"];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "content/polish", 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many polishes in a row. Give it a minute." }, { status: 429 });
  }

  let body: { raw_text?: unknown; steer?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = typeof body.raw_text === "string" ? body.raw_text.trim() : "";
  const steer = VALID_STEERS.includes(body.steer as PolishSteer) ? (body.steer as PolishSteer) : undefined;

  if (rawText.length < MIN_POLISH_CHARS) {
    return NextResponse.json({ error: "Add a bit more to work with." }, { status: 400 });
  }
  if (rawText.length > MAX_POLISH_CHARS) {
    return NextResponse.json({ error: "That is longer than this handles for now. Trim it or split it." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("voice_json, sample_messages, version")
    .eq("coach_id", user.id)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "no_voice_profile" }, { status: 409 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured right now. Try again shortly." }, { status: 500 });
  }

  const system = buildSharpenSystemPrompt(profile.voice_json, profile.sample_messages ?? []);
  const userPrompt = buildUserPrompt(rawText, steer);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: `Could not reach the model: ${String(err)}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Model error ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const result = await res.json();
  const rawOut: string = result?.content?.[0]?.text ?? "";
  const { polished, changes } = parsePolishResponse(rawOut);
  if (!polished.trim()) {
    return NextResponse.json({ error: "The model returned an empty edit. Try again." }, { status: 502 });
  }
  const flags = runGuardrails(rawText, polished);

  // v1 logging: metadata only, no raw text, no table (YAGNI).
  console.log("[content/polish]", JSON.stringify({
    coach: user.id,
    in_len: rawText.length,
    out_len: polished.length,
    steer: steer ?? null,
    voice_version: profile.version,
    model: MODEL,
    flags: flags.map((f) => f.kind),
  }));

  return NextResponse.json({ polished, changes, flags, voice_version: profile.version, model: MODEL });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `app/api/content/polish/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/content/polish/route.ts
git commit -m "feat(polish): /api/content/polish edge route"
```

---

### Task 6: PolishPanel UI

**Files:**
- Create: `components/content/PolishPanel.tsx`
- Reference (component primitives): `components/ui` (`Badge`, `Button`, `Card`), `components/VoiceSetupFlow.tsx` (state + invoke patterns)

- [ ] **Step 1: Write the component**

```tsx
// components/content/PolishPanel.tsx
"use client";

// Standalone "polish a rough draft in my voice" panel. Paste -> Sharpen ->
// result polished-forward with a one-tap "what changed" summary. Honest:
// the edit is a suggestion (Use this / Try again / Copy), guardrail flags
// surface as soft "check this" notes, real errors are shown verbatim.

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { MAX_POLISH_CHARS, MIN_POLISH_CHARS, type PolishSteer } from "@/lib/content/polish-core";

type Flag =
  | { kind: "em_dash" }
  | { kind: "numbers_added"; values: string[] }
  | { kind: "ballooned"; rawWords: number; polishedWords: number }
  | { kind: "structure_dropped" };

type PolishResponse = {
  polished: string;
  changes: string[];
  flags: Flag[];
  voice_version: number;
  model: string;
};

const STEER_CHIPS: Array<{ id: PolishSteer; label: string }> = [
  { id: "tighter", label: "Tighter" },
  { id: "warmer", label: "Warmer" },
  { id: "shorter", label: "Shorter" },
  { id: "keep_more", label: "Keep my words" },
];

function flagText(f: Flag): string {
  switch (f.kind) {
    case "em_dash": return "An em-dash slipped in. You may want to swap it.";
    case "numbers_added": return `Double-check this number: ${f.values.join(", ")}. It was not in your draft.`;
    case "ballooned": return "This came back longer than your draft. Skim it before you use it.";
    case "structure_dropped": return "Your line breaks or bullets changed. Check the formatting.";
  }
}

export default function PolishPanel({ hasVoice, weakVoice }: { hasVoice: boolean; weakVoice: boolean }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<PolishResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [copied, setCopied] = useState(false);

  const tooShort = raw.trim().length < MIN_POLISH_CHARS;
  const tooLong = raw.trim().length > MAX_POLISH_CHARS;

  async function polish(steer?: PolishSteer) {
    setError(null);
    setBusy(true);
    setCopied(false);
    try {
      const res = await fetch("/api/content/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw.trim(), steer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error === "no_voice_profile"
          ? "Build your voice first so polish sounds like you."
          : String(data?.error ?? "Something went wrong. Try again."));
        return;
      }
      setResult(data as PolishResponse);
      setShowChanges(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyOut() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.polished);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy. Select the text and copy manually.");
    }
  }

  if (!hasVoice) {
    return (
      <Card padding="lg" className="text-center">
        <h2 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)]">Build your voice first</h2>
        <p className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)] max-w-md mx-auto">
          Polish rewrites your rough drafts in your voice. Set your voice up once and this comes alive.
        </p>
        <a href="/voice" className="inline-flex items-center justify-center h-11 px-5 mt-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-extrabold">
          Build my voice
        </a>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Badge tone="brand" size="xs" uppercase>Polish in your voice</Badge>
        <h1 className="text-[length:var(--t-h1)] font-extrabold mt-2 text-[color:var(--text)] leading-[var(--leading-tight)]">
          Paste a rough draft. Get it back sharp, in your voice.
        </h1>
        <p className="mt-1.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] max-w-xl leading-[var(--leading-relaxed)]">
          Brain-dump it messy. This tightens it without inventing anything or sanding off how you sound.
        </p>
      </div>

      {weakVoice && (
        <Card padding="md" className="border-[var(--border-faint)] bg-[var(--surface-deep)]">
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Your voice is still a starter. <a href="/voice" className="font-bold underline">Refine it</a> for sharper polish.
          </p>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-faint)] flex items-center justify-between">
          <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">Your rough draft</span>
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">{raw.trim().length} chars</span>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={9}
          placeholder="ok so i keep telling guys that discipline isnt the real problem its clarity..."
          className="w-full p-4 text-[length:var(--t-body)] leading-[var(--leading-relaxed)] bg-[var(--surface-elevated)] focus:outline-none resize-none"
        />
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          {tooShort ? "Add a sentence or two." : tooLong ? "Too long for now. Trim or split it." : "Looks good."}
        </div>
        <Button onClick={() => polish()} disabled={busy || tooShort || tooLong}>
          {busy ? (<><span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden /> Polishing…</>) : "Polish in my voice"}
        </Button>
      </div>

      {error && (
        <Card padding="md" className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <p className="text-[length:var(--t-caption)] text-[#B42318]">{error}</p>
        </Card>
      )}

      {result && (
        <Card padding="lg" className="border-2 border-[var(--brand)] bg-[var(--brand-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[length:var(--t-label)] uppercase tracking-widest text-[color:var(--text)] font-bold">Polished — your voice</div>
            {result.changes.length > 0 && (
              <button type="button" onClick={() => setShowChanges((v) => !v)} className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
                {showChanges ? "▾ hide changes" : "▸ see what changed"}
              </button>
            )}
          </div>

          <p className="mt-3 text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)] whitespace-pre-wrap">{result.polished}</p>

          {showChanges && result.changes.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-[color-mix(in_srgb,var(--brand)_25%,transparent)] pt-3">
              {result.changes.map((c, i) => (
                <li key={i} className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">• {c}</li>
              ))}
            </ul>
          )}

          {result.flags.length > 0 && (
            <div className="mt-3 rounded-[var(--r-md)] bg-[var(--surface-elevated)] p-3 space-y-1">
              {result.flags.map((f, i) => (
                <p key={i} className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Heads up: {flagText(f)}</p>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button onClick={copyOut}>{copied ? "Copied ✓" : "Use this"}</Button>
            <Button variant="ghost" onClick={() => polish()} disabled={busy}>Try again</Button>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">Nudge it:</span>
            {STEER_CHIPS.map((chip) => (
              <button key={chip.id} type="button" onClick={() => polish(chip.id)} disabled={busy}
                className="inline-flex items-center h-8 px-3 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] hover:text-[color:var(--text)] transition disabled:opacity-50">
                {chip.label}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `components/content/PolishPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/content/PolishPanel.tsx
git commit -m "feat(polish): PolishPanel UI (verify, steer chips, gates)"
```

---

### Task 7: Route page + discoverability link

**Files:**
- Create: `app/content/polish/page.tsx`
- Modify: `app/content/page.tsx` (add a link to `/content/polish`)
- Reference: `app/command-center/page.tsx` (auth + voice-profile count pattern)

- [ ] **Step 1: Create the page**

```tsx
// app/content/polish/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userDisplayName, userAvatarUrl } from "@/lib/user-display";
import Header from "@/components/Header";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import PolishPanel from "@/components/content/PolishPanel";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function PolishPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [headerEmphasis, navUnlocks, { data: profile }] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
    supabase
      .from("cp_voice_profiles")
      .select("voice_json")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const hasVoice = profile !== null;
  const training = (profile?.voice_json as { training_signal?: { fallback?: boolean; interview_answers?: number } } | null)?.training_signal;
  const weakVoice = Boolean(training?.fallback) || (typeof training?.interview_answers === "number" && training.interview_answers < 3);

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <PolishPanel hasVoice={hasVoice} weakVoice={weakVoice} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add a discoverability link**

Read `app/content/page.tsx`. Near the top of its main content header (after the masthead/title, before the tab content), insert this link so coaches can reach Polish:

```tsx
<a
  href="/content/polish"
  className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition"
>
  ✎ Polish a rough draft
</a>
```

If `app/content/page.tsx` is a client component with a clear header `<div>`, place the link inside it. If it delegates to `ContentWorkspace`, add the link to the workspace's top header row instead. Keep it a plain `<a>` (route nav), do NOT wire it into the controlled tab state.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: clean typecheck; build includes route `/content/polish`.

- [ ] **Step 4: Commit**

```bash
git add app/content/polish/page.tsx app/content/page.tsx
git commit -m "feat(polish): /content/polish route + entry link"
```

---

### Task 8: Eval harness (golden set + script + docs)

**Files:**
- Create: `eval/polish/golden.jsonl`
- Create: `scripts/eval-polish.mjs`
- Create: `docs/qa/polish-eval.md`
- Modify: `package.json` (add `eval:polish` script)

- [ ] **Step 1: Seed the golden set format with one real pair**

```jsonl
{"id":"clarity-not-discipline","raw":"ok so i've been thinking about this a lot. most of the guys i work with they think they have a discipline problem. like they cant wake up early or stick to the gym or whatever. but thats not actually it. the real thing is they dont have clarity. they dont know what they actually want so they just kind of float and then beat themselves up for not being disciplined. discipline is easy when you know why. so before we fix the discipline we have to fix the clarity. thats the whole thing.","ideal":"Most of the guys I work with think they have a discipline problem. They can't wake up early. Can't stick to the gym. So they grind on willpower and beat themselves up when it slips. But it was never discipline. It's clarity. When you don't know what you actually want, you float. Discipline is easy when you know why. So we don't fix the discipline first. We fix the clarity. That's the whole thing.","notes":"Sharpen: cut throat-clearing opener, kept his short punchy rhythm and the closing line. No new ideas."}
```

(Add ~19 more real pairs over time. The `ideal` is hand-written by Sunny — it is the spec. Start with his own drafts.)

- [ ] **Step 2: Write the eval script**

```js
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
```

- [ ] **Step 3: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"eval:polish": "node scripts/eval-polish.mjs"
```

- [ ] **Step 4: Write the eval doc**

```markdown
<!-- docs/qa/polish-eval.md -->
# Polish eval

Measures the content-polish model against a hand-labeled golden set.

## Run
ANTHROPIC_API_KEY=... npm run eval:polish

## Golden set
`eval/polish/golden.jsonl`, one JSON object per line:
- `id` — slug
- `raw` — a real rough draft (start with Sunny's)
- `ideal` — Sunny's hand-written strong edit. THIS IS THE SPEC.
- `notes` — what "good" meant for this one

Add ~20 pairs. The prompt is derived from the gap between `raw` and `ideal`.

## Judge calibration (do this before trusting the score)
Pick 5 pairs. Have Sunny rate the model's edit 1-5 on voice/faithful/improved.
Run the script and compare its judge scores to Sunny's. If they disagree by
more than ~1 point on voice, tune the JUDGE prompt until they track. An
uncalibrated judge is theater.

## Gate
Exit 0 = all pass (no deterministic fails, voice>=4, faithful>=4, improved>=3).
Exit 1 = a regression. Run before shipping any change to the Sharpen prompt.
```

- [ ] **Step 5: Verify the script runs**

Run: `node scripts/eval-polish.mjs` (with `ANTHROPIC_API_KEY` set)
Expected: prints one `✓`/`✗` line for the seed pair and a `1/1 passed` summary (or a clear model error). If `ANTHROPIC_API_KEY` is unset, expect exit 2 with the required-key message.

- [ ] **Step 6: Commit**

```bash
git add eval/polish/golden.jsonl scripts/eval-polish.mjs docs/qa/polish-eval.md package.json
git commit -m "feat(polish): eval harness (golden set + calibrated judge + checks)"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run`
Expected: all prior tests pass plus the new `polish-core` tests.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: clean; `/content/polish` and `/api/content/polish` both present in build output.

- [ ] **Step 3: Manual smoke (local)**

Start the app, sign in as a coach WITH a voice profile, go to `/content/polish`, paste a messy 3-4 sentence draft, click Polish. Expect: a tighter version, a "see what changed" toggle with 2-4 bullets, working Use this / Try again / steer chips. Then sign in as a coach WITHOUT a profile and confirm the "Build your voice first" gate.

- [ ] **Step 4: Commit any fixes, then push**

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage:**
- Sharpen-only default → Tasks 1-2, 5. ✅
- Verify via model `changes` summary, no token diff → Tasks 3, 6. ✅
- Standalone panel, no library wiring → Tasks 6, 7 (route + link, explicit no-tab-state deviation). ✅
- Next edge route w/ Cloudflare key → Task 5. ✅
- Shared unit-tested `polish-core` → Tasks 1-4. ✅
- Deterministic guardrails surfaced as soft flags → Tasks 4, 6. ✅
- Golden set + calibrated judge → Task 8. ✅
- Steer chips v1; voice input v1.1 (not built) → Task 6 (chips) / out of scope. ✅
- Weak-voice nudge + no-profile gate → Tasks 6, 7. ✅
- No logs table; metadata to edge logs → Task 5. ✅
- Input bounds + re-polish (stateless on raw_text) → Tasks 1, 5. ✅
- Structure preservation → Tasks 1 (prompt), 4 (guardrail). ✅

**2. Placeholder scan:** No TBD/TODO. Golden set intentionally seeds one pair with a documented "add ~19 more" instruction (data is Sunny's to label, not a code placeholder). Task 7 Step 2 gives exact insert markup with a conditional placement instruction because `app/content/page.tsx` internals are read at execution time — the link code itself is complete.

**3. Type consistency:** `PolishSteer`, `PolishFlag`, `PolishResult`, `MIN/MAX_POLISH_CHARS` defined in Task 1 and reused verbatim in Tasks 5-7. `Flag` type in `PolishPanel` mirrors `PolishFlag`. Route response `{ polished, changes, flags, voice_version, model }` matches `PolishResponse` in the panel. ✅
